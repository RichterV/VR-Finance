from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(prefix="/dropdown-options", tags=["dropdown-options"])


def _get_owned_option(db: Session, current_user: models.User, option_id: int) -> models.DropdownOption:
    option = (
        db.query(models.DropdownOption)
        .filter(models.DropdownOption.id == option_id, models.DropdownOption.user_id == current_user.id)
        .first()
    )
    if option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado")
    return option


@router.get("", response_model=list[schemas.DropdownOptionOut])
def list_options(
    priority: schemas.Priority,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.DropdownOption)
        .filter(
            models.DropdownOption.user_id == current_user.id,
            models.DropdownOption.priority == priority,
            models.DropdownOption.active.is_(True),
        )
        .order_by(models.DropdownOption.name)
        .all()
    )


@router.post("", response_model=schemas.DropdownOptionOut, status_code=status.HTTP_201_CREATED)
def create_option(
    payload: schemas.DropdownOptionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    option = models.DropdownOption(
        user_id=current_user.id,
        priority=payload.priority,
        name=payload.name,
    )
    db.add(option)
    db.commit()
    db.refresh(option)
    return option


@router.put("/{option_id}", response_model=schemas.DropdownOptionOut)
def update_option(
    option_id: int,
    payload: schemas.DropdownOptionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    option = _get_owned_option(db, current_user, option_id)
    option.name = payload.name
    db.commit()
    db.refresh(option)
    return option


@router.delete("/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_option(
    option_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    option = _get_owned_option(db, current_user, option_id)
    option.active = False
    db.commit()
