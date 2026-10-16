"""Relatório anual de receitas e gastos (PDF, Exportar Dados > Relatórios).

Decisões do usuário (2026-10-09): conteúdo completo (resumo com comparação com o ano anterior,
mês a mês, essencial x não essencial, categorias, maiores gastos, parcelas e contas fixas,
receitas, ritmo e inflação pessoal), sem seções dos outros módulos. Ano em andamento: os números
param **hoje** (lançamentos com data futura aparecem só numa seção "ainda programado"), e a
comparação com o ano anterior usa o mesmo período (1º/jan até o mesmo dia). Na virada do ano a
central de notificações avisa que o relatório do ano que passou está pronto (sem dados no aviso).
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app import models
from app.pdf_relatorio import (
    garantir_espaco,
    COR_ESSENCIAL,
    COR_GASTOS,
    COR_LINHA,
    COR_NAO_ESSENCIAL,
    COR_NEGATIVO,
    COR_RECEITA,
    COR_DESTAQUE,
    COR_SECUNDARIA,
    COR_TEXTO,
    MESES,
    MESES_CURTOS,
    barras_horizontais,
    brl,
    caixa_avisos,
    cartoes,
    explicacao,
    grafico_barras,
    novo_pdf,
    par,
    pct,
    tabela,
    titulo_secao,
)
from app.utils import today_local

TIPO_AVISO = "relatorio_anual"
# O aviso de "o ano virou" começa na virada de 2026 para 2027 (lançamento do recurso) -- sem isso,
# quem já usava o app ganharia na hora um aviso sobre 2025.
PRIMEIRO_ANO_AVISO = 2026
DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
MESES_REPETICAO = 3
VARIACAO_FIXA = 0.2  # até 20% da mediana
PRIORIDADE = {"essencial": "Essencial", "nao_essencial": "Não essencial"}


# --- Números ---

@dataclass
class Totais:
    receita: float = 0.0
    gastos: float = 0.0
    essencial: float = 0.0
    nao_essencial: float = 0.0
    pretendido: float = 0.0
    qtd_gastos: int = 0
    qtd_receitas: int = 0

    @property
    def caixa_real(self) -> float:
        return round(self.receita - self.gastos, 2)

    @property
    def poupanca_pct(self) -> Optional[float]:
        return self.caixa_real / self.receita * 100 if self.receita else None

    @property
    def meta_pct(self) -> Optional[float]:
        return self.pretendido / self.receita * 100 if self.receita else None

    @property
    def tem_dados(self) -> bool:
        return bool(self.qtd_gastos or self.qtd_receitas)


@dataclass
class Categoria:
    nome: str
    prioridade: str
    total: float
    anterior: float
    qtd: int

    @property
    def variacao_pct(self) -> Optional[float]:
        return (self.total - self.anterior) / self.anterior * 100 if self.anterior else None


@dataclass
class Parcelamento:
    nome: str
    parcelas: int
    valor_parcela: float

    @property
    def total(self) -> float:
        return round(self.parcelas * self.valor_parcela, 2)


@dataclass
class ContaFixa:
    nome: str
    tipo: str  # "gasto" | "receita"
    total: float
    meses: int


@dataclass
class RelatorioAnual:
    ano: int
    nome_usuario: str
    inicio: date
    corte: date
    em_andamento: bool
    atual: Totais
    anterior: Totais
    corte_anterior: date
    por_mes: list[tuple[int, Totais]]
    categorias: list[Categoria]
    maiores: list[models.Gasto]
    parcelas_pagas: float
    parcelamentos_novos: list[Parcelamento]
    parcelas_futuras: float
    parcelas_futuras_qtd: int
    parcelas_futuras_ate: Optional[date]
    contas_fixas: list[ContaFixa]
    fontes_receita: list[tuple[str, float, int]]
    por_dia_semana: list[tuple[str, float, int]]
    inflacao: Optional[tuple[list[str], float, float]]  # (cesta, atual, anterior)
    programado_gastos: float
    programado_receitas: float
    programado_qtd: int
    destaques: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    @property
    def meses_no_periodo(self) -> int:
        return self.corte.month

    @property
    def tem_anterior(self) -> bool:
        return self.anterior.tem_dados


def _mesmo_dia(ano: int, d: date) -> date:
    try:
        return d.replace(year=ano)
    except ValueError:  # 29/02 num ano não bissexto
        return date(ano, 2, 28)


def _somar(totais: Totais, gastos: list[models.Gasto], receitas: list[models.Receita]) -> Totais:
    for g in gastos:
        totais.gastos += g.value
        totais.qtd_gastos += 1
        if g.priority == "essencial":
            totais.essencial += g.value
        else:
            totais.nao_essencial += g.value
    for r in receitas:
        totais.receita += r.value
        totais.pretendido += r.cash_value
        totais.qtd_receitas += 1
    for campo in ("receita", "gastos", "essencial", "nao_essencial", "pretendido"):
        setattr(totais, campo, round(getattr(totais, campo), 2))
    return totais


def _rotulo_gasto(g: models.Gasto) -> str:
    descricao = (g.description or "").strip()
    if not descricao or descricao.lower() == g.item_name.lower():
        return g.item_name
    return f"{g.item_name} - {descricao}"


def anos_com_dados(db: Session, user: models.User, hoje: date) -> list[int]:
    """Anos com algum gasto ou receita até hoje, mais recente primeiro (sempre inclui o ano atual)."""
    anos = {hoje.year}
    for model in (models.Gasto, models.Receita):
        for (d,) in db.query(model.date).filter(model.user_id == user.id, model.date <= hoje).distinct():
            anos.add(d.year)
    return sorted(anos, reverse=True)


def montar_relatorio(db: Session, user: models.User, ano: int, hoje: date) -> RelatorioAnual:
    inicio, fim_ano = date(ano, 1, 1), date(ano, 12, 31)
    em_andamento = ano >= hoje.year
    corte = min(hoje, fim_ano) if em_andamento else fim_ano
    inicio_ant = date(ano - 1, 1, 1)
    corte_ant = _mesmo_dia(ano - 1, corte)

    gastos_todos = (
        db.query(models.Gasto)
        .options(joinedload(models.Gasto.item))
        .filter(models.Gasto.user_id == user.id, models.Gasto.date >= inicio_ant)
        .all()
    )
    receitas_todas = (
        db.query(models.Receita).filter(models.Receita.user_id == user.id, models.Receita.date >= inicio_ant).all()
    )
    gastos = [g for g in gastos_todos if inicio <= g.date <= corte]
    receitas = [r for r in receitas_todas if inicio <= r.date <= corte]
    gastos_ant = [g for g in gastos_todos if inicio_ant <= g.date <= corte_ant]
    receitas_ant = [r for r in receitas_todas if inicio_ant <= r.date <= corte_ant]

    atual = _somar(Totais(), gastos, receitas)
    anterior = _somar(Totais(), gastos_ant, receitas_ant)

    por_mes = [
        (
            mes,
            _somar(
                Totais(),
                [g for g in gastos if g.date.month == mes],
                [r for r in receitas if r.date.month == mes],
            ),
        )
        for mes in range(1, corte.month + 1)
    ]

    # Categorias (com o mesmo período do ano anterior)
    por_cat: dict[int, Categoria] = {}
    for lista, campo in ((gastos, "total"), (gastos_ant, "anterior")):
        for g in lista:
            cat = por_cat.setdefault(g.item_id, Categoria(g.item_name, g.item.priority, 0.0, 0.0, 0))
            setattr(cat, campo, getattr(cat, campo) + g.value)
            if campo == "total":
                cat.qtd += 1
    categorias = sorted((c for c in por_cat.values() if c.total > 0), key=lambda c: -c.total)
    for c in categorias:
        c.total, c.anterior = round(c.total, 2), round(c.anterior, 2)

    # Parcelas
    parcelados = [g for g in gastos if g.is_installment]
    parcelas_pagas = round(sum(g.value for g in parcelados), 2)
    parcelamentos_novos = sorted(
        (
            Parcelamento(_rotulo_gasto(g), g.installment_count or 1, g.value)
            for g in parcelados
            if g.installment_number == 1
        ),
        key=lambda p: -p.total,
    )
    futuras = [g for g in gastos_todos if g.is_installment and g.date > fim_ano]
    parcelas_futuras = round(sum(g.value for g in futuras), 2)
    parcelas_futuras_ate = max((g.date for g in futuras), default=None)

    # Contas fixas: recorrências cadastradas, ou o mesmo lançamento (categoria + descrição) uma vez
    # por mês em MESES_REPETICAO meses ou mais, com valor parecido -- muita conta fixa é lançada à
    # mão todo mês. Mercado em vários lançamentos de valores diferentes não entra.
    grupos: dict[tuple, list] = {}
    for g in gastos:
        if not g.is_installment:
            grupos.setdefault(("gasto", g.item_id, (g.description or "").strip().lower()), []).append(g)
    for r in receitas:
        grupos.setdefault(("receita", (r.description or "").strip().lower()), []).append(r)
    contas_fixas, ids_fixos = [], set()
    for chave, itens in grupos.items():
        meses = {i.date.month for i in itens}
        valores = sorted(i.value for i in itens)
        mediana = valores[len(valores) // 2]
        estavel = (
            len(meses) >= MESES_REPETICAO
            and len(itens) == len(meses)
            and all(abs(v - mediana) <= VARIACAO_FIXA * mediana for v in valores)
        )
        if not (estavel or any(i.recorrencia_id for i in itens)):
            continue
        if chave[0] == "gasto":
            nome = _rotulo_gasto(itens[0])
            ids_fixos.update(g.id for g in itens)
        else:
            nome = (itens[0].description or "").strip() or "Receita sem descrição"
        contas_fixas.append(ContaFixa(nome, chave[0], round(sum(i.value for i in itens), 2), len(meses)))
    contas_fixas.sort(key=lambda c: (c.tipo != "gasto", -c.total))

    # Maiores gastos pontuais (sem parcelas e sem o que se repete)
    pontuais = [g for g in gastos if not g.is_installment and g.id not in ids_fixos]
    maiores = sorted(pontuais, key=lambda g: (-g.value, g.date))[:10]

    # Fontes de receita (pela descrição)
    fontes: dict[str, list] = {}
    for r in receitas:
        nome = (r.description or "").strip() or "Sem descrição"
        fonte = fontes.setdefault(nome.lower(), [nome, 0.0, 0])
        fonte[1] += r.value
        fonte[2] += 1
    fontes_receita = sorted(((n, round(v, 2), q) for n, v, q in fontes.values()), key=lambda f: -f[1])

    # Gasto avulso por dia da semana (parcelas e recorrências têm data "de calendário", não de compra)
    semana: dict[int, list] = defaultdict(lambda: [0.0, 0])
    for g in gastos:
        if not g.is_installment and not g.recorrencia_id:
            semana[g.date.weekday()][0] += g.value
            semana[g.date.weekday()][1] += 1
    por_dia_semana = [(DIAS_SEMANA[d], round(semana[d][0], 2), semana[d][1]) for d in range(7)]

    # Inflação pessoal (só com o módulo)
    inflacao = None
    if "analise_inflacionaria" in user.modules:
        cesta = (
            db.query(models.DropdownOption)
            .filter(models.DropdownOption.user_id == user.id, models.DropdownOption.include_in_inflation.is_(True))
            .all()
        )
        if cesta:
            ids = {c.id for c in cesta}
            inflacao = (
                sorted(c.name for c in cesta),
                round(sum(g.value for g in gastos if g.item_id in ids), 2),
                round(sum(g.value for g in gastos_ant if g.item_id in ids), 2),
            )

    # Ainda programado no ano (datas futuras já lançadas)
    prog_g = [g for g in gastos_todos if corte < g.date <= fim_ano]
    prog_r = [r for r in receitas_todas if corte < r.date <= fim_ano]

    rel = RelatorioAnual(
        ano=ano,
        nome_usuario=f"{user.first_name} {user.last_name}".strip(),
        inicio=inicio,
        corte=corte,
        em_andamento=em_andamento,
        atual=atual,
        anterior=anterior,
        corte_anterior=corte_ant,
        por_mes=por_mes,
        categorias=categorias,
        maiores=maiores,
        parcelas_pagas=parcelas_pagas,
        parcelamentos_novos=parcelamentos_novos,
        parcelas_futuras=parcelas_futuras,
        parcelas_futuras_qtd=len(futuras),
        parcelas_futuras_ate=parcelas_futuras_ate,
        contas_fixas=contas_fixas,
        fontes_receita=fontes_receita,
        por_dia_semana=por_dia_semana,
        inflacao=inflacao,
        programado_gastos=round(sum(g.value for g in prog_g), 2),
        programado_receitas=round(sum(r.value for r in prog_r), 2),
        programado_qtd=len(prog_g) + len(prog_r),
    )
    rel.destaques = _destaques(rel)
    if em_andamento:
        rel.avisos.append(
            f"Relatório parcial: {ano} ainda não terminou. Os números vão até hoje ({corte:%d/%m/%Y}) e a "
            f"comparação usa o mesmo período de {ano - 1} (até {corte_ant:%d/%m})."
        )
    if not atual.tem_dados:
        rel.avisos.append(f"Nenhuma receita ou gasto lançado em {ano} até {corte:%d/%m/%Y}.")
    return rel


def _destaques(rel: RelatorioAnual) -> list[str]:
    a, ant = rel.atual, rel.anterior
    frases = []
    if a.receita:
        if a.caixa_real >= 0:
            frase = f"Você guardou {pct(a.poupanca_pct)} da receita ({brl(a.caixa_real)})"
            if a.meta_pct is not None and a.pretendido:
                frase += (
                    f", acima da meta de {pct(a.meta_pct)}." if a.poupanca_pct >= a.meta_pct
                    else f", abaixo da meta de {pct(a.meta_pct)}."
                )
            else:
                frase += "."
            frases.append(frase)
        else:
            frases.append(f"Os gastos passaram a receita em {brl(-a.caixa_real)} no período.")
    meses_com_gasto = [(m, t) for m, t in rel.por_mes if t.gastos]
    if len(meses_com_gasto) >= 2:
        caro = max(meses_com_gasto, key=lambda x: x[1].gastos)
        barato = min(meses_com_gasto, key=lambda x: x[1].gastos)
        frases.append(
            f"Mês mais caro: {MESES[caro[0] - 1].lower()} ({brl(caro[1].gastos)}); "
            f"mais econômico: {MESES[barato[0] - 1].lower()} ({brl(barato[1].gastos)})."
        )
    if rel.categorias and a.gastos:
        top = rel.categorias[0]
        frases.append(f"A maior categoria foi {top.nome}: {pct(top.total / a.gastos * 100)} de tudo que saiu.")
    if rel.tem_anterior and ant.gastos:
        var = (a.gastos - ant.gastos) / ant.gastos * 100
        frases.append(
            f"Os gastos {'subiram' if var >= 0 else 'caíram'} {pct(abs(var))} em relação ao mesmo período de {rel.ano - 1}."
        )
        cresceram = [c for c in rel.categorias if c.anterior and c.total - c.anterior >= 50]
        if cresceram:
            c = max(cresceram, key=lambda c: c.total - c.anterior)
            frases.append(
                f"Categoria que mais cresceu: {c.nome} (+{brl(c.total - c.anterior)}, {pct(c.variacao_pct, sinal=True)})."
            )
    meses_receita = [(m, t) for m, t in rel.por_mes if t.receita and t.pretendido]
    if meses_receita:
        cumpridos = sum(1 for _, t in meses_receita if t.caixa_real >= t.pretendido)
        frases.append(f"A meta de caixa foi cumprida em {cumpridos} de {len(meses_receita)} meses com receita.")
    return frases


# --- Aviso na central de notificações ---

def ensure_annual_report_notice(db: Session, user: models.User) -> None:
    """Na virada do ano, avisa (uma vez) que o relatório do ano que passou está pronto. Só pra quem
    tem Exportar Dados e teve algum lançamento naquele ano. O aviso não leva dados."""
    hoje = today_local()
    ano = hoje.year - 1
    if ano < PRIMEIRO_ANO_AVISO or "exportar_dados" not in user.modules:
        return
    existe = (
        db.query(models.Notificacao.id)
        .filter(
            models.Notificacao.user_id == user.id,
            models.Notificacao.tipo == TIPO_AVISO,
            models.Notificacao.ano == ano,
        )
        .first()
    )
    if existe:
        return
    inicio, fim = date(ano, 1, 1), date(ano, 12, 31)
    teve = any(
        db.query(model.id).filter(model.user_id == user.id, model.date >= inicio, model.date <= fim).first()
        for model in (models.Gasto, models.Receita)
    )
    if not teve:
        return
    db.add(
        models.Notificacao(
            user_id=user.id,
            tipo=TIPO_AVISO,
            ano=ano,
            mes=12,
            titulo=f"Seu relatório de {ano} está pronto",
            payload="{}",
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


# --- PDF ---

def _variacao(atual: float, anterior: float, sobe_e_bom: bool) -> tuple[str, Optional[tuple[int, int, int]]]:
    if not anterior:
        return ("sem base de comparação", None)
    var = (atual - anterior) / abs(anterior) * 100
    if abs(var) < 0.05:
        return ("igual ao ano anterior", None)
    bom = (var > 0) == sobe_e_bom
    return (f"{pct(var, sinal=True)} vs. ano anterior", COR_DESTAQUE if bom else COR_NEGATIVO)


def gerar_pdf(rel: RelatorioAnual, gerado_em: datetime) -> bytes:
    a, ant = rel.atual, rel.anterior
    pdf = novo_pdf(
        f"Relatório anual {rel.ano}",
        f"VR Finance - relatório de {rel.ano} gerado em {gerado_em:%d/%m/%Y %H:%M}.",
    )

    # Capa / resumo
    pdf.set_font("Helvetica", "B", 19)
    pdf.set_text_color(*COR_TEXTO)
    pdf.cell(0, 10, f"Relatório anual {rel.ano}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=10.5)
    pdf.set_text_color(*COR_SECUNDARIA)
    periodo = f"{rel.inicio:%d/%m/%Y} a {rel.corte:%d/%m/%Y}" + (" (parcial)" if rel.em_andamento else "")
    pdf.cell(0, 6, f"Receitas e gastos de {rel.nome_usuario} - {periodo}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    explicacao(
        pdf,
        "Este relatório resume tudo o que você lançou no app no ano: quanto entrou, quanto saiu, para onde foi "
        "o dinheiro e quanto sobrou. As porcentagens comparam com o mesmo período do ano anterior. "
        "No fim há um glossário com os termos usados.",
    )
    if rel.avisos:
        caixa_avisos(pdf, rel.avisos)

    obs_receita = _variacao(a.receita, ant.receita, True)
    obs_gastos = _variacao(a.gastos, ant.gastos, False)
    obs_ess = _variacao(a.essencial, ant.essencial, False)
    obs_nao = _variacao(a.nao_essencial, ant.nao_essencial, False)
    if ant.tem_dados:
        dif = a.caixa_real - ant.caixa_real
        obs_caixa = (f"{'+' if dif >= 0 else '-'}{brl(abs(dif))} vs. ano anterior", COR_DESTAQUE if dif >= 0 else COR_NEGATIVO)
    else:
        obs_caixa = ("sem base de comparação", None)
    meta = f"meta: {pct(a.meta_pct)}" if a.meta_pct is not None else "sem receita no período"
    cartoes(
        pdf,
        [
            ("Receita", brl(a.receita), *obs_receita),
            ("Gastos", brl(a.gastos), *obs_gastos),
            ("Caixa real (o que sobrou)", brl(a.caixa_real), *obs_caixa),
            ("Taxa de poupança", pct(a.poupanca_pct), meta, None),
            ("Essenciais", brl(a.essencial), *obs_ess),
            ("Não essenciais", brl(a.nao_essencial), *obs_nao),
        ],
    )
    if rel.destaques:
        titulo_secao(pdf, "Destaques do ano", 30)
        pdf.set_font("Helvetica", size=9.5)
        pdf.set_text_color(*COR_TEXTO)
        for frase in rel.destaques:
            pdf.multi_cell(0, 5.5, f"-  {frase}", align="L", new_x="LMARGIN", new_y="NEXT")

    if not a.tem_dados:
        return bytes(pdf.output())

    # 1. Mês a mês
    titulo_secao(pdf, "1. Mês a mês", 90)
    explicacao(
        pdf,
        "Barras: o que entrou (receita) e o que saiu (gastos) em cada mês. Linha: o caixa real, a diferença "
        "entre os dois -- abaixo de zero, o mês gastou mais do que recebeu.",
    )
    rotulos = [MESES_CURTOS[m - 1] for m, _ in rel.por_mes]
    grafico_barras(
        pdf,
        rotulos,
        [("Receita", [t.receita for _, t in rel.por_mes], COR_RECEITA), ("Gastos", [t.gastos for _, t in rel.por_mes], COR_GASTOS)],
        linha=("Caixa real", [t.caixa_real for _, t in rel.por_mes], COR_LINHA),
    )
    w = pdf.largura_util
    cols = [("Mês", w * 0.11, "L"), ("Receita", w * 0.13, "R"), ("Gastos", w * 0.13, "R"), ("Essencial", w * 0.13, "R"),
            ("Não essencial", w * 0.13, "R"), ("Caixa pretend.", w * 0.13, "R"), ("Caixa real", w * 0.13, "R"), ("Poupança", w * 0.11, "R")]
    garantir_espaco(pdf, 6.5 * (len(rel.por_mes) + 2))
    linhas, cores = [], []
    for m, t in rel.por_mes:
        linhas.append([MESES_CURTOS[m - 1], brl(t.receita), brl(t.gastos), brl(t.essencial), brl(t.nao_essencial),
                       brl(t.pretendido), brl(t.caixa_real), pct(t.poupanca_pct)])
        cores.append([None] * 6 + [COR_NEGATIVO if t.caixa_real < 0 else None, None])
    tabela(pdf, cols, linhas,
           total=["Total", brl(a.receita), brl(a.gastos), brl(a.essencial), brl(a.nao_essencial), brl(a.pretendido),
                  brl(a.caixa_real), pct(a.poupanca_pct)],
           cores=cores)

    # 2. Essencial x não essencial
    titulo_secao(pdf, "2. Essencial x não essencial", 80)
    if a.gastos:
        explicacao(
            pdf,
            f"Essenciais são as contas do dia a dia (moradia, mercado, saúde...); não essenciais, o que dá para "
            f"cortar. No ano, {pct(a.essencial / a.gastos * 100)} foi essencial e "
            f"{pct(a.nao_essencial / a.gastos * 100)} não essencial. Os valores de cada mês estão na tabela acima.",
        )
    grafico_barras(
        pdf,
        rotulos,
        [("Essencial", [t.essencial for _, t in rel.por_mes], COR_ESSENCIAL),
         ("Não essencial", [t.nao_essencial for _, t in rel.por_mes], COR_NAO_ESSENCIAL)],
        altura=55,
        empilhado=True,
    )

    # 3. Categorias
    titulo_secao(pdf, "3. Para onde foi o dinheiro", 80)
    explicacao(pdf, "As 10 categorias com mais gastos no período. A tabela traz todas, com a média por mês e a variação em relação ao ano anterior.")
    barras_horizontais(
        pdf,
        [(c.nome, c.total, f"{brl(c.total)}  ({pct(c.total / a.gastos * 100)})") for c in rel.categorias[:10]],
        COR_GASTOS,
    )
    pdf.ln(3)
    cols = [("Categoria", w * 0.27, "L"), ("Tipo", w * 0.15, "L"), ("Total", w * 0.15, "R"), ("% dos gastos", w * 0.12, "R"),
            ("Média/mês", w * 0.14, "R"), (f"vs. {rel.ano - 1}", w * 0.17, "R")]
    linhas, cores = [], []
    for c in rel.categorias:
        if c.variacao_pct is None:
            var, cor = ("novo" if rel.tem_anterior else "-"), None
        else:
            var = f"{pct(c.variacao_pct, sinal=True)}"
            cor = None if abs(c.variacao_pct) < 0.05 else COR_NEGATIVO if c.variacao_pct > 0 else COR_DESTAQUE
        linhas.append([c.nome, PRIORIDADE.get(c.prioridade, c.prioridade), brl(c.total), pct(c.total / a.gastos * 100),
                       brl(c.total / rel.meses_no_periodo), var])
        cores.append([None] * 5 + [cor])
    tabela(pdf, cols, linhas, cores=cores)

    # 4. Maiores gastos
    titulo_secao(pdf, "4. Maiores gastos pontuais", 60)
    explicacao(pdf, "Os 10 maiores gastos fora das parcelas e das contas fixas (essas estão na seção 5).")
    cols = [("Data", w * 0.14, "L"), ("Categoria", w * 0.24, "L"), ("Descrição", w * 0.44, "L"), ("Valor", w * 0.18, "R")]
    if rel.maiores:
        tabela(pdf, cols, [[f"{g.date:%d/%m/%Y}", g.item_name, g.description or "-", brl(g.value)] for g in rel.maiores])
    else:
        explicacao(pdf, "Nenhum gasto pontual no período.")

    # 5. Compromissos
    titulo_secao(pdf, "5. Compromissos: parcelas e contas fixas", 60)
    explicacao(
        pdf,
        "Parcelas e contas que se repetem são gastos que já chegam \"decididos\". Quanto maior essa parte, "
        "menos espaço sobra para escolher no mês. Conta fixa: recorrência cadastrada, ou o mesmo lançamento "
        f"(categoria e descrição) uma vez por mês, com valor parecido, em {MESES_REPETICAO} meses ou mais.",
    )
    par(pdf, "Pago em parcelas", f"{brl(rel.parcelas_pagas)}" + (f" ({pct(rel.parcelas_pagas / a.gastos * 100)} dos gastos)" if a.gastos else ""), 62)
    par(pdf, "Parcelamentos novos", f"{len(rel.parcelamentos_novos)} (total {brl(sum(p.total for p in rel.parcelamentos_novos))})", 62)
    if rel.parcelas_futuras_qtd:
        par(pdf, f"Já comprometido depois de {rel.ano}",
            f"{brl(rel.parcelas_futuras)} em {rel.parcelas_futuras_qtd} parcelas, até {rel.parcelas_futuras_ate:%m/%Y}", 62)
    fixas_gasto = sum(c.total for c in rel.contas_fixas if c.tipo == "gasto")
    par(pdf, "Contas fixas", brl(fixas_gasto) + (f" ({pct(fixas_gasto / a.gastos * 100)} dos gastos)" if a.gastos else ""), 62)
    if rel.parcelamentos_novos:
        pdf.ln(2)
        tabela(pdf, [("Parcelamento novo", w * 0.52, "L"), ("Parcelas", w * 0.14, "C"), ("Valor da parcela", w * 0.17, "R"), ("Total", w * 0.17, "R")],
               [[p.nome, f"{p.parcelas}x", brl(p.valor_parcela), brl(p.total)] for p in rel.parcelamentos_novos[:12]])
    if rel.contas_fixas:
        pdf.ln(2)
        tabela(pdf, [("Conta fixa", w * 0.52, "L"), ("Tipo", w * 0.14, "C"), ("Meses", w * 0.14, "C"), ("Total no ano", w * 0.2, "R")],
               [[c.nome, "Receita" if c.tipo == "receita" else "Gasto", str(c.meses), brl(c.total)] for c in rel.contas_fixas])

    # 6. Receitas
    titulo_secao(pdf, "6. Receitas", 60)
    meses_receita = [(m, t) for m, t in rel.por_mes if t.receita]
    if meses_receita:
        maior = max(meses_receita, key=lambda x: x[1].receita)
        par(pdf, "Receita média por mês", brl(a.receita / rel.meses_no_periodo), 62)
        par(pdf, "Mês de maior receita", f"{MESES[maior[0] - 1]} ({brl(maior[1].receita)})", 62)
        par(pdf, "Caixa pretendido no ano", f"{brl(a.pretendido)} (meta de {pct(a.meta_pct)} da receita)", 62)
        explicacao(pdf, "Principais fontes, agrupadas pela descrição que você deu a cada receita:")
        fontes = rel.fontes_receita[:8]
        if len(rel.fontes_receita) > 8:
            resto = rel.fontes_receita[8:]
            fontes.append(("Outras", round(sum(f[1] for f in resto), 2), sum(f[2] for f in resto)))
        barras_horizontais(pdf, [(n, v, f"{brl(v)}  ({q}x)") for n, v, q in fontes], COR_RECEITA)
    else:
        explicacao(pdf, "Nenhuma receita lançada no período.")

    # 7. Ritmo
    titulo_secao(pdf, "7. Ritmo dos gastos", 70)
    dias = (rel.corte - rel.inicio).days + 1
    par(pdf, "Média por mês", brl(a.gastos / rel.meses_no_periodo), 62)
    par(pdf, "Média por dia", brl(a.gastos / dias), 62)
    par(pdf, "Lançamentos", f"{a.qtd_gastos} gastos e {a.qtd_receitas} receitas", 62)
    melhores = [(m, t) for m, t in rel.por_mes if t.receita]
    if melhores:
        melhor = max(melhores, key=lambda x: x[1].caixa_real)
        par(pdf, "Mês em que mais sobrou", f"{MESES[melhor[0] - 1]} ({brl(melhor[1].caixa_real)})", 62)
    if any(q for _, _, q in rel.por_dia_semana):
        explicacao(pdf, "Gastos avulsos por dia da semana (sem parcelas e contas fixas, que caem em datas de calendário):")
        barras_horizontais(pdf, [(d, v, f"{brl(v)}  ({q}x)") for d, v, q in rel.por_dia_semana], COR_GASTOS, largura_rotulo=26, altura_linha=5.5)

    # 8. Inflação pessoal
    if rel.inflacao:
        cesta, total, total_ant = rel.inflacao
        # Reserva a seção inteira (a lista da cesta pode ocupar várias linhas) pra não partir no meio.
        pdf.set_font("Helvetica", "B", 9.5)
        linhas_cesta = len(pdf.multi_cell(pdf.largura_util - 62, 6, ", ".join(cesta), dry_run=True, output="LINES"))
        titulo_secao(pdf, "8. Inflação pessoal", 45 + 6 * linhas_cesta)
        explicacao(
            pdf,
            "Quanto você gastou na sua cesta de inflação (as categorias marcadas em Categorias) comparado ao mesmo "
            "período do ano anterior. Não é o IPCA: mede o seu próprio custo de vida.",
        )
        par(pdf, "Cesta", ", ".join(cesta), 62)
        par(pdf, f"Gasto na cesta em {rel.ano}", brl(total), 62)
        if total_ant:
            par(pdf, f"Mesmo período de {rel.ano - 1}", brl(total_ant), 62)
            par(pdf, "Variação", pct((total - total_ant) / total_ant * 100, sinal=True), 62)

    # 9. Programado
    if rel.em_andamento and rel.programado_qtd:
        titulo_secao(pdf, f"Ainda programado até o fim de {rel.ano}", 40)
        explicacao(pdf, "Lançamentos que já estão no app com data depois de hoje (parcelas, contas fixas e datas escolhidas). Não entram nos números acima.")
        par(pdf, "Gastos programados", brl(rel.programado_gastos), 62)
        par(pdf, "Receitas programadas", brl(rel.programado_receitas), 62)
        par(pdf, "Ano com o programado", f"receita {brl(a.receita + rel.programado_receitas)}, gastos {brl(a.gastos + rel.programado_gastos)}", 62)

    # Glossário
    titulo_secao(pdf, "Como ler este relatório", 50)
    for termo, texto in [
        ("Receita", "tudo o que entrou (salário, freelas, vendas...)."),
        ("Gastos", "tudo o que saiu; parcelas contam no mês em que caem."),
        ("Caixa pretendido", "a parte de cada receita que você planejou guardar (o % escolhido ao lançar a receita)."),
        ("Caixa real", "o que de fato sobrou: receita menos gastos."),
        ("Taxa de poupança", "caixa real dividido pela receita. A meta é o caixa pretendido dividido pela receita."),
        ("Essencial / não essencial", "a prioridade que você escolhe em cada gasto."),
    ]:
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(*COR_TEXTO)
        pdf.cell(44, 5, termo)
        pdf.set_font("Helvetica", size=8.5)
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.multi_cell(0, 5, texto, align="L", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
