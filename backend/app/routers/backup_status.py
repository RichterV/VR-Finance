from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends

from app import models, schemas
from app.config import settings
from app.deps import require_master

router = APIRouter(prefix="/backup-status", tags=["backup-status"])


@router.get("", response_model=schemas.BackupStatusOut)
def get_backup_status(_master: models.User = Depends(require_master)):
    """Lê o timestamp do último backup, gravado pelo menu.bat (opção 4) via SSH direto no servidor
    logo após um backup bem-sucedido -- ver `backup_menu`/`backup_marcar_feito` em menu.bat.
    Restrito ao master, já que só o aviso de "faça backup" dele usa isso."""
    path = Path(settings.backup_marker_file)
    if not path.is_file():
        return {"last_backup_at": None}
    try:
        last_backup_at = datetime.fromisoformat(path.read_text().strip())
    except ValueError:
        return {"last_backup_at": None}
    return {"last_backup_at": last_backup_at}
