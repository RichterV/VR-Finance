"""Resumo da virada do mês: o que subiu, o que caiu, parcelamentos e pendências do mês que acabou.

Gerado sob demanda (sem cron): na primeira consulta à central de notificações depois do dia 1,
`ensure_monthly_digest` calcula o resumo do mês anterior e grava em `notificacoes`. Só o mês
imediatamente anterior é gerado -- quem fica meses sem abrir o app não recebe uma enxurrada de
resumos atrasados.

Comparação por categoria usa só gastos avulsos (sem parcelas): uma compra em 10x não aparece como
"subiu" por 10 meses seguidos -- parcelamentos têm seção própria (novos/encerrados).
"""
import json
from datetime import date
from typing import Optional

from sqlalchemy import extract, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers.resumo import _basket_month_total, _month_totals
from app.utils import add_months, today_local

TIPO_RESUMO_MENSAL = "resumo_mensal"

MESES_BASE = 3  # média de comparação = os 3 meses anteriores ao mês do resumo
MIN_VARIACAO_PCT = 20.0  # abaixo disso a variação é ruído, não entra em "subiram/caíram"
MIN_DIFERENCA = 50.0  # idem pra diferença em R$ (café de R$ 8 -> R$ 12 é +50%, mas irrelevante)
MIN_MESES_COM_GASTO = 2  # categoria precisa aparecer em 2 dos 3 meses base pra ter "média" confiável
MAX_POR_LISTA = 3
MESES_GUARDADOS = 12  # resumos com mês de referência mais antigo que isso são apagados

MESES_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _variacao_pct(atual: float, base: Optional[float]) -> Optional[float]:
    # abs() no denominador: caixa real pode ter média negativa, e dividir por ela inverteria o sinal
    # (piorar viraria "subiu").
    return (atual - base) / abs(base) * 100 if base else None


def _gastos_avulsos_por_categoria(db: Session, user_id: int, ano: int, mes: int) -> dict[int, tuple[str, str, float]]:
    rows = (
        db.query(
            models.Gasto.item_id,
            models.DropdownOption.name,
            models.DropdownOption.priority,
            func.sum(models.Gasto.value).label("total"),
        )
        .join(models.DropdownOption, models.DropdownOption.id == models.Gasto.item_id)
        .filter(
            models.Gasto.user_id == user_id,
            models.Gasto.is_installment.is_(False),
            extract("year", models.Gasto.date) == ano,
            extract("month", models.Gasto.date) == mes,
        )
        .group_by(models.Gasto.item_id, models.DropdownOption.name, models.DropdownOption.priority)
        .all()
    )
    return {row.item_id: (row.name, row.priority, row.total or 0.0) for row in rows}


def _indicador(valor: float, base_valores: list[float]) -> schemas.IndicadorMensal:
    media = sum(base_valores) / len(base_valores) if base_valores else None
    return schemas.IndicadorMensal(valor=valor, media=media, variacao_pct=_variacao_pct(valor, media))


def _categorias(db: Session, user_id: int, ano: int, mes: int, bases: list[date]):
    atual = _gastos_avulsos_por_categoria(db, user_id, ano, mes)
    base_por_mes = [_gastos_avulsos_por_categoria(db, user_id, b.year, b.month) for b in bases]

    info: dict[int, tuple[str, str]] = {}
    for mapa in [atual, *base_por_mes]:
        for item_id, (name, priority, _) in mapa.items():
            info.setdefault(item_id, (name, priority))

    subiram, cairam, pontuais = [], [], []
    for item_id, (name, priority) in info.items():
        valor = atual.get(item_id, (name, priority, 0.0))[2]
        valores_base = [m[item_id][2] for m in base_por_mes if item_id in m and m[item_id][2] > 0]
        if len(valores_base) < MIN_MESES_COM_GASTO:
            # Sem histórico recente suficiente pra uma média confiável (IPVA, presente, conserto):
            # vira "gasto pontual" se for relevante, nunca "subiu X%".
            if valor >= MIN_DIFERENCA:
                pontuais.append(schemas.GastoPontual(item_id=item_id, item_name=name, priority=priority, valor=valor))
            continue
        media = sum(valores_base) / len(bases)  # mês sem gasto na categoria conta como zero
        diferenca = valor - media
        pct = _variacao_pct(valor, media)
        if pct is None or abs(pct) < MIN_VARIACAO_PCT or abs(diferenca) < MIN_DIFERENCA:
            continue
        item = schemas.VariacaoCategoria(
            item_id=item_id, item_name=name, priority=priority,
            valor=valor, media=media, diferenca=diferenca, variacao_pct=pct,
        )
        (subiram if diferenca > 0 else cairam).append(item)

    subiram.sort(key=lambda c: c.diferenca, reverse=True)
    cairam.sort(key=lambda c: c.diferenca)
    pontuais.sort(key=lambda c: c.valor, reverse=True)
    return subiram[:MAX_POR_LISTA], cairam[:MAX_POR_LISTA], pontuais[:MAX_POR_LISTA]


def _parcelamentos(db: Session, user_id: int, ano: int, mes: int):
    parcelas = (
        db.query(models.Gasto)
        .filter(
            models.Gasto.user_id == user_id,
            models.Gasto.is_installment.is_(True),
            extract("year", models.Gasto.date) == ano,
            extract("month", models.Gasto.date) == mes,
        )
        .order_by(models.Gasto.value.desc())
        .all()
    )

    def _resumo(g: models.Gasto) -> schemas.ParcelamentoResumo:
        return schemas.ParcelamentoResumo(
            descricao=g.description or g.item_name,
            item_name=g.item_name,
            valor_parcela=g.value,
            parcelas=g.installment_count or 1,
        )

    novos = [_resumo(g) for g in parcelas if g.installment_number == 1 and (g.installment_count or 1) > 1]
    encerrados = [
        _resumo(g)
        for g in parcelas
        if g.installment_number == g.installment_count and (g.installment_count or 1) > 1
    ]
    return novos, encerrados


