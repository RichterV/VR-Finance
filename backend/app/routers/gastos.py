import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.utils import add_months

router = APIRouter(prefix="/gastos", tags=["gastos"])


def _get_owned_gasto(db: Session, current_user: models.User, gasto_id: int) -> models.Gasto:
    gasto = (
        db.query(models.Gasto)
        .filter(models.Gasto.id == gasto_id, models.Gasto.user_id == current_user.id)
        .first()
    )
    if gasto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto não encontrado")
    return gasto


@router.get("", response_model=schemas.GastoPage)
def list_gastos(
    ano: Optional[int] = Query(None, ge=2000, le=2100),
    mes: Optional[int] = Query(None, ge=1, le=12),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Gasto).filter(models.Gasto.user_id == current_user.id)
    if ano is not None:
        query = query.filter(extract("year", models.Gasto.date) == ano)
    if mes is not None:
        query = query.filter(extract("month", models.Gasto.date) == mes)
    total = query.count()
    items = (
        query.order_by(models.Gasto.date.desc(), models.Gasto.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"items": items, "total": total}


@router.post("", response_model=list[schemas.GastoOut], status_code=status.HTTP_201_CREATED)
def create_gasto(
    payload: schemas.GastoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = (
        db.query(models.DropdownOption)
        .filter(
            models.DropdownOption.id == payload.item_id,
            models.DropdownOption.user_id == current_user.id,
            models.DropdownOption.active.is_(True),
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado")
    if item.priority != payload.priority:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item não pertence a essa prioridade")

    if payload.is_installment and not payload.installment_count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o número de parcelas")

    today = date.today()
    rows: list[models.Gasto] = []

    if payload.is_installment:
        group_id = str(uuid.uuid4())
        for i in range(payload.installment_count):
            rows.append(
                models.Gasto(
                    user_id=current_user.id,
                    priority=payload.priority,
                    item_id=payload.item_id,
                    value=payload.value,
                    description=payload.description,
                    is_installment=True,
                    installment_count=payload.installment_count,
                    installment_number=i + 1,
                    installment_group_id=group_id,
                    date=add_months(today, i),
                )
            )
    else:
        rows.append(
            models.Gasto(
                user_id=current_user.id,
                priority=payload.priority,
                item_id=payload.item_id,
                value=payload.value,
                description=payload.description,
                is_installment=False,
                date=today,
            )
        )

    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


@router.put("/{gasto_id}", response_model=schemas.GastoOut)
def update_gasto(
    gasto_id: int,
    payload: schemas.GastoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    gasto = _get_owned_gasto(db, current_user, gasto_id)

    item = (
        db.query(models.DropdownOption)
        .filter(
            models.DropdownOption.id == payload.item_id,
            models.DropdownOption.user_id == current_user.id,
            models.DropdownOption.active.is_(True),
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado")
    if item.priority != payload.priority:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item não pertence a essa prioridade")

    gasto.priority = payload.priority
    gasto.item_id = payload.item_id
    gasto.value = payload.value
    gasto.description = payload.description
    db.commit()
    db.refresh(gasto)
    return gasto


@router.delete("/{gasto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gasto(
    gasto_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    gasto = _get_owned_gasto(db, current_user, gasto_id)
    db.delete(gasto)
    db.commit()
