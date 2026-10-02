import pytest

from app import models
from app.modules import OPTIONAL_MODULES
from tests.conftest import _create_user, _login_headers


@pytest.fixture()
def restricted_headers(client, db_session):
    _create_user(db_session, "restrito", "senha-restrita", modules=())
    return _login_headers(client, "restrito", "senha-restrita")


@pytest.mark.parametrize(
    "path",
    [
        "/veiculos",
        "/veiculos/resumo",
        "/servicos-veiculos",
        "/export/gastos",
        "/resumo/inflacao",
    ],
)
def test_disabled_module_endpoints_return_403(client, restricted_headers, path):
    response = client.get(path, headers=restricted_headers)
    assert response.status_code == 403


def test_core_endpoints_available_without_modules(client, restricted_headers):
    assert client.get("/gastos", headers=restricted_headers).status_code == 200
    assert client.get("/receitas", headers=restricted_headers).status_code == 200
    assert client.get("/dropdown-options?priority=essencial", headers=restricted_headers).status_code == 200


def test_me_lists_enabled_modules(client, db_session):
    _create_user(db_session, "parcial", "senha-parcial", modules=("veiculos", "ferramentas"))
    headers = _login_headers(client, "parcial", "senha-parcial")
    response = client.get("/auth/me", headers=headers)
    assert response.json()["modules"] == ["veiculos", "ferramentas"]


def test_master_always_has_all_modules(client, master_headers):
    response = client.get("/auth/me", headers=master_headers)
    assert response.json()["modules"] == list(OPTIONAL_MODULES)


def test_export_requires_module_of_exported_data(client, db_session):
    _create_user(db_session, "exporta", "senha-exporta", modules=("exportar_dados",))
    headers = _login_headers(client, "exporta", "senha-exporta")
    assert client.get("/export/gastos", headers=headers).status_code == 200
    assert client.get("/export/categorias", headers=headers).status_code == 200
    assert client.get("/export/veiculos", headers=headers).status_code == 403


def test_attachments_of_disabled_module_are_blocked(client, db_session):
    user = _create_user(db_session, "anexos", "senha-anexos")
    headers = _login_headers(client, "anexos", "senha-anexos")
    vehicle = client.post("/veiculos", json={"name": "Moto", "year": 2010}, headers=headers).json()
    service = client.post(
        "/servicos-veiculos",
        json={"vehicle_id": vehicle["id"], "description": "Óleo", "value": 50, "mileage": 1000},
        headers=headers,
    ).json()
    entity_id = str(service["id"])
    upload = client.post(
        "/attachments/upload",
        data={"entity_type": "servico_veiculo", "entity_id": entity_id},
        files={"file": ("a.png", b"\x89PNG\r\n\x1a\n fake", "image/png")},
        headers=headers,
    )
    assert upload.status_code == 201
    attachment_id = upload.json()["id"]

    user.set_modules([])
    db_session.commit()

    assert client.get(f"/attachments/{attachment_id}/download", headers=headers).status_code == 403
    assert (
        client.get(f"/attachments?entity_type=servico_veiculo&entity_id={entity_id}", headers=headers).status_code
        == 403
    )
    assert (
        client.get(
            f"/attachments/exists?entity_type=servico_veiculo&entity_ids={entity_id}", headers=headers
        ).status_code
        == 403
    )


def test_master_creates_user_with_modules(client, master_headers):
    response = client.post(
        "/auth/users",
        json={
            "username": "novo",
            "password": "senha123",
            "first_name": "Novo",
            "last_name": "Usuário",
            "modules": ["veiculos", "exportar_dados"],
        },
        headers=master_headers,
    )
    assert response.status_code == 201
    assert response.json()["modules"] == ["veiculos", "exportar_dados"]


def test_new_user_defaults_to_no_modules(client, master_headers):
    response = client.post(
        "/auth/users",
        json={"username": "novo", "password": "senha123", "first_name": "Novo", "last_name": "Usuário"},
        headers=master_headers,
    )
    assert response.json()["modules"] == []


