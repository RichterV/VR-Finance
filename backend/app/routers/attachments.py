import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import event, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.deps import get_current_user, get_db

router = APIRouter(prefix="/attachments", tags=["attachments"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
MAX_FILENAME_LENGTH = 200

# Arquivos a apagar do disco só depois que o commit da exclusão der certo (ver _unlink_after_commit).
_PENDING_UNLINK_KEY = "attachments_pending_unlink"


@event.listens_for(Session, "after_commit")
def _unlink_after_commit(session: Session) -> None:
    """A linha do anexo some do banco primeiro; o arquivo só depois do commit. Se o commit falhar,
    a linha continua e o arquivo também (antes o arquivo já tinha sido apagado)."""
    for path in session.info.pop(_PENDING_UNLINK_KEY, []):
        path.unlink(missing_ok=True)


@event.listens_for(Session, "after_rollback")
def _discard_pending_unlink(session: Session) -> None:
    session.info.pop(_PENDING_UNLINK_KEY, None)


def _schedule_unlink(db: Session, path: Path) -> None:
    db.info.setdefault(_PENDING_UNLINK_KEY, []).append(path)


def safe_filename(name: str | None, fallback: str) -> str:
    """Nome original sem diretórios (nada de "../"), sem caracteres de controle e com tamanho limitado
    -- vai pro Content-Disposition do download e pro nome do arquivo dentro do zip da exportação."""
    base = Path((name or "").replace("\\", "/")).name
    base = "".join(ch for ch in base if ch.isprintable()).strip()
    if not base or base in {".", ".."}:
        return fallback
    if len(base) > MAX_FILENAME_LENGTH:
        stem, dot, ext = base.rpartition(".")
        base = (stem[: MAX_FILENAME_LENGTH - len(ext) - 1] + dot + ext) if dot and len(ext) <= 10 else base[:MAX_FILENAME_LENGTH]
    return base


def sniff_content_type(head: bytes) -> str | None:
    """Tipo real pelo começo do arquivo (assinatura), em vez de confiar no content_type do cliente."""
    if head.startswith(b"%PDF"):
        return "application/pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp" and head[8:12] in {b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis"}:
        return "image/heic"
    return None

# entity_type -> (model, tem installment_group_id -- ver nota em _authorize_entity)
ENTITY_CONFIG: dict[str, tuple[type, bool]] = {
    "gasto": (models.Gasto, True),
    "receita": (models.Receita, False),
    "servico_veiculo": (models.VehicleService, False),
}


# entity_type -> módulo opcional que precisa estar habilitado (gasto/receita são do Início, sempre)
ENTITY_MODULE: dict[str, str] = {
    "servico_veiculo": "veiculos",
    "operacao_bolsa": "operacoes_bolsa",
    "devedor": "devedores",
}


def _require_entity_module(current_user: models.User, entity_type: str) -> None:
    module_key = ENTITY_MODULE.get(entity_type)
    if module_key is not None and module_key not in current_user.modules:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Módulo não habilitado para este usuário")


def _authorize_entity(db: Session, current_user: models.User, entity_type: str, entity_id: str) -> None:
    """Confere que entity_id (id numerico OU installment_group_id) pertence ao usuario logado.

    Deliberadamente permissivo pra tipos com grupo de parcelamento (gasto/devedor): aceita tanto o
    installment_group_id quanto o id de uma parcela individual como chave valida de posse. Quem
    garante "sempre vincula ao grupo, nunca a uma parcela" e o frontend -- ver anexos.md.
    """
    _require_entity_module(current_user, entity_type)
    model, has_group = ENTITY_CONFIG[entity_type]
    query = db.query(model).filter(model.user_id == current_user.id)
    if has_group:
        conditions = [model.installment_group_id == entity_id]
        if entity_id.isdigit():
            conditions.append(model.id == int(entity_id))
        match = query.filter(or_(*conditions)).first()
    else:
        match = query.filter(model.id == int(entity_id)).first() if entity_id.isdigit() else None
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")


def _get_owned_attachment(db: Session, current_user: models.User, attachment_id: int) -> models.Attachment:
    attachment = (
        db.query(models.Attachment)
        .filter(models.Attachment.id == attachment_id, models.Attachment.user_id == current_user.id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo não encontrado")
    _require_entity_module(current_user, attachment.entity_type)
    return attachment


def _disk_path(attachment: models.Attachment) -> Path:
    return Path(settings.upload_dir, attachment.entity_type, attachment.stored_filename)


def delete_attachments_for_key(db: Session, entity_type: str, entity_id: str) -> None:
    """Apaga (arquivo + linha) todo anexo com essa chave exata (entity_type + entity_id).

    Usado pelos endpoints DELETE dos 5 módulos: sempre limpa o que estava vinculado direto ao
    id da linha removida, e -- só pros tipos com grupo de parcelamento (gasto/devedor) -- também
    limpa o vinculado ao installment_group_id quando essa era a última parcela do grupo (o
    chamador é responsável por só passar o group_id aqui depois de confirmar que não sobrou
    nenhuma outra parcela referenciando ele, senão apagaria um anexo que outra parcela ainda usa).
    """
    attachments = (
        db.query(models.Attachment)
        .filter(models.Attachment.entity_type == entity_type, models.Attachment.entity_id == entity_id)
        .all()
    )
    for attachment in attachments:
        _schedule_unlink(db, _disk_path(attachment))
        db.delete(attachment)


def delete_all_attachments_for_user(db: Session, user_id: int) -> None:
    """Cascade de exclusão de usuário -- apaga todo anexo dele, sem checar referências (o usuário inteiro está saindo)."""
    attachments = db.query(models.Attachment).filter(models.Attachment.user_id == user_id).all()
    for attachment in attachments:
        _schedule_unlink(db, _disk_path(attachment))
    db.query(models.Attachment).filter(models.Attachment.user_id == user_id).delete(synchronize_session=False)


@router.post("/upload", response_model=schemas.AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    entity_type: schemas.EntityType = Form(...),
    entity_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    extension = ALLOWED_CONTENT_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de arquivo não permitido (só imagens ou PDF)",
        )

    data = await file.read(MAX_FILE_SIZE_BYTES + 1)
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Arquivo maior que o limite permitido (10MB)",
        )

    detected = sniff_content_type(data[:16])
    if detected is None or detected != file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O conteúdo do arquivo não corresponde ao tipo informado (só imagens ou PDF)",
        )

    _authorize_entity(db, current_user, entity_type, entity_id)

    stored_filename = f"{uuid.uuid4().hex}{extension}"
    entity_dir = Path(settings.upload_dir, entity_type)
    entity_dir.mkdir(parents=True, exist_ok=True)
    disk_path = entity_dir / stored_filename
    disk_path.write_bytes(data)

    attachment = models.Attachment(
        user_id=current_user.id,
        entity_type=entity_type,
        entity_id=entity_id,
        original_filename=safe_filename(file.filename, stored_filename),
        stored_filename=stored_filename,
        content_type=detected,
        size_bytes=len(data),
    )
    db.add(attachment)
    try:
        db.commit()
    except Exception:
        # Sem a linha no banco o arquivo ficaria órfão no disco pra sempre.
        db.rollback()
        disk_path.unlink(missing_ok=True)
        raise
    db.refresh(attachment)
    return attachment


@router.get("", response_model=list[schemas.AttachmentOut])
def list_attachments(
    entity_type: schemas.EntityType = Query(...),
    entity_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _authorize_entity(db, current_user, entity_type, entity_id)
    return (
        db.query(models.Attachment)
        .filter(
            models.Attachment.user_id == current_user.id,
            models.Attachment.entity_type == entity_type,
            models.Attachment.entity_id == entity_id,
        )
        .order_by(models.Attachment.created_at.desc())
        .all()
    )


@router.get("/exists", response_model=schemas.AttachmentExistsOut)
def check_attachments_exist(
    entity_type: schemas.EntityType = Query(...),
    entity_ids: list[str] = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_entity_module(current_user, entity_type)
    rows = (
        db.query(models.Attachment.entity_id)
        .filter(
            models.Attachment.user_id == current_user.id,
            models.Attachment.entity_type == entity_type,
            models.Attachment.entity_id.in_(entity_ids),
        )
        .distinct()
        .all()
    )
    return {"entity_ids_with_attachments": [row[0] for row in rows]}


@router.get("/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    attachment = _get_owned_attachment(db, current_user, attachment_id)
    disk_path = _disk_path(attachment)
    if not disk_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo não encontrado")
    return FileResponse(
        disk_path,
        media_type=attachment.content_type,
        filename=attachment.original_filename,
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    attachment = _get_owned_attachment(db, current_user, attachment_id)
    _schedule_unlink(db, _disk_path(attachment))
    db.delete(attachment)
    db.commit()
