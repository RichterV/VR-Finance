"""Base dos relatórios em PDF (declaração anual do MEI, relatório anual de receitas e gastos):
cores, cabeçalho/rodapé, títulos de seção, tabelas e gráficos desenhados direto com fpdf2 (sem
matplotlib -- nada de dependência pesada no servidor).

Gráficos seguem a paleta categórica validada (ver CLAUDE.md): receita azul, gastos laranja,
essencial água, não essencial amarelo -- os dois últimos têm contraste baixo no papel branco, então
sempre vão com legenda e com uma tabela dos mesmos números por perto. Um eixo só por gráfico.
"""

import math
from typing import Optional, Sequence

from fpdf import FPDF

MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

# Fundo em tom de papel (não branco puro -- menos brilho pra quem tem visão sensível ou moscas
# volantes, pedido do usuário). Superfícies um degrau mais escuras, sem bordas: visual minimalista.
COR_FUNDO = (242, 239, 233)  # #f2efe9
COR_SUPERFICIE = (233, 229, 221)  # cartões, cabeçalho de tabela
COR_TEXTO = (38, 40, 46)
COR_SECUNDARIA = (110, 108, 102)
COR_BORDA = (214, 209, 199)
COR_GRADE = (224, 219, 210)
COR_DESTAQUE = (21, 128, 61)
COR_FUNDO_DESTAQUE = (222, 233, 220)
COR_AVISO = (146, 64, 14)
COR_FUNDO_AVISO = (240, 228, 205)
COR_CABECALHO = COR_SUPERFICIE
COR_NEGATIVO = (190, 38, 38)

# Séries: paleta categórica validada contra o fundo #f2efe9 (degraus mais escuros da mesma escala)
COR_RECEITA = (42, 120, 214)  # #2a78d6
COR_GASTOS = (217, 89, 38)  # #d95926
COR_ESSENCIAL = (25, 158, 112)  # #199e70
COR_NAO_ESSENCIAL = (201, 133, 0)  # #c98500
COR_LINHA = COR_TEXTO  # caixa real: tinta neutra, não compete com as barras

Cor = tuple[int, int, int]


def brl(valor: float) -> str:
    texto = f"{abs(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{'-' if valor < 0 else ''}R$ {texto}"


def brl_curto(valor: float) -> str:
    """Rótulo de eixo: R$ 12 mil, R$ 1,5 mil, R$ 800."""
    sinal = "-" if valor < 0 else ""
    v = abs(valor)
    if v >= 1_000_000:
        texto = f"{v / 1_000_000:.1f}".rstrip("0").rstrip(".").replace(".", ",") + " mi"
    elif v >= 1000:
        texto = f"{v / 1000:.1f}".rstrip("0").rstrip(".").replace(".", ",") + " mil"
    else:
        texto = f"{v:.0f}"
    return f"{sinal}R$ {texto}"


def pct(valor: Optional[float], casas: int = 1, sinal: bool = False) -> str:
    if valor is None:
        return "-"
    texto = f"{valor:+.{casas}f}" if sinal else f"{valor:.{casas}f}"
    return texto.replace(".", ",") + "%"


class Pdf(FPDF):
    rodape = ""

    def header(self) -> None:
        # Pinta a página inteira antes do conteúdo (o fpdf2 chama header() a cada página nova).
        self.set_fill_color(*COR_FUNDO)
        self.rect(0, 0, self.w, self.h, style="F")

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", size=7.5)
        self.set_text_color(*COR_SECUNDARIA)
        self.cell(0, 5, self.rodape, align="L")
        self.set_x(self.l_margin)
        self.cell(0, 5, f"Página {self.page_no()} de {{nb}}", align="R")

    @property
    def largura_util(self) -> float:
        return self.w - self.l_margin - self.r_margin


def novo_pdf(titulo: str, rodape: str) -> Pdf:
    pdf = Pdf(format="A4")
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_title(titulo)
    pdf.set_creator("VR Finance")
    pdf.rodape = rodape
    pdf.add_page()
    return pdf


def garantir_espaco(pdf: Pdf, altura: float) -> None:
    if pdf.get_y() + altura > pdf.h - 18:
        pdf.add_page()


