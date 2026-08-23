from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.utils import add_months, last_day_of_month

router = APIRouter(prefix="/resumo", tags=["resumo"])


def _month_totals(db: Session, user_id: int, ano: int, mes: int) -> dict:
    gastos = (
        db.query(models.Gasto)
        .filter(
            models.Gasto.user_id == user_id,
            extract("year", models.Gasto.date) == ano,
            extract("month", models.Gasto.date) == mes,
        )
        .all()
    )
    total_essenciais = sum(g.value for g in gastos if g.priority == "essencial")
    total_nao_essenciais = sum(g.value for g in gastos if g.priority == "nao_essencial")
    total_gastos = total_essenciais + total_nao_essenciais

    receitas = (
        db.query(models.Receita)
        .filter(
            models.Receita.user_id == user_id,
            extract("year", models.Receita.date) == ano,
            extract("month", models.Receita.date) == mes,
        )
        .all()
    )
    total_receita = sum(r.value for r in receitas)
    total_caixa_pretendido = sum(r.cash_value for r in receitas)

    return {
        "total_gastos": total_gastos,
        "total_essenciais": total_essenciais,
        "total_nao_essenciais": total_nao_essenciais,
        "quantidade_gastos": len(gastos),
        "total_receita": total_receita,
        "total_caixa_pretendido": total_caixa_pretendido,
        "quantidade_receitas": len(receitas),
        "total_caixa_real": total_receita - total_gastos,
    }


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
        .filter(
            models.Gasto.user_id == user_id,
            extract("year", models.Gasto.date) == ano,
        )
    )
    if mes is not None:
        query = query.filter(extract("month", models.Gasto.date) == mes)
    elif ate_mes is not None:
        query = query.filter(extract("month", models.Gasto.date) <= ate_mes)

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

    meses_totais = [_month_totals(db, current_user.id, ano, m) for m in range(1, ultimo_mes + 1)]

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
        today = date.today()
        mes_referencia = date(today.year, today.month, 1)

    ultimos_n_meses = []
    for i in range(meses - 1, -1, -1):
        ref = add_months(mes_referencia, -i)
        ultimos_n_meses.append((ref.year, ref.month, _month_totals(db, current_user.id, ref.year, ref.month)))

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
    cutoff = last_day_of_month(ate_ano, ate_mes) if ate_ano is not None and ate_mes is not None else None

    gastos_query = db.query(models.Gasto).filter(models.Gasto.user_id == current_user.id)
    if cutoff is not None:
        gastos_query = gastos_query.filter(models.Gasto.date <= cutoff)
    gastos = gastos_query.all()

    receitas_query = db.query(models.Receita).filter(models.Receita.user_id == current_user.id)
    if cutoff is not None:
        receitas_query = receitas_query.filter(models.Receita.date <= cutoff)
    receitas = receitas_query.all()

    anos = sorted({g.date.year for g in gastos} | {r.date.year for r in receitas})

    anos_resumo = []
    for ano in anos:
        gastos_ano = [g for g in gastos if g.date.year == ano]
        receitas_ano = [r for r in receitas if r.date.year == ano]
        total_essenciais = sum(g.value for g in gastos_ano if g.priority == "essencial")
        total_nao_essenciais = sum(g.value for g in gastos_ano if g.priority == "nao_essencial")
        total_receita = sum(r.value for r in receitas_ano)
        total_caixa_pretendido = sum(r.cash_value for r in receitas_ano)
        anos_resumo.append(
            schemas.ResumoGeralAno(
                ano=ano,
                total_essenciais=total_essenciais,
                total_nao_essenciais=total_nao_essenciais,
                total_receita=total_receita,
                total_caixa_pretendido=total_caixa_pretendido,
                total_caixa_real=total_receita - (total_essenciais + total_nao_essenciais),
            )
        )

    total_essenciais_geral = sum(g.value for g in gastos if g.priority == "essencial")
    total_nao_essenciais_geral = sum(g.value for g in gastos if g.priority == "nao_essencial")
    total_receita_geral = sum(r.value for r in receitas)
    total_caixa_pretendido_geral = sum(r.cash_value for r in receitas)
    total_caixa_real_geral = total_receita_geral - (total_essenciais_geral + total_nao_essenciais_geral)

    # Soma por mês do calendário (jan, fev, ...) somando todos os anos — revela sazonalidade
    # (ex: dezembro sempre mais alto), independente de qual ano cada gasto caiu.
    por_mes_acumulado = defaultdict(lambda: {"essenciais": 0.0, "nao_essenciais": 0.0, "receita": 0.0, "caixa_pretendido": 0.0})
    for g in gastos:
        campo = "essenciais" if g.priority == "essencial" else "nao_essenciais"
        por_mes_acumulado[g.date.month][campo] += g.value
    for r in receitas:
        por_mes_acumulado[r.date.month]["receita"] += r.value
        por_mes_acumulado[r.date.month]["caixa_pretendido"] += r.cash_value

    por_mes = []
    for mes in range(1, 13):
        acumulado = por_mes_acumulado[mes]
        caixa_real = acumulado["receita"] - (acumulado["essenciais"] + acumulado["nao_essenciais"])
        por_mes.append(
            schemas.ResumoGeralMes(
                mes=mes,
                total_essenciais=acumulado["essenciais"],
                total_nao_essenciais=acumulado["nao_essenciais"],
                total_receita=acumulado["receita"],
                total_caixa_pretendido=acumulado["caixa_pretendido"],
                total_caixa_real=caixa_real,
            )
        )

    return schemas.ResumoGeral(
        anos=anos_resumo,
        por_mes=por_mes,
        total_essenciais=total_essenciais_geral,
        total_nao_essenciais=total_nao_essenciais_geral,
        total_receita=total_receita_geral,
        total_caixa_pretendido=total_caixa_pretendido_geral,
        total_caixa_real=total_caixa_real_geral,
    )
