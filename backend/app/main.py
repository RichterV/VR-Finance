from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.config import settings
from app.database import Base, engine
from app.modules import OPTIONAL_MODULES
from app.routers import (
    analytics,
    attachments,
    auth,
    backup_status,
    dropdown_options,
    export,
    gastos,
    notificacoes,
    receitas,
    recorrencias,
    resumo,
    servicos_veiculos,
    veiculos,
)

# Precisa ser checado antes do create_all -- é ele que cria a tabela.
_had_user_modules = inspect(engine).has_table("user_modules")
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

        if "must_change_password" not in user_cols:
            # Usuários que já existiam ficam como estão (false) -- só contas criadas ou com senha
            # resetada pelo master daqui pra frente passam a exigir a troca.
            conn.execute(text("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()

        if "default_cash_percentage" not in user_cols:
            # 50% era o valor fixo do slider antes de existir o padrão por usuário.
            conn.execute(text("ALTER TABLE users ADD COLUMN default_cash_percentage REAL NOT NULL DEFAULT 50"))
            conn.commit()

        if "last_login_at" not in user_cols:
            # Sem backfill: não há registro de logins anteriores, fica null ("Nunca") até o próximo.
            conn.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))
            conn.commit()

        if "last_activity_at" not in user_cols:
            # Backfill com o último login: é a melhor aproximação da última atividade que existe.
            conn.execute(text("ALTER TABLE users ADD COLUMN last_activity_at DATETIME"))
            conn.execute(text("UPDATE users SET last_activity_at = last_login_at"))
            conn.commit()

        if "token_version" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"))
            conn.commit()

        if not _had_user_modules:
            # Tabela recém-criada: usuários que já existiam antes do controle de módulos ficam com
            # todos os módulos habilitados (não perdem nada que já usavam). Usuários criados depois
            # começam sem nenhum -- quem habilita é o master, no painel de admin. Roda uma vez só.
            user_ids = [row[0] for row in conn.execute(text("SELECT id FROM users WHERE role != 'master'"))]
            for user_id in user_ids:
                for key in OPTIONAL_MODULES:
                    conn.execute(
                        text("INSERT INTO user_modules (user_id, module_key) VALUES (:u, :k)"),
                        {"u": user_id, "k": key},
                    )
            conn.commit()

        for table in ("gastos", "receitas"):
            cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
            if "recorrencia_id" not in cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN recorrencia_id INTEGER REFERENCES recorrencias(id)"))
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_recorrencia_id ON {table} (recorrencia_id)"))
                conn.commit()

        # Índices (user_id, date) -- create_all só cria índice junto com uma tabela nova, então bancos
        # que já existiam precisam disso. IF NOT EXISTS deixa idempotente.
        # Só tabelas que existem neste banco (o espelho público não tem operacoes_bolsa/devedores).
        existing_tables = set(inspect(conn).get_table_names())
        for table in ("gastos", "receitas", "operacoes_bolsa", "devedores", "vehicle_services"):
            if table in existing_tables:
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_user_date ON {table} (user_id, date)"))
        conn.commit()

        # Versões de dados via PRAGMA user_version (0 = nenhuma aplicada), pra migrações que só
        # podem rodar uma vez -- ao contrário de ADD COLUMN, não dá pra detectar pelo schema.
        user_version = conn.execute(text("PRAGMA user_version")).scalar()
        if user_version < 1:
            # 1: Análise inflacionária virou módulo opcional. Quem já existia continua vendo a seção
            # (sem isso, desabilitar no admin e reiniciar o backend reabilitaria o módulo).
            conn.execute(
                text(
                    "INSERT INTO user_modules (user_id, module_key) "
                    "SELECT id, 'analise_inflacionaria' FROM users WHERE role != 'master' "
                    "AND id NOT IN (SELECT user_id FROM user_modules WHERE module_key = 'analise_inflacionaria')"
                )
            )
            conn.execute(text("PRAGMA user_version = 1"))
            conn.commit()

        if user_version < 2:
            # 2: valores em R$ passaram a ser arredondados a centavos na entrada (schemas.Money); os já
            # gravados (ex: cash_value 411.10848) são arredondados uma vez aqui.
            money_columns = {
                "gastos": ("value",),
                "receitas": ("value", "cash_value"),
                "devedores": ("value",),
                "vehicle_services": ("value",),
                "operacoes_bolsa": ("value_brl", "value_usd"),
            }
            for table, columns in money_columns.items():
                if table not in existing_tables:
                    continue
                for column in columns:
                    conn.execute(text(f"UPDATE {table} SET {column} = ROUND({column}, 2) WHERE {column} IS NOT NULL"))
            conn.execute(text("PRAGMA user_version = 2"))
            conn.commit()


_migrate_schema()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

app = FastAPI(title="VR Finance API")


@app.middleware("http")
async def _security_headers(request, call_next):
    response = await call_next(request)
    # Navegador nunca "adivinha" outro tipo além do Content-Type informado (ex: anexo servido como HTML).
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


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
app.include_router(notificacoes.router)
app.include_router(analytics.router)
app.include_router(recorrencias.router)


@app.get("/health")
def health():
    return {"status": "ok"}
