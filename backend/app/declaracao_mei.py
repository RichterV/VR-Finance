"""Declaração anual do MEI (DASN-SIMEI): junta os números do ano e gera um PDF de apoio com o que
é preciso digitar no Portal do Empreendedor (não substitui a declaração oficial).

Regras (decisões do usuário): o ano de cada nota é o da **competência** (mesma regra do limite);
notas substituídas ficam fora do total, mas aparecem numa lista à parte; receita sem nota
(`outras_receitas`) entra no total de serviços; falta na numeração das notas vira aviso.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

from fpdf import FPDF
from sqlalchemy.orm import Session

from app import models
from app.empresa import limite_do_ano, situacao_limite

MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

SITUACAO_TEXTO = {
    "ok": "Dentro do limite do MEI.",
    "atencao": "Atenção: passou de 80% do limite do ano.",
    "excedido_ate_20": (
        "Passou do limite em até 20%: paga imposto sobre o excesso na própria DASN-SIMEI e deixa de ser "
        "MEI a partir de janeiro do ano seguinte."
    ),
    "excedido_acima_20": (
        "Passou mais de 20% do limite: o desenquadramento do MEI vale desde janeiro (ou desde a abertura). "
        "Vale procurar um contador antes de declarar."
    ),
}


@dataclass
class DeclaracaoAnual:
    ano: int
    empresa: models.Empresa
    periodo_inicio: date
    periodo_fim: date
    notas: list[models.NotaFiscal]
    substituidas: list[tuple[models.NotaFiscal, Optional[str]]]
    total_notas: float
    outras_receitas: float
    receita_servicos: float
    por_mes: list[tuple[int, int, float]]  # (mês, quantidade de notas, valor)
    limite: float
    pct_limite: float
    situacao: str
    em_andamento: bool
    avisos: list[str] = field(default_factory=list)


def brl(valor: float) -> str:
    texto = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {texto}"


def formatar_cnpj(cnpj: str) -> str:
    if len(cnpj) != 14:
        return cnpj
    return f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"


def _numero_int(numero: str) -> Optional[int]:
    return int(numero) if numero.isdigit() else None


def _faixas(numeros: list[int]) -> list[tuple[int, int]]:
    """[3, 4, 5, 9] -> [(3, 5), (9, 9)]"""
    faixas: list[tuple[int, int]] = []
    for n in numeros:
        if faixas and n == faixas[-1][1] + 1:
            faixas[-1] = (faixas[-1][0], n)
        else:
            faixas.append((n, n))
    return faixas


def avisos_numeracao(todas: list[models.NotaFiscal], ano: int) -> list[str]:
    """Números que faltam na sequência das notas (ex: tem a 2 e a 4, falta a 3) -- pode ser uma
    nota esquecida. Só avisa no ano da nota anterior ou da seguinte ao buraco."""
    por_numero = {n: nota for nota in todas if (n := _numero_int(nota.numero)) is not None}
    if len(por_numero) < 2:
        return []
    existentes = sorted(por_numero)
    faltando = sorted(set(range(existentes[0], existentes[-1] + 1)) - set(existentes))
    avisos = []
    for inicio, fim in _faixas(faltando):
        anterior = por_numero[max(n for n in existentes if n < inicio)]
        seguinte = por_numero[min(n for n in existentes if n > fim)]
        if ano not in (anterior.competencia.year, seguinte.competencia.year):
            continue
        rotulo = f"a nota nº {inicio}" if inicio == fim else f"as notas nº {inicio} a {fim}"
        avisos.append(
            f"Falta {rotulo} na sequência (entre a nº {anterior.numero}, competência "
            f"{anterior.competencia:%m/%Y}, e a nº {seguinte.numero}, competência {seguinte.competencia:%m/%Y}). "
            "Se for deste ano, cadastre a nota ou informe o valor em \"Outras receitas sem nota\"."
        )
    return avisos


def montar_declaracao(
    db: Session, empresa: models.Empresa, ano: int, outras_receitas: float, hoje: date
) -> DeclaracaoAnual:
    todas = db.query(models.NotaFiscal).filter(models.NotaFiscal.user_id == empresa.user_id).all()
    do_ano = sorted(
        (n for n in todas if n.competencia.year == ano),
        key=lambda n: (n.competencia, n.data_emissao, _numero_int(n.numero) or 0, n.numero),
    )
    numero_por_id = {n.id: n.numero for n in todas}
    notas = [n for n in do_ano if n.substituida_por is None]
    substituidas = [(n, numero_por_id.get(n.substituida_por)) for n in do_ano if n.substituida_por is not None]

    abertura = empresa.data_abertura
    inicio = abertura if ano == abertura.year else date(ano, 1, 1)
    total_notas = round(sum(n.valor for n in notas), 2)
    outras_receitas = round(outras_receitas, 2)
    receita = round(total_notas + outras_receitas, 2)

    por_mes = []
    for mes in range(inicio.month, 13):
        doms = [n for n in notas if n.competencia.month == mes]
        por_mes.append((mes, len(doms), round(sum(n.valor for n in doms), 2)))

    limite = limite_do_ano(empresa, ano)
    pct = round(receita / limite * 100, 1) if limite else 0.0
    situacao = situacao_limite(pct)
    em_andamento = ano >= hoje.year

    avisos = []
    if em_andamento:
        avisos.append(f"O ano de {ano} ainda não terminou: os valores são parciais. A declaração é entregue até 31 de maio do ano seguinte.")
    if not notas and not outras_receitas:
        avisos.append(f"Nenhuma nota fiscal com competência em {ano}. Se não houve faturamento, a declaração é feita com receita zero.")
    avisos += avisos_numeracao(todas, ano)
    if situacao in ("excedido_ate_20", "excedido_acima_20"):
        avisos.append(SITUACAO_TEXTO[situacao])

    return DeclaracaoAnual(
        ano=ano,
        empresa=empresa,
        periodo_inicio=inicio,
        periodo_fim=date(ano, 12, 31),
        notas=notas,
        substituidas=substituidas,
        total_notas=total_notas,
        outras_receitas=outras_receitas,
        receita_servicos=receita,
        por_mes=por_mes,
        limite=limite,
        pct_limite=pct,
        situacao=situacao,
        em_andamento=em_andamento,
        avisos=avisos,
    )


# --- PDF ---

COR_TEXTO = (17, 24, 39)
COR_SECUNDARIA = (100, 116, 139)
COR_BORDA = (203, 213, 225)
COR_DESTAQUE = (22, 163, 74)
COR_FUNDO_DESTAQUE = (240, 253, 244)
COR_AVISO = (180, 83, 9)
COR_FUNDO_AVISO = (255, 251, 235)
COR_CABECALHO = (241, 245, 249)


class _Pdf(FPDF):
    rodape = ""

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", size=7.5)
        self.set_text_color(*COR_SECUNDARIA)
        self.cell(0, 5, self.rodape, align="L")
        self.set_x(self.l_margin)
        self.cell(0, 5, f"Página {self.page_no()} de {{nb}}", align="R")


def _titulo_secao(pdf: _Pdf, texto: str) -> None:
    if pdf.get_y() > pdf.h - 45:
        pdf.add_page()
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 11.5)
    pdf.set_text_color(*COR_TEXTO)
    pdf.cell(0, 7, texto, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*COR_BORDA)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(2)


def _cortar(pdf: _Pdf, texto: str, largura: float) -> str:
    if pdf.get_string_width(texto) <= largura - 2:
        return texto
    while texto and pdf.get_string_width(texto + "...") > largura - 2:
        texto = texto[:-1]
    return texto.rstrip() + "..."


def _tabela(pdf: _Pdf, colunas: list[tuple[str, float, str]], linhas: list[list[str]], total: Optional[list[str]] = None) -> None:
    """colunas = (título, largura em mm, alinhamento 'L'|'R'|'C')."""

    def cabecalho() -> None:
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_fill_color(*COR_CABECALHO)
        pdf.set_text_color(*COR_SECUNDARIA)
        for titulo, largura, alinhamento in colunas:
            pdf.cell(largura, 6.5, titulo, border="B", align=alinhamento, fill=True)
        pdf.ln()

    cabecalho()
    pdf.set_text_color(*COR_TEXTO)
    for linha in linhas:
        if pdf.get_y() > pdf.h - 22:
            pdf.add_page()
            cabecalho()
            pdf.set_text_color(*COR_TEXTO)
        pdf.set_font("Helvetica", size=8.5)
        for (_, largura, alinhamento), valor in zip(colunas, linha):
            pdf.cell(largura, 6, _cortar(pdf, valor, largura), border="B", align=alinhamento)
        pdf.ln()
    if total:
        pdf.set_font("Helvetica", "B", 8.5)
        for (_, largura, alinhamento), valor in zip(colunas, total):
            pdf.cell(largura, 6.5, valor, align=alinhamento)
        pdf.ln()


def _par(pdf: _Pdf, rotulo: str, valor: str, largura_rotulo: float = 48) -> None:
    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(*COR_SECUNDARIA)
    pdf.cell(largura_rotulo, 6, rotulo)
    pdf.set_font("Helvetica", "B", 9.5)
    pdf.set_text_color(*COR_TEXTO)
    pdf.cell(0, 6, valor, new_x="LMARGIN", new_y="NEXT")


def gerar_pdf(dados: DeclaracaoAnual, empregado: bool, gerado_em: datetime) -> bytes:
    pdf = _Pdf(format="A4")
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_title(f"Declaração anual do MEI {dados.ano}")
    pdf.set_creator("VR Finance")
    pdf.rodape = f"VR Finance - gerado em {gerado_em:%d/%m/%Y %H:%M}. Documento de apoio: não substitui a declaração oficial."
    pdf.add_page()
    largura_util = pdf.w - pdf.l_margin - pdf.r_margin

    # Cabeçalho
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(*COR_TEXTO)
    pdf.cell(0, 9, "Declaração Anual do MEI (DASN-SIMEI)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=10.5)
    pdf.set_text_color(*COR_SECUNDARIA)
    pdf.cell(0, 6, f"Dados para preenchimento - ano-calendário {dados.ano}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=8.5)
    pdf.multi_cell(
        0, 4.5,
        "A declaração é transmitida no Portal do Empreendedor (gov.br/mei) até 31 de maio do ano seguinte. "
        "Os valores abaixo vêm das notas fiscais cadastradas no app, pela competência, sem as notas substituídas.",
        align="L", new_x="LMARGIN", new_y="NEXT",
    )

    # 1. Contribuinte
    empresa = dados.empresa
    _titulo_secao(pdf, "1. Informações do contribuinte")
    _par(pdf, "Nome empresarial", empresa.nome)
    _par(pdf, "CNPJ", formatar_cnpj(empresa.cnpj))
    _par(pdf, "Data de abertura", f"{empresa.data_abertura:%d/%m/%Y}")
    _par(pdf, "Período abrangido", f"{dados.periodo_inicio:%d/%m/%Y} a {dados.periodo_fim:%d/%m/%Y}")

    # 2. Campos da declaração (destaque)
    _titulo_secao(pdf, "2. Informações socioeconômicas e fiscais (o que digitar na declaração)")
    campos = [
        ("Receita bruta de comércio, indústria, transportes intermunicipais e interestaduais e fornecimento de refeições", brl(0)),
        ("Receita bruta de serviços prestados de qualquer natureza, exceto transportes intermunicipais e interestaduais", brl(dados.receita_servicos)),
        ("Receita Bruta Total", brl(dados.receita_servicos)),
        ("Possuiu empregado durante o período abrangido pela declaração?", "Sim" if empregado else "Não"),
    ]
    topo = pdf.get_y()
    pdf.set_fill_color(*COR_FUNDO_DESTAQUE)
    pdf.set_draw_color(*COR_DESTAQUE)
    altura = 4 + 11 * len(campos)
    pdf.rect(pdf.l_margin, topo, largura_util, altura, style="DF")
    pdf.set_y(topo + 2)
    largura_valor = 38
    for i, (rotulo, valor) in enumerate(campos):
        y = pdf.get_y()
        pdf.set_x(pdf.l_margin + 4)
        negrito = rotulo == "Receita Bruta Total"
        pdf.set_font("Helvetica", "B" if negrito else "", 9)
        pdf.set_text_color(*COR_TEXTO)
        pdf.multi_cell(largura_util - largura_valor - 10, 4.5, rotulo, align="L")
        pdf.set_xy(pdf.w - pdf.r_margin - largura_valor - 4, y)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*(COR_DESTAQUE if negrito else COR_TEXTO))
        pdf.cell(largura_valor, 9, valor, align="R")
        pdf.set_y(y + 11)
    pdf.set_y(topo + altura + 2)
    pdf.set_font("Helvetica", size=8.5)
    pdf.set_text_color(*COR_SECUNDARIA)
    qtd = len(dados.notas)
    composicao = f"{qtd} nota{'s' if qtd != 1 else ''} fiscal{'is' if qtd != 1 else ''}: {brl(dados.total_notas)}"
    if dados.outras_receitas:
        composicao += f" + outras receitas sem nota: {brl(dados.outras_receitas)}"
    pdf.multi_cell(0, 4.5, f"Composição dos serviços - {composicao}.", new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(
        0, 4.5,
        "Os valores do DAS pagos em cada mês aparecem na própria declaração (vêm do sistema da Receita) e não "
        "precisam ser digitados.",
        new_x="LMARGIN", new_y="NEXT",
    )

    # Avisos
    if dados.avisos:
        _titulo_secao(pdf, "Avisos")
        pdf.set_fill_color(*COR_FUNDO_AVISO)
        pdf.set_text_color(*COR_AVISO)
        pdf.set_font("Helvetica", size=9)
        for aviso in dados.avisos:
            pdf.multi_cell(0, 5, f"- {aviso}", fill=True, align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

    # 3. Limite
    _titulo_secao(pdf, "3. Limite de faturamento do MEI")
    rotulo_limite = brl(dados.limite)
    if dados.ano == empresa.data_abertura.year:
        meses = 12 - empresa.data_abertura.month + 1
        rotulo_limite += f" (ano de abertura: R$ 6.750,00 x {meses} {'mês' if meses == 1 else 'meses'})"
    _par(pdf, "Limite do ano", rotulo_limite)
    pct = f"{dados.pct_limite:.1f}".replace(".", ",")
    _par(pdf, "Receita bruta total", f"{brl(dados.receita_servicos)} ({pct}% do limite)")
    _par(pdf, "Situação", SITUACAO_TEXTO[dados.situacao] if dados.situacao in ("ok", "atencao") else "Limite excedido (ver avisos)")

    # 4. Mês a mês
    _titulo_secao(pdf, "4. Faturamento mês a mês (competência)")
    _tabela(
        pdf,
        [("Mês", 80, "L"), ("Notas", 30, "C"), ("Valor", largura_util - 110, "R")],
        [[f"{MESES[mes - 1]}/{dados.ano}", str(qtd_mes), brl(valor)] for mes, qtd_mes, valor in dados.por_mes],
        ["Total das notas", str(qtd), brl(dados.total_notas)],
    )
    if dados.outras_receitas:
        pdf.set_font("Helvetica", size=8.5)
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.cell(0, 5, f"Outras receitas sem nota (informadas na geração, sem mês): {brl(dados.outras_receitas)}", new_x="LMARGIN", new_y="NEXT")

    # 5. Notas incluídas
    _titulo_secao(pdf, "5. Notas fiscais incluídas")
    if dados.notas:
        _tabela(
            pdf,
            [("Nº", 16, "L"), ("Emissão", 24, "L"), ("Competência", 26, "L"), ("Tomador", largura_util - 98, "L"), ("Valor", 32, "R")],
            [
                [n.numero, f"{n.data_emissao:%d/%m/%Y}", f"{n.competencia:%m/%Y}", n.tomador_nome, brl(n.valor)]
                for n in dados.notas
            ],
            ["", "", "", "Total", brl(dados.total_notas)],
        )
    else:
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(*COR_SECUNDARIA)
        pdf.cell(0, 6, "Nenhuma nota fiscal neste ano.", new_x="LMARGIN", new_y="NEXT")

    # 6. Substituídas
    if dados.substituidas:
        _titulo_secao(pdf, "6. Notas substituídas (não entram no total)")
        _tabela(
            pdf,
            [("Nº", 16, "L"), ("Emissão", 24, "L"), ("Competência", 26, "L"), ("Substituída pela", largura_util - 98, "L"), ("Valor", 32, "R")],
            [
                [n.numero, f"{n.data_emissao:%d/%m/%Y}", f"{n.competencia:%m/%Y}", f"nº {sub}" if sub else "-", brl(n.valor)]
                for n, sub in dados.substituidas
            ],
        )

    return bytes(pdf.output())
