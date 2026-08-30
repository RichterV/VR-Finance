import io

import pytest

from app import models
from app.security import hash_password


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.attachments.settings.upload_dir", str(tmp_path))
    return tmp_path


def _pdf_file(name="comprovante.pdf"):
    return {"file": (name, io.BytesIO(b"%PDF-1.4 conteudo fake"), "application/pdf")}


def _create_item(client, headers, priority="essencial", name="Casa"):
    return client.post("/dropdown-options", headers=headers, json={"priority": priority, "name": name}).json()


def _create_receita(client, headers, value=100.0):
    return client.post(
        "/receitas", headers=headers, json={"value": value, "cash_percentage": 50}
    ).json()


def _create_gasto(client, headers, parcelado=False, installment_count=3):
    item = _create_item(client, headers)
    payload = {"priority": "essencial", "item_id": item["id"], "value": 50.0}
    if parcelado:
        payload["is_installment"] = True
        payload["installment_count"] = installment_count
    return client.post("/gastos", headers=headers, json=payload).json()



def _other_user_headers(client, db_session):
    other = models.User(username="outro_anexo", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    login = client.post("/auth/login", data={"username": "outro_anexo", "password": "senha123"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_upload_success_non_grouped_entity(client, auth_headers, tmp_path):
    receita = _create_receita(client, auth_headers)

    response = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files=_pdf_file(),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["entity_type"] == "receita"
    assert body["entity_id"] == str(receita["id"])
    assert body["original_filename"] == "comprovante.pdf"
    assert body["content_type"] == "application/pdf"
    assert body["size_bytes"] > 0

    disk_files = list((tmp_path / "receita").glob("*.pdf"))
    assert len(disk_files) == 1


def test_upload_rejects_disallowed_content_type(client, auth_headers, tmp_path):
    receita = _create_receita(client, auth_headers)

    response = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files={"file": ("nota.txt", io.BytesIO(b"so texto"), "text/plain")},
    )
    assert response.status_code == 400
    assert not any((tmp_path).rglob("*"))


def test_upload_rejects_file_too_large(client, auth_headers, tmp_path):
    receita = _create_receita(client, auth_headers)
    big_content = b"0" * (10 * 1024 * 1024 + 1)

    response = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files={"file": ("grande.pdf", io.BytesIO(big_content), "application/pdf")},
    )
    assert response.status_code == 413
    assert not any((tmp_path).rglob("*"))


def test_upload_not_owned_entity_returns_404(client, auth_headers, db_session):
    other_headers = _other_user_headers(client, db_session)
    receita = _create_receita(client, other_headers)

    response = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files=_pdf_file(),
    )
    assert response.status_code == 404


def test_list_download_delete_not_owned_returns_404(client, auth_headers, db_session):
    other_headers = _other_user_headers(client, db_session)
    receita = _create_receita(client, other_headers)
    uploaded = client.post(
        "/attachments/upload",
        headers=other_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files=_pdf_file(),
    ).json()

    list_response = client.get(
        "/attachments",
        headers=auth_headers,
        params={"entity_type": "receita", "entity_id": str(receita["id"])},
    )
    assert list_response.status_code == 404

    download_response = client.get(f"/attachments/{uploaded['id']}/download", headers=auth_headers)
    assert download_response.status_code == 404

    delete_response = client.delete(f"/attachments/{uploaded['id']}", headers=auth_headers)
    assert delete_response.status_code == 404


def test_download_streams_correct_bytes_and_headers(client, auth_headers):
    receita = _create_receita(client, auth_headers)
    original_bytes = b"%PDF-1.4 conteudo fake"
    uploaded = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files={"file": ("comprovante.pdf", io.BytesIO(original_bytes), "application/pdf")},
    ).json()

    response = client.get(f"/attachments/{uploaded['id']}/download", headers=auth_headers)
    assert response.status_code == 200
    assert response.content == original_bytes
    assert response.headers["content-type"] == "application/pdf"
    assert "comprovante.pdf" in response.headers["content-disposition"]


def test_delete_removes_row_and_file(client, auth_headers, tmp_path):
    receita = _create_receita(client, auth_headers)
    uploaded = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files=_pdf_file(),
    ).json()
    assert len(list(tmp_path.rglob("*.pdf"))) == 1

    response = client.delete(f"/attachments/{uploaded['id']}", headers=auth_headers)
    assert response.status_code == 204

    listed = client.get(
        "/attachments",
        headers=auth_headers,
        params={"entity_type": "receita", "entity_id": str(receita["id"])},
    ).json()
    assert listed == []
    assert not any(tmp_path.rglob("*.pdf"))

    download_response = client.get(f"/attachments/{uploaded['id']}/download", headers=auth_headers)
    assert download_response.status_code == 404


