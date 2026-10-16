"""Regras do módulo Empresa (MEI): limite de faturamento, substituição de notas e validação de CNPJ."""

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models

# Limite do MEI: R$ 81 mil por ano; no ano de abertura, R$ 6.750 por mês desde o mês de abertura
# (mês começado conta inteiro).
LIMITE_ANUAL = 81_000.0
LIMITE_MENSAL = 6_750.0
# Faixas da barra: atenção a partir de 80%; acima de 100% o que muda é se passou de 20% (120%).
PCT_ATENCAO = 80.0
PCT_EXCESSO_TOLERADO = 120.0


def month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def cnpj_valido(cnpj: str) -> bool:
    """14 dígitos com os 2 dígitos verificadores certos (CNPJ só com números)."""
    if len(cnpj) != 14 or not cnpj.isdigit() or cnpj == cnpj[0] * 14:
        return False

    def digito(base: str, pesos: list[int]) -> str:
        resto = sum(int(n) * p for n, p in zip(base, pesos)) % 11
        return "0" if resto < 2 else str(11 - resto)

    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    d1 = digito(cnpj[:12], pesos1)
    d2 = digito(cnpj[:12] + d1, [6] + pesos1)
    return cnpj[12:] == d1 + d2


def limite_do_ano(empresa: models.Empresa, ano: int) -> float:
    abertura = empresa.data_abertura
    if ano < abertura.year:
        return 0.0
    if ano == abertura.year:
        return LIMITE_MENSAL * (12 - abertura.month + 1)
    return LIMITE_ANUAL


def situacao_limite(pct: float) -> str:
    if pct > PCT_EXCESSO_TOLERADO:
        return "excedido_acima_20"
    if pct > 100:
        return "excedido_ate_20"
    if pct >= PCT_ATENCAO:
        return "atencao"
    return "ok"


def faturamento_por_mes(db: Session, user_id: int, ano: int) -> list[float]:
    """Soma das notas por mês de competência (12 posições, jan..dez), sem as substituídas."""
    rows = (
        db.query(func.strftime("%m", models.NotaFiscal.competencia), func.sum(models.NotaFiscal.valor))
        .filter(
            models.NotaFiscal.user_id == user_id,
            models.NotaFiscal.competencia >= date(ano, 1, 1),
            models.NotaFiscal.competencia <= date(ano, 12, 1),
            models.NotaFiscal.substituida_por.is_(None),
        )
        .group_by(func.strftime("%m", models.NotaFiscal.competencia))
        .all()
    )
    por_mes = [0.0] * 12
    for mes, total in rows:
        por_mes[int(mes) - 1] = round(total or 0.0, 2)
    return por_mes


def vincular_substituicao(db: Session, nota: models.NotaFiscal) -> None:
    """Liga a nota à substituição, nos dois sentidos -- funciona em qualquer ordem de cadastro:
    se ela substitui uma nota já cadastrada, marca a original; se uma substituta dela já foi
    cadastrada antes, marca esta. Não faz commit (precisa do id da nota: chamar depois do flush)."""
    if nota.substitui_chave:
        original = (
            db.query(models.NotaFiscal)
            .filter(
                models.NotaFiscal.user_id == nota.user_id,
                models.NotaFiscal.chave_acesso == nota.substitui_chave,
                models.NotaFiscal.id != nota.id,
            )
            .first()
        )
        if original is not None:
            original.substituida_por = nota.id
    if nota.chave_acesso:
        substituta = (
            db.query(models.NotaFiscal)
            .filter(
                models.NotaFiscal.user_id == nota.user_id,
                models.NotaFiscal.substitui_chave == nota.chave_acesso,
                models.NotaFiscal.id != nota.id,
            )
            .first()
        )
        nota.substituida_por = substituta.id if substituta is not None else None


def desvincular_substituta(db: Session, nota: models.NotaFiscal) -> None:
    """Antes de excluir (ou trocar a chave de) uma substituta: a original volta a contar."""
    db.query(models.NotaFiscal).filter(
        models.NotaFiscal.user_id == nota.user_id, models.NotaFiscal.substituida_por == nota.id
    ).update({models.NotaFiscal.substituida_por: None}, synchronize_session=False)
