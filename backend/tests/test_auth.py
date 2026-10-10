from datetime import datetime, timedelta, timezone

from tests.conftest import _create_user


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
    assert body["first_name"] == user.first_name
    assert body["last_name"] == user.last_name


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


def test_default_cash_percentage_starts_at_50(client, auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.json()["default_cash_percentage"] == 50


def test_update_default_cash_percentage(client, auth_headers, master_headers):
    response = client.put(
        "/auth/me/default-cash-percentage", headers=auth_headers, json={"default_cash_percentage": 35}
    )
    assert response.status_code == 200
    assert response.json()["default_cash_percentage"] == 35
    assert client.get("/auth/me", headers=auth_headers).json()["default_cash_percentage"] == 35
    # Por usuário: o padrão de um não afeta o de outro
    assert client.get("/auth/me", headers=master_headers).json()["default_cash_percentage"] == 50


def test_update_default_cash_percentage_rejects_out_of_range(client, auth_headers):
    for value in (-1, 101):
        response = client.put(
            "/auth/me/default-cash-percentage", headers=auth_headers, json={"default_cash_percentage": value}
        )
        assert response.status_code == 422


def test_theme_defaults_to_salvia_and_is_per_user(client, auth_headers, master_headers):
    assert client.get("/auth/me", headers=auth_headers).json()["theme"] == "salvia"
    response = client.put("/auth/me/theme", headers=auth_headers, json={"theme": "nordico"})
    assert response.status_code == 200
    assert response.json()["theme"] == "nordico"
    assert client.get("/auth/me", headers=auth_headers).json()["theme"] == "nordico"
    # Por usuário: o tema de um não muda o de outro
    assert client.get("/auth/me", headers=master_headers).json()["theme"] == "salvia"


def test_update_theme_rejects_unknown_theme(client, auth_headers):
    response = client.put("/auth/me/theme", headers=auth_headers, json={"theme": "rosa-choque"})
    assert response.status_code == 422
    assert client.get("/auth/me", headers=auth_headers).json()["theme"] == "salvia"


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
        json={"username": "novo_usuario", "password": "senha123", "first_name": "Novo", "last_name": "Usuário"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "novo_usuario"
    assert body["role"] == "user"
    assert body["first_name"] == "Novo"
    assert body["last_name"] == "Usuário"


def test_create_user_requires_first_and_last_name(client, master_headers):
    response = client.post(
        "/auth/users",
        headers=master_headers,
        json={"username": "sem_nome", "password": "senha123"},
    )
    assert response.status_code == 422


def test_master_cannot_create_duplicate_username(client, master_headers, master_user):
    response = client.post(
        "/auth/users",
        headers=master_headers,
        json={"username": master_user.username, "password": "senha123", "first_name": "X", "last_name": "Y"},
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
        json={"username": "renomeado", "first_name": "Renomeado", "last_name": "Sobrenome"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "renomeado"
    assert body["first_name"] == "Renomeado"
    assert body["last_name"] == "Sobrenome"


def test_master_can_reset_user_password(client, master_headers, user):
    response = client.put(
        f"/auth/users/{user.id}",
        headers=master_headers,
        json={
            "username": user.username,
            "password": "senha-resetada",
            "first_name": user.first_name,
            "last_name": user.last_name,
        },
    )
    assert response.status_code == 200

    login = client.post("/auth/login", data={"username": user.username, "password": "senha-resetada"})
    assert login.status_code == 200


def test_update_user_rejects_duplicate_username(client, master_headers, user, master_user):
    response = client.put(
        f"/auth/users/{user.id}",
        headers=master_headers,
        json={"username": master_user.username, "first_name": user.first_name, "last_name": user.last_name},
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
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca", "value": 50.0, "mileage": 1000},
    )
    response = client.delete(f"/auth/users/{user.id}", headers=master_headers)
    assert response.status_code == 204

    assert db_session.query(models.Gasto).filter(models.Gasto.user_id == user.id).count() == 0
    assert db_session.query(models.Receita).filter(models.Receita.user_id == user.id).count() == 0
    assert db_session.query(models.DropdownOption).filter(models.DropdownOption.user_id == user.id).count() == 0
    assert db_session.query(models.Vehicle).filter(models.Vehicle.user_id == user.id).count() == 0
    assert db_session.query(models.VehicleService).filter(models.VehicleService.user_id == user.id).count() == 0


def test_last_login_at_null_before_first_login(client, db_session, master_headers):
    novo = _create_user(db_session, "sem-login", "senha-123")
    users = client.get("/auth/users", headers=master_headers).json()
    row = next(u for u in users if u["id"] == novo.id)
    assert row["last_login_at"] is None


def test_login_records_last_login_at_in_utc(client, user, user_password, master_headers):
    antes = datetime.now(timezone.utc)
    assert client.post("/auth/login", data={"username": user.username, "password": user_password}).status_code == 200

    users = client.get("/auth/users", headers=master_headers).json()
    raw = next(u for u in users if u["id"] == user.id)["last_login_at"]
    assert raw.endswith("+00:00")  # offset explícito, senão o navegador lê como horário local
    registrado = datetime.fromisoformat(raw)
    assert antes - timedelta(seconds=5) <= registrado <= datetime.now(timezone.utc) + timedelta(seconds=5)


def test_failed_login_does_not_record_last_login_at(client, user, master_headers):
    assert client.post("/auth/login", data={"username": user.username, "password": "errada"}).status_code == 401
    users = client.get("/auth/users", headers=master_headers).json()
    assert next(u for u in users if u["id"] == user.id)["last_login_at"] is None


def test_switch_to_teste_does_not_record_last_login_at(client, db_session, master_headers):
    teste = _create_user(db_session, "teste", "senha-teste")
    assert client.post("/auth/switch-to-teste", headers=master_headers).status_code == 200
    users = client.get("/auth/users", headers=master_headers).json()
    assert next(u for u in users if u["id"] == teste.id)["last_login_at"] is None


def _activity_of(client, master_headers, user_id):
    users = client.get("/auth/users", headers=master_headers).json()
    return next(u for u in users if u["id"] == user_id)["last_activity_at"]


def test_last_activity_at_null_sem_uso(client, db_session, master_headers):
    novo = _create_user(db_session, "sem-uso", "senha-123")
    assert _activity_of(client, master_headers, novo.id) is None


def test_requisicao_autenticada_registra_atividade_em_utc(client, db_session, user, auth_headers, master_headers):
    user.last_activity_at = None
    db_session.commit()
    antes = datetime.now(timezone.utc)

    assert client.get("/gastos", headers=auth_headers).status_code == 200

    raw = _activity_of(client, master_headers, user.id)
    assert raw.endswith("+00:00")
    assert antes - timedelta(seconds=5) <= datetime.fromisoformat(raw) <= datetime.now(timezone.utc) + timedelta(seconds=5)


def test_atividade_so_regrava_depois_do_intervalo(client, db_session, user, auth_headers):
    recente = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=10)
    user.last_activity_at = recente
    db_session.commit()
    client.get("/gastos", headers=auth_headers)
    db_session.refresh(user)
    assert user.last_activity_at == recente

    antiga = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
    user.last_activity_at = antiga
    db_session.commit()
    client.get("/gastos", headers=auth_headers)
    db_session.refresh(user)
    assert user.last_activity_at > antiga


def test_login_registra_atividade(client, user, user_password, master_headers):
    assert client.post("/auth/login", data={"username": user.username, "password": user_password}).status_code == 200
    assert _activity_of(client, master_headers, user.id) is not None


def test_uso_via_switch_to_teste_nao_registra_atividade(client, db_session, master_headers):
    teste = _create_user(db_session, "teste", "senha-teste")
    token = client.post("/auth/switch-to-teste", headers=master_headers).json()["access_token"]
    teste_headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/gastos", headers=teste_headers).status_code == 200
    # Editar o perfil devolve um token novo -- que continua sem contar como atividade.
    novo_token = client.put(
        "/auth/me", headers=teste_headers, json={"username": "teste", "first_name": "T", "last_name": "T"}
    ).json()["access_token"]
    assert client.get("/gastos", headers={"Authorization": f"Bearer {novo_token}"}).status_code == 200

    assert _activity_of(client, master_headers, teste.id) is None
