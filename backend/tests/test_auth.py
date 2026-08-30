def test_login_success(client, user, user_password):
    response = client.post("/auth/login", data={"username": user.username, "password": user_password})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_wrong_password(client, user):
    response = client.post("/auth/login", data={"username": user.username, "password": "errada"})
    assert response.status_code == 401


def test_login_unknown_user(client):
    response = client.post("/auth/login", data={"username": "ninguem", "password": "x"})
    assert response.status_code == 401


def test_me_requires_token(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_current_user(client, user, auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == user.username
    assert body["role"] == "user"


def test_change_password_success(client, user, user_password, auth_headers):
    response = client.put(
        "/auth/me/password",
        headers=auth_headers,
        json={"current_password": user_password, "new_password": "nova-senha-123"},
    )
    assert response.status_code == 200

    login = client.post("/auth/login", data={"username": user.username, "password": "nova-senha-123"})
    assert login.status_code == 200


def test_change_password_wrong_current(client, auth_headers):
    response = client.put(
        "/auth/me/password",
        headers=auth_headers,
        json={"current_password": "errada", "new_password": "nova-senha-123"},
    )
    assert response.status_code == 400


def test_create_user_requires_master(client, auth_headers):
    response = client.post(
        "/auth/users",
        headers=auth_headers,
        json={"username": "novo", "password": "senha123"},
    )
    assert response.status_code == 403


def test_master_can_create_user(client, master_headers):
    response = client.post(
        "/auth/users",
        headers=master_headers,
        json={"username": "novo_usuario", "password": "senha123"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "novo_usuario"
    assert body["role"] == "user"


def test_master_cannot_create_duplicate_username(client, master_headers, master_user):
    response = client.post(
        "/auth/users",
        headers=master_headers,
        json={"username": master_user.username, "password": "senha123"},
    )
    assert response.status_code == 400


def test_list_users_requires_master(client, auth_headers):
    response = client.get("/auth/users", headers=auth_headers)
    assert response.status_code == 403


def test_master_can_list_users(client, master_headers, user, master_user):
    response = client.get("/auth/users", headers=master_headers)
    assert response.status_code == 200
    usernames = {u["username"] for u in response.json()}
    assert usernames == {user.username, master_user.username}


def test_update_user_requires_master(client, auth_headers, user):
    response = client.put(
        f"/auth/users/{user.id}",
        headers=auth_headers,
        json={"username": "novo_nome"},
    )
    assert response.status_code == 403


def test_master_can_update_user_username(client, master_headers, user):
    response = client.put(
        f"/auth/users/{user.id}",
        headers=master_headers,
        json={"username": "renomeado"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "renomeado"


def test_master_can_reset_user_password(client, master_headers, user):
    response = client.put(
        f"/auth/users/{user.id}",
        headers=master_headers,
        json={"username": user.username, "password": "senha-resetada"},
    )
    assert response.status_code == 200

    login = client.post("/auth/login", data={"username": user.username, "password": "senha-resetada"})
    assert login.status_code == 200


def test_update_user_rejects_duplicate_username(client, master_headers, user, master_user):
    response = client.put(
        f"/auth/users/{user.id}",
        headers=master_headers,
        json={"username": master_user.username},
    )
    assert response.status_code == 400


def test_delete_user_requires_master(client, auth_headers, user):
    response = client.delete(f"/auth/users/{user.id}", headers=auth_headers)
    assert response.status_code == 403


def test_master_can_delete_user(client, master_headers, user):
    response = client.delete(f"/auth/users/{user.id}", headers=master_headers)
    assert response.status_code == 204

    login = client.post("/auth/login", data={"username": user.username, "password": "qualquer"})
    assert login.status_code == 401


def test_master_cannot_delete_itself(client, master_headers, master_user):
    response = client.delete(f"/auth/users/{master_user.id}", headers=master_headers)
    assert response.status_code == 400


def test_delete_user_removes_dependent_data(client, master_headers, auth_headers, user, db_session):
    from app import models

    item = client.post(
        "/dropdown-options", headers=auth_headers, json={"priority": "essencial", "name": "Casa"}
    ).json()
    client.post(
        "/gastos", headers=auth_headers, json={"priority": "essencial", "item_id": item["id"], "value": 100.0}
    )
    client.post("/receitas", headers=auth_headers, json={"value": 500.0, "cash_percentage": 10})
    vehicle = client.post("/veiculos", headers=auth_headers, json={"name": "Carro", "year": 2020}).json()
    client.post(
        "/servicos-veiculos", headers=auth_headers, json={"vehicle_id": vehicle["id"], "description": "Troca", "value": 50.0}
    )
    response = client.delete(f"/auth/users/{user.id}", headers=master_headers)
    assert response.status_code == 204

    assert db_session.query(models.Gasto).filter(models.Gasto.user_id == user.id).count() == 0
    assert db_session.query(models.Receita).filter(models.Receita.user_id == user.id).count() == 0
    assert db_session.query(models.DropdownOption).filter(models.DropdownOption.user_id == user.id).count() == 0
    assert db_session.query(models.Vehicle).filter(models.Vehicle.user_id == user.id).count() == 0
    assert db_session.query(models.VehicleService).filter(models.VehicleService.user_id == user.id).count() == 0
