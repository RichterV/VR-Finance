from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db, require_module
from app.utils import add_months, month_range, today_local, year_range

router = APIRouter(prefix="/resumo", tags=["resumo"])


def _empty_totals() -> dict:
    return {
        "total_gastos": 0.0,
        "total_essenciais": 0.0,
        "total_nao_essenciais": 0.0,
        "quantidade_gastos": 0,
        "total_receita": 0.0,
        "total_caixa_pretendido": 0.0,
        "quantidade_receitas": 0,
        "total_caixa_real": 0.0,
    }


def _date_bounds(column, inicio: Optional[date], fim: Optional[date]) -> list:
    conditions = []
    if inicio is not None:
        conditions.append(column >= inicio)
    if fim is not None:
        conditions.append(column < fim)
    return conditions


def monthly_totals(
    db: Session, user_id: int, inicio: Optional[date] = None, fim: Optional[date] = None
) -> dict[tuple[int, int], dict]:
    """Totais por (ano, mês) entre inicio (inclusive) e fim (exclusivo), em 2 consultas agrupadas
    -- antes eram 2 consultas por mês. Com os dois limites, todo mês da faixa aparece (zerado se não
    teve lançamento); sem limite, só os meses que têm algum lançamento."""
    ym_gasto = func.strftime("%Y-%m", models.Gasto.date)
    gastos = (
        db.query(ym_gasto, models.Gasto.priority, func.sum(models.Gasto.value), func.count(models.Gasto.id))
        .filter(models.Gasto.user_id == user_id, *_date_bounds(models.Gasto.date, inicio, fim))
        .group_by(ym_gasto, models.Gasto.priority)
        .all()
    )
    ym_receita = func.strftime("%Y-%m", models.Receita.date)
    receitas = (
        db.query(
            ym_receita, func.sum(models.Receita.value), func.sum(models.Receita.cash_value), func.count(models.Receita.id)
        )
        .filter(models.Receita.user_id == user_id, *_date_bounds(models.Receita.date, inicio, fim))
        .group_by(ym_receita)
        .all()
    )

    result: dict[tuple[int, int], dict] = {}
    if inicio is not None and fim is not None:
        ref = date(inicio.year, inicio.month, 1)
        while ref < fim:
            result[(ref.year, ref.month)] = _empty_totals()
            ref = add_months(ref, 1)

    def _bucket(ym: str) -> dict:
        key = (int(ym[:4]), int(ym[5:7]))
        return result.setdefault(key, _empty_totals())

    for ym, priority, total, count in gastos:
        bucket = _bucket(ym)
        bucket["total_essenciais" if priority == "essencial" else "total_nao_essenciais"] += total or 0.0
        bucket["quantidade_gastos"] += count
    for ym, total, cash, count in receitas:
        bucket = _bucket(ym)
        bucket["total_receita"] += total or 0.0
        bucket["total_caixa_pretendido"] += cash or 0.0
        bucket["quantidade_receitas"] += count
    for bucket in result.values():
        # Somas de floats arredondadas a centavos (os valores gravados já têm 2 casas).
        for key in ("total_essenciais", "total_nao_essenciais", "total_receita", "total_caixa_pretendido"):
            bucket[key] = round(bucket[key], 2)
        bucket["total_gastos"] = round(bucket["total_essenciais"] + bucket["total_nao_essenciais"], 2)
        bucket["total_caixa_real"] = round(bucket["total_receita"] - bucket["total_gastos"], 2)
    return result


def _month_totals(db: Session, user_id: int, ano: int, mes: int) -> dict:
    inicio, fim = month_range(ano, mes)
    return monthly_totals(db, user_id, inicio, fim)[(ano, mes)]


