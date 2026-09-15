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
        json={"vehicle_id": 999, "description": "Troca de óleo", "value": 100.0, "mileage": 1000},
    )
    assert response.status_code == 404


def test_create_service_requires_mileage(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)
    response = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de óleo", "value": 100.0},
    )
    assert response.status_code == 422


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
            json={"vehicle_id": v1["id"], "description": f"Serviço {i}", "value": 10.0 + i, "mileage": 1000 + i},
        )
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de óleo", "value": 34.9, "mileage": 500},
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


def test_list_services_busca_matches_description_or_notes(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={
            "vehicle_id": vehicle["id"],
            "description": "Troca de óleo",
            "notes": "Mobil 20w50",
            "value": 35.9,
            "mileage": 1000,
        },
    )
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={
            "vehicle_id": vehicle["id"],
            "description": "Pneu novo",
            "notes": "Pirelli",
            "value": 400.0,
            "mileage": 2000,
        },
    )

    por_descricao = client.get("/servicos-veiculos", headers=auth_headers, params={"busca": "óleo"}).json()
    assert por_descricao["total"] == 1
    assert por_descricao["items"][0]["description"] == "Troca de óleo"

    por_observacao = client.get("/servicos-veiculos", headers=auth_headers, params={"busca": "pirelli"}).json()
    assert por_observacao["total"] == 1
    assert por_observacao["items"][0]["description"] == "Pneu novo"

    sem_match = client.get("/servicos-veiculos", headers=auth_headers, params={"busca": "inexistente"}).json()
    assert sem_match["total"] == 0


def test_update_service(client, auth_headers):
    v1 = _create_vehicle(client, auth_headers, "Voyage", 2011)
    v2 = _create_vehicle(client, auth_headers, "Biz", 2010)
    created = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v1["id"], "description": "Troca de óleo", "value": 35.9, "mileage": 1000},
    ).json()

    response = client.put(
        f"/servicos-veiculos/{created['id']}",
        headers=auth_headers,
        json={
            "vehicle_id": v2["id"],
            "description": "Troca de óleo e filtro",
            "value": 60.0,
            "service_type": "peca",
            "mileage": 1500,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["vehicle_id"] == v2["id"]
    assert body["description"] == "Troca de óleo e filtro"
    assert body["value"] == 60.0
    assert body["service_type"] == "peca"
    assert body["mileage"] == 1500


def test_delete_service(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)
    created = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de óleo", "value": 35.9, "mileage": 1000},
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
        json={"vehicle_id": v1["id"], "description": "Troca de óleo", "value": 100.0, "mileage": 1000},
    )
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v1["id"], "description": "Pneu", "value": 200.0, "mileage": 2000},
    )
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de óleo", "value": 34.9, "mileage": 500},
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


def test_resumo_veiculos_ano_mes_filter_only_affects_totals_not_chart(client, auth_headers, db_session, user):
    from datetime import date

    from app import models

    vehicle = _create_vehicle(client, auth_headers)
    db_session.add_all(
        [
            models.VehicleService(
                user_id=user.id,
                vehicle_id=vehicle["id"],
                description="Troca de óleo",
                value=100.0,
                mileage=1000,
                date=date(2025, 3, 10),
            ),
            models.VehicleService(
                user_id=user.id,
                vehicle_id=vehicle["id"],
                description="Pneu novo",
                value=400.0,
                mileage=2000,
                date=date(2025, 8, 20),
            ),
        ]
    )
    db_session.commit()

    sem_filtro = client.get("/veiculos/resumo", headers=auth_headers).json()
    item = sem_filtro["veiculos"][0]
    assert item["total_gasto"] == 500.0
    assert item["quantidade_servicos"] == 2

    so_marco = client.get("/veiculos/resumo", headers=auth_headers, params={"ano": 2025, "mes": 3}).json()
    item_marco = so_marco["veiculos"][0]
    assert item_marco["total_gasto"] == 100.0
    assert item_marco["quantidade_servicos"] == 1
    assert item_marco["ultimo_servico"] == "2025-03-10"

    so_ano = client.get("/veiculos/resumo", headers=auth_headers, params={"ano": 2025}).json()
    assert so_ano["veiculos"][0]["total_gasto"] == 500.0

    nenhum_servico_no_filtro = client.get(
        "/veiculos/resumo", headers=auth_headers, params={"ano": 2025, "mes": 12}
    ).json()
    assert nenhum_servico_no_filtro["veiculos"][0]["total_gasto"] == 0.0
    assert nenhum_servico_no_filtro["veiculos"][0]["quantidade_servicos"] == 0
    assert nenhum_servico_no_filtro["veiculos"][0]["ultimo_servico"] is None


