from datetime import date


def _create_item(client, headers, priority="essencial", name="Casa"):
    return client.post("/dropdown-options", headers=headers, json={"priority": priority, "name": name}).json()


def _seed_mes_atual(client, headers):
    essencial = _create_item(client, headers, "essencial", "Casa")
    nao_essencial = _create_item(client, headers, "nao_essencial", "Lanche")

    client.post(
        "/gastos",
        headers=headers,
        json={"priority": "essencial", "item_id": essencial["id"], "value": 500.0},
    )
    client.post(
        "/gastos",
        headers=headers,
        json={"priority": "nao_essencial", "item_id": nao_essencial["id"], "value": 200.0},
    )
    client.post(
        "/receitas",
        headers=headers,
        json={"value": 1000.0, "cash_percentage": 20},
    )


def test_resumo_mensal_disponivel_para_gastar(client, auth_headers):
    _seed_mes_atual(client, auth_headers)
    today = date.today()

    response = client.get(
        "/resumo/mensal", headers=auth_headers, params={"ano": today.year, "mes": today.month}
    )
    assert response.status_code == 200
    body = response.json()

    assert body["total_gastos"] == 700.0
    assert body["total_essenciais"] == 500.0
    assert body["total_nao_essenciais"] == 200.0
    assert body["quantidade_gastos"] == 2
    assert body["quantidade_receitas"] == 1
    assert body["total_caixa_pretendido"] == 200.0
    assert body["total_caixa_real"] == 300.0
    assert body["media_gastos_lancamento"] == 350.0
    assert body["media_receitas_lancamento"] == 1000.0
    assert body["disponivel_para_gastar"] == 100.0


def test_resumo_mensal_sem_lancamentos_nao_divide_por_zero(client, auth_headers):
    today = date.today()
    response = client.get(
        "/resumo/mensal", headers=auth_headers, params={"ano": today.year, "mes": today.month}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["quantidade_gastos"] == 0
    assert body["media_gastos_lancamento"] == 0
    assert body["disponivel_para_gastar"] == 0


def test_resumo_anual_agrega_totais_do_mes_atual(client, auth_headers):
    _seed_mes_atual(client, auth_headers)
    today = date.today()

    response = client.get("/resumo/anual", headers=auth_headers, params={"ano": today.year})
    assert response.status_code == 200
    body = response.json()

    assert body["total_gastos"] == 700.0
    assert body["quantidade_gastos"] == 2
    assert body["media_gastos_mensal"] == 700.0
    assert len(body["evolucao_12_meses"]) == 12


def test_resumo_anual_aceita_janela_configuravel_de_meses(client, auth_headers):
    today = date.today()

    response = client.get("/resumo/anual", headers=auth_headers, params={"ano": today.year, "meses": 24})
    assert response.status_code == 200
    body = response.json()

    assert len(body["evolucao_12_meses"]) == 24
    assert len(body["caixa_pretendido_vs_real"]) == 24


def test_resumo_anual_janela_rolante_usa_corte_como_referencia(client, auth_headers):
    response = client.get(
        "/resumo/anual",
        headers=auth_headers,
        params={"ano": 2025, "meses": 12, "ate_ano": 2025, "ate_mes": 6},
    )
    assert response.status_code == 200
    body = response.json()

    ultimo_evolucao = body["evolucao_12_meses"][-1]
    assert (ultimo_evolucao["ano"], ultimo_evolucao["mes"]) == (2025, 6)

    ultimo_combo = body["caixa_pretendido_vs_real"][-1]
    assert (ultimo_combo["ano"], ultimo_combo["mes"]) == (2025, 6)


def test_resumo_requires_auth(client):
    response = client.get("/resumo/anual", params={"ano": 2026})
    assert response.status_code == 401


def test_resumo_anual_respeita_corte_ate_mes(client, auth_headers, db_session, user):
    from app import models

    item = _create_item(client, auth_headers, "essencial", "Casa")
    db_session.add_all(
        [
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=100.0, is_installment=False, date=date(2025, 1, 10)),
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=999.0, is_installment=False, date=date(2025, 6, 10)),
        ]
    )
    db_session.commit()

    response = client.get(
        "/resumo/anual", headers=auth_headers, params={"ano": 2025, "ate_ano": 2025, "ate_mes": 3}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_essenciais"] == 100.0


def test_resumo_anual_corte_de_ano_anterior_zera_ano_futuro(client, auth_headers, db_session, user):
    from app import models

    item = _create_item(client, auth_headers, "essencial", "Casa")
    db_session.add(
        models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=500.0, is_installment=False, date=date(2026, 1, 5))
    )
    db_session.commit()

    response = client.get(
        "/resumo/anual", headers=auth_headers, params={"ano": 2026, "ate_ano": 2025, "ate_mes": 12}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_essenciais"] == 0


def test_resumo_geral_agrupa_por_ano_e_calcula_totais(client, auth_headers, db_session, user):
    from app import models

    item = _create_item(client, auth_headers, "essencial", "Casa")
    outro_item = _create_item(client, auth_headers, "nao_essencial", "Lazer")

    db_session.add_all(
        [
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=100.0, is_installment=False, date=date(2024, 3, 10)),
            models.Gasto(user_id=user.id, priority="nao_essencial", item_id=outro_item["id"], value=50.0, is_installment=False, date=date(2024, 6, 5)),
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=200.0, is_installment=False, date=date(2025, 1, 15)),
        ]
    )
    db_session.add_all(
        [
            models.Receita(user_id=user.id, value=1000.0, cash_percentage=10, cash_value=100.0, date=date(2024, 3, 20)),
            models.Receita(user_id=user.id, value=2000.0, cash_percentage=20, cash_value=400.0, date=date(2025, 1, 20)),
        ]
    )
    db_session.commit()

    response = client.get("/resumo/geral", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()

    anos = {a["ano"]: a for a in body["anos"]}
    assert set(anos.keys()) == {2024, 2025}
    assert anos[2024]["total_essenciais"] == 100.0
    assert anos[2024]["total_nao_essenciais"] == 50.0
    assert anos[2024]["total_receita"] == 1000.0
    assert anos[2024]["total_caixa_pretendido"] == 100.0
    assert anos[2025]["total_essenciais"] == 200.0
    assert anos[2025]["total_receita"] == 2000.0

    assert body["total_essenciais"] == 100.0 + 200.0
    assert body["total_nao_essenciais"] == 50.0
    assert body["total_receita"] == 1000.0 + 2000.0


def test_resumo_geral_respeita_corte_ate_mes(client, auth_headers, db_session, user):
    from app import models

    item = _create_item(client, auth_headers, "essencial", "Casa")
    db_session.add_all(
        [
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=100.0, is_installment=False, date=date(2025, 1, 10)),
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=999.0, is_installment=False, date=date(2025, 6, 10)),
        ]
    )
    db_session.commit()

    response = client.get("/resumo/geral", headers=auth_headers, params={"ate_ano": 2025, "ate_mes": 3})
    assert response.status_code == 200
    body = response.json()
    anos = {a["ano"]: a for a in body["anos"]}
    assert anos[2025]["total_essenciais"] == 100.0


