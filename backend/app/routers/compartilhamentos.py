"""Compartilhamento de imóveis entre usuários (lógica em app/compartilhamento.py)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import compartilhamento as comp
from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(prefix="/compartilhamentos", tags=["compartilhamentos"])


def _require_module(user: models.User, item_tipo: str) -> None:
    if comp.ITEM_MODULE[item_tipo] not in user.modules:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Módulo não habilitado para este usuário")


@router.post("", response_model=schemas.CompartilhamentoOut, status_code=status.HTTP_201_CREATED)
def enviar(
    payload: schemas.CompartilhamentoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_module(current_user, payload.item_tipo)
    share = comp.enviar(db, current_user, payload)
    db.commit()
    db.refresh(share)
    return comp.to_out(db, share)


@router.get("", response_model=list[schemas.CompartilhamentoOut])
def list_do_item(
    item_tipo: schemas.ShareItemTipo = Query(...),
    item_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Do dono: com quem o item está compartilhado ou aguardando resposta."""
    _require_module(current_user, item_tipo)
    comp.ensure_expired_shares(db)
    imovel = db.get(models.Imovel, item_id)
    if imovel is None or imovel.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado")
    shares = (
        db.query(models.Compartilhamento)
        .filter(
            models.Compartilhamento.item_tipo == item_tipo,
            models.Compartilhamento.item_id == item_id,
            models.Compartilhamento.status.in_(comp.ATIVOS),
        )
        .order_by(models.Compartilhamento.created_at)
        .all()
    )
    return [comp.to_out(db, s) for s in shares]


@router.get("/recebidos", response_model=list[schemas.CompartilhamentoOut])
def list_recebidos(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Do convidado: aceitos e pendentes."""
    comp.ensure_expired_shares(db)
    shares = (
        db.query(models.Compartilhamento)
        .filter(
            models.Compartilhamento.convidado_id == current_user.id,
            models.Compartilhamento.status.in_(comp.ATIVOS),
        )
        .order_by(models.Compartilhamento.created_at.desc())
        .all()
    )
    return [comp.to_out(db, s) for s in shares if comp.ITEM_MODULE[s.item_tipo] in current_user.modules]


@router.post("/{share_id}/aceitar", response_model=schemas.CompartilhamentoOut)
def aceitar(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    comp.ensure_expired_shares(db)
    share = comp.get_share_as_convidado(db, current_user, share_id)
    _require_module(current_user, share.item_tipo)
    comp.responder(db, current_user, share, aceitar=True)
    db.commit()
    db.refresh(share)
    return comp.to_out(db, share)


@router.post("/{share_id}/recusar", response_model=schemas.CompartilhamentoOut)
def recusar(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    comp.ensure_expired_shares(db)
    share = comp.get_share_as_convidado(db, current_user, share_id)
    comp.responder(db, current_user, share, aceitar=False)
    db.commit()
    db.refresh(share)
    return comp.to_out(db, share)


@router.put("/{share_id}", response_model=schemas.CompartilhamentoOut)
def mudar_nivel(
    share_id: int,
    payload: schemas.CompartilhamentoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    share = comp.get_share_as_participant(db, current_user, share_id)
    _require_module(current_user, share.item_tipo)
    comp.mudar_nivel(db, current_user, share, payload.nivel)
    db.commit()
    db.refresh(share)
    return comp.to_out(db, share)


@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def encerrar(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Dono: cancela (pendente) ou revoga (aceito). Convidado: sai do compartilhamento."""
    share = comp.get_share_as_participant(db, current_user, share_id)
    comp.encerrar(db, current_user, share)
    db.commit()
