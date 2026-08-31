from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.routers.attachments import delete_attachments_for_key

router = APIRouter(prefix="/receitas", tags=["receitas"])


def _get_owned_receita(db: Session, current_user: models.User, receita_id: int) -> models.Receita:
    receita = (
        db.query(models.Receita)
        .filter(models.Receita.id == receita_id, models.Receita.user_id == current_user.id)
        .first()
    )
    if receita is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receita não encontrada")
    return receita


@router.get("", response_model=schemas.ReceitaPage)
def list_receitas(
    ano: Optional[int] = Query(None, ge=2000, le=2100),
    mes: Optional[int] = Query(None, ge=1, le=12),
    busca: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Receita).filter(models.Receita.user_id == current_user.id)
    if ano is not None:
        query = query.filter(extract("year", models.Receita.date) == ano)
    if mes is not None:
        query = query.filter(extract("month", models.Receita.date) == mes)
    if busca:
        query = query.filter(models.Receita.description.ilike(f"%{busca.strip()}%"))
    total = query.count()
    items = (
        query.order_by(models.Receita.date.desc(), models.Receita.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"items": items, "total": total}


@router.post("", response_model=schemas.ReceitaOut, status_code=status.HTTP_201_CREATED)
def create_receita(
    payload: schemas.ReceitaCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cash_value = payload.value * payload.cash_percentage / 100
    receita = models.Receita(
        user_id=current_user.id,
        value=payload.value,
        cash_percentage=payload.cash_percentage,
        cash_value=cash_value,
        description=payload.description,
        date=date.today(),
    )
    db.add(receita)
    db.commit()
    db.refresh(receita)
    return receita


@router.put("/{receita_id}", response_model=schemas.ReceitaOut)
def update_receita(
    receita_id: int,
    payload: schemas.ReceitaUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    receita = _get_owned_receita(db, current_user, receita_id)
    receita.value = payload.value
    receita.cash_percentage = payload.cash_percentage
    receita.cash_value = payload.value * payload.cash_percentage / 100
    receita.description = payload.description
    db.commit()
    db.refresh(receita)
    return receita


@router.delete("/{receita_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_receita(
    receita_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    receita = _get_owned_receita(db, current_user, receita_id)
    delete_attachments_for_key(db, "receita", str(receita.id))
    db.delete(receita)
    db.commit()
