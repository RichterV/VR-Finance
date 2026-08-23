from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.utils import add_months

router = APIRouter(prefix="/veiculos", tags=["veiculos"])


def _get_owned_vehicle(db: Session, current_user: models.User, vehicle_id: int) -> models.Vehicle:
    vehicle = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.id == vehicle_id, models.Vehicle.user_id == current_user.id)
        .first()
    )
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
    return vehicle


@router.get("", response_model=list[schemas.VehicleOut])
def list_vehicles(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Vehicle)
        .filter(models.Vehicle.user_id == current_user.id, models.Vehicle.active.is_(True))
        .order_by(models.Vehicle.name)
        .all()
    )


@router.post("", response_model=schemas.VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    vehicle = models.Vehicle(user_id=current_user.id, name=payload.name, year=payload.year)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.put("/{vehicle_id}", response_model=schemas.VehicleOut)
def update_vehicle(
    vehicle_id: int,
    payload: schemas.VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    vehicle = _get_owned_vehicle(db, current_user, vehicle_id)
    vehicle.name = payload.name
    vehicle.year = payload.year
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    vehicle = _get_owned_vehicle(db, current_user, vehicle_id)
    vehicle.active = False
    db.commit()


@router.get("/resumo", response_model=schemas.VehiclesResumo)
def resumo_veiculos(
    meses: int = 12,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    vehicles = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.user_id == current_user.id, models.Vehicle.active.is_(True))
        .order_by(models.Vehicle.name)
        .all()
    )

    today = date.today()
    janela = []
    for i in range(meses - 1, -1, -1):
        ref = add_months(date(today.year, today.month, 1), -i)
        janela.append((ref.year, ref.month))
    meses_labels = [f"{ano:04d}-{mes:02d}" for ano, mes in janela]

    veiculos_resumo = []
    series = []
    for vehicle in vehicles:
        services = (
            db.query(models.VehicleService)
            .filter(
                models.VehicleService.user_id == current_user.id,
                models.VehicleService.vehicle_id == vehicle.id,
            )
            .all()
        )
        total_gasto = sum(s.value for s in services)
        ultimo_servico = max((s.date for s in services), default=None)

        valores_mes = {}
        for s in services:
            key = (s.date.year, s.date.month)
            valores_mes[key] = valores_mes.get(key, 0) + s.value

        veiculos_resumo.append(
            schemas.VehicleResumoItem(
                vehicle_id=vehicle.id,
                vehicle_name=vehicle.name,
                total_gasto=total_gasto,
                quantidade_servicos=len(services),
                ultimo_servico=ultimo_servico,
            )
        )
        series.append(
            {
                "vehicle_name": vehicle.name,
                "valores": [valores_mes.get((ano, mes), 0) for ano, mes in janela],
            }
        )

    return schemas.VehiclesResumo(veiculos=veiculos_resumo, meses=meses_labels, series=series)
