from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.deps import get_current_user, get_db
from app.recorrencias import ensure_recurrences, month_start, next_date_of, status_of
from app.routers.attachments import delete_attachments_for_key
from app.utils import today_local

router = APIRouter(prefix="/recorrencias", tags=["recorrencias"])


def _get_owned(db: Session, current_user: models.User, recorrencia_id: int) -> models.Recorrencia:
    rec = (
        db.query(models.Recorrencia)
        .filter(models.Recorrencia.id == recorrencia_id, models.Recorrencia.user_id == current_user.id)
        .first()
    )
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recorrência não encontrada")
    return rec


def _pending_dates(db: Session, user_id: int) -> dict[int, object]:
    """Por recorrência, a data do lançamento já gerado mais próximo que ainda não chegou."""
    hoje = today_local()
    pendentes: dict[int, object] = {}
    for model in (models.Gasto, models.Receita):
        rows = (
            db.query(model.recorrencia_id, func.min(model.date))
            .filter(model.user_id == user_id, model.recorrencia_id.isnot(None), model.date > hoje)
            .group_by(model.recorrencia_id)
            .all()
        )
        pendentes.update({rec_id: d for rec_id, d in rows})
    return pendentes


def _to_out(rec: models.Recorrencia, pendente=None) -> schemas.RecorrenciaOut:
    return schemas.RecorrenciaOut(
        id=rec.id,
        tipo=rec.tipo,
        priority=rec.priority,
        item_id=rec.item_id,
        item_name=rec.item_name,
        item_active=rec.item_active,
        value=rec.value,
        cash_percentage=rec.cash_percentage,
        description=rec.description,
        dia=rec.dia,
        pausada=rec.pausada,
        fim_mes=rec.fim_mes,
        status=status_of(rec),
        proxima_data=next_date_of(rec),
        lancamento_pendente_data=pendente,
        created_at=rec.created_at,
    )


def _refresh_out(db: Session, rec: models.Recorrencia) -> schemas.RecorrenciaOut:
    db.refresh(rec)
    return _to_out(rec, _pending_dates(db, rec.user_id).get(rec.id))


@router.get("", response_model=list[schemas.RecorrenciaOut])
def list_recorrencias(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    recs = (
        db.query(models.Recorrencia)
        .options(joinedload(models.Recorrencia.item))
        .filter(models.Recorrencia.user_id == current_user.id)
        .order_by(models.Recorrencia.tipo, models.Recorrencia.dia, models.Recorrencia.id)
        .all()
    )
    pendentes = _pending_dates(db, current_user.id)
    return [_to_out(rec, pendentes.get(rec.id)) for rec in recs]


@router.put("/{recorrencia_id}", response_model=schemas.RecorrenciaOut)
def update_recorrencia(
    recorrencia_id: int,
    payload: schemas.RecorrenciaUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rec = _get_owned(db, current_user, recorrencia_id)
    atual = month_start(today_local())
    estava_encerrada = status_of(rec) == "encerrada"

    if rec.tipo == "gasto":
        if payload.priority is None or payload.item_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe a prioridade e a categoria")
        item = (
            db.query(models.DropdownOption)
            .filter(models.DropdownOption.id == payload.item_id, models.DropdownOption.user_id == current_user.id)
            .first()
        )
        # Categoria excluída só continua valendo se não foi trocada (mesma regra de editar gasto).
        if item is None or (not item.active and item.id != rec.item_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado")
        if item.priority != payload.priority:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item não pertence a essa prioridade")
        rec.priority = payload.priority
        rec.item_id = payload.item_id
    else:
        if payload.cash_percentage is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o percentual de caixa")
        rec.cash_percentage = payload.cash_percentage

    fim = month_start(payload.fim_mes) if payload.fim_mes else None
    if fim is not None and fim < atual:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="O último mês não pode ser anterior ao mês atual"
        )
    rec.value = payload.value
    rec.description = payload.description
    rec.dia = payload.dia
    rec.fim_mes = fim
    # Encerrada que volta a valer (fim adiado) não cria os meses que passaram enquanto estava parada.
    if estava_encerrada and status_of(rec) != "encerrada" and rec.proximo_mes < atual:
        rec.proximo_mes = atual
    db.commit()
    ensure_recurrences(db, current_user.id, force=True)
    return _refresh_out(db, rec)


@router.post("/{recorrencia_id}/pausar", response_model=schemas.RecorrenciaOut)
def pausar_recorrencia(
    recorrencia_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rec = _get_owned(db, current_user, recorrencia_id)
    rec.pausada = True
    db.commit()
    return _refresh_out(db, rec)


@router.post("/{recorrencia_id}/retomar", response_model=schemas.RecorrenciaOut)
def retomar_recorrencia(
    recorrencia_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Volta a gerar a partir do mês atual -- os meses em que ficou pausada não são criados."""
    rec = _get_owned(db, current_user, recorrencia_id)
    rec.pausada = False
    atual = month_start(today_local())
    if rec.proximo_mes < atual:
        rec.proximo_mes = atual
    db.commit()
    ensure_recurrences(db, current_user.id, force=True)
    return _refresh_out(db, rec)


@router.delete("/{recorrencia_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recorrencia(
    recorrencia_id: int,
    apagar_pendentes: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Para de gerar. Os lançamentos já criados continuam (viram avulsos); com apagar_pendentes,
    os que ainda têm data futura são apagados junto."""
    rec = _get_owned(db, current_user, recorrencia_id)
    model = models.Gasto if rec.tipo == "gasto" else models.Receita
    entity_type = rec.tipo
    hoje = today_local()
    if apagar_pendentes:
        futuros = (
            db.query(model)
            .filter(model.user_id == current_user.id, model.recorrencia_id == rec.id, model.date > hoje)
            .all()
        )
        for launch in futuros:
            delete_attachments_for_key(db, entity_type, str(launch.id))
            db.delete(launch)
    db.query(model).filter(model.recorrencia_id == rec.id).update(
        {model.recorrencia_id: None}, synchronize_session=False
    )
    db.flush()
    db.delete(rec)
    db.commit()