def test_create_service_rejects_mileage_lower_than_last_service(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de pneu", "value": 400.0, "mileage": 140000},
    )

    response = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de parabrisa", "value": 300.0, "mileage": 139000},
    )
    assert response.status_code == 400
    assert "140000" in response.json()["detail"]


def test_create_service_allows_same_or_higher_mileage(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de óleo", "value": 100.0, "mileage": 50000},
    )

    igual = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Filtro de ar", "value": 40.0, "mileage": 50000},
    )
    assert igual.status_code == 201

    maior = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Pastilha de freio", "value": 150.0, "mileage": 55000},
    )
    assert maior.status_code == 201


def test_mileage_validation_is_per_vehicle(client, auth_headers):
    v1 = _create_vehicle(client, auth_headers, "Voyage", 2011)
    v2 = _create_vehicle(client, auth_headers, "Biz", 2010)
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v1["id"], "description": "Troca de pneu", "value": 400.0, "mileage": 140000},
    )

    response = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de óleo", "value": 100.0, "mileage": 500},
    )
    assert response.status_code == 201


def test_update_service_rejects_mileage_outside_neighbors(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers)
    primeiro = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de óleo", "value": 100.0, "mileage": 1000},
    ).json()
    meio = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Filtro de ar", "value": 50.0, "mileage": 2000},
    ).json()
    ultimo = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Pastilha de freio", "value": 150.0, "mileage": 3000},
    ).json()

    abaixo_do_anterior = client.put(
        f"/servicos-veiculos/{meio['id']}",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Filtro de ar", "value": 50.0, "mileage": 500},
    )
    assert abaixo_do_anterior.status_code == 400
    assert "1000" in abaixo_do_anterior.json()["detail"]

    acima_do_proximo = client.put(
        f"/servicos-veiculos/{meio['id']}",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Filtro de ar", "value": 50.0, "mileage": 3500},
    )
    assert acima_do_proximo.status_code == 400
    assert "3000" in acima_do_proximo.json()["detail"]

    entre_vizinhos = client.put(
        f"/servicos-veiculos/{meio['id']}",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Filtro de ar", "value": 50.0, "mileage": 2500},
    )
    assert entre_vizinhos.status_code == 200
    assert entre_vizinhos.json()["mileage"] == 2500

    # sanity check -- garante que primeiro/ultimo continuam intocados nesse meio tempo
    assert primeiro["mileage"] == 1000
    assert ultimo["mileage"] == 3000


def test_update_service_changing_vehicle_validates_against_new_vehicle(client, auth_headers):
    v1 = _create_vehicle(client, auth_headers, "Voyage", 2011)
    v2 = _create_vehicle(client, auth_headers, "Biz", 2010)
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de óleo", "value": 100.0, "mileage": 90000},
    )
    servico_v1 = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": v1["id"], "description": "Troca de pneu", "value": 400.0, "mileage": 140000},
    ).json()

    response = client.put(
        f"/servicos-veiculos/{servico_v1['id']}",
        headers=auth_headers,
        json={"vehicle_id": v2["id"], "description": "Troca de pneu", "value": 400.0, "mileage": 1000},
    )
    assert response.status_code == 400
    assert "90000" in response.json()["detail"]