def _percentuais_itens(
    db: Session,
    user_id: int,
    ano: int,
    mes: Optional[int] = None,
    ate_mes: Optional[int] = None,
) -> list[schemas.ItemPercentual]:
    query = (
        db.query(
            models.Gasto.item_id,
            models.DropdownOption.name,
            models.Gasto.priority,
            func.sum(models.Gasto.value).label("total"),
        )
        .join(models.DropdownOption, models.DropdownOption.id == models.Gasto.item_id)
        .filter(models.Gasto.user_id == user_id)
    )
    if mes is not None:
        inicio, fim = month_range(ano, mes)
    elif ate_mes is not None:
        if ate_mes < 1:  # corte num ano anterior: nada desse ano entra
            return []
        inicio, fim = date(ano, 1, 1), month_range(ano, ate_mes)[1]
    else:
        inicio, fim = year_range(ano)
    query = query.filter(models.Gasto.date >= inicio, models.Gasto.date < fim)

    rows = query.group_by(models.Gasto.item_id, models.DropdownOption.name, models.Gasto.priority).all()
    total_geral = sum(row.total for row in rows) or 0

    return [
        schemas.ItemPercentual(
            item_id=row.item_id,
            item_name=row.name,
            priority=row.priority,
            total=row.total,
            percentual=(row.total / total_geral * 100) if total_geral else 0,
        )
        for row in rows
    ]


def basket_monthly_totals(
    db: Session, user_id: int, item_ids: list[int], inicio: date, fim: date
) -> dict[tuple[int, int], float]:
    """Gasto na cesta de inflação por (ano, mês), todos os meses da faixa -- uma consulta só."""
    result: dict[tuple[int, int], float] = {}
    ref = date(inicio.year, inicio.month, 1)
    while ref < fim:
        result[(ref.year, ref.month)] = 0.0
        ref = add_months(ref, 1)
    if not item_ids:
        return result
    ym = func.strftime("%Y-%m", models.Gasto.date)
    rows = (
        db.query(ym, func.sum(models.Gasto.value))
        .filter(
            models.Gasto.user_id == user_id,
            models.Gasto.item_id.in_(item_ids),
            models.Gasto.date >= inicio,
            models.Gasto.date < fim,
        )
        .group_by(ym)
        .all()
    )
    for ym_value, total in rows:
        result[(int(ym_value[:4]), int(ym_value[5:7]))] = round(total or 0.0, 2)
    return result


def _basket_month_total(db: Session, user_id: int, ano: int, mes: int, item_ids: list[int]) -> float:
    inicio, fim = month_range(ano, mes)
    return basket_monthly_totals(db, user_id, item_ids, inicio, fim)[(ano, mes)]


