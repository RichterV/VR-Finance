"""Lixeira: excluir um registro (gasto, receita, serviço de veículo ou da casa, operação, parcela de devedor,
nota fiscal) ou um anexo não apaga na hora -- a linha vira uma foto em `lixeira` por 15 dias, e dá
pra restaurar. Depois disso (ou com "Excluir definitivamente"/"Esvaziar") some de vez, inclusive o
arquivo do anexo.

O registro sai da tabela dele de verdade (a foto fica só na `lixeira`): resumos, relatórios,
exportação e listagens continuam sem precisar saber que a lixeira existe. O arquivo do anexo fica
no mesmo lugar do disco enquanto está na lixeira.

Anexo de gasto parcelado/devedor é do grupo (installment_group_id): excluir uma parcela só leva o
anexo do grupo junto quando é a última (mesma regra de antes); restaurar qualquer parcela do grupo
traz de volta os anexos do grupo que saíram junto com uma parcela.

Imports de app.routers.* ficam dentro das funções: app.deps importa este módulo (limpeza da
lixeira a cada request) e os routers importam app.deps.
"""

import json
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import Date, DateTime, or_
from sqlalchemy.orm import Session

from app import models
from app.config import settings

RETENCAO = timedelta(days=15)
# A limpeza dos vencidos roda no get_current_user, no máximo 1x por hora por usuário (cache em memória).
PURGE_INTERVAL_SECONDS = 3600
_last_purge: dict[int, float] = {}

RECORD_MODELS: dict[str, type] = {
    "gasto": models.Gasto,
    "receita": models.Receita,
    "servico_veiculo": models.VehicleService,
    "servico_casa": models.ServicoCasa,
    "nota_fiscal": models.NotaFiscal,
}
GROUPED_TYPES = {"gasto", "devedor"}


def reset_purge_cache() -> None:
    _last_purge.clear()


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Foto da linha -------------------------------------------------------------------------------


def _serialize(row: Any) -> str:
    data = {}
    for col in row.__table__.columns:
        value = getattr(row, col.key)
        data[col.key] = value.isoformat() if isinstance(value, (date, datetime)) else value
    return json.dumps(data, ensure_ascii=False)


def _deserialize(model: type, payload: str) -> dict:
    data = json.loads(payload)
    for col in model.__table__.columns:
        value = data.get(col.key)
        if value is None:
            continue
        if isinstance(col.type, DateTime):
            data[col.key] = datetime.fromisoformat(value)
        elif isinstance(col.type, Date):
            data[col.key] = date.fromisoformat(value)
    return {k: v for k, v in data.items() if k in model.__table__.columns}


# --- Como cada tipo aparece na lista -------------------------------------------------------------

_OPERACOES = {"compra": "Compra", "venda": "Venda", "compra_dolar": "Compra de dólar", "venda_dolar": "Venda de dólar"}


def _parcela(row: Any) -> Optional[str]:
    if getattr(row, "installment_count", None) and row.installment_count > 1:
        return f"parcela {row.installment_number}/{row.installment_count}"
    return None


def _join(*parts: Optional[str]) -> Optional[str]:
    text = " · ".join(p for p in parts if p)
    return text or None


def describe(entity_type: str, row: Any) -> tuple[str, Optional[str], Optional[float], Optional[date]]:
    """(título, detalhe, valor, data) do registro -- fica gravado no item da lixeira."""
    if entity_type == "gasto":
        name = row.item.name if row.item is not None else None
        titulo = row.description or name or "Gasto"
        return titulo, _join(name if row.description else None, _parcela(row)), row.value, row.date
    if entity_type == "receita":
        return row.description or "Receita", None, row.value, row.date
    if entity_type == "servico_veiculo":
        vehicle = row.vehicle.name if row.vehicle is not None else None
        km = f"{row.mileage} km" if row.mileage is not None else None
        return row.description, _join(vehicle, km), row.value, row.date
    if entity_type == "servico_casa":
        imovel = row.imovel.name if row.imovel is not None else None
        return row.description, _join(imovel, row.prestador), row.value, row.date
    if entity_type == "nota_fiscal":
        return f"Nota {row.numero}", row.tomador_nome, row.valor, row.data_emissao
    return entity_type, None, None, None


