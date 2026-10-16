import json
from datetime import timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import lixeira, models, schemas
from app.config import settings
from app.deps import get_current_user, get_db
from app.routers.attachments import ENTITY_MODULE

router = APIRouter(prefix="/lixeira", tags=["lixeira"])


def _module_allowed(user: models.User, entity_type: str) -> bool:
    module_key = ENTITY_MODULE.get(entity_type)
    return module_key is None or module_key in user.modules


def _visible_items(db: Session, user: models.User) -> list[models.LixeiraItem]:
    """Itens de primeiro nível (registros e anexos excluídos sozinhos) dos módulos que o usuário
    tem -- os de um módulo desligado continuam guardados, só não aparecem nem podem ser mexidos."""
    rows = (
        db.query(models.LixeiraItem)
        .filter(models.LixeiraItem.user_id == user.id, models.LixeiraItem.parent_id.is_(None))
        .order_by(models.LixeiraItem.deleted_at.desc(), models.LixeiraItem.id.desc())
        .all()
    )
    return [r for r in rows if _module_allowed(user, r.entity_type)]


def _anexo_out(item: models.LixeiraItem) -> schemas.LixeiraAnexoOut:
    data = json.loads(item.payload)
    return schemas.LixeiraAnexoOut(
        id=item.id,
        original_filename=data["original_filename"],
        content_type=data["content_type"],
        size_bytes=data["size_bytes"],
    )


def _get_owned(db: Session, user: models.User, item_id: int) -> models.LixeiraItem:
    item = (
        db.query(models.LixeiraItem)
        .filter(models.LixeiraItem.id == item_id, models.LixeiraItem.user_id == user.id)
        .first()
    )
    if item is None or not _module_allowed(user, item.entity_type):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado na lixeira")
    return item


@router.get("", response_model=list[schemas.LixeiraItemOut])
def list_lixeira(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    lixeira.purge_expired(db, current_user.id)
    items = _visible_items(db, current_user)
    parent_ids = [i.id for i in items if i.tipo == "registro"]
    children: dict[int, list[models.LixeiraItem]] = {}
    if parent_ids:
        for child in (
            db.query(models.LixeiraItem)
            .filter(models.LixeiraItem.parent_id.in_(parent_ids))
            .order_by(models.LixeiraItem.id)
            .all()
        ):
            children.setdefault(child.parent_id, []).append(child)

    out = []
    for item in items:
        deleted_at = item.deleted_at.replace(tzinfo=timezone.utc)
        anexos = [item] if item.tipo == "anexo" else children.get(item.id, [])
        out.append(
            schemas.LixeiraItemOut(
                id=item.id,
                tipo=item.tipo,
                entity_type=item.entity_type,
                titulo=item.titulo,
                detalhe=item.detalhe,
                valor=item.valor,
                data_registro=item.data_registro,
                deleted_at=deleted_at,
                expira_em=deleted_at + lixeira.RETENCAO,
                anexos=[_anexo_out(a) for a in anexos],
            )
        )
    return out


@router.post("/{item_id}/restaurar", response_model=schemas.LixeiraRestauradoOut)
def restore_item(item_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    item = _get_owned(db, current_user, item_id)
    result = lixeira.restore(db, item)
    db.commit()
    return result


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    item = _get_owned(db, current_user, item_id)
    if item.parent_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este anexo saiu junto com o registro")
    lixeira.purge(db, item)
    db.commit()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def empty_lixeira(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Esvazia o que o usuário vê (itens de um módulo desligado ficam até vencer)."""
    for item in _visible_items(db, current_user):
        lixeira.purge(db, item)
    db.commit()


@router.get("/anexos/{item_id}/download")
def download_anexo(item_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    item = _get_owned(db, current_user, item_id)
    if item.tipo != "anexo":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo não encontrado")
    data = json.loads(item.payload)
    disk_path = Path(settings.upload_dir, item.entity_type, data["stored_filename"])
    if not disk_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo não encontrado")
    return FileResponse(disk_path, media_type=data["content_type"], filename=data["original_filename"])