def titulo_secao(pdf: Pdf, texto: str, espaco_minimo: float = 45) -> None:
    garantir_espaco(pdf, espaco_minimo)
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*COR_TEXTO)
    pdf.cell(0, 7, texto, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*COR_BORDA)
    pdf.set_line_width(0.15)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(2.5)


def explicacao(pdf: Pdf, texto: str) -> None:
    """Parágrafo curto em cinza explicando como ler a seção."""
    pdf.set_font("Helvetica", size=8.5)
    pdf.set_text_color(*COR_SECUNDARIA)
    pdf.multi_cell(0, 4.5, texto, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def cortar(pdf: Pdf, texto: str, largura: float) -> str:
    if pdf.get_string_width(texto) <= largura - 2:
        return texto
    while texto and pdf.get_string_width(texto + "...") > largura - 2:
        texto = texto[:-1]
    return texto.rstrip() + "..."


def tabela(
    pdf: Pdf,
    colunas: list[tuple[str, float, str]],
    linhas: list[list[str]],
    total: Optional[list[str]] = None,
    cores: Optional[list[Optional[list[Optional[Cor]]]]] = None,
) -> None:
    """colunas = (título, largura em mm, alinhamento 'L'|'R'|'C'). `cores[i][j]`: cor do texto da
    célula (None = padrão)."""

    def cabecalho() -> None:
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.set_line_width(0.3)
        for titulo, largura, alinhamento in colunas:
            pdf.cell(largura, 6.5, titulo, border="B", align=alinhamento)
        pdf.ln()
        pdf.set_line_width(0.1)

    pdf.set_draw_color(*COR_BORDA)
    cabecalho()
    for i, linha in enumerate(linhas):
        if pdf.get_y() > pdf.h - 24:
            pdf.add_page()
            cabecalho()
        pdf.set_font("Helvetica", size=8.5)
        for j, ((_, largura, alinhamento), valor) in enumerate(zip(colunas, linha)):
            cor = cores[i][j] if cores and cores[i] and j < len(cores[i]) else None
            pdf.set_text_color(*(cor or COR_TEXTO))
            pdf.cell(largura, 6, cortar(pdf, valor, largura), border="B", align=alinhamento)
        pdf.ln()
    if total:
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(*COR_TEXTO)
        for (_, largura, alinhamento), valor in zip(colunas, total):
            pdf.cell(largura, 6.5, valor, align=alinhamento)
        pdf.ln()


def par(pdf: Pdf, rotulo: str, valor: str, largura_rotulo: float = 48) -> None:
    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(*COR_SECUNDARIA)
    pdf.cell(largura_rotulo, 6, rotulo)
    pdf.set_font("Helvetica", "B", 9.5)
    pdf.set_text_color(*COR_TEXTO)
    # multi_cell: valor longo (ex: a lista da cesta de inflação) quebra linha alinhado ao valor,
    # em vez de vazar da página.
    pdf.multi_cell(0, 6, valor, align="L", new_x="LMARGIN", new_y="NEXT")


def caixa_avisos(pdf: Pdf, avisos: Sequence[str]) -> None:
    """Cada aviso numa faixa de fundo âmbar suave, com uma barra fina à esquerda."""
    pdf.set_font("Helvetica", size=9)
    for aviso in avisos:
        x, y = pdf.l_margin, pdf.get_y()
        linhas = len(pdf.multi_cell(pdf.largura_util - 8, 5, aviso, dry_run=True, output="LINES"))
        altura = linhas * 5 + 4
        garantir_espaco(pdf, altura + 2)
        x, y = pdf.l_margin, pdf.get_y()
        pdf.set_fill_color(*COR_FUNDO_AVISO)
        pdf.rect(x, y, pdf.largura_util, altura, style="F", round_corners=True, corner_radius=1.5)
        pdf.set_fill_color(*COR_AVISO)
        pdf.rect(x, y, 1.2, altura, style="F")
        pdf.set_xy(x + 5, y + 2)
        pdf.set_text_color(*COR_AVISO)
        pdf.multi_cell(pdf.largura_util - 8, 5, aviso, align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.set_y(y + altura + 2)


def cartoes(pdf: Pdf, itens: list[tuple[str, str, str, Optional[Cor]]], por_linha: int = 3) -> None:
    """Cartões de número em destaque: (rótulo, valor, observação, cor da observação)."""
    gap = 4
    largura = (pdf.largura_util - gap * (por_linha - 1)) / por_linha
    altura = 21
    for inicio in range(0, len(itens), por_linha):
        garantir_espaco(pdf, altura + 2)
        y = pdf.get_y()
        for k, (rotulo, valor, obs, cor_obs) in enumerate(itens[inicio:inicio + por_linha]):
            x = pdf.l_margin + k * (largura + gap)
            pdf.set_fill_color(*COR_SUPERFICIE)
            pdf.rect(x, y, largura, altura, style="F", round_corners=True, corner_radius=2.5)
            pdf.set_xy(x + 3, y + 2.5)
            pdf.set_font("Helvetica", size=8)
            pdf.set_text_color(*COR_SECUNDARIA)
            pdf.cell(largura - 6, 4, rotulo)
            pdf.set_xy(x + 3, y + 7)
            pdf.set_font("Helvetica", "B", 12.5)
            pdf.set_text_color(*COR_TEXTO)
            pdf.cell(largura - 6, 6.5, cortar(pdf, valor, largura - 6))
            pdf.set_xy(x + 3, y + 14)
            pdf.set_font("Helvetica", size=7.5)
            pdf.set_text_color(*(cor_obs or COR_SECUNDARIA))
            pdf.cell(largura - 6, 4, cortar(pdf, obs, largura - 6))
        pdf.set_y(y + altura + gap)


# --- Gráficos ---

def _escala(minimo: float, maximo: float, divisoes: int = 4) -> tuple[float, float, float]:
    """Limites e passo "redondos" (1, 2, 2,5, 5 x 10^n) cobrindo [minimo, maximo]."""
    minimo, maximo = min(minimo, 0.0), max(maximo, 0.0)
    if maximo == minimo:
        maximo = minimo + 1
    bruto = (maximo - minimo) / divisoes
    base = 10 ** math.floor(math.log10(bruto))
    passo = next(m * base for m in (1, 2, 2.5, 5, 10) if m * base >= bruto)
    return math.floor(minimo / passo) * passo, math.ceil(maximo / passo) * passo, passo


def _legenda(pdf: Pdf, x: float, y: float, itens: list[tuple[str, Cor, str]]) -> None:
    """itens = (nome, cor, 'barra' | 'linha')."""
    pdf.set_font("Helvetica", size=7.5)
    for nome, cor, tipo in itens:
        if tipo == "linha":
            pdf.set_draw_color(*cor)
            pdf.set_line_width(0.6)
            pdf.line(x, y + 1.8, x + 5, y + 1.8)
            pdf.set_fill_color(*cor)
            pdf.ellipse(x + 1.7, y + 0.9, 1.8, 1.8, style="F")
            x += 6.5
        else:
            pdf.set_fill_color(*cor)
            pdf.rect(x, y + 0.5, 2.8, 2.8, style="F", round_corners=True, corner_radius=0.5)
            x += 4
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.set_xy(x, y)
        pdf.cell(pdf.get_string_width(nome) + 1, 3.8, nome)
        x += pdf.get_string_width(nome) + 5


def grafico_barras(
    pdf: Pdf,
    rotulos: list[str],
    series: list[tuple[str, list[float], Cor]],
    altura: float = 62,
    linha: Optional[tuple[str, list[float], Cor]] = None,
    empilhado: bool = False,
    formato=brl_curto,
) -> None:
    """Barras por categoria do eixo x (agrupadas ou empilhadas), com uma linha opcional na mesma
    escala (mesmo eixo -- nunca dois eixos). Legenda em cima quando há mais de uma série."""
    garantir_espaco(pdf, altura + 8)
    x0, topo = pdf.l_margin, pdf.get_y()
    nomes_legenda = [(n, c, "barra") for n, _, c in series] + ([(linha[0], linha[2], "linha")] if linha else [])
    if len(nomes_legenda) > 1:
        _legenda(pdf, x0, topo, nomes_legenda)
        topo += 6
    eixo_y = 17  # largura dos rótulos do eixo
    area_x, area_w = x0 + eixo_y, pdf.largura_util - eixo_y
    area_y, area_h = topo + 1, altura - 8

    if empilhado:
        positivos = [sum(max(s[1][i], 0) for s in series) for i in range(len(rotulos))]
        valores = positivos
    else:
        valores = [v for _, vs, _ in series for v in vs]
    if linha:
        valores = valores + [v for v in linha[1] if v is not None]
    vmin, vmax, passo = _escala(min(valores, default=0), max(valores, default=1))

    def y_de(v: float) -> float:
        return area_y + area_h - (v - vmin) / (vmax - vmin) * area_h

    # grade e rótulos do eixo
    pdf.set_font("Helvetica", size=6.8)
    pdf.set_line_width(0.15)
    tick = vmin
    while tick <= vmax + passo / 2:
        y = y_de(tick)
        pdf.set_draw_color(*(COR_SECUNDARIA if abs(tick) < 1e-9 else COR_GRADE))
        pdf.line(area_x, y, area_x + area_w, y)
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.set_xy(x0, y - 1.8)
        pdf.cell(eixo_y - 1.5, 3.6, formato(tick), align="R")
        tick += passo

    n = len(rotulos)
    slot = area_w / max(n, 1)
    grupo = slot * 0.72
    zero = y_de(0)
    for i, rotulo in enumerate(rotulos):
        gx = area_x + i * slot + (slot - grupo) / 2
        if empilhado:
            base = zero
            for _, vs, cor in series:
                v = max(vs[i], 0)
                if v <= 0:
                    continue
                h = zero - y_de(v)
                pdf.set_fill_color(*cor)
                pdf.rect(gx, base - h, grupo, max(h - 0.4, 0.1), style="F")  # 0,4 mm de respiro entre segmentos
                base -= h
        else:
            bw = grupo / len(series)
            for k, (_, vs, cor) in enumerate(series):
                v = vs[i]
                if not v:
                    continue
                y1, y2 = sorted((y_de(v), zero))
                pdf.set_fill_color(*cor)
                pdf.rect(gx + k * bw + 0.2, y1, bw - 0.4, max(y2 - y1, 0.1), style="F")
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.set_font("Helvetica", size=6.8)
        pdf.set_xy(area_x + i * slot, area_y + area_h + 1)
        pdf.cell(slot, 3.5, rotulo, align="C")

    if linha:
        pontos = [
            (area_x + i * slot + slot / 2, y_de(v)) for i, v in enumerate(linha[1]) if v is not None
        ]
        pdf.set_draw_color(*linha[2])
        pdf.set_line_width(0.5)
        for a, b in zip(pontos, pontos[1:]):
            pdf.line(a[0], a[1], b[0], b[1])
        pdf.set_fill_color(*linha[2])
        pdf.set_draw_color(*COR_FUNDO)
        pdf.set_line_width(0.3)
        for px, py in pontos:
            pdf.ellipse(px - 1, py - 1, 2, 2, style="DF")
    pdf.set_line_width(0.2)
    pdf.set_y(area_y + area_h + 6)


def barras_horizontais(
    pdf: Pdf,
    itens: list[tuple[str, float, str]],
    cor: Cor,
    largura_rotulo: float = 48,
    altura_linha: float = 6,
) -> None:
    """Uma barra por item (rótulo à esquerda, valor escrito logo depois da barra), escala pelo maior."""
    if not itens:
        return
    maior = max(v for _, v, _ in itens) or 1
    largura_valor = 34
    area = pdf.largura_util - largura_rotulo - largura_valor
    for rotulo, valor, texto in itens:
        garantir_espaco(pdf, altura_linha)
        y = pdf.get_y()
        pdf.set_font("Helvetica", size=8.5)
        pdf.set_text_color(*COR_TEXTO)
        pdf.set_xy(pdf.l_margin, y)
        pdf.cell(largura_rotulo, altura_linha, cortar(pdf, rotulo, largura_rotulo))
        w = max(area * valor / maior, 0.6)
        pdf.set_fill_color(*cor)
        pdf.rect(pdf.l_margin + largura_rotulo, y + 1.3, w, altura_linha - 2.6, style="F", round_corners=True, corner_radius=0.8)
        pdf.set_xy(pdf.l_margin + largura_rotulo + w + 1.5, y)
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.set_font("Helvetica", size=8)
        pdf.cell(largura_valor, altura_linha, texto)
        pdf.set_y(y + altura_linha)
