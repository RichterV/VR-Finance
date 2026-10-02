from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.analytics import build_indicadores, build_previsao, check_anomalia
from app.deps import get_current_user, get_db

# Endpoints de analytics ficam fora de routers/resumo.py e routers/gastos.py porque app.analytics
# importa a agregação de routers/resumo.py (import circular).
router = APIRouter(tags=["analytics"])


@router.get("/gastos/anomalia", response_model=schemas.AnomaliaOut)
def gasto_anomalia(
    item_id: int = Query(...),
    value: float = Query(..., gt=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """O valor é muito acima do normal da categoria? Chamado antes de salvar um gasto avulso."""
    return check_anomalia(db, current_user, item_id, value)


@router.get("/resumo/previsao", response_model=schemas.PrevisaoOut)
def resumo_previsao(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return build_previsao(db, current_user)


@router.get("/resumo/indicadores", response_model=schemas.IndicadoresOut)
def resumo_indicadores(
    ate_ano: Optional[int] = Query(None, ge=2000, le=2100),
    ate_mes: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return build_indicadores(db, current_user, ate_ano, ate_mes)
