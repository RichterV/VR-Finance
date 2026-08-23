from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(prefix="/servicos-veiculos", tags=["servicos-veiculos"])


def _get_owned_service(db: Session, current_user: models.User, service_id: int) -> models.VehicleService:
    service = (
        db.query(models.VehicleService)
        .filter(models.VehicleService.id == service_id, models.VehicleService.user_id == current_user.id)
        .first()
    )
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado")
    return service


def _get_owned_vehicle(db: Session, current_user: models.User, vehicle_id: int) -> models.Vehicle:
    vehicle = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.id == vehicle_id, models.Vehicle.user_id == current_user.id)
        .first()
    )
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
    return vehicle


@router.get("", response_model=schemas.VehicleServicePage)
def list_services(
    vehicle_id: Optional[int] = Query(None),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.VehicleService).filter(models.VehicleService.user_id == current_user.id)
    if vehicle_id is not None:
        query = query.filter(models.VehicleService.vehicle_id == vehicle_id)
    total = query.count()
    items = (
        query.order_by(models.VehicleService.date.desc(), models.VehicleService.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"items": items, "total": total}


@router.post("", response_model=schemas.VehicleServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: schemas.VehicleServiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_owned_vehicle(db, current_user, payload.vehicle_id)
    service = models.VehicleService(
        user_id=current_user.id,
        vehicle_id=payload.vehicle_id,
        description=payload.description,
        notes=payload.notes,
        value=payload.value,
        service_type=payload.service_type,
        mileage=payload.mileage,
        date=date.today(),
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/{service_id}", response_model=schemas.VehicleServiceOut)
def update_service(
    service_id: int,
    payload: schemas.VehicleServiceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    service = _get_owned_service(db, current_user, service_id)
    _get_owned_vehicle(db, current_user, payload.vehicle_id)
    service.vehicle_id = payload.vehicle_id
    service.description = payload.description
    service.notes = payload.notes
    service.value = payload.value
    service.service_type = payload.service_type
    service.mileage = payload.mileage
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    service = _get_owned_service(db, current_user, service_id)
    db.delete(service)
    db.commit()
