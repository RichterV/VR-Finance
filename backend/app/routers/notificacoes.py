from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from sqlalchemy import Integer, cast, func

from app import compartilhamento as comp
from app import models, schemas
from app.deps import get_current_user, get_db
from app.relatorio_anual import ensure_annual_report_notice
from app.resumo_mensal import TIPO_RESUMO_MENSAL, ensure_monthly_digest, parse_payload

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


def _to_out(n: models.Notificacao, share_status: dict[int, str]) -> schemas.NotificacaoOut:
    if n.tipo == TIPO_RESUMO_MENSAL:
        payload = parse_payload(n.payload)
    elif n.tipo in comp.TIPOS:
        payload = comp.parse_payload(n.payload, share_status.get(n.ref_id))
    else:
        payload = None
    return schemas.NotificacaoOut(
        id=n.id,
        tipo=n.tipo,
        ano=n.ano,
        mes=n.mes,
        titulo=n.titulo,
        lida=n.lida_em is not None,
        created_at=n.created_at,
        payload=payload,
    )


def _share_status(db: Session, rows: list[models.Notificacao]) -> dict[int, str]:
    ids = {n.ref_id for n in rows if n.ref_id is not None}
    if not ids:
        return {}
    return dict(
        db.query(models.Compartilhamento.id, models.Compartilhamento.status)
        .filter(models.Compartilhamento.id.in_(ids))
        .all()
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
    comp.ensure_expired_shares(db)
    # Resumo/relatório pelo mês de referência; avisos sem mês pelo mês em que chegaram (ficam acima
    # do resumo do mês anterior, que é gerado no começo do mês seguinte).
    periodo = func.coalesce(
        models.Notificacao.ano * 12 + models.Notificacao.mes,
        cast(func.strftime("%Y", models.Notificacao.created_at), Integer) * 12
        + cast(func.strftime("%m", models.Notificacao.created_at), Integer),
    )
    base = db.query(models.Notificacao).filter(models.Notificacao.user_id == current_user.id)
    rows = base.order_by(periodo.desc(), models.Notificacao.id.desc()).limit(limit).all()
    # Convite ainda sem resposta nunca fica de fora pelo limite.
    shown = {n.id for n in rows}
    pendentes = (
        base.join(models.Compartilhamento, models.Compartilhamento.id == models.Notificacao.ref_id)
        .filter(models.Notificacao.tipo == comp.TIPO_CONVITE, models.Compartilhamento.status == "pendente")
        .order_by(models.Notificacao.id.desc())
        .all()
    )
    rows = [n for n in pendentes if n.id not in shown] + rows
    status_map = _share_status(db, rows)
    return [_to_out(n, status_map) for n in rows]


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
    return _to_out(n, _share_status(db, [n]))
