"""Analytics sobre os dados que já existem: alerta de anomalia, previsão do fim do mês e indicadores.

Tudo calculado na hora (sem tabela nova nem job agendado), com estatística robusta -- mediana em vez
de média, pra um gasto fora da curva não distorcer a referência.
"""
import calendar
import statistics
import unicodedata
from collections import defaultdict
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.routers.resumo import monthly_totals
from app.utils import add_months, today_local

# --- Alerta de anomalia ---
ANOMALIA_MESES = 12
ANOMALIA_MIN_AMOSTRAS = 6  # menos lançamentos que isso: sem referência confiável, nunca alerta
ANOMALIA_Z_LIMITE = 3.5
ANOMALIA_MIN_DIFERENCA = 50.0
ANOMALIA_MULTIPLO_SEM_DISPERSAO = 3.0  # valores sempre iguais (MAD = 0): alerta a partir de 3× a mediana

# --- Previsão do fim do mês ---
PREVISAO_MESES_HISTORICO = 12
PREVISAO_MIN_MESES = 3
PREVISAO_FRACAO_MINIMA = 0.1  # abaixo disso a extrapolação pelo ritmo explode -- usa a mediana mensal
PREVISAO_MESES_RECEITA = 6

# --- Indicadores ---
INDICADORES_MESES = 12
COMPROMETIMENTO_MESES = 6
CUSTO_FIXO_MESES = 4
CUSTO_FIXO_MIN_PRESENCA = 3
CUSTO_FIXO_VARIACAO_MAX = 0.15


