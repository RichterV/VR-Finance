import calendar
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.deps import get_current_user, get_db
from app.recorrencias import create_from_launch
from app.routers.attachments import delete_attachments_for_key
from app.utils import add_months, like_contains, period_filters, resolve_launch_date, today_local

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
    busca: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Gasto).filter(models.Gasto.user_id == current_user.id)
    query = query.filter(*period_filters(models.Gasto.date, ano, mes))
    if busca:
        termo = like_contains(busca)
        query = query.join(models.DropdownOption, models.Gasto.item_id == models.DropdownOption.id).filter(
            or_(
                models.Gasto.description.ilike(termo, escape="\\"),
                models.DropdownOption.name.ilike(termo, escape="\\"),
            )
        )
    total = query.count()
    items = (
        query.options(joinedload(models.Gasto.item))
        .order_by(models.Gasto.date.desc(), models.Gasto.id.desc())
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
    if payload.is_installment and payload.recorrente:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Um gasto parcelado não pode ser recorrente")

    start_date = resolve_launch_date(payload.date)
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
                    date=add_months(start_date, i),
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
                date=start_date,
            )
        )

    db.add_all(rows)
    if payload.recorrente:
        create_from_launch(db, rows[0], payload.recorrencia_dia)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


ANTECIPADA_MARK = "Parcela Antecipada"
ANTECIPADA_SUFFIX = f" - {ANTECIPADA_MARK}"


def _is_antecipada(description: Optional[str]) -> bool:
    return bool(description) and description.endswith(ANTECIPADA_MARK)


def _strip_antecipada(description: Optional[str]) -> Optional[str]:
    if not description:
        return description
    if description.endswith(ANTECIPADA_SUFFIX):
        return description[: -len(ANTECIPADA_SUFFIX)] or None
    if description == ANTECIPADA_MARK:
        return None
    return description


def _with_antecipada(description: Optional[str]) -> str:
    return f"{description}{ANTECIPADA_SUFFIX}" if description else ANTECIPADA_MARK


@router.put("/{gasto_id}", response_model=schemas.GastoOut)
def update_gasto(
    gasto_id: int,
    payload: schemas.GastoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    gasto = _get_owned_gasto(db, current_user, gasto_id)

    item_query = db.query(models.DropdownOption).filter(
        models.DropdownOption.id == payload.item_id,
        models.DropdownOption.user_id == current_user.id,
    )
    # Categoria excluída (soft delete) continua valendo pro gasto que já é dela -- senão editar só o
    # valor de um gasto antigo dava 404. Trocar pra outra categoria continua exigindo uma ativa.
    if payload.item_id != gasto.item_id:
        item_query = item_query.filter(models.DropdownOption.active.is_(True))
    item = item_query.first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado")
    if item.priority != payload.priority:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item não pertence a essa prioridade")

    gasto.priority = payload.priority
    gasto.item_id = payload.item_id
    gasto.value = payload.value
    gasto.description = payload.description

    # Parcelado: a edição vale pra compra inteira, replicada nas demais parcelas do grupo. Parcela
    # antecipada preserva o que a antecipação mudou nela (valor com desconto e o sufixo na descrição).
    if gasto.installment_group_id:
        base_description = _strip_antecipada(payload.description)
        siblings = (
            db.query(models.Gasto)
            .filter(
                models.Gasto.user_id == current_user.id,
                models.Gasto.installment_group_id == gasto.installment_group_id,
                models.Gasto.id != gasto.id,
            )
            .all()
        )
        for sibling in siblings:
            sibling.priority = payload.priority
            sibling.item_id = payload.item_id
            if _is_antecipada(sibling.description):
                sibling.description = _with_antecipada(base_description)
            else:
                sibling.description = base_description
                if not _is_antecipada(payload.description):
                    sibling.value = payload.value
    db.commit()
    db.refresh(gasto)
    return gasto


@router.post("/{gasto_id}/antecipar", response_model=schemas.GastoOut)
def antecipar_gasto(
    gasto_id: int,
    payload: Optional[schemas.GastoAntecipar] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    gasto = _get_owned_gasto(db, current_user, gasto_id)

    today = today_local()
    if (gasto.date.year, gasto.date.month) <= (today.year, today.month):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Só é possível antecipar gastos de meses futuros",
        )

    day = min(gasto.date.day, calendar.monthrange(today.year, today.month)[1])
    gasto.date = date(today.year, today.month, day)
    if payload is not None and payload.value is not None:
        gasto.value = payload.value
    gasto.description = _with_antecipada(gasto.description)
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
    group_id = gasto.installment_group_id

    # Sempre limpa o que estava vinculado direto ao id desta parcela (nada mais pode referenciar
    # esse id depois que ela some).
    delete_attachments_for_key(db, "gasto", str(gasto.id))

    # Só limpa o anexo do grupo se essa era a ultima parcela restante -- exclui o proprio id da
    # contagem (em vez de depender do autoflush, que esta desligado nesta sessao) pra funcionar
    # independente de quando o delete abaixo e de fato aplicado no banco.
    if group_id:
        remaining_siblings = (
            db.query(models.Gasto)
            .filter(models.Gasto.installment_group_id == group_id, models.Gasto.id != gasto.id)
            .count()
        )
        if remaining_siblings == 0:
            delete_attachments_for_key(db, "gasto", group_id)

    db.delete(gasto)
    db.commit()
