from datetime import date, datetime

from app import models


def _gastos(db_session, user, quantidade: int) -> None:
    item = models.DropdownOption(user_id=user.id, priority="essencial", name="Mercado")
    db_session.add(item)
    db_session.flush()
    for i in range(quantidade):
        db_session.add(
            models.Gasto(
                user_id=user.id,
                priority="essencial",
                item_id=item.id,
                value=10.0 + i,
                description="Compra do mês com uma descrição razoavelmente comprida",
                is_installment=False,
                date=date(2026, 1, 1),
            )
        )
    db_session.commit()


def test_only_master_sees_storage(client, auth_headers, master_headers):
    assert client.get("/auth/users/armazenamento", headers=auth_headers).status_code == 403
    assert client.get("/auth/users/armazenamento", headers=master_headers).status_code == 200


def test_storage_is_proportional_to_each_user_data(client, db_session, user, master_user, master_headers):
    _gastos(db_session, user, 200)
    _gastos(db_session, master_user, 10)

    body = client.get("/auth/users/armazenamento", headers=master_headers).json()
    por_id = {u["user_id"]: u for u in body["usuarios"]}

    assert set(por_id) == {user.id, master_user.id}
    assert por_id[user.id]["banco_bytes"] > 5 * por_id[master_user.id]["banco_bytes"] > 0
    # A soma das partes nunca passa do tamanho do arquivo do banco.
    assert sum(u["banco_bytes"] for u in body["usuarios"]) <= body["banco_total_bytes"]


def test_files_count_attachments_trash_and_avatar(client, db_session, user, master_headers, tmp_path, monkeypatch):
    monkeypatch.setattr("app.avatars.settings.upload_dir", str(tmp_path))
    (tmp_path / "avatars").mkdir()
    (tmp_path / "avatars" / "foto.jpg").write_bytes(b"x" * 300)
    user.avatar_filename = "foto.jpg"
    db_session.add(
        models.Attachment(
            user_id=user.id,
            entity_type="gasto",
            entity_id="1",
            original_filename="a.pdf",
            stored_filename="a.pdf",
            content_type="application/pdf",
            size_bytes=1000,
        )
    )
    db_session.add(
        models.LixeiraItem(
            user_id=user.id,
            tipo="anexo",
            entity_type="gasto",
            entity_id="2",
            titulo="b.pdf",
            payload='{"size_bytes": 500}',
            deleted_at=datetime.utcnow(),
        )
    )
    db_session.commit()

    body = client.get("/auth/users/armazenamento", headers=master_headers).json()
    por_id = {u["user_id"]: u for u in body["usuarios"]}
    assert por_id[user.id]["arquivos_bytes"] == 1800
