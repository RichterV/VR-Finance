from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import models
from app.deps import get_current_user, get_db, require_module
from app.relatorio_anual import anos_com_dados, gerar_pdf, montar_relatorio
from app.utils import APP_TIMEZONE, today_local

# Relatórios em PDF ficam em Exportar Dados > Relatórios (a declaração do MEI continua em /empresa,
# porque depende do módulo Empresa).
router = APIRouter(
    prefix="/relatorios",
    tags=["relatorios"],
    dependencies=[Depends(require_module("exportar_dados"))],
)


@router.get("/anual/anos", response_model=list[int])
def anos_relatorio_anual(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Anos com lançamentos até hoje (mais recente primeiro; sempre inclui o atual)."""
    return anos_com_dados(db, current_user, today_local())


@router.get("/anual", response_class=Response)
def relatorio_anual(
    ano: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """PDF com o resumo do ano (parcial até hoje se o ano estiver em andamento) -- não grava nada."""
    hoje = today_local()
    if ano > hoje.year:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esse ano ainda não começou")
    rel = montar_relatorio(db, current_user, ano, hoje)
    pdf = gerar_pdf(rel, datetime.now(APP_TIMEZONE))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="relatorio-anual-{ano}.pdf"'},
    )
