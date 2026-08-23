def _create_vehicle(client, headers, name="Voyage", year=2011):
    response = client.post("/veiculos", headers=headers, json={"name": name, "year": year})
    return response.json()


def test_create_and_list_vehicles(client, auth_headers):
    _create_vehicle(client, auth_headers, "Voyage", 2011)
    _create_vehicle(client, auth_headers, "Biz", 2010)

    response = client.get("/veiculos", headers=auth_headers)
    assert response.status_code == 200
    names = sorted(v["name"] for v in response.json())
    assert names == ["Biz", "Voyage"]


def test_update_vehicle(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)

    response = client.put(
        f"/veiculos/{vehicle['id']}", headers=auth_headers, json={"name": "Voyage Confortline", "year": 2012}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Voyage Confortline"
    assert body["year"] == 2012


def test_delete_vehicle_is_soft_delete(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)

    response = client.delete(f"/veiculos/{vehicle['id']}", headers=auth_headers)
    assert response.status_code == 204

    listed = client.get("/veiculos", headers=auth_headers).json()
    assert listed == []


def test_delete_vehicle_not_owned_returns_404(client, auth_headers, db_session):
    from app import models
    from app.security import hash_password

    other = models.User(username="outro_veiculo", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    login = client.post("/auth/login", data={"username": "outro_veiculo", "password": "senha123"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    vehicle = _create_vehicle(client, other_headers)

    response = client.delete(f"/veiculos/{vehicle['id']}", headers=auth_headers)
    assert response.status_code == 404


def test_create_service_requires_owned_vehicle(client, auth_headers):
    response = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": 999, "description": "Troca de óleo", "value": 100.0},
    )
    assert response.status_code == 404


def test_create_and_list_services(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)

    response = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={
            "vehicle_id": vehicle["id"],
            "description": "Troca de óleo",
            "notes": "Mobil 20w50",
            "value": 35.9,
            "service_type": "peca_mao_de_obra",
            "mileage": 18473,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["vehicle_name"] == vehicle["name"]
    assert body["service_type"] == "peca_mao_de_obra"
    assert body["mileage"] == 18473

    listed = client.get("/servicos-veiculos", headers=auth_headers).json()
    assert listed["total"] == 1
    assert listed["items"][0]["description"] == "Troca de óleo"


def test_list_services_filters_by_vehicle_and_is_paginated(client, auth_headers):
    v1 = _create_vehicle(client, auth_headers, "Voyage", 2011)
    v2 = _create_vehicle(client, auth_headers, "Biz", 2010)

    for i in range(30):
        client.post(
            "/servicos-veiculos",
            headers=auth_headers,
            json={"vehicle_id": v1["id"], "description": f"Serviço {i}", "value": 10.0 + i},
        )
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de óleo", "value": 34.9},
    )

    only_v2 = client.get("/servicos-veiculos", headers=auth_headers, params={"vehicle_id": v2["id"]}).json()
    assert only_v2["total"] == 1

    primeira_pagina = client.get(
        "/servicos-veiculos", headers=auth_headers, params={"vehicle_id": v1["id"], "limit": 25, "offset": 0}
    ).json()
    assert primeira_pagina["total"] == 30
    assert len(primeira_pagina["items"]) == 25

    segunda_pagina = client.get(
        "/servicos-veiculos", headers=auth_headers, params={"vehicle_id": v1["id"], "limit": 25, "offset": 25}
    ).json()
    assert len(segunda_pagina["items"]) == 5


def test_update_service(client, auth_headers):
    v1 = _create_vehicle(client, auth_headers, "Voyage", 2011)
    v2 = _create_vehicle(client, auth_headers, "Biz", 2010)
    created = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v1["id"], "description": "Troca de óleo", "value": 35.9},
    ).json()

    response = client.put(
        f"/servicos-veiculos/{created['id']}",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de óleo e filtro", "value": 60.0, "service_type": "peca"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["vehicle_id"] == v2["id"]
    assert body["description"] == "Troca de óleo e filtro"
    assert body["value"] == 60.0
    assert body["service_type"] == "peca"


def test_delete_service(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)
    created = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de óleo", "value": 35.9},
    ).json()

    response = client.delete(f"/servicos-veiculos/{created['id']}", headers=auth_headers)
    assert response.status_code == 204

    listed = client.get("/servicos-veiculos", headers=auth_headers).json()
    assert listed["total"] == 0


def test_resumo_veiculos(client, auth_headers):
    v1 = _create_vehicle(client, auth_headers, "Voyage", 2011)
    v2 = _create_vehicle(client, auth_headers, "Biz", 2010)

    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v1["id"], "description": "Troca de óleo", "value": 100.0},
    )
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v1["id"], "description": "Pneu", "value": 200.0},
    )
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de óleo", "value": 34.9},
    )

    response = client.get("/veiculos/resumo", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["veiculos"]) == 2
    assert len(body["meses"]) == 12
    assert len(body["series"]) == 2

    by_name = {v["vehicle_name"]: v for v in body["veiculos"]}
    assert by_name["Voyage"]["total_gasto"] == 300.0
    assert by_name["Voyage"]["quantidade_servicos"] == 2
    assert by_name["Biz"]["total_gasto"] == 34.9
    assert by_name["Biz"]["quantidade_servicos"] == 1
