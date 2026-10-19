"""Quanto cada usuário ocupa: parte do banco (SQLite) e arquivos (anexos + foto de perfil).

O SQLite não diz quanto espaço é de cada usuário (as páginas misturam linhas de todos), então a
parte do banco é uma divisão proporcional: soma o tamanho dos valores das linhas de cada usuário
(todas as tabelas com `user_id`, mais a linha dele em `users`) e reparte o espaço realmente usado
pelo arquivo (páginas - páginas livres) nessa proporção -- índices e sobra das páginas entram junto.
As tabelas vêm do `Base.metadata`, sem citar modelo por nome: tabela nova entra sozinha.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models
from app.avatars import avatar_path
from app.database import Base


def _bytes_brutos_por_usuario(db: Session) -> dict[int, int]:
    brutos: dict[int, int] = {}

    def somar(tabela, coluna_usuario: str) -> None:
        tamanho = " + ".join(f'COALESCE(length(CAST("{c.name}" AS BLOB)), 0)' for c in tabela.columns)
        sql = f'SELECT "{coluna_usuario}", SUM({tamanho}) FROM "{tabela.name}" GROUP BY "{coluna_usuario}"'
        for user_id, total in db.execute(text(sql)):
            if user_id is not None:
                brutos[user_id] = brutos.get(user_id, 0) + int(total or 0)

    for tabela in Base.metadata.sorted_tables:
        if tabela.name == "users":
            somar(tabela, "id")
        elif "user_id" in tabela.columns:
            somar(tabela, "user_id")
    return brutos


def _bytes_em_uso_do_banco(db: Session) -> tuple[int, int]:
    """(tamanho do arquivo, parte usada) em bytes."""
    page_size = db.execute(text("PRAGMA page_size")).scalar() or 0
    page_count = db.execute(text("PRAGMA page_count")).scalar() or 0
    livres = db.execute(text("PRAGMA freelist_count")).scalar() or 0
    return page_size * page_count, page_size * (page_count - livres)


def _bytes_de_arquivos_por_usuario(db: Session) -> dict[int, int]:
    arquivos: dict[int, int] = {}
    consultas = [
        "SELECT user_id, SUM(size_bytes) FROM attachments GROUP BY user_id",
        # Anexo na lixeira: a linha saiu de `attachments`, mas o arquivo continua no disco.
        "SELECT user_id, SUM(json_extract(payload, '$.size_bytes')) FROM lixeira "
        "WHERE tipo = 'anexo' GROUP BY user_id",
    ]
    for sql in consultas:
        for user_id, total in db.execute(text(sql)):
            arquivos[user_id] = arquivos.get(user_id, 0) + int(total or 0)

    com_foto = db.query(models.User.id, models.User.avatar_filename).filter(models.User.avatar_filename.isnot(None))
    for user_id, filename in com_foto:
        caminho = avatar_path(filename)
        if caminho.is_file():
            arquivos[user_id] = arquivos.get(user_id, 0) + caminho.stat().st_size
    return arquivos


def uso_por_usuario(db: Session) -> dict:
    brutos = _bytes_brutos_por_usuario(db)
    tamanho_arquivo, em_uso = _bytes_em_uso_do_banco(db)
    total_bruto = sum(brutos.values())
    arquivos = _bytes_de_arquivos_por_usuario(db)

    user_ids = [uid for (uid,) in db.query(models.User.id)]
    usuarios = [
        {
            "user_id": uid,
            "banco_bytes": round(em_uso * brutos.get(uid, 0) / total_bruto) if total_bruto else 0,
            "arquivos_bytes": arquivos.get(uid, 0),
        }
        for uid in user_ids
    ]
    return {"banco_total_bytes": tamanho_arquivo, "usuarios": usuarios}
