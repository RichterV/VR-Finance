"""Leitura do XML de uma NFS-e pra preencher o cadastro da nota no módulo Empresa.

Formato principal: leiaute nacional (Emissor Nacional da NFS-e, obrigatório pro MEI desde 2023) --
`NFSe/infNFSe` com a DPS dentro (`DPS/infDPS`). Formato de reserva: ABRASF, usado por emissores
municipais (`CompNfse/Nfse/InfNfse`). As tags são buscadas pelo nome local, sem depender do
namespace, que muda entre versões.

Só lê, nunca grava. Arquivo com DOCTYPE é recusado (evita expansão de entidades num XML hostil).
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Optional
from xml.etree import ElementTree

MAX_XML_BYTES = 1024 * 1024


class NfseXmlError(ValueError):
    """XML que não é uma NFS-e legível (mensagem vai direto pro usuário)."""


@dataclass
class NotaLida:
    numero: str
    data_emissao: date
    competencia: date  # dia 1 do mês
    valor: float
    tomador_nome: str
    chave_acesso: Optional[str] = None
    tomador_documento: Optional[str] = None
    descricao: Optional[str] = None
    prestador_documento: Optional[str] = None
    substitui_chave: Optional[str] = None  # nota substituta: chave de acesso da nota substituída
    avisos: list[str] = field(default_factory=list)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(node: Optional[ElementTree.Element], name: str) -> Optional[ElementTree.Element]:
    if node is None:
        return None
    return next((c for c in node if _local(c.tag) == name), None)


def _path(node: Optional[ElementTree.Element], *names: str) -> Optional[ElementTree.Element]:
    for name in names:
        node = _child(node, name)
    return node


def _find(node: Optional[ElementTree.Element], name: str) -> Optional[ElementTree.Element]:
    """Primeiro descendente com esse nome local (busca em profundidade)."""
    if node is None:
        return None
    return next((el for el in node.iter() if _local(el.tag) == name and el is not node), None)


def _first_node(*nodes: Optional[ElementTree.Element]) -> Optional[ElementTree.Element]:
    # Não dá pra usar `a or b`: um Element sem filhos é falsy no ElementTree.
    return next((n for n in nodes if n is not None), None)


def _text(node: Optional[ElementTree.Element]) -> Optional[str]:
    if node is None or node.text is None:
        return None
    value = node.text.strip()
    return value or None


def _first_text(nodes: Iterable[Optional[ElementTree.Element]]) -> Optional[str]:
    for node in nodes:
        value = _text(node)
        if value:
            return value
    return None


def _digits(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    only = "".join(ch for ch in value if ch.isdigit())
    return only or None


def _parse_date(value: Optional[str]) -> Optional[date]:
    """`2025-03-10`, `2025-03-10T09:30:00-03:00` ou `2025-03` (competência) -> date."""
    if not value:
        return None
    try:
        if len(value) == 7:
            return date(int(value[:4]), int(value[5:7]), 1)
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _parse_valor(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        return round(float(value.replace(",", ".")), 2)
    except ValueError:
        return None


def _doc_of(node: Optional[ElementTree.Element]) -> Optional[str]:
    """CNPJ/CPF de um bloco de pessoa (prest/toma/emit), em qualquer nível dentro dele."""
    return _digits(_first_text(_find(node, name) for name in ("CNPJ", "Cnpj", "CPF", "Cpf")))


def _ler_nacional(inf: ElementTree.Element) -> NotaLida:
    dps = _path(inf, "DPS", "infDPS")
    toma = _child(dps, "toma")
    emit = _child(inf, "emit")
    prest = _child(dps, "prest")

    numero = _text(_child(inf, "nNFSe"))
    emissao = _parse_date(_first_text([_child(dps, "dhEmi"), _child(inf, "dhProc")]))
    competencia = _parse_date(_text(_child(dps, "dCompet"))) or emissao
    valor = _parse_valor(_first_text([_find(_child(dps, "valores"), "vServ"), _find(_child(inf, "valores"), "vLiq")]))
    chave = (inf.get("Id") or "").removeprefix("NFS") or None

    nota = _montar(
        numero=numero,
        emissao=emissao,
        competencia=competencia,
        valor=valor,
        tomador_nome=_text(_child(toma, "xNome")),
        tomador_documento=_digits(_first_text(_child(toma, n) for n in ("CNPJ", "CPF", "NIF"))),
        descricao=_text(_find(dps, "xDescServ")),
        prestador_documento=_doc_of(emit) or _doc_of(prest),
        chave=_digits(chave),
    )
    nota.substitui_chave = _digits(_text(_path(dps, "subst", "chSubstda")))
    return nota


def _ler_abrasf(inf: ElementTree.Element) -> NotaLida:
    servico = _find(inf, "Servico")
    tomador = _first_node(_find(inf, "TomadorServico"), _find(inf, "Tomador"))
    prestador = _first_node(_find(inf, "PrestadorServico"), _find(inf, "Prestador"))

    emissao = _parse_date(_first_text([_child(inf, "DataEmissao"), _find(inf, "DataEmissao")]))
    competencia = _parse_date(_text(_find(inf, "Competencia"))) or emissao

    return _montar(
        numero=_text(_child(inf, "Numero")),
        emissao=emissao,
        competencia=competencia,
        valor=_parse_valor(_text(_find(servico, "ValorServicos"))),
        tomador_nome=_text(_find(tomador, "RazaoSocial")) or _text(_find(tomador, "NomeFantasia")),
        tomador_documento=_doc_of(tomador),
        descricao=_text(_find(servico, "Discriminacao")),
        prestador_documento=_doc_of(prestador),
        chave=_digits(_text(_child(inf, "CodigoVerificacao"))),
    )


def _montar(*, numero, emissao, competencia, valor, tomador_nome, tomador_documento, descricao, prestador_documento, chave) -> NotaLida:
    faltando = [
        nome
        for nome, valor_campo in (
            ("número da nota", numero),
            ("data de emissão", emissao),
            ("valor do serviço", valor),
        )
        if valor_campo is None
    ]
    if faltando:
        raise NfseXmlError(f"Não encontrei no XML: {', '.join(faltando)}.")
    return NotaLida(
        numero=numero,
        data_emissao=emissao,
        competencia=date(competencia.year, competencia.month, 1),
        valor=valor,
        tomador_nome=tomador_nome or "",
        chave_acesso=chave,
        tomador_documento=tomador_documento,
        descricao=descricao,
        prestador_documento=prestador_documento,
    )


def ler_nfse(conteudo: bytes) -> NotaLida:
    if len(conteudo) > MAX_XML_BYTES:
        raise NfseXmlError("Arquivo grande demais para um XML de nota (limite de 1MB).")
    if b"<!DOCTYPE" in conteudo[:4096].upper():
        raise NfseXmlError("XML com DOCTYPE não é aceito.")
    try:
        root = ElementTree.fromstring(conteudo)
    except ElementTree.ParseError:
        raise NfseXmlError("O arquivo não é um XML válido.") from None

    inf = root if _local(root.tag) == "infNFSe" else _find(root, "infNFSe")
    if inf is not None:
        nota = _ler_nacional(inf)
    else:
        inf = root if _local(root.tag) == "InfNfse" else _find(root, "InfNfse")
        if inf is None:
            raise NfseXmlError("Não reconheci este XML como uma NFS-e (nacional ou ABRASF).")
        nota = _ler_abrasf(inf)

    if not nota.tomador_nome:
        nota.avisos.append("O XML não traz o nome do tomador; preencha manualmente.")
    return nota
