import csv
import io
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.deps import get_current_user, get_db

router = APIRouter(prefix="/export", tags=["export"])

Modulo = Literal["gastos", "receitas", "veiculos", "categorias"]


def _fmt_decimal(value: Optional[float], casas: int = 2) -> str:
    if value is None:
        return ""
    texto = f"{value:.{casas}f}"
    if casas > 2:
        texto = texto.rstrip("0").rstrip(".")
    return texto.replace(".", ",")


def _fmt_bool(value: bool) -> str:
    return "Sim" if value else "Não"


def _fmt_date(value) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def _fmt_datetime(value) -> str:
    return value.strftime("%d/%m/%Y %H:%M:%S") if value else ""


def _write_csv(rows: list[dict[str, Any]], columns: list[str]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([row.get(c, "") for c in columns])
    # errors="replace" e' defensivo: um caractere que nao existe em latin-1 (ex: emoji digitado
    # numa descricao) vira "?" em vez de estourar a exportacao inteira.
    return buf.getvalue().encode("latin-1", errors="replace")


def _attachments_by_key(db: Session, user_id: int, entity_type: str) -> dict[str, list[models.Attachment]]:
    """Uma query so por modulo (nao uma por linha) -- agrupa em memoria por entity_id."""
    rows = (
        db.query(models.Attachment)
        .filter(models.Attachment.user_id == user_id, models.Attachment.entity_type == entity_type)
        .order_by(models.Attachment.created_at)
        .all()
    )
    grouped: dict[str, list[models.Attachment]] = defaultdict(list)
    for attachment in rows:
        grouped[attachment.entity_id].append(attachment)
    return grouped


def _export_filename(entity_type: str, attachment: models.Attachment) -> str:
    return f"{entity_type}_{attachment.entity_id}_{attachment.id}_{attachment.original_filename}"


def _anexos_cell_and_files(
    attachments: list[models.Attachment], entity_type: str, files: dict[str, bytes]
) -> str:
    """Monta a celula "anexos" (nomes separados por virgula) e adiciona os arquivos lidos do
    disco em `files` (mutado in-place). Anexo cujo arquivo sumiu do disco (raro -- ex: limpeza
    manual) e' silenciosamente omitido tanto da celula quanto do zip, sem quebrar a exportacao."""
    nomes = []
    for attachment in attachments:
        disk_path = Path(settings.upload_dir, attachment.entity_type, attachment.stored_filename)
        if not disk_path.is_file():
            continue
        nome_exportado = _export_filename(entity_type, attachment)
        files[f"anexos/{nome_exportado}"] = disk_path.read_bytes()
        nomes.append(nome_exportado)
    return ",".join(nomes)


def _build_zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _export_gastos(db: Session, user: models.User) -> dict[str, bytes]:
    rows = (
        db.query(models.Gasto)
        .filter(models.Gasto.user_id == user.id)
        .order_by(models.Gasto.date.asc(), models.Gasto.id.asc())
        .all()
    )
    files: dict[str, bytes] = {}
    anexos_por_chave = _attachments_by_key(db, user.id, "gasto")

    csv_rows = []
    for gasto in rows:
        chave = gasto.installment_group_id or str(gasto.id)
        anexos = _anexos_cell_and_files(anexos_por_chave.get(chave, []), "gasto", files)
        csv_rows.append(
            {
                "id": gasto.id,
                "data": _fmt_date(gasto.date),
                "prioridade": gasto.priority,
                "categoria": gasto.item_name,
                "valor": _fmt_decimal(gasto.value),
                "descricao": gasto.description or "",
                "parcelado": _fmt_bool(gasto.is_installment),
                "parcela_numero": gasto.installment_number if gasto.installment_number is not None else "",
                "parcela_total": gasto.installment_count if gasto.installment_count is not None else "",
                "grupo_parcelamento": gasto.installment_group_id or "",
                "anexos": anexos,
                "criado_em": _fmt_datetime(gasto.created_at),
            }
        )

    columns = [
        "id",
        "data",
        "prioridade",
        "categoria",
        "valor",
        "descricao",
        "parcelado",
        "parcela_numero",
        "parcela_total",
        "grupo_parcelamento",
        "anexos",
        "criado_em",
    ]
    files["gastos.csv"] = _write_csv(csv_rows, columns)
    return files


def _export_receitas(db: Session, user: models.User) -> dict[str, bytes]:
    rows = (
        db.query(models.Receita)
        .filter(models.Receita.user_id == user.id)
        .order_by(models.Receita.date.asc(), models.Receita.id.asc())
        .all()
    )
    files: dict[str, bytes] = {}
    anexos_por_chave = _attachments_by_key(db, user.id, "receita")

    csv_rows = []
    for receita in rows:
        anexos = _anexos_cell_and_files(anexos_por_chave.get(str(receita.id), []), "receita", files)
        csv_rows.append(
            {
                "id": receita.id,
                "data": _fmt_date(receita.date),
                "valor": _fmt_decimal(receita.value),
                "percentual_caixa": _fmt_decimal(receita.cash_percentage),
                "valor_caixa": _fmt_decimal(receita.cash_value),
                "descricao": receita.description or "",
                "anexos": anexos,
                "criado_em": _fmt_datetime(receita.created_at),
            }
        )

    columns = ["id", "data", "valor", "percentual_caixa", "valor_caixa", "descricao", "anexos", "criado_em"]
    files["receitas.csv"] = _write_csv(csv_rows, columns)
    return files


def _export_veiculos(db: Session, user: models.User) -> dict[str, bytes]:
    veiculos = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.user_id == user.id)
        .order_by(models.Vehicle.name.asc())
        .all()
    )
    servicos = (
        db.query(models.VehicleService)
        .filter(models.VehicleService.user_id == user.id)
        .order_by(models.VehicleService.date.asc(), models.VehicleService.id.asc())
        .all()
    )

    files: dict[str, bytes] = {}

    veiculos_rows = [
        {
            "id": v.id,
            "nome": v.name,
            "ano": v.year,
            "ativo": _fmt_bool(v.active),
            "criado_em": _fmt_datetime(v.created_at),
        }
        for v in veiculos
    ]
    files["veiculos.csv"] = _write_csv(veiculos_rows, ["id", "nome", "ano", "ativo", "criado_em"])

    anexos_por_chave = _attachments_by_key(db, user.id, "servico_veiculo")
    servicos_rows = []
    for servico in servicos:
        anexos = _anexos_cell_and_files(anexos_por_chave.get(str(servico.id), []), "servico_veiculo", files)
        servicos_rows.append(
            {
                "id": servico.id,
                "veiculo": servico.vehicle_name,
                "descricao": servico.description,
                "observacao": servico.notes or "",
                "valor": _fmt_decimal(servico.value),
                "tipo_servico": servico.service_type or "",
                "quilometragem": servico.mileage if servico.mileage is not None else "",
                "data": _fmt_date(servico.date),
                "anexos": anexos,
                "criado_em": _fmt_datetime(servico.created_at),
            }
        )
    files["servicos_veiculos.csv"] = _write_csv(
        servicos_rows,
        ["id", "veiculo", "descricao", "observacao", "valor", "tipo_servico", "quilometragem", "data", "anexos", "criado_em"],
    )
    return files



