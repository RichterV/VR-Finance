from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import (
    attachments,
    auth,
    backup_status,
    dropdown_options,
    gastos,
    receitas,
    resumo,
    servicos_veiculos,
    veiculos,
)

Base.metadata.create_all(bind=engine)
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

app = FastAPI(title="VR Finance API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dropdown_options.router)
app.include_router(gastos.router)
app.include_router(receitas.router)
app.include_router(resumo.router)
app.include_router(veiculos.router)
app.include_router(servicos_veiculos.router)
app.include_router(attachments.router)
app.include_router(backup_status.router)


@app.get("/health")
def health():
    return {"status": "ok"}
