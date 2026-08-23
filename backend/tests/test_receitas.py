from datetime import date


def test_create_receita_calculates_cash_value(client, auth_headers):
    response = client.post(
        "/receitas",
        headers=auth_headers,
        json={"value": 1000.0, "cash_percentage": 30, "description": "Salário"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["value"] == 1000.0
    assert body["cash_percentage"] == 30
    assert body["cash_value"] == 300.0
    assert body["date"] == date.today().isoformat()


def test_create_receita_requires_auth(client):
    response = client.post("/receitas", json={"value": 1000.0, "cash_percentage": 30})
    assert response.status_code == 401


def test_receita_rejects_negative_value(client, auth_headers):
    response = client.post(
        "/receitas", headers=auth_headers, json={"value": -10.0, "cash_percentage": 30}
    )
    assert response.status_code == 422


def test_receita_rejects_percentage_out_of_range(client, auth_headers):
    response = client.post(
        "/receitas", headers=auth_headers, json={"value": 100.0, "cash_percentage": 150}
    )
    assert response.status_code == 422


def test_list_receitas_orders_by_date_desc(client, auth_headers):
    client.post("/receitas", headers=auth_headers, json={"value": 100.0, "cash_percentage": 10})
    client.post("/receitas", headers=auth_headers, json={"value": 200.0, "cash_percentage": 20})

    response = client.get("/receitas", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    rows = body["items"]
    assert len(rows) == 2
    assert rows[0]["value"] == 200.0
    assert rows[1]["value"] == 100.0


def test_list_receitas_filters_by_ano_e_mes(client, auth_headers):
    client.post("/receitas", headers=auth_headers, json={"value": 100.0, "cash_percentage": 10})

    today = date.today()
    matching = client.get("/receitas", headers=auth_headers, params={"ano": today.year, "mes": today.month}).json()
    assert len(matching["items"]) == 1
    assert matching["total"] == 1

    other_month = today.month - 1 if today.month > 1 else 12
    other_year = today.year if today.month > 1 else today.year - 1
    not_matching = client.get("/receitas", headers=auth_headers, params={"ano": other_year, "mes": other_month}).json()
    assert not_matching["items"] == []
    assert not_matching["total"] == 0


def test_list_receitas_e_paginado(client, auth_headers):
    for i in range(30):
        client.post("/receitas", headers=auth_headers, json={"value": 100.0 + i, "cash_percentage": 10})

    primeira_pagina = client.get("/receitas", headers=auth_headers, params={"limit": 25, "offset": 0}).json()
    assert primeira_pagina["total"] == 30
    assert len(primeira_pagina["items"]) == 25

    segunda_pagina = client.get("/receitas", headers=auth_headers, params={"limit": 25, "offset": 25}).json()
    assert segunda_pagina["total"] == 30
    assert len(segunda_pagina["items"]) == 5

    ids_primeira = {row["id"] for row in primeira_pagina["items"]}
    ids_segunda = {row["id"] for row in segunda_pagina["items"]}
    assert ids_primeira.isdisjoint(ids_segunda)


def test_update_receita_recomputes_cash_value(client, auth_headers):
    created = client.post(
        "/receitas", headers=auth_headers, json={"value": 1000.0, "cash_percentage": 30}
    ).json()

    response = client.put(
        f"/receitas/{created['id']}",
        headers=auth_headers,
        json={"value": 2000.0, "cash_percentage": 50, "description": "Ajustado"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["value"] == 2000.0
    assert body["cash_percentage"] == 50
    assert body["cash_value"] == 1000.0
    assert body["description"] == "Ajustado"


def test_update_receita_not_owned_returns_404(client, auth_headers, db_session):
    from app import models
    from app.security import hash_password

    other = models.User(username="outro3", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    login = client.post("/auth/login", data={"username": "outro3", "password": "senha123"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    created = client.post("/receitas", headers=other_headers, json={"value": 100.0, "cash_percentage": 10}).json()

    response = client.put(
        f"/receitas/{created['id']}",
        headers=auth_headers,
        json={"value": 999.0, "cash_percentage": 0},
    )
    assert response.status_code == 404


def test_delete_receita(client, auth_headers):
    created = client.post("/receitas", headers=auth_headers, json={"value": 100.0, "cash_percentage": 10}).json()

    response = client.delete(f"/receitas/{created['id']}", headers=auth_headers)
    assert response.status_code == 204

    listed = client.get("/receitas", headers=auth_headers).json()
    assert listed["items"] == []
    assert listed["total"] == 0


def test_delete_receita_not_owned_returns_404(client, auth_headers, db_session):
    from app import models
    from app.security import hash_password

    other = models.User(username="outro4", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    login = client.post("/auth/login", data={"username": "outro4", "password": "senha123"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    created = client.post("/receitas", headers=other_headers, json={"value": 100.0, "cash_percentage": 10}).json()

    response = client.delete(f"/receitas/{created['id']}", headers=auth_headers)
    assert response.status_code == 404
