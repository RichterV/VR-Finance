from app import models
from tests.conftest import _login_headers


def _create_via_master(client, master_headers, username="novo", password="senha123"):
    response = client.post(
        "/auth/users",
        json={
            "username": username,
            "password": password,
            "first_name": "Novo",
            "last_name": "Usuário",
            "modules": ["veiculos"],
        },
        headers=master_headers,
    )
    assert response.status_code == 201
    return response.json()


def test_user_created_by_master_must_change_password(client, master_headers):
    created = _create_via_master(client, master_headers)
    assert created["must_change_password"] is True

    headers = _login_headers(client, "novo", "senha123")
    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["must_change_password"] is True


def test_pending_password_change_blocks_other_endpoints(client, master_headers):
    _create_via_master(client, master_headers)
    headers = _login_headers(client, "novo", "senha123")
    for path in ["/gastos", "/receitas", "/resumo/mensal?ano=2026&mes=9", "/veiculos"]:
        assert client.get(path, headers=headers).status_code == 403, path
    profile = client.put(
        "/auth/me", json={"username": "outro", "first_name": "A", "last_name": "B"}, headers=headers
    )
    assert profile.status_code == 403


def test_changing_password_clears_the_flag(client, master_headers):
    _create_via_master(client, master_headers)
    headers = _login_headers(client, "novo", "senha123")
    response = client.put(
        "/auth/me/password",
        json={"current_password": "senha123", "new_password": "minha-senha"},
        headers=headers,
    )
    assert response.status_code == 200

    assert client.get("/auth/me", headers=headers).json()["must_change_password"] is False
    assert client.get("/gastos", headers=headers).status_code == 200
    assert client.post("/auth/login", data={"username": "novo", "password": "minha-senha"}).status_code == 200


def test_new_password_must_differ_from_current(client, master_headers):
    _create_via_master(client, master_headers)
    headers = _login_headers(client, "novo", "senha123")
    response = client.put(
        "/auth/me/password",
        json={"current_password": "senha123", "new_password": "senha123"},
        headers=headers,
    )
    assert response.status_code == 400
    assert client.get("/auth/me", headers=headers).json()["must_change_password"] is True


def test_master_password_reset_requires_change_again(client, master_headers, user, db_session):
    response = client.put(
        f"/auth/users/{user.id}",
        json={"username": user.username, "first_name": "A", "last_name": "B", "password": "resetada1"},
        headers=master_headers,
    )
    assert response.json()["must_change_password"] is True

    headers = _login_headers(client, user.username, "resetada1")
    assert client.get("/gastos", headers=headers).status_code == 403


def test_master_edit_without_password_keeps_flag_untouched(client, master_headers, user):
    response = client.put(
        f"/auth/users/{user.id}",
        json={"username": user.username, "first_name": "Outro", "last_name": "Nome"},
        headers=master_headers,
    )
    assert response.json()["must_change_password"] is False


def test_master_resetting_own_password_is_not_forced(client, master_headers, master_user, master_password):
    response = client.put(
        f"/auth/users/{master_user.id}",
        json={"username": master_user.username, "first_name": "V", "last_name": "R", "password": "nova-master"},
        headers=master_headers,
    )
    assert response.json()["must_change_password"] is False


def test_existing_users_are_not_forced(client, auth_headers, db_session, user):
    assert db_session.get(models.User, user.id).must_change_password is False
    assert client.get("/gastos", headers=auth_headers).status_code == 200