def _find_record(db: Session, user_id: int, entity_type: str, entity_id: str) -> Any:
    """Registro dono de um anexo (pela chave do anexo: id ou installment_group_id)."""
    if entity_type == "empresa":
        return db.query(models.Empresa).filter(models.Empresa.user_id == user_id).first()
    model = RECORD_MODELS.get(entity_type)
    if model is None:
        return None
    query = db.query(model).filter(model.user_id == user_id)
    if entity_type in GROUPED_TYPES and not entity_id.isdigit():
        return query.filter(model.installment_group_id == entity_id).order_by(model.date).first()
    return query.filter(model.id == int(entity_id)).first() if entity_id.isdigit() else None


# --- Mandar pra lixeira --------------------------------------------------------------------------


def _attachment_item(
    attachment: models.Attachment, deleted_at: datetime, parent_id: Optional[int], detalhe: Optional[str]
) -> models.LixeiraItem:
    return models.LixeiraItem(
        user_id=attachment.user_id,
        tipo="anexo",
        entity_type=attachment.entity_type,
        entity_id=attachment.entity_id,
        parent_id=parent_id,
        titulo=attachment.original_filename,
        detalhe=detalhe,
        payload=_serialize(attachment),
        deleted_at=deleted_at,
    )


def trash_record(db: Session, entity_type: str, row: Any) -> models.LixeiraItem:
    """Move o registro (e os anexos que só ele usava) pra lixeira. Não faz commit."""
    model = RECORD_MODELS[entity_type]
    deleted_at = _now()
    titulo, detalhe, valor, data_registro = describe(entity_type, row)
    group_id = getattr(row, "installment_group_id", None)
    item = models.LixeiraItem(
        user_id=row.user_id,
        tipo="registro",
        entity_type=entity_type,
        entity_id=str(row.id),
        group_id=group_id,
        titulo=titulo,
        detalhe=detalhe,
        valor=valor,
        data_registro=data_registro,
        payload=_serialize(row),
        deleted_at=deleted_at,
    )
    db.add(item)
    db.flush()

    # Anexos ligados direto ao id; os do grupo só quando esta é a última parcela -- conta excluindo
    # o próprio id (o autoflush está desligado, o delete abaixo ainda não foi aplicado).
    keys = [str(row.id)]
    if entity_type in GROUPED_TYPES and group_id:
        siblings = db.query(model).filter(model.installment_group_id == group_id, model.id != row.id).count()
        if siblings == 0:
            keys.append(group_id)
    attachments = (
        db.query(models.Attachment)
        .filter(
            models.Attachment.user_id == row.user_id,
            models.Attachment.entity_type == entity_type,
            models.Attachment.entity_id.in_(keys),
        )
        .all()
    )
    for attachment in attachments:
        db.add(_attachment_item(attachment, deleted_at, item.id, titulo))
        db.delete(attachment)
    db.delete(row)
    return item


def trash_attachment(db: Session, attachment: models.Attachment) -> models.LixeiraItem:
    """Anexo excluído sozinho (o registro continua). Não faz commit."""
    record = _find_record(db, attachment.user_id, attachment.entity_type, attachment.entity_id)
    if attachment.entity_type == "empresa":
        detalhe = "Documento da empresa"
    elif record is not None:
        detalhe = describe(attachment.entity_type, record)[0]
    else:
        detalhe = None
    item = _attachment_item(attachment, _now(), None, detalhe)
    db.add(item)
    db.delete(attachment)
    return item