def test_resumo_geral_sem_dados_nao_divide_por_zero(client, auth_headers):
    response = client.get("/resumo/geral", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["anos"] == []
    assert body["total_essenciais"] == 0
    assert body["total_receita"] == 0
    assert len(body["por_mes"]) == 12
    assert all(m["total_essenciais"] == 0 for m in body["por_mes"])


def test_resumo_geral_por_mes_soma_todos_os_anos(client, auth_headers, db_session, user):
    from app import models

    item = _create_item(client, auth_headers, "essencial", "Casa")

    db_session.add_all(
        [
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=100.0, is_installment=False, date=date(2024, 1, 10)),
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=300.0, is_installment=False, date=date(2025, 1, 12)),
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=900.0, is_installment=False, date=date(2024, 7, 5)),
        ]
    )
    db_session.commit()

    response = client.get("/resumo/geral", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()

    por_mes = {m["mes"]: m for m in body["por_mes"]}
    assert len(por_mes) == 12
    # Janeiro soma os dois anos: 2024 (100) + 2025 (300) = 400.
    assert por_mes[1]["total_essenciais"] == 400.0
    # Julho só tem dado em 2024 (900).
    assert por_mes[7]["total_essenciais"] == 900.0
    # Fevereiro não tem nenhum lançamento em nenhum ano -> zero.
    assert por_mes[2]["total_essenciais"] == 0.0


def test_resumo_isolado_por_usuario(client, db_session, auth_headers):
    from app import models
    from app.security import hash_password

    _seed_mes_atual(client, auth_headers)

    other = models.User(username="outro", password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    other_login = client.post("/auth/login", data={"username": "outro", "password": "senha123"})
    other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}

    today = date.today()
    response = client.get(
        "/resumo/mensal", headers=other_headers, params={"ano": today.year, "mes": today.month}
    )
    assert response.json()["total_gastos"] == 0
