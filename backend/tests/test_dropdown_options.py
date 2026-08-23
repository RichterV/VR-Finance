def test_create_and_list_option(client, auth_headers):
    create = client.post(
        "/dropdown-options",
        headers=auth_headers,
        json={"priority": "essencial", "name": "Casa"},
    )
    assert create.status_code == 201
    body = create.json()
    assert body["name"] == "Casa"
    assert body["active"] is True

    listed = client.get("/dropdown-options", headers=auth_headers, params={"priority": "essencial"})
    assert listed.status_code == 200
    names = [item["name"] for item in listed.json()]
    assert "Casa" in names


def test_list_filters_by_priority(client, auth_headers):
    client.post("/dropdown-options", headers=auth_headers, json={"priority": "essencial", "name": "Casa"})
    client.post("/dropdown-options", headers=auth_headers, json={"priority": "nao_essencial", "name": "Lanche"})

    essenciais = client.get("/dropdown-options", headers=auth_headers, params={"priority": "essencial"}).json()
    assert [item["name"] for item in essenciais] == ["Casa"]

    nao_essenciais = client.get("/dropdown-options", headers=auth_headers, params={"priority": "nao_essencial"}).json()
    assert [item["name"] for item in nao_essenciais] == ["Lanche"]


def test_update_option_name(client, auth_headers):
    created = client.post(
        "/dropdown-options", headers=auth_headers, json={"priority": "essencial", "name": "Casa"}
    ).json()

    updated = client.put(
        f"/dropdown-options/{created['id']}", headers=auth_headers, json={"name": "Moradia"}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Moradia"


def test_soft_delete_removes_from_list_but_not_from_db(client, auth_headers):
    created = client.post(
        "/dropdown-options", headers=auth_headers, json={"priority": "essencial", "name": "Casa"}
    ).json()

    delete = client.delete(f"/dropdown-options/{created['id']}", headers=auth_headers)
    assert delete.status_code == 204

    listed = client.get("/dropdown-options", headers=auth_headers, params={"priority": "essencial"}).json()
    assert listed == []


def test_options_are_isolated_per_user(client, db_session, auth_headers):
    from app.security import hash_password
    from app import models

    other = models.User(username="outro", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()

    other_login = client.post("/auth/login", data={"username": "outro", "password": "senha123"})
    other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}

    client.post("/dropdown-options", headers=auth_headers, json={"priority": "essencial", "name": "Casa"})

    other_list = client.get("/dropdown-options", headers=other_headers, params={"priority": "essencial"}).json()
    assert other_list == []