# --- Restaurar -----------------------------------------------------------------------------------


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _check_restorable(db: Session, entity_type: str, data: dict, restored_id: Optional[int]) -> None:
    """Regras do tipo que a linha restaurada precisa continuar cumprindo (400 se não der).
    `restored_id`: o id com que ela volta, ou None se vai ganhar um novo (entra depois de todas)."""
    user_id = data["user_id"]
    if entity_type in ("gasto", "receita") and data.get("recorrencia_id") is not None:
        exists = db.query(models.Recorrencia.id).filter(models.Recorrencia.id == data["recorrencia_id"]).first()
        if exists is None:
            data["recorrencia_id"] = None  # a recorrência foi excluída depois: volta como avulso
    if entity_type == "servico_veiculo" and data.get("mileage") is not None:
        from app.routers.servicos_veiculos import _validate_mileage_order

        try:
            _validate_mileage_order(db, data["vehicle_id"], data["mileage"], data["date"], exclude_id=restored_id)
        except HTTPException as exc:
            raise _bad_request(f"Não dá pra restaurar: {exc.detail[0].lower()}{exc.detail[1:]}") from exc
    if entity_type == "servico_casa" and data.get("criado_por") is not None:
        if db.get(models.User, data["criado_por"]) is None:
            data["criado_por"] = None  # quem cadastrou (convidado) teve a conta excluída
    if entity_type == "nota_fiscal":
        conditions = [models.NotaFiscal.numero == data["numero"]]
        if data.get("chave_acesso"):
            conditions.append(models.NotaFiscal.chave_acesso == data["chave_acesso"])
        duplicada = db.query(models.NotaFiscal.id).filter(models.NotaFiscal.user_id == user_id, or_(*conditions)).first()
        if duplicada is not None:
            raise _bad_request(f"Não dá pra restaurar: a nota {data['numero']} já está cadastrada de novo")
        data["substituida_por"] = None  # recalculado por vincular_substituicao depois do insert


def _restore_attachment_row(db: Session, item: models.LixeiraItem) -> None:
    data = _deserialize(models.Attachment, item.payload)
    data["entity_id"] = item.entity_id  # pode ter mudado (registro restaurado com outro id)
    data.pop("id", None)
    if not Path(settings.upload_dir, data["entity_type"], data["stored_filename"]).is_file():
        return  # arquivo sumiu do disco: não volta um anexo quebrado
    db.add(models.Attachment(**data))


def _restore_record(db: Session, item: models.LixeiraItem) -> dict:
    model = RECORD_MODELS[item.entity_type]
    data = _deserialize(model, item.payload)
    old_id = data.pop("id")
    # Volta com o mesmo id se estiver livre (os anexos e as notas substituídas apontam pra ele); o
    # SQLite pode ter dado esse id a um registro novo se este era o último da tabela.
    reuse_id = db.get(model, old_id) is None
    _check_restorable(db, item.entity_type, data, old_id if reuse_id else None)
    if reuse_id:
        data["id"] = old_id
    row = model(**data)
    db.add(row)
    db.flush()
    new_key = str(row.id)

    if item.entity_type == "nota_fiscal":
        from app.empresa import vincular_substituicao

        vincular_substituicao(db, row)

    anexos = db.query(models.LixeiraItem).filter(
        models.LixeiraItem.user_id == item.user_id, models.LixeiraItem.tipo == "anexo"
    )
    if new_key != str(old_id):
        # Anexos (na lixeira) que apontam pro id antigo passam a apontar pro novo.
        anexos.filter(
            models.LixeiraItem.entity_type == item.entity_type, models.LixeiraItem.entity_id == str(old_id)
        ).update({models.LixeiraItem.entity_id: new_key}, synchronize_session=False)
        db.flush()

    group_id = getattr(row, "installment_group_id", None)
    conditions = [models.LixeiraItem.parent_id == item.id]
    if item.entity_type in GROUPED_TYPES and group_id:
        conditions.append(
            (models.LixeiraItem.entity_type == item.entity_type)
            & (models.LixeiraItem.entity_id == group_id)
            & models.LixeiraItem.parent_id.isnot(None)
        )
    for anexo in anexos.filter(or_(*conditions)).all():
        _restore_attachment_row(db, anexo)
        db.delete(anexo)

    db.delete(item)
    return {"entity_type": item.entity_type, "entity_id": new_key}


