from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.relatorio_anual import ensure_annual_report_notice
from app.resumo_mensal import TIPO_RESUMO_MENSAL, ensure_monthly_digest, parse_payload

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


def _to_out(n: models.Notificacao) -> schemas.NotificacaoOut:
    return schemas.NotificacaoOut(
        id=n.id,
        tipo=n.tipo,
        ano=n.ano,
        mes=n.mes,
        titulo=n.titulo,
        lida=n.lida_em is not None,
        created_at=n.created_at,
        payload=parse_payload(n.payload) if n.tipo == TIPO_RESUMO_MENSAL else None,
    )


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("", response_model=list[schemas.NotificacaoOut])
def list_notificacoes(
    limit: int = Query(12, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Também é quem dispara a geração do resumo do mês (sem cron -- ver app/resumo_mensal.py).
    ensure_monthly_digest(db, current_user)
    ensure_annual_report_notice(db, current_user)
    rows = (
        db.query(models.Notificacao)
        .filter(models.Notificacao.user_id == current_user.id)
        .order_by(models.Notificacao.ano.desc(), models.Notificacao.mes.desc(), models.Notificacao.id.desc())
        .limit(limit)
        .all()
    )
    return [_to_out(n) for n in rows]


@router.put("/lidas", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db.query(models.Notificacao).filter(
        models.Notificacao.user_id == current_user.id, models.Notificacao.lida_em.is_(None)
    ).update({models.Notificacao.lida_em: _now_utc()}, synchronize_session=False)
    db.commit()


@router.put("/{notificacao_id}/lida", response_model=schemas.NotificacaoOut)
def mark_read(
    notificacao_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    n = (
        db.query(models.Notificacao)
        .filter(models.Notificacao.id == notificacao_id, models.Notificacao.user_id == current_user.id)
        .first()
    )
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificação não encontrada")
    if n.lida_em is None:
        n.lida_em = _now_utc()
        db.commit()
        db.refresh(n)
    return _to_out(n)