def test_create_user_rejects_unknown_module(client, master_headers):
    response = client.post(
        "/auth/users",
        json={
            "username": "novo",
            "password": "senha123",
            "first_name": "Novo",
            "last_name": "Usuário",
            "modules": ["inexistente"],
        },
        headers=master_headers,
    )
    assert response.status_code == 422


def test_master_updates_user_modules(client, master_headers, user, db_session):
    response = client.put(
        f"/auth/users/{user.id}",
        json={"username": user.username, "first_name": "A", "last_name": "B", "modules": ["ferramentas"]},
        headers=master_headers,
    )
    assert response.status_code == 200
    assert response.json()["modules"] == ["ferramentas"]
    rows = db_session.query(models.UserModule).filter(models.UserModule.user_id == user.id).all()
    assert [r.module_key for r in rows] == ["ferramentas"]


def test_update_without_modules_keeps_current(client, master_headers, user):
    response = client.put(
        f"/auth/users/{user.id}",
        json={"username": user.username, "first_name": "A", "last_name": "B"},
        headers=master_headers,
    )
    assert response.json()["modules"] == list(OPTIONAL_MODULES)


def test_module_change_takes_effect_immediately(client, master_headers, user, auth_headers):
    assert client.get("/veiculos", headers=auth_headers).status_code == 200
    client.put(
        f"/auth/users/{user.id}",
        json={"username": user.username, "first_name": "A", "last_name": "B", "modules": []},
        headers=master_headers,
    )
    assert client.get("/veiculos", headers=auth_headers).status_code == 403


def test_delete_user_removes_module_rows(client, master_headers, user, db_session):
    user_id = user.id
    assert client.delete(f"/auth/users/{user_id}", headers=master_headers).status_code == 204
    assert db_session.query(models.UserModule).filter(models.UserModule.user_id == user_id).count() == 0


# --- PUT /auth/me (usuário editando a própria conta) ---


def test_update_me_changes_name(client, auth_headers, user):
    response = client.put(
        "/auth/me",
        json={"username": user.username, "first_name": "Maria", "last_name": "Silva"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["first_name"] == "Maria"
    assert body["user"]["last_name"] == "Silva"


def test_update_me_changes_username_and_returns_working_token(client, auth_headers, user_password):
    response = client.put(
        "/auth/me",
        json={"username": "novo_nome", "first_name": "A", "last_name": "B"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    new_headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/auth/me", headers=new_headers).json()["username"] == "novo_nome"
    # Login com o username novo também funciona
    login = client.post("/auth/login", data={"username": "novo_nome", "password": user_password})
    assert login.status_code == 200


def test_update_me_rejects_existing_username(client, auth_headers, master_user):
    response = client.put(
        "/auth/me",
        json={"username": master_user.username, "first_name": "A", "last_name": "B"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_update_me_requires_all_fields(client, auth_headers, user):
    response = client.put(
        "/auth/me",
        json={"username": user.username, "first_name": "", "last_name": "B"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_update_me_rejects_blank_username(client, auth_headers):
    response = client.put(
        "/auth/me",
        json={"username": "   ", "first_name": "A", "last_name": "B"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_update_me_requires_token(client):
    response = client.put("/auth/me", json={"username": "x", "first_name": "A", "last_name": "B"})
    assert response.status_code == 401


def test_inflation_basket_toggle_requires_module(client, restricted_headers):
    item = client.post(
        "/dropdown-options", json={"priority": "essencial", "name": "Mercado"}, headers=restricted_headers
    ).json()
    blocked = client.put(
        f"/dropdown-options/{item['id']}",
        json={"name": "Mercado", "include_in_inflation": True},
        headers=restricted_headers,
    )
    assert blocked.status_code == 403
    # Renomear (sem mexer na cesta) continua liberado.
    renamed = client.put(f"/dropdown-options/{item['id']}", json={"name": "Feira"}, headers=restricted_headers)
    assert renamed.status_code == 200
    assert renamed.json()["include_in_inflation"] is False
