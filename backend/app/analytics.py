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
from app.resumo_mensal import MESES_BASE, _indicador, _variacao_pct
from app.routers.resumo import monthly_totals
from app.utils import add_months, month_range, today_local

# --- Alerta de anomalia ---
ANOMALIA_MESES = 12
ANOMALIA_MIN_AMOSTRAS = 6  # menos lançamentos que isso: sem referência confiável, nunca alerta
ANOMALIA_Z_LIMITE = 3.5
ANOMALIA_MIN_DIFERENCA = 50.0
ANOMALIA_MULTIPLO_SEM_DISPERSAO = 3.0  # valores sempre iguais (MAD = 0): alerta a partir de 3× a mediana

# --- Previsão do fim do mês ---
PREVISAO_MESES_HISTORICO = 12
PREVISAO_MIN_MESES = 3
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

    # Por mês do histórico: quanto do gasto avulso aconteceu DEPOIS do "dia de hoje". O que ainda deve
    # sair este mês é a mediana disso, em R$ -- não uma extrapolação do ritmo (gasto até hoje ÷ fração
    # do mês): no começo do mês a fração é pequena e muito variável, e duas compras maiores nos
    # primeiros dias projetavam o dobro do mês normal.
    avulso_total: dict[tuple[int, int], float] = defaultdict(float)
    avulso_depois: dict[tuple[int, int], float] = defaultdict(float)
    for g in gastos:
        if g.date >= mes_atual or g.is_installment:
            continue
        key = (g.date.year, g.date.month)
        avulso_total[key] += g.value
        dia_limite = min(today.day, calendar.monthrange(g.date.year, g.date.month)[1])
        if g.date.day > dia_limite:
            avulso_depois[key] += g.value
    meses_validos = [k for k, total in avulso_total.items() if total > 0]
    depois = [avulso_depois[k] for k in meses_validos]
    historico_suficiente = len(meses_validos) >= PREVISAO_MIN_MESES

    # Avulsos já lançados com data futura neste mês fazem parte do que "ainda vai sair" -- e já estão
    # em comprometido, então saem do que falta estimar.
    ja_lancado_futuro = variavel_mes - variavel_ate_hoje

    def _restante(valor_tipico: float) -> float:
        return max(0.0, valor_tipico - ja_lancado_futuro)

    if depois:
        restante = _restante(statistics.median(depois))
        restante_min = _restante(_quantile(depois, 0.25))
        restante_max = _restante(_quantile(depois, 0.75))
    else:
        restante = restante_min = restante_max = 0.0

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
    # Séries com fim definido ficam de fora -- são compras parceladas lançadas como avulsas (ex: a
    # planilha importada não marcava parcelas): lançamentos depois do mês seguinte ao de referência
    # (o app não deixa lançar tão adiantado; só parcela chega lá) ou série que já parou. Série ligada
    # a uma recorrência sempre conta.
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
    com_fim_futuro = {
        _normalize_description(descricao)
        for (descricao,) in db.query(models.Gasto.description)
        .filter(
            models.Gasto.user_id == user.id,
            models.Gasto.is_installment.is_(False),
            models.Gasto.description.isnot(None),
            models.Gasto.date >= add_months(fim_ref, 1),
        )
        .distinct()
    }
    hoje = today_local()
    mes_ref = (referencia.year, referencia.month)
    itens_fixos = []
    for chave, por_mes in ocorrencias.items():
        if len(por_mes) < CUSTO_FIXO_MIN_PRESENCA or any(len(lista) > 1 for lista in por_mes.values()):
            continue
        if not any(lista[0].recorrencia_id for lista in por_mes.values()):
            if chave in com_fim_futuro:
                continue
            if max(por_mes) < mes_ref:
                # Sem lançamento no mês de referência: parou. No mês em andamento, só depois que o
                # dia de costume passou (a conta pode só não ter sido lançada ainda).
                ultimo = por_mes[max(por_mes)][0]
                em_andamento = mes_ref == (hoje.year, hoje.month)
                if not em_andamento or hoje.day > ultimo.date.day:
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


# =====================================================================================
# Detalhes do mês (modal "Ver detalhes")
# =====================================================================================


