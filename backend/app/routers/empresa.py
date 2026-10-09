from typing import Optional

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.declaracao_mei import gerar_pdf, montar_declaracao
from app.deps import get_current_user, get_db, require_module
from app.empresa import (
    cnpj_valido,
    desvincular_substituta,
    faturamento_por_mes,
    limite_do_ano,
    month_start,
    situacao_limite,
    vincular_substituicao,
)
from app.nfse_xml import MAX_XML_BYTES, NfseXmlError, ler_nfse
from app.routers.attachments import delete_attachments_for_key
from app.utils import APP_TIMEZONE, like_contains, period_filters, today_local

router = APIRouter(
    prefix="/empresa",
    tags=["empresa"],
    dependencies=[Depends(require_module("empresa"))],
)


def _get_empresa(db: Session, user: models.User) -> Optional[models.Empresa]:
    return db.query(models.Empresa).filter(models.Empresa.user_id == user.id).first()


def _require_empresa(db: Session, user: models.User) -> models.Empresa:
    empresa = _get_empresa(db, user)
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cadastre a empresa primeiro")
    return empresa


# --- Cadastro da empresa ---

@router.get("", response_model=Optional[schemas.EmpresaOut])
def get_empresa(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return _get_empresa(db, current_user)


@router.put("", response_model=schemas.EmpresaOut)
def save_empresa(
    payload: schemas.EmpresaIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not cnpj_valido(payload.cnpj):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CNPJ inválido")
    if payload.data_abertura > today_local():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A data de abertura não pode ser no futuro")

    empresa = _get_empresa(db, current_user)
    if empresa is None:
        empresa = models.Empresa(user_id=current_user.id)
        db.add(empresa)
    empresa.nome = payload.nome
    empresa.cnpj = payload.cnpj
    empresa.data_abertura = payload.data_abertura
    db.commit()
    db.refresh(empresa)
    return empresa


# --- Limite do MEI ---

@router.get("/limite", response_model=schemas.LimiteMeiOut)
def get_limite(
    ano: Optional[int] = Query(None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    empresa = _require_empresa(db, current_user)
    ano = ano or today_local().year
    limite = limite_do_ano(empresa, ano)
    por_mes = faturamento_por_mes(db, current_user.id, ano)
    faturado = round(sum(por_mes), 2)
    pct = round(faturado / limite * 100, 1) if limite else 0.0
    return {
        "ano": ano,
        "limite": limite,
        "faturado": faturado,
        "restante": round(max(limite - faturado, 0.0), 2),
        "pct": pct,
        "situacao": situacao_limite(pct),
        "por_mes": por_mes,
        "proporcional": ano == empresa.data_abertura.year,
    }


# --- Declaração anual (DASN-SIMEI) ---

@router.get("/declaracao-anual", response_class=Response)
def declaracao_anual(
    ano: int = Query(..., ge=2000, le=2100),
    empregado: bool = Query(False),
    outras_receitas: float = Query(0.0, ge=0, le=10_000_000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """PDF de apoio com o que digitar na declaração anual do MEI -- não grava nada."""
    empresa = _require_empresa(db, current_user)
    hoje = today_local()
    if ano < empresa.data_abertura.year:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A empresa foi aberta em {empresa.data_abertura.year}")
    if ano > hoje.year:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esse ano ainda não começou")
    dados = montar_declaracao(db, empresa, ano, outras_receitas, hoje)
    pdf = gerar_pdf(dados, empregado, datetime.now(APP_TIMEZONE))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="declaracao-anual-mei-{ano}.pdf"'},
    )


# --- Notas fiscais ---

def _get_owned_nota(db: Session, user: models.User, nota_id: int) -> models.NotaFiscal:
    nota = (
        db.query(models.NotaFiscal)
        .filter(models.NotaFiscal.id == nota_id, models.NotaFiscal.user_id == user.id)
        .first()
    )
    if nota is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota fiscal não encontrada")
    return nota


def _nota_duplicada(db: Session, user_id: int, numero: str, chave: Optional[str], ignorar_id: Optional[int] = None) -> bool:
    conditions = [models.NotaFiscal.numero == numero]
    if chave:
        conditions.append(models.NotaFiscal.chave_acesso == chave)
    query = db.query(models.NotaFiscal.id).filter(models.NotaFiscal.user_id == user_id, or_(*conditions))
    if ignorar_id is not None:
        query = query.filter(models.NotaFiscal.id != ignorar_id)
    return query.first() is not None


def _apply_nota(nota: models.NotaFiscal, payload: schemas.NotaFiscalIn) -> None:
    nota.numero = payload.numero
    nota.chave_acesso = payload.chave_acesso or None
    nota.data_emissao = payload.data_emissao
    nota.competencia = month_start(payload.competencia)
    nota.tomador_nome = payload.tomador_nome
    nota.tomador_documento = payload.tomador_documento or None
    nota.valor = payload.valor
    nota.descricao = (payload.descricao or "").strip() or None
    nota.substitui_chave = payload.substitui_chave or None


def _nota_out(db: Session, nota: models.NotaFiscal) -> dict:
    """NotaFiscalOut + números das notas ligadas pela substituição."""
    out = schemas.NotaFiscalOut.model_validate(nota).model_dump()
    if nota.substituida_por:
        out["substituida_por_numero"] = (
            db.query(models.NotaFiscal.numero).filter(models.NotaFiscal.id == nota.substituida_por).scalar()
        )
    if nota.substitui_chave:
        out["substitui_numero"] = (
            db.query(models.NotaFiscal.numero)
            .filter(models.NotaFiscal.user_id == nota.user_id, models.NotaFiscal.chave_acesso == nota.substitui_chave)
            .scalar()
        )
    return out


@router.post("/notas/ler-xml", response_model=schemas.NotaXmlLida)
async def ler_xml_nota(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    empresa = _require_empresa(db, current_user)
    conteudo = await file.read(MAX_XML_BYTES + 1)
    try:
        nota = ler_nfse(conteudo)
    except NfseXmlError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from None

    avisos = list(nota.avisos)
    if nota.prestador_documento and nota.prestador_documento != empresa.cnpj:
        avisos.insert(0, "O prestador desta nota não é o CNPJ da sua empresa. Confira se é a nota certa.")
    if _nota_duplicada(db, current_user.id, nota.numero, nota.chave_acesso):
        avisos.insert(0, f"A nota {nota.numero} já está cadastrada.")
    if nota.substitui_chave:
        original = (
            db.query(models.NotaFiscal.numero)
            .filter(models.NotaFiscal.user_id == current_user.id, models.NotaFiscal.chave_acesso == nota.substitui_chave)
            .scalar()
        )
        avisos.append(
            f"Esta nota substitui a nº {original}, que deixa de contar no limite."
            if original
            else "Esta nota substitui outra, que ainda não foi cadastrada (se for, ela já entra como substituída)."
        )
    return {**nota.__dict__, "avisos": avisos}


@router.get("/notas", response_model=schemas.NotaFiscalPage)
def list_notas(
    ano: Optional[int] = Query(None, ge=2000, le=2100),
    mes: Optional[int] = Query(None, ge=1, le=12),
    busca: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.NotaFiscal).filter(models.NotaFiscal.user_id == current_user.id)
    query = query.filter(*period_filters(models.NotaFiscal.competencia, ano, mes))
    if busca:
        termo = like_contains(busca)
        query = query.filter(
            or_(
                models.NotaFiscal.numero.ilike(termo, escape="\\"),
                models.NotaFiscal.tomador_nome.ilike(termo, escape="\\"),
                models.NotaFiscal.descricao.ilike(termo, escape="\\"),
            )
        )
    total = query.count()
    soma = (
        query.filter(models.NotaFiscal.substituida_por.is_(None))
        .with_entities(func.coalesce(func.sum(models.NotaFiscal.valor), 0.0))
        .scalar()
    )
    items = (
        query.order_by(models.NotaFiscal.data_emissao.desc(), models.NotaFiscal.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"items": [_nota_out(db, n) for n in items], "total": total, "soma_valor": round(soma or 0.0, 2)}


@router.post("/notas", response_model=schemas.NotaFiscalOut, status_code=status.HTTP_201_CREATED)
def create_nota(
    payload: schemas.NotaFiscalIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_empresa(db, current_user)
    if _nota_duplicada(db, current_user.id, payload.numero, payload.chave_acesso):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A nota {payload.numero} já está cadastrada")
    nota = models.NotaFiscal(user_id=current_user.id)
    _apply_nota(nota, payload)
    db.add(nota)
    db.flush()
    vincular_substituicao(db, nota)
    db.commit()
    db.refresh(nota)
    return _nota_out(db, nota)


@router.put("/notas/{nota_id}", response_model=schemas.NotaFiscalOut)
def update_nota(
    nota_id: int,
    payload: schemas.NotaFiscalIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    nota = _get_owned_nota(db, current_user, nota_id)
    if _nota_duplicada(db, current_user.id, payload.numero, payload.chave_acesso, ignorar_id=nota.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A nota {payload.numero} já está cadastrada")
    desvincular_substituta(db, nota)
    _apply_nota(nota, payload)
    vincular_substituicao(db, nota)
    db.commit()
    db.refresh(nota)
    return _nota_out(db, nota)


@router.delete("/notas/{nota_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_nota(
    nota_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    nota = _get_owned_nota(db, current_user, nota_id)
    delete_attachments_for_key(db, "nota_fiscal", str(nota.id))
    desvincular_substituta(db, nota)
    db.delete(nota)
    db.commit()