def test_gasto_parcelado_attachment_linked_to_group_visible_from_every_parcela(client, auth_headers):
    rows = _create_gasto(client, auth_headers, parcelado=True, installment_count=3)
    group_id = rows[0]["installment_group_id"]

    client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "gasto", "entity_id": group_id},
        files=_pdf_file(),
    )

    for row in rows:
        listed = client.get(
            "/attachments",
            headers=auth_headers,
            params={"entity_type": "gasto", "entity_id": group_id},
        ).json()
        assert len(listed) == 1
        # autorizacao tambem aceita o id de qualquer parcela individual do mesmo grupo, ja que a
        # checagem no backend e permissiva por design (ver _authorize_entity) -- so o frontend
        # garante que sempre usa o group_id, nunca o id de uma parcela, ao subir um anexo novo.
        upload_by_parcela_id = client.post(
            "/attachments/upload",
            headers=auth_headers,
            data={"entity_type": "gasto", "entity_id": str(row["id"])},
            files=_pdf_file(name=f"parcela-{row['installment_number']}.pdf"),
        )
        assert upload_by_parcela_id.status_code == 201

    # o upload "por parcela" cria uma linha de anexo distinta (entity_id = id da parcela), nao se
    # funde com a do grupo -- normalizar pra sempre usar o group_id e responsabilidade do frontend.
    todos_por_grupo = client.get(
        "/attachments", headers=auth_headers, params={"entity_type": "gasto", "entity_id": group_id}
    ).json()
    assert len(todos_por_grupo) == 1
    todos_por_parcela_1 = client.get(
        "/attachments", headers=auth_headers, params={"entity_type": "gasto", "entity_id": str(rows[0]["id"])}
    ).json()
    assert len(todos_por_parcela_1) == 1
    assert todos_por_parcela_1[0]["entity_id"] == str(rows[0]["id"])


def test_gasto_nao_parcelado_attachment_linked_directly_to_id(client, auth_headers):
    rows = _create_gasto(client, auth_headers, parcelado=False)
    gasto_id = rows[0]["id"]
    assert rows[0]["installment_group_id"] is None

    response = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "gasto", "entity_id": str(gasto_id)},
        files=_pdf_file(),
    )
    assert response.status_code == 201
    assert response.json()["entity_id"] == str(gasto_id)



def test_exists_returns_only_entity_ids_with_attachments(client, auth_headers):
    receita_com_anexo = _create_receita(client, auth_headers, value=10.0)
    receita_sem_anexo = _create_receita(client, auth_headers, value=20.0)
    client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita_com_anexo["id"])},
        files=_pdf_file(),
    )

    response = client.get(
        "/attachments/exists",
        headers=auth_headers,
        params={
            "entity_type": "receita",
            "entity_ids": [str(receita_com_anexo["id"]), str(receita_sem_anexo["id"])],
        },
    )
    assert response.status_code == 200
    assert response.json()["entity_ids_with_attachments"] == [str(receita_com_anexo["id"])]


def test_exists_is_isolated_per_user(client, auth_headers, db_session):
    other_headers = _other_user_headers(client, db_session)
    receita_outro_usuario = _create_receita(client, other_headers, value=10.0)
    client.post(
        "/attachments/upload",
        headers=other_headers,
        data={"entity_type": "receita", "entity_id": str(receita_outro_usuario["id"])},
        files=_pdf_file(),
    )

    response = client.get(
        "/attachments/exists",
        headers=auth_headers,
        params={"entity_type": "receita", "entity_ids": [str(receita_outro_usuario["id"])]},
    )
    assert response.json()["entity_ids_with_attachments"] == []


# --- Limpeza de orfaos ao excluir registros ---

def _attachment_row_exists(db_session, entity_type, entity_id):
    return (
        db_session.query(models.Attachment)
        .filter(models.Attachment.entity_type == entity_type, models.Attachment.entity_id == entity_id)
        .count()
        > 0
    )


def test_deleting_non_grouped_entity_deletes_its_attachment(client, auth_headers, db_session, tmp_path):
    receita = _create_receita(client, auth_headers)
    client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files=_pdf_file(),
    )
    assert len(list(tmp_path.rglob("*.pdf"))) == 1

    response = client.delete(f"/receitas/{receita['id']}", headers=auth_headers)
    assert response.status_code == 204
    assert not _attachment_row_exists(db_session, "receita", str(receita["id"]))
    assert not any(tmp_path.rglob("*.pdf"))


def test_deleting_one_parcela_of_gasto_group_keeps_attachment_for_siblings(client, auth_headers, db_session, tmp_path):
    rows = _create_gasto(client, auth_headers, parcelado=True, installment_count=2)
    group_id = rows[0]["installment_group_id"]
    client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "gasto", "entity_id": group_id},
        files=_pdf_file(),
    )

    # apaga a primeira parcela -- a segunda ainda existe, entao o anexo do grupo deve permanecer
    response = client.delete(f"/gastos/{rows[0]['id']}", headers=auth_headers)
    assert response.status_code == 204
    assert _attachment_row_exists(db_session, "gasto", group_id)
    assert len(list(tmp_path.rglob("*.pdf"))) == 1

    # apaga a ultima parcela -- agora sim o anexo do grupo deve sumir
    response = client.delete(f"/gastos/{rows[1]['id']}", headers=auth_headers)
    assert response.status_code == 204
    assert not _attachment_row_exists(db_session, "gasto", group_id)
    assert not any(tmp_path.rglob("*.pdf"))



def test_deleting_user_removes_all_their_attachments(client, master_headers, db_session, tmp_path):
    from app.security import hash_password

    user = models.User(username="usuario_com_anexo", password_hash=hash_password("senha123"), role="user")
    db_session.add(user)
    db_session.commit()
    login = client.post("/auth/login", data={"username": "usuario_com_anexo", "password": "senha123"})
    user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    receita = _create_receita(client, user_headers)
    client.post(
        "/attachments/upload",
        headers=user_headers,
        data={"entity_type": "receita", "entity_id": str(receita["id"])},
        files=_pdf_file(),
    )
    assert len(list(tmp_path.rglob("*.pdf"))) == 1

    response = client.delete(f"/auth/users/{user.id}", headers=master_headers)
    assert response.status_code == 204
    assert not any(tmp_path.rglob("*.pdf"))
    assert db_session.query(models.Attachment).filter(models.Attachment.user_id == user.id).count() == 0