def _round(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(value, 2)


def _quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * q
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


# =====================================================================================
# Alerta de anomalia
# =====================================================================================


def check_anomalia(db: Session, user: models.User, item_id: int, value: float) -> schemas.AnomaliaOut:
    """O valor está muito acima do normal dessa categoria? Compara com os gastos avulsos (sem parcela)
    dos últimos 12 meses, por lançamento, com z-score robusto (mediana e MAD)."""
    today = today_local()
    inicio = add_months(date(today.year, today.month, 1), -ANOMALIA_MESES)
    valores = [
        row.value
        for row in db.query(models.Gasto.value)
        .filter(
            models.Gasto.user_id == user.id,
            models.Gasto.item_id == item_id,
            models.Gasto.is_installment.is_(False),
            models.Gasto.date >= inicio,
            models.Gasto.date <= today,
        )
        .all()
    ]
    if len(valores) < ANOMALIA_MIN_AMOSTRAS:
        return schemas.AnomaliaOut(anomalo=False, mediana=None, multiplo=None, amostras=len(valores))

    mediana = statistics.median(valores)
    mad = statistics.median(abs(v - mediana) for v in valores)
    diferenca = value - mediana
    if mad > 0:
        anomalo = 0.6745 * diferenca / mad > ANOMALIA_Z_LIMITE and diferenca >= ANOMALIA_MIN_DIFERENCA
    else:
        anomalo = value >= ANOMALIA_MULTIPLO_SEM_DISPERSAO * mediana and diferenca >= ANOMALIA_MIN_DIFERENCA
    return schemas.AnomaliaOut(
        anomalo=anomalo,
        mediana=_round(mediana),
        multiplo=round(value / mediana, 1) if mediana > 0 else None,
        amostras=len(valores),
    )


# =====================================================================================
# Previsão do fim do mês
# =====================================================================================


def build_previsao(db: Session, user: models.User) -> schemas.PrevisaoOut:
    """Quanto deve sobrar no fim do mês atual: receita − gastos já comprometidos no mês (inclusive
    parcelas e lançamentos com data futura) − o que ainda falta do gasto variável − caixa pretendido."""
    today = today_local()
    mes_atual = date(today.year, today.month, 1)
    fim_mes = add_months(mes_atual, 1)
    inicio_historico = add_months(mes_atual, -PREVISAO_MESES_HISTORICO)

    gastos = (
        db.query(models.Gasto.date, models.Gasto.value, models.Gasto.is_installment)
        .filter(models.Gasto.user_id == user.id, models.Gasto.date >= inicio_historico, models.Gasto.date < fim_mes)
        .all()
    )
    comprometido = sum(g.value for g in gastos if g.date >= mes_atual)
    variavel_mes = sum(g.value for g in gastos if g.date >= mes_atual and not g.is_installment)
    variavel_ate_hoje = sum(g.value for g in gastos if mes_atual <= g.date <= today and not g.is_installment)

    # Por mês do histórico: total do gasto avulso e quanto dele já tinha acontecido até o "dia de hoje".
    avulso_total: dict[tuple[int, int], float] = defaultdict(float)
    avulso_ate_dia: dict[tuple[int, int], float] = defaultdict(float)
    for g in gastos:
        if g.date >= mes_atual or g.is_installment:
            continue
        key = (g.date.year, g.date.month)
        avulso_total[key] += g.value
        dia_limite = min(today.day, calendar.monthrange(g.date.year, g.date.month)[1])
        if g.date.day <= dia_limite:
            avulso_ate_dia[key] += g.value
    meses_validos = [k for k, total in avulso_total.items() if total > 0]
    fracoes = [avulso_ate_dia[k] / avulso_total[k] for k in meses_validos]
    historico_suficiente = len(meses_validos) >= PREVISAO_MIN_MESES

    def _restante(fracao: Optional[float]) -> float:
        if fracao is not None and fracao >= PREVISAO_FRACAO_MINIMA and variavel_ate_hoje > 0:
            projecao = variavel_ate_hoje / fracao
        elif meses_validos:
            projecao = statistics.median(avulso_total[k] for k in meses_validos)
        else:
            projecao = variavel_mes
        return max(0.0, projecao - variavel_mes)

    if fracoes:
        restante = _restante(statistics.median(fracoes))
        # Fração maior (mês "adiantado") projeta menos; fração menor projeta mais.
        restante_min = _restante(_quantile(fracoes, 0.75))
        restante_max = _restante(_quantile(fracoes, 0.25))
    else:
        restante = restante_min = restante_max = _restante(None)

    receitas_mes = (
        db.query(models.Receita.value, models.Receita.cash_value)
        .filter(models.Receita.user_id == user.id, models.Receita.date >= mes_atual, models.Receita.date < fim_mes)
        .all()
    )
    receita = sum(r.value for r in receitas_mes)
    caixa_pretendido = sum(r.cash_value for r in receitas_mes)
    receita_estimada = False
    if not receitas_mes:
        totais = monthly_totals(db, user.id, add_months(mes_atual, -PREVISAO_MESES_RECEITA), mes_atual)
        receitas_hist = [m["total_receita"] for m in totais.values() if m["total_receita"] > 0]
        if receitas_hist:
            # Mediana (não média): 13º e PLR não puxam a estimativa pra cima.
            receita = statistics.median(receitas_hist)
            caixa_pretendido = receita * (user.default_cash_percentage or 0) / 100
            receita_estimada = True

    base = receita - comprometido - caixa_pretendido
    return schemas.PrevisaoOut(
        ano=today.year,
        mes=today.month,
        dia=today.day,
        historico_suficiente=historico_suficiente,
        receita=_round(receita),
        receita_estimada=receita_estimada,
        comprometido=_round(comprometido),
        variavel_ate_hoje=_round(variavel_ate_hoje),
        variavel_restante=_round(restante),
        caixa_pretendido=_round(caixa_pretendido),
        saldo_previsto=_round(base - restante),
        saldo_min=_round(base - restante_max),
        saldo_max=_round(base - restante_min),
    )


# =====================================================================================
# Indicadores
# =====================================================================================


def _normalize_description(text: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(sem_acento.lower().split())


def _slope(points: list[float]) -> Optional[float]:
    """Inclinação da regressão linear (unidade por passo) -- None com menos de 2 pontos."""
    if len(points) < 2:
        return None
    n = len(points)
    mean_x = (n - 1) / 2
    mean_y = sum(points) / n
    den = sum((x - mean_x) ** 2 for x in range(n))
    return sum((x - mean_x) * (y - mean_y) for x, y in enumerate(points)) / den


def build_indicadores(db: Session, user: models.User, ano: Optional[int], mes: Optional[int]) -> schemas.IndicadoresOut:
    if ano is None or mes is None:
        today = today_local()
        ano, mes = today.year, today.month
    referencia = date(ano, mes, 1)
    fim_ref = add_months(referencia, 1)
    totais = monthly_totals(db, user.id, add_months(referencia, -(INDICADORES_MESES - 1)), fim_ref)
    meses = sorted(totais.items())  # [((ano, mes), totais)] do mais antigo pro mais recente

    # 1. Taxa de poupança (caixa real ÷ receita): série mensal + janela móvel de 3 meses
    serie_poupanca = [
        schemas.PontoIndicador(
            ano=a, mes=m, valor=_round(t["total_caixa_real"] / t["total_receita"] * 100) if t["total_receita"] else None
        )
        for (a, m), t in meses
    ]
    ultimos3 = [t for _, t in meses[-3:]]
    receita3 = sum(t["total_receita"] for t in ultimos3)
    poupanca_3m = sum(t["total_caixa_real"] for t in ultimos3) / receita3 * 100 if receita3 else None

    # 2. Comprometimento futuro: parcelas já lançadas nos próximos 6 meses ÷ receita média
    inicio_futuro = fim_ref
    fim_futuro = add_months(inicio_futuro, COMPROMETIMENTO_MESES)
    parcelas_futuras = (
        db.query(models.Gasto.date, models.Gasto.value)
        .filter(
            models.Gasto.user_id == user.id,
            models.Gasto.is_installment.is_(True),
            models.Gasto.date >= inicio_futuro,
            models.Gasto.date < fim_futuro,
        )
        .all()
    )
    por_mes_futuro: dict[tuple[int, int], float] = {}
    ref = inicio_futuro
    while ref < fim_futuro:
        por_mes_futuro[(ref.year, ref.month)] = 0.0
        ref = add_months(ref, 1)
    for p in parcelas_futuras:
        por_mes_futuro[(p.date.year, p.date.month)] += p.value
    total_futuro = sum(por_mes_futuro.values())
    receitas6 = [t["total_receita"] for _, t in meses[-COMPROMETIMENTO_MESES:]]
    receita_media6 = sum(receitas6) / len(receitas6) if receitas6 else 0
    comprometimento_pct = total_futuro / (receita_media6 * COMPROMETIMENTO_MESES) * 100 if receita_media6 else None

    # 3. Custo fixo: gasto avulso com a mesma descrição, uma vez por mês, em 3 dos últimos 4 meses, com
    # valor estável (até 15% da mediana). Soma das medianas ÷ receita média de 3 meses.
    inicio_fixo = add_months(referencia, -(CUSTO_FIXO_MESES - 1))
    avulsos = (
        db.query(models.Gasto)
        .options(joinedload(models.Gasto.item))
        .filter(
            models.Gasto.user_id == user.id,
            models.Gasto.is_installment.is_(False),
            models.Gasto.description.isnot(None),
            models.Gasto.date >= inicio_fixo,
            models.Gasto.date < fim_ref,
        )
        .order_by(models.Gasto.date)
        .all()
    )
    ocorrencias: dict[str, dict[tuple[int, int], list[models.Gasto]]] = defaultdict(lambda: defaultdict(list))
    for g in avulsos:
        chave = _normalize_description(g.description)
        if chave:
            ocorrencias[chave][(g.date.year, g.date.month)].append(g)
    itens_fixos = []
    for por_mes in ocorrencias.values():
        if len(por_mes) < CUSTO_FIXO_MIN_PRESENCA or any(len(lista) > 1 for lista in por_mes.values()):
            continue
        valores = [lista[0].value for lista in por_mes.values()]
        mediana = statistics.median(valores)
        if mediana <= 0 or any(abs(v - mediana) > CUSTO_FIXO_VARIACAO_MAX * mediana for v in valores):
            continue
        mais_recente = por_mes[max(por_mes)][0]
        itens_fixos.append(
            schemas.CustoFixoItem(descricao=mais_recente.description, item_name=mais_recente.item_name, valor=_round(mediana))
        )
    itens_fixos.sort(key=lambda i: i.valor, reverse=True)
    custo_fixo = sum(i.valor for i in itens_fixos)
    receita_media3 = receita3 / len(ultimos3) if ultimos3 else 0
    custo_fixo_pct = custo_fixo / receita_media3 * 100 if receita_media3 else None

    # 4. Proporção de gastos essenciais: série + tendência (regressão linear, p.p. por mês)
    serie_essencial = [
        schemas.PontoIndicador(
            ano=a, mes=m, valor=_round(t["total_essenciais"] / t["total_gastos"] * 100) if t["total_gastos"] else None
        )
        for (a, m), t in meses
    ]
    pontos_essencial = [p.valor for p in serie_essencial if p.valor is not None]
    inclinacao = _slope(pontos_essencial)

    return schemas.IndicadoresOut(
        ano=ano,
        mes=mes,
        poupanca=schemas.IndicadorPoupanca(atual_3m_pct=_round(poupanca_3m), serie=serie_poupanca),
        comprometimento=schemas.IndicadorComprometimento(
            pct=_round(comprometimento_pct),
            total=_round(total_futuro),
            receita_media=_round(receita_media6),
            meses=[schemas.PontoIndicador(ano=a, mes=m, valor=_round(v)) for (a, m), v in sorted(por_mes_futuro.items())],
        ),
        custo_fixo=schemas.IndicadorCustoFixo(pct=_round(custo_fixo_pct), total=_round(custo_fixo), itens=itens_fixos),
        essencial=schemas.IndicadorEssencial(
            atual_pct=serie_essencial[-1].valor if serie_essencial else None,
            inclinacao_pp_mes=_round(inclinacao),
            serie=serie_essencial,
        ),
    )