def _restore_standalone_attachment(db: Session, item: models.LixeiraItem) -> dict:
    if item.parent_id is not None:
        raise _bad_request("Este anexo saiu junto com o registro -- restaure o registro")
    if _find_record(db, item.user_id, item.entity_type, item.entity_id) is None:
        no_trash = (
            db.query(models.LixeiraItem.id)
            .filter(
                models.LixeiraItem.user_id == item.user_id,
                models.LixeiraItem.tipo == "registro",
                models.LixeiraItem.entity_type == item.entity_type,
                or_(models.LixeiraItem.entity_id == item.entity_id, models.LixeiraItem.group_id == item.entity_id),
            )
            .first()
        )
        if no_trash is not None:
            raise _bad_request("O registro deste anexo também está na lixeira -- restaure ele primeiro")
        raise _bad_request("O registro deste anexo foi excluído definitivamente")
    _restore_attachment_row(db, item)
    db.delete(item)
    return {"entity_type": item.entity_type, "entity_id": item.entity_id}


def restore(db: Session, item: models.LixeiraItem) -> dict:
    """Devolve o item à tabela dele. Não faz commit."""
    if item.tipo == "anexo":
        return _restore_standalone_attachment(db, item)
    return _restore_record(db, item)


# --- Excluir de vez ------------------------------------------------------------------------------


def _unlink_attachment_file(db: Session, item: models.LixeiraItem) -> None:
    from app.routers.attachments import schedule_unlink_after_commit

    data = json.loads(item.payload)
    schedule_unlink_after_commit(db, Path(settings.upload_dir, item.entity_type, data["stored_filename"]))


def purge(db: Session, item: models.LixeiraItem) -> None:
    """Some de vez com o item, os anexos que saíram junto com ele e os arquivos. Não faz commit."""
    children = db.query(models.LixeiraItem).filter(models.LixeiraItem.parent_id == item.id).all()
    for entry in [*children, item]:
        if entry.tipo == "anexo":
            _unlink_attachment_file(db, entry)
        db.delete(entry)


def purge_expired(db: Session, user_id: int) -> int:
    """Apaga de vez o que está na lixeira há mais de 15 dias. Faz commit se apagou algo."""
    limite = _now() - RETENCAO
    vencidos = (
        db.query(models.LixeiraItem)
        .filter(models.LixeiraItem.user_id == user_id, models.LixeiraItem.deleted_at < limite)
        .all()
    )
    for entry in vencidos:
        if entry.tipo == "anexo":
            _unlink_attachment_file(db, entry)
        db.delete(entry)
    if vencidos:
        db.commit()
    return len(vencidos)


def ensure_purged(db: Session, user_id: int) -> None:
    """Chamado em toda request autenticada; a limpeza de fato roda no máximo 1x/hora por usuário."""
    now = time.monotonic()
    last = _last_purge.get(user_id)
    if last is not None and now - last < PURGE_INTERVAL_SECONDS:
        return
    _last_purge[user_id] = now
    purge_expired(db, user_id)


def delete_all_for_user(db: Session, user_id: int) -> None:
    """Cascade de exclusão de usuário: a lixeira inteira dele, com os arquivos."""
    for entry in db.query(models.LixeiraItem).filter(models.LixeiraItem.user_id == user_id).all():
        if entry.tipo == "anexo":
            _unlink_attachment_file(db, entry)
    db.query(models.LixeiraItem).filter(models.LixeiraItem.user_id == user_id).delete(synchronize_session=False)
