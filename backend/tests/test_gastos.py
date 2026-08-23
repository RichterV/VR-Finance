from datetime import date

from app.utils import add_months


def _create_item(client, headers, priority="essencial", name="Casa"):
    response = client.post("/dropdown-options", headers=headers, json={"priority": priority, "name": name})
    return response.json()


def test_create_simple_gasto(client, auth_headers):
    item = _create_item(client, auth_headers)

    response = client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": item["id"], "value": 150.0, "description": "Aluguel"},
    )
    assert response.status_code == 201
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["value"] == 150.0
    assert rows[0]["is_installment"] is False
    assert rows[0]["date"] == date.today().isoformat()


def test_create_installment_gasto_creates_n_rows_with_incrementing_dates(client, auth_headers):
    item = _create_item(client, auth_headers, priority="nao_essencial", name="Notebook")

    response = client.post(
        "/gastos",
        headers=auth_headers,
        json={
            "priority": "nao_essencial",
            "item_id": item["id"],
            "value": 200.0,
            "is_installment": True,
            "installment_count": 3,
        },
    )
    assert response.status_code == 201
    rows = response.json()
    assert len(rows) == 3

    group_ids = {row["installment_group_id"] for row in rows}
    assert len(group_ids) == 1

    today = date.today()
    expected_dates = [add_months(today, i).isoformat() for i in range(3)]
    assert [row["date"] for row in rows] == expected_dates
    assert [row["installment_number"] for row in rows] == [1, 2, 3]
    assert all(row["value"] == 200.0 for row in rows)


def test_installment_without_count_is_rejected(client, auth_headers):
    item = _create_item(client, auth_headers)

    response = client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": item["id"], "value": 100.0, "is_installment": True},
    )
    assert response.status_code == 400


def test_gasto_with_unknown_item_returns_404(client, auth_headers):
    response = client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": 9999, "value": 100.0},
    )
    assert response.status_code == 404


def test_gasto_with_mismatched_priority_returns_400(client, auth_headers):
    item = _create_item(client, auth_headers, priority="essencial", name="Casa")

    response = client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "nao_essencial", "item_id": item["id"], "value": 100.0},
    )
    assert response.status_code == 400


def test_gasto_with_inactive_item_returns_404(client, auth_headers):
    item = _create_item(client, auth_headers)
    client.delete(f"/dropdown-options/{item['id']}", headers=auth_headers)

    response = client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": item["id"], "value": 100.0},
    )
    assert response.status_code == 404


def test_list_gastos_orders_by_date_desc(client, auth_headers):
    item = _create_item(client, auth_headers)
    client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": item["id"], "value": 200.0, "is_installment": True, "installment_count": 3},
    )

    response = client.get("/gastos", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    rows = body["items"]
    assert len(rows) == 3
    dates = [row["date"] for row in rows]
    assert dates == sorted(dates, reverse=True)


def test_list_gastos_filters_by_ano_e_mes(client, auth_headers):
    item = _create_item(client, auth_headers)
    client.post("/gastos", headers=auth_headers, json={"priority": "essencial", "item_id": item["id"], "value": 100.0})

    today = date.today()
    matching = client.get("/gastos", headers=auth_headers, params={"ano": today.year, "mes": today.month}).json()
    assert len(matching["items"]) == 1
    assert matching["total"] == 1

    other_month = today.month - 1 if today.month > 1 else 12
    other_year = today.year if today.month > 1 else today.year - 1
    not_matching = client.get("/gastos", headers=auth_headers, params={"ano": other_year, "mes": other_month}).json()
    assert not_matching["items"] == []
    assert not_matching["total"] == 0


def test_list_gastos_e_paginado(client, auth_headers):
    item = _create_item(client, auth_headers)
    client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": item["id"], "value": 10.0, "is_installment": True, "installment_count": 30},
    )

    primeira_pagina = client.get("/gastos", headers=auth_headers, params={"limit": 25, "offset": 0}).json()
    assert primeira_pagina["total"] == 30
    assert len(primeira_pagina["items"]) == 25

    segunda_pagina = client.get("/gastos", headers=auth_headers, params={"limit": 25, "offset": 25}).json()
    assert segunda_pagina["total"] == 30
    assert len(segunda_pagina["items"]) == 5

    ids_primeira = {row["id"] for row in primeira_pagina["items"]}
    ids_segunda = {row["id"] for row in segunda_pagina["items"]}
    assert ids_primeira.isdisjoint(ids_segunda)


def test_update_gasto(client, auth_headers):
    item = _create_item(client, auth_headers, priority="essencial", name="Casa")
    other_item = _create_item(client, auth_headers, priority="nao_essencial", name="Lanche")
    created = client.post(
        "/gastos", headers=auth_headers, json={"priority": "essencial", "item_id": item["id"], "value": 100.0}
    ).json()[0]

    response = client.put(
        f"/gastos/{created['id']}",
        headers=auth_headers,
        json={"priority": "nao_essencial", "item_id": other_item["id"], "value": 250.0, "description": "Corrigido"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["priority"] == "nao_essencial"
    assert body["item_id"] == other_item["id"]
    assert body["value"] == 250.0
    assert body["description"] == "Corrigido"


def test_update_gasto_rejects_mismatched_priority(client, auth_headers):
    item = _create_item(client, auth_headers, priority="essencial", name="Casa")
    other_item = _create_item(client, auth_headers, priority="nao_essencial", name="Lanche")
    created = client.post(
        "/gastos", headers=auth_headers, json={"priority": "essencial", "item_id": item["id"], "value": 100.0}
    ).json()[0]

    response = client.put(
        f"/gastos/{created['id']}",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": other_item["id"], "value": 100.0},
    )
    assert response.status_code == 400


def test_update_gasto_not_owned_returns_404(client, auth_headers, db_session):
    from app import models
    from app.security import hash_password

    other = models.User(username="outro", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    login = client.post("/auth/login", data={"username": "outro", "password": "senha123"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    item = _create_item(client, other_headers, priority="essencial", name="Casa")
    created = client.post(
        "/gastos", headers=other_headers, json={"priority": "essencial", "item_id": item["id"], "value": 100.0}
    ).json()[0]

    response = client.put(
        f"/gastos/{created['id']}",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": item["id"], "value": 999.0},
    )
    assert response.status_code == 404


def test_delete_gasto(client, auth_headers):
    item = _create_item(client, auth_headers)
    created = client.post(
        "/gastos", headers=auth_headers, json={"priority": "essencial", "item_id": item["id"], "value": 100.0}
    ).json()[0]

    response = client.delete(f"/gastos/{created['id']}", headers=auth_headers)
    assert response.status_code == 204

    listed = client.get("/gastos", headers=auth_headers).json()
    assert listed["items"] == []
    assert listed["total"] == 0


def test_delete_gasto_not_owned_returns_404(client, auth_headers, db_session):
    from app import models
    from app.security import hash_password

    other = models.User(username="outro2", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    login = client.post("/auth/login", data={"username": "outro2", "password": "senha123"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    item = _create_item(client, other_headers, priority="essencial", name="Casa")
    created = client.post(
        "/gastos", headers=other_headers, json={"priority": "essencial", "item_id": item["id"], "value": 100.0}
    ).json()[0]

    response = client.delete(f"/gastos/{created['id']}", headers=auth_headers)
    assert response.status_code == 404