@router.get(
    "/inflacao",
    response_model=schemas.ResumoInflacao,
    dependencies=[Depends(require_module("analise_inflacionaria"))],
)
def resumo_inflacao(
    meses: int = Query(12, ge=1, le=36),
    ate_ano: Optional[int] = Query(None, ge=2000, le=2100),
    ate_mes: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cesta_options = (
        db.query(models.DropdownOption)
        .filter(
            models.DropdownOption.user_id == current_user.id,
            models.DropdownOption.priority == "essencial",
            models.DropdownOption.active.is_(True),
            models.DropdownOption.include_in_inflation.is_(True),
        )
        .order_by(models.DropdownOption.name)
        .all()
    )
    item_ids = [o.id for o in cesta_options]

    if not item_ids:
        return schemas.ResumoInflacao(
            possui_cesta=False, cesta=[], mensal=[], anual=[], headline_mom_pct=None, headline_yoy_pct=None
        )

    if ate_ano is not None and ate_mes is not None:
        mes_referencia = date(ate_ano, ate_mes, 1)
    else:
        today = today_local()
        mes_referencia = date(today.year, today.month, 1)

    # Uma consulta da cesta cobrindo a janela inteira (12 meses extras de base pro ano a ano) e uma
    # de totais pros pontos de caixa real -- antes era uma consulta por mês de cada.
    fim_janela = add_months(mes_referencia, 1)
    cesta_por_mes = basket_monthly_totals(
        db, current_user.id, item_ids, add_months(mes_referencia, -(meses + 12 - 1)), fim_janela
    )
    totais_por_mes = monthly_totals(db, current_user.id, add_months(mes_referencia, -(meses - 1)), fim_janela)

    def _totais_cesta(qtd_meses_extra: int) -> list[tuple[int, int, float]]:
        """(ano, mes, total_cesta) dos ultimos `meses + qtd_meses_extra` meses, do mais antigo
        pro mais recente, terminando em mes_referencia -- os meses extras servem so de base de
        comparacao pros primeiros pontos "de verdade" da serie."""
        pontos = []
        for i in range(meses + qtd_meses_extra - 1, -1, -1):
            ref = add_months(mes_referencia, -i)
            pontos.append((ref.year, ref.month, cesta_por_mes[(ref.year, ref.month)]))
        return pontos

    def _variacao_pct(atual: float, base: float) -> Optional[float]:
        # None em vez de ZeroDivisionError/infinito -- um mes sem nenhum gasto na cesta nao tem
        # base de comparacao valida.
        return (atual - base) / base * 100 if base else None

    def _caixa_real_pct(ano: int, mes: int) -> float:
        m = totais_por_mes[(ano, mes)]
        return (m["total_caixa_real"] / m["total_gastos"] * 100) if m["total_gastos"] else 0

    # Mes a mes: 1 mes extra de base pra comparar o primeiro ponto da serie.
    serie_mom = _totais_cesta(1)
    mensal = [
        schemas.InflacaoPonto(
            ano=ano,
            mes=mes,
            total_cesta=total,
            variacao_pct=_variacao_pct(total, base_total),
            caixa_real_pct=_caixa_real_pct(ano, mes),
        )
        for (_, _, base_total), (ano, mes, total) in zip(serie_mom, serie_mom[1:])
    ]

    # Ano a ano: 12 meses extras de base -- cada ponto compara com o mesmo mes do ano anterior,
    # que e' exatamente 12 posicoes atras nessa mesma serie (cada passo = 1 mes).
    serie_yoy = _totais_cesta(12)
    anual = [
        schemas.InflacaoPonto(
            ano=ano,
            mes=mes,
            total_cesta=total,
            variacao_pct=_variacao_pct(total, base_total),
            caixa_real_pct=_caixa_real_pct(ano, mes),
        )
        for (_, _, base_total), (ano, mes, total) in zip(serie_yoy, serie_yoy[12:])
    ]

    return schemas.ResumoInflacao(
        possui_cesta=True,
        cesta=[o.name for o in cesta_options],
        mensal=mensal,
        anual=anual,
        headline_mom_pct=mensal[-1].variacao_pct if mensal else None,
        headline_yoy_pct=anual[-1].variacao_pct if anual else None,
    )


@router.get("/anual", response_model=schemas.ResumoAnual)
def resumo_anual(
    ano: int = Query(..., ge=2000, le=2100),
    meses: int = Query(12, ge=1, le=36),
    ate_ano: Optional[int] = Query(None, ge=2000, le=2100),
    ate_mes: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    corte_ativo = ate_ano is not None and ate_mes is not None
    if corte_ativo:
        if ano < ate_ano:
            ultimo_mes = 12
        elif ano == ate_ano:
            ultimo_mes = ate_mes
        else:
            ultimo_mes = 0
    else:
        ultimo_mes = 12

    totais_ano = monthly_totals(db, current_user.id, *year_range(ano))
    meses_totais = [totais_ano[(ano, m)] for m in range(1, ultimo_mes + 1)]

    total_gastos = sum(m["total_gastos"] for m in meses_totais)
    total_essenciais = sum(m["total_essenciais"] for m in meses_totais)
    total_nao_essenciais = sum(m["total_nao_essenciais"] for m in meses_totais)
    quantidade_gastos = sum(m["quantidade_gastos"] for m in meses_totais)
    quantidade_receitas = sum(m["quantidade_receitas"] for m in meses_totais)
    total_caixa_pretendido = sum(m["total_caixa_pretendido"] for m in meses_totais)
    total_receita = sum(m["total_receita"] for m in meses_totais)
    total_caixa_real = total_receita - total_gastos

    meses_com_gasto = sum(1 for m in meses_totais if m["quantidade_gastos"] > 0)
    meses_com_receita = sum(1 for m in meses_totais if m["quantidade_receitas"] > 0)
    media_gastos_mensal = total_gastos / meses_com_gasto if meses_com_gasto else 0
    media_receitas_mensal = total_receita / meses_com_receita if meses_com_receita else 0

    percentuais_itens = _percentuais_itens(db, current_user.id, ano, ate_mes=ultimo_mes if corte_ativo else None)

    if corte_ativo:
        mes_referencia = date(ate_ano, ate_mes, 1)
    else:
        today = today_local()
        mes_referencia = date(today.year, today.month, 1)

    janela = monthly_totals(
        db, current_user.id, add_months(mes_referencia, -(meses - 1)), add_months(mes_referencia, 1)
    )
    ultimos_n_meses = [(ref_ano, ref_mes, m) for (ref_ano, ref_mes), m in sorted(janela.items())]

    evolucao_12_meses = [
        {
            "ano": ref_ano,
            "mes": ref_mes,
            "essencial": m["total_essenciais"],
            "nao_essencial": m["total_nao_essenciais"],
            "caixa": m["total_caixa_real"],
        }
        for ref_ano, ref_mes, m in ultimos_n_meses
    ]

    caixa_pretendido_vs_real = [
        {
            "ano": ref_ano,
            "mes": ref_mes,
            "receita": m["total_receita"],
            "caixa_pretendido": m["total_caixa_pretendido"],
            "caixa_real": m["total_caixa_real"],
            "proporcao_caixa_real": (m["total_caixa_real"] / m["total_gastos"] * 100) if m["total_gastos"] else 0,
        }
        for ref_ano, ref_mes, m in ultimos_n_meses
    ]

    return schemas.ResumoAnual(
        ano=ano,
        total_gastos=total_gastos,
        total_receita=total_receita,
        total_essenciais=total_essenciais,
        total_nao_essenciais=total_nao_essenciais,
        quantidade_gastos=quantidade_gastos,
        quantidade_receitas=quantidade_receitas,
        total_caixa_pretendido=total_caixa_pretendido,
        total_caixa_real=total_caixa_real,
        percentuais_itens=percentuais_itens,
        media_gastos_mensal=media_gastos_mensal,
        media_receitas_mensal=media_receitas_mensal,
        evolucao_12_meses=evolucao_12_meses,
        caixa_pretendido_vs_real=caixa_pretendido_vs_real,
    )


@router.get("/mensal", response_model=schemas.ResumoMensal)
def resumo_mensal(
    ano: int = Query(..., ge=2000, le=2100),
    mes: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    m = _month_totals(db, current_user.id, ano, mes)
    percentuais_itens = _percentuais_itens(db, current_user.id, ano, mes)

    media_gastos_lancamento = m["total_gastos"] / m["quantidade_gastos"] if m["quantidade_gastos"] else 0
    media_receitas_lancamento = m["total_receita"] / m["quantidade_receitas"] if m["quantidade_receitas"] else 0
    disponivel_para_gastar = m["total_receita"] - m["total_gastos"] - m["total_caixa_pretendido"]

    return schemas.ResumoMensal(
        ano=ano,
        mes=mes,
        total_gastos=m["total_gastos"],
        total_receita=m["total_receita"],
        total_essenciais=m["total_essenciais"],
        total_nao_essenciais=m["total_nao_essenciais"],
        quantidade_gastos=m["quantidade_gastos"],
        quantidade_receitas=m["quantidade_receitas"],
        total_caixa_pretendido=m["total_caixa_pretendido"],
        total_caixa_real=m["total_caixa_real"],
        percentuais_itens=percentuais_itens,
        media_gastos_lancamento=media_gastos_lancamento,
        media_receitas_lancamento=media_receitas_lancamento,
        disponivel_para_gastar=disponivel_para_gastar,
    )


@router.get("/geral", response_model=schemas.ResumoGeral)
def resumo_geral(
    ate_ano: Optional[int] = Query(None, ge=2000, le=2100),
    ate_mes: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fim = add_months(date(ate_ano, ate_mes, 1), 1) if ate_ano is not None and ate_mes is not None else None
    # Totais agrupados por mês no banco (antes carregava todo lançamento e somava em Python).
    por_ano_mes = monthly_totals(db, current_user.id, None, fim)

    def _zero() -> dict:
        return {"essenciais": 0.0, "nao_essenciais": 0.0, "receita": 0.0, "caixa_pretendido": 0.0}

    por_ano: dict[int, dict] = defaultdict(_zero)
    por_mes_acumulado: dict[int, dict] = defaultdict(_zero)
    for (ano, mes), m in por_ano_mes.items():
        # Soma por mês do calendário (jan, fev, ...) somando todos os anos — revela sazonalidade
        # (ex: dezembro sempre mais alto), independente de qual ano cada gasto caiu.
        for acumulado in (por_ano[ano], por_mes_acumulado[mes]):
            acumulado["essenciais"] += m["total_essenciais"]
            acumulado["nao_essenciais"] += m["total_nao_essenciais"]
            acumulado["receita"] += m["total_receita"]
            acumulado["caixa_pretendido"] += m["total_caixa_pretendido"]

    def _caixa_real(acumulado: dict) -> float:
        return round(acumulado["receita"] - (acumulado["essenciais"] + acumulado["nao_essenciais"]), 2)

    anos_resumo = [
        schemas.ResumoGeralAno(
            ano=ano,
            total_essenciais=round(acumulado["essenciais"], 2),
            total_nao_essenciais=round(acumulado["nao_essenciais"], 2),
            total_receita=round(acumulado["receita"], 2),
            total_caixa_pretendido=round(acumulado["caixa_pretendido"], 2),
            total_caixa_real=_caixa_real(acumulado),
        )
        for ano, acumulado in sorted(por_ano.items())
    ]

    geral = _zero()
    for acumulado in por_ano.values():
        for key in geral:
            geral[key] += acumulado[key]
    total_essenciais_geral = round(geral["essenciais"], 2)
    total_nao_essenciais_geral = round(geral["nao_essenciais"], 2)
    total_receita_geral = round(geral["receita"], 2)
    total_caixa_pretendido_geral = round(geral["caixa_pretendido"], 2)
    total_caixa_real_geral = _caixa_real(geral)

    por_mes = [
        schemas.ResumoGeralMes(
            mes=mes,
            total_essenciais=round(por_mes_acumulado[mes]["essenciais"], 2),
            total_nao_essenciais=round(por_mes_acumulado[mes]["nao_essenciais"], 2),
            total_receita=round(por_mes_acumulado[mes]["receita"], 2),
            total_caixa_pretendido=round(por_mes_acumulado[mes]["caixa_pretendido"], 2),
            total_caixa_real=_caixa_real(por_mes_acumulado[mes]),
        )
        for mes in range(1, 13)
    ]

    return schemas.ResumoGeral(
        anos=anos_resumo,
        por_mes=por_mes,
        total_essenciais=total_essenciais_geral,
        total_nao_essenciais=total_nao_essenciais_geral,
        total_receita=total_receita_geral,
        total_caixa_pretendido=total_caixa_pretendido_geral,
        total_caixa_real=total_caixa_real_geral,
    )