def build_detalhes_mes(db: Session, user: models.User, ano: int, mes: int) -> schemas.DetalhesMesOut:
    """Leitura do mês: totais com a mesma comparação do resumo da virada (média dos 3 meses anteriores
    com algum lançamento), gasto por categoria, composição e quanto ainda vai cair até o fim do mês."""
    today = today_local()
    referencia = date(ano, mes, 1)
    inicio, fim = month_range(ano, mes)
    bases = [add_months(referencia, -i) for i in range(1, MESES_BASE + 1)]
    totais_janela = monthly_totals(db, user.id, bases[-1], fim)
    totais = totais_janela[(ano, mes)]
    base_com_dados = [
        b for b in bases
        if totais_janela[(b.year, b.month)]["quantidade_gastos"] or totais_janela[(b.year, b.month)]["quantidade_receitas"]
    ]
    totais_base = [totais_janela[(b.year, b.month)] for b in base_com_dados]

    def _disponivel(t: dict) -> float:
        return round(t["total_receita"] - t["total_gastos"] - t["total_caixa_pretendido"], 2)

    def _ind(chave: str) -> schemas.IndicadorMensal:
        return _indicador(totais[chave], [t[chave] for t in totais_base])

    gastos = (
        db.query(models.Gasto)
        .options(joinedload(models.Gasto.item))
        .filter(models.Gasto.user_id == user.id, models.Gasto.date >= bases[-1], models.Gasto.date < fim)
        .all()
    )
    do_mes = [g for g in gastos if g.date >= inicio]
    meses_base = {(b.year, b.month) for b in base_com_dados}

    # Por categoria: total do mês e média dos meses base (com zero onde a categoria não apareceu).
    por_item: dict[int, dict] = {}
    for g in do_mes:
        info = por_item.setdefault(g.item_id, {"item": g.item, "priority": g.priority, "total": 0.0, "n": 0})
        info["total"] += g.value
        info["n"] += 1
    base_por_item: dict[int, float] = defaultdict(float)
    for g in gastos:
        if (g.date.year, g.date.month) in meses_base:
            base_por_item[g.item_id] += g.value
    total_gastos = totais["total_gastos"]
    categorias = []
    for item_id, info in por_item.items():
        media = base_por_item[item_id] / len(base_com_dados) if base_com_dados else None
        categorias.append(
            schemas.DetalheCategoria(
                item_id=item_id,
                item_name=info["item"].name,
                priority=info["priority"],
                total=_round(info["total"]),
                pct=_round(info["total"] / total_gastos * 100) if total_gastos else 0.0,
                lancamentos=info["n"],
                media=_round(media) if media is not None else None,
                variacao_pct=_round(_variacao_pct(info["total"], media)) if media else None,
            )
        )
    categorias.sort(key=lambda c: (-c.total, c.item_name))

    composicao = schemas.ComposicaoGastos(
        recorrentes=_round(sum(g.value for g in do_mes if g.recorrencia_id and not g.is_installment)),
        parcelas=_round(sum(g.value for g in do_mes if g.is_installment)),
        avulsos_essenciais=_round(
            sum(g.value for g in do_mes if not g.is_installment and not g.recorrencia_id and g.priority == "essencial")
        ),
        avulsos_nao_essenciais=_round(
            sum(g.value for g in do_mes if not g.is_installment and not g.recorrencia_id and g.priority != "essencial")
        ),
    )

    mes_atual = date(today.year, today.month, 1)
    situacao = "atual" if referencia == mes_atual else ("passado" if referencia < mes_atual else "futuro")
    programado = sum(g.value for g in do_mes if g.date > today)

    return schemas.DetalhesMesOut(
        ano=ano,
        mes=mes,
        situacao=situacao,
        dia_atual=today.day if situacao == "atual" else None,
        dias_no_mes=calendar.monthrange(ano, mes)[1],
        meses_base=MESES_BASE,
        receita=_ind("total_receita"),
        gastos=_ind("total_gastos"),
        caixa_pretendido=_ind("total_caixa_pretendido"),
        caixa_real=_ind("total_caixa_real"),
        disponivel=_indicador(_disponivel(totais), [_disponivel(t) for t in totais_base]),
        quantidade_gastos=totais["quantidade_gastos"],
        quantidade_receitas=totais["quantidade_receitas"],
        categorias=categorias,
        composicao=composicao,
        ja_lancado=_round(total_gastos - programado),
        programado=_round(programado),
    )