def _export_categorias(db: Session, user: models.User) -> dict[str, bytes]:
    # Ativas e inativas de proposito -- e' uma copia de backup, esconder as soft-deleted perderia
    # o historico de categorias ja usadas em gastos antigos.
    rows = (
        db.query(models.DropdownOption)
        .filter(models.DropdownOption.user_id == user.id)
        .order_by(models.DropdownOption.name.asc())
        .all()
    )
    csv_rows = [
        {
            "id": item.id,
            "nome": item.name,
            "prioridade": item.priority,
            "ativo": _fmt_bool(item.active),
            "cesta_inflacao": _fmt_bool(item.include_in_inflation),
            "criado_em": _fmt_datetime(item.created_at),
        }
        for item in rows
    ]
    columns = ["id", "nome", "prioridade", "ativo", "cesta_inflacao", "criado_em"]
    return {"categorias.csv": _write_csv(csv_rows, columns)}


_BUILDERS = {
    "gastos": _export_gastos,
    "receitas": _export_receitas,
    "veiculos": _export_veiculos,
    "categorias": _export_categorias,
}


@router.get("/{modulo}")
def export_modulo(
    modulo: Modulo,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    files = _BUILDERS[modulo](db, current_user)
    zip_bytes = _build_zip(files)
    filename = f"export_{modulo}_{date.today().isoformat()}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