def _inflacao(db: Session, user: models.User, ano: int, mes: int) -> Optional[schemas.InflacaoResumo]:
    if "analise_inflacionaria" not in user.modules:
        return None
    cesta = (
        db.query(models.DropdownOption)
        .filter(
            models.DropdownOption.user_id == user.id,
            models.DropdownOption.priority == "essencial",
            models.DropdownOption.active.is_(True),
            models.DropdownOption.include_in_inflation.is_(True),
        )
        .order_by(models.DropdownOption.name)
        .all()
    )
    if not cesta:
        return None
    item_ids = [o.id for o in cesta]
    anterior = add_months(date(ano, mes, 1), -1)
    total = _basket_month_total(db, user.id, ano, mes, item_ids)
    base = _basket_month_total(db, user.id, anterior.year, anterior.month, item_ids)
    return schemas.InflacaoResumo(cesta=[o.name for o in cesta], total_cesta=total, variacao_pct=_variacao_pct(total, base))


def build_monthly_digest(db: Session, user: models.User, ano: int, mes: int) -> Optional[schemas.ResumoMensalPayload]:
    """Resumo do mês `mes/ano`, ou None se o usuário não lançou nada nesse mês."""
    totais = _month_totals(db, user.id, ano, mes)
    if not totais["quantidade_gastos"] and not totais["quantidade_receitas"]:
        return None

    bases = [add_months(date(ano, mes, 1), -i) for i in range(1, MESES_BASE + 1)]
    totais_base = [_month_totals(db, user.id, b.year, b.month) for b in bases]
    # Média dos totais só sobre meses base com algum lançamento -- um usuário novo (sem histórico)
    # fica sem comparação, em vez de "gastos subiram 300%" contra meses vazios.
    base_com_dados = [t for t in totais_base if t["quantidade_gastos"] or t["quantidade_receitas"]]

    def _ind(chave: str) -> schemas.IndicadorMensal:
        return _indicador(totais[chave], [t[chave] for t in base_com_dados])

    receita_base = sum(t["total_receita"] for t in base_com_dados)
    taxa = schemas.TaxaPoupanca(
        valor_pct=totais["total_caixa_real"] / totais["total_receita"] * 100 if totais["total_receita"] else None,
        media_pct=sum(t["total_caixa_real"] for t in base_com_dados) / receita_base * 100 if receita_base else None,
        meta_pct=totais["total_caixa_pretendido"] / totais["total_receita"] * 100 if totais["total_receita"] else None,
    )

    subiram, cairam, pontuais = _categorias(db, user.id, ano, mes, bases)
    novos, encerrados = _parcelamentos(db, user.id, ano, mes)

    payload = schemas.ResumoMensalPayload(
        ano=ano,
        mes=mes,
        meses_base=MESES_BASE,
        gastos=_ind("total_gastos"),
        receita=_ind("total_receita"),
        caixa_real=_ind("total_caixa_real"),
        caixa_pretendido=_ind("total_caixa_pretendido"),
        taxa_poupanca=taxa,
        subiram=subiram,
        cairam=cairam,
        pontuais=pontuais,
        parcelamentos_novos=novos,
        parcelamentos_encerrados=encerrados,
        inflacao=_inflacao(db, user, ano, mes),
    )
    return payload


def _prune_old_digests(db: Session, user: models.User, mes_atual: date) -> None:
    """Mantém só os resumos dos últimos MESES_GUARDADOS meses (ex: em outubro/2026, de outubro/2025
    a setembro/2026)."""
    corte = add_months(mes_atual, -MESES_GUARDADOS)
    indice_corte = corte.year * 12 + corte.month
    removidos = (
        db.query(models.Notificacao)
        .filter(
            models.Notificacao.user_id == user.id,
            models.Notificacao.tipo == TIPO_RESUMO_MENSAL,
            models.Notificacao.ano * 12 + models.Notificacao.mes < indice_corte,
        )
        .delete(synchronize_session=False)
    )
    if removidos:
        db.commit()


def ensure_monthly_digest(db: Session, user: models.User) -> None:
    """Gera (uma vez só) o resumo do mês anterior a hoje, se ainda não existir, e apaga os que
    passaram da janela de MESES_GUARDADOS meses."""
    today = today_local()
    mes_atual = date(today.year, today.month, 1)
    _prune_old_digests(db, user, mes_atual)
    ref = add_months(mes_atual, -1)
    exists = (
        db.query(models.Notificacao.id)
        .filter(
            models.Notificacao.user_id == user.id,
            models.Notificacao.tipo == TIPO_RESUMO_MENSAL,
            models.Notificacao.ano == ref.year,
            models.Notificacao.mes == ref.month,
        )
        .first()
    )
    if exists:
        return
    payload = build_monthly_digest(db, user, ref.year, ref.month)
    if payload is None:
        return
    db.add(
        models.Notificacao(
            user_id=user.id,
            tipo=TIPO_RESUMO_MENSAL,
            ano=ref.year,
            mes=ref.month,
            titulo=f"Resumo de {MESES_PT[ref.month - 1]}/{ref.year}",
            payload=payload.model_dump_json(),
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # Outra requisição gerou o mesmo resumo ao mesmo tempo (a Home dispara várias em paralelo).
        db.rollback()


def parse_payload(raw: str) -> schemas.ResumoMensalPayload:
    return schemas.ResumoMensalPayload.model_validate(json.loads(raw))
