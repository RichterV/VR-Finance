from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine
from app.routers import (
    attachments,
    auth,
    backup_status,
    dropdown_options,
    export,
    gastos,
    receitas,
    resumo,
    servicos_veiculos,
    veiculos,
)

Base.metadata.create_all(bind=engine)


def _migrate_schema() -> None:
    """create_all() só cria tabelas que ainda não existem -- nunca altera uma tabela já
    existente. Sem Alembic no projeto, colunas novas em tabelas antigas (ex: include_in_inflation
    em dropdown_options) precisam desse passo manual pra chegar num banco que já tem dados
    (dev local ou o servidor). Idempotente: cada ALTER TABLE só roda se a coluna ainda não
    existir, então rodar de novo a cada start do backend é seguro."""
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(dropdown_options)"))}
        if "include_in_inflation" not in cols:
            conn.execute(
                text("ALTER TABLE dropdown_options ADD COLUMN include_in_inflation BOOLEAN NOT NULL DEFAULT 0")
            )
            conn.commit()

        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
        if "first_name" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''"))
            conn.execute(text("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''"))
            # Backfill dos dois usuários já existentes antes dessa coluna existir -- usuários criados
            # depois já vêm com o nome preenchido via POST /auth/users, que passou a exigir os campos.
            conn.execute(text("UPDATE users SET first_name = 'Teste', last_name = 'Teste' WHERE username = 'teste'"))
            conn.execute(
                text("UPDATE users SET first_name = 'Nome', last_name = 'Sobrenome' WHERE username = 'admin'")
            )
            conn.commit()


_migrate_schema()
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
app.include_router(export.router)


@app.get("/health")
def health():
    return {"status": "ok"}
