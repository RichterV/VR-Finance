import sqlite3

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _connection_record) -> None:
    """Em toda conexão SQLite (inclusive a do banco em memória dos testes): FKs passam a valer de
    verdade (sem isso as ForeignKey dos models são decorativas) e uma escrita concorrente espera até
    5s em vez de falhar com "database is locked". Sem WAL de propósito -- o backup do servidor faz
    tar da pasta com o backend rodando, e o WAL deixaria o banco copiado inconsistente."""
    if isinstance(dbapi_conn, sqlite3.Connection):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()
