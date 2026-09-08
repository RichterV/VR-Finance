from datetime import date

from app import models


def _create_item(client, headers, priority="essencial", name="Casa"):
    return client.post("/dropdown-options", headers=headers, json={"priority": priority, "name": name}).json()


def _create_item_na_cesta(client, headers, name="Casa"):
    item = _create_item(client, headers, "essencial", name)
    put = client.put(
        f"/dropdown-options/{item['id']}", headers=headers, json={"name": name, "include_in_inflation": True}
    )
    assert put.status_code == 200
    return item


def _gasto(user_id, item_id, value, ano, mes, dia=10, priority="essencial"):
    return models.Gasto(
        user_id=user_id, priority=priority, item_id=item_id, value=value, is_installment=False,
        date=date(ano, mes, dia),
    )


def test_sem_categoria_marcada_retorna_cesta_vazia(client, auth_headers):
    _create_item(client, auth_headers, "essencial", "Casa")  # existe mas nao esta na cesta

    response = client.get("/resumo/inflacao", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()

    assert body["possui_cesta"] is False
    assert body["cesta"] == []
    assert body["mensal"] == []
    assert body["anual"] == []
    assert body["headline_mom_pct"] is None
    assert body["headline_yoy_pct"] is None


def test_variacao_mes_a_mes_e_calculada_sobre_a_soma_da_cesta(client, auth_headers, db_session, user):
    casa = _create_item_na_cesta(client, auth_headers, "Casa")
    alimentacao = _create_item_na_cesta(client, auth_headers, "Alimentação")
    hoje = date.today()
    mes_anterior = 12 if hoje.month == 1 else hoje.month - 1
    ano_mes_anterior = hoje.year - 1 if hoje.month == 1 else hoje.year

    db_session.add_all(
        [
            _gasto(user.id, casa["id"], 500.0, ano_mes_anterior, mes_anterior),
            _gasto(user.id, alimentacao["id"], 300.0, ano_mes_anterior, mes_anterior),
            _gasto(user.id, casa["id"], 550.0, hoje.year, hoje.month),
            _gasto(user.id, alimentacao["id"], 330.0, hoje.year, hoje.month),
        ]
    )
    db_session.commit()

    response = client.get("/resumo/inflacao", headers=auth_headers, params={"meses": 12})
    assert response.status_code == 200
    body = response.json()

    assert body["possui_cesta"] is True
    assert set(body["cesta"]) == {"Casa", "Alimentação"}

    ultimo = body["mensal"][-1]
    assert (ultimo["ano"], ultimo["mes"]) == (hoje.year, hoje.month)
    assert ultimo["total_cesta"] == 880.0
    # base = 800 (500+300), atual = 880 (550+330) -> +10%
    assert ultimo["variacao_pct"] == 10.0
    assert body["headline_mom_pct"] == 10.0


def test_variacao_ano_a_ano_compara_com_mesmo_mes_do_ano_anterior(client, auth_headers, db_session, user):
    casa = _create_item_na_cesta(client, auth_headers, "Casa")
    hoje = date.today()

    db_session.add_all(
        [
            _gasto(user.id, casa["id"], 1000.0, hoje.year - 1, hoje.month),
            _gasto(user.id, casa["id"], 1200.0, hoje.year, hoje.month),
        ]
    )
    db_session.commit()

    response = client.get("/resumo/inflacao", headers=auth_headers, params={"meses": 12})
    assert response.status_code == 200
    body = response.json()

    ultimo = body["anual"][-1]
    assert (ultimo["ano"], ultimo["mes"]) == (hoje.year, hoje.month)
    assert ultimo["total_cesta"] == 1200.0
    assert ultimo["variacao_pct"] == 20.0
    assert body["headline_yoy_pct"] == 20.0
    assert len(body["anual"]) == 12


def test_caixa_real_pct_bate_com_a_formula_ja_usada_no_resumo_anual(client, auth_headers, db_session, user):
    casa = _create_item_na_cesta(client, auth_headers, "Casa")
    hoje = date.today()

    db_session.add(_gasto(user.id, casa["id"], 400.0, hoje.year, hoje.month))
    db_session.add(models.Receita(user_id=user.id, value=1000.0, cash_percentage=20, cash_value=200.0, date=hoje))
    db_session.commit()

    response = client.get("/resumo/inflacao", headers=auth_headers)
    body = response.json()

    ultimo = body["mensal"][-1]
    # gastos do mes = 400 (so essa categoria tem gasto), receita = 1000 -> caixa_real = 600
    # caixa_real_pct = 600 / 400 * 100 = 150
    assert ultimo["caixa_real_pct"] == 150.0


def test_categoria_nao_marcada_ou_nao_essencial_fica_fora_da_cesta(client, auth_headers, db_session, user):
    casa = _create_item_na_cesta(client, auth_headers, "Casa")
    fora_da_cesta = _create_item(client, auth_headers, "essencial", "Transporte")  # nunca marcada
    lazer = _create_item(client, auth_headers, "nao_essencial", "Lazer")
    # marca o flag num item nao-essencial direto no banco -- o endpoint deve ignorar mesmo assim,
    # ja que so considera priority == "essencial".
    db_session.query(models.DropdownOption).filter(models.DropdownOption.id == lazer["id"]).update(
        {"include_in_inflation": True}
    )
    hoje = date.today()

    db_session.add_all(
        [
            _gasto(user.id, casa["id"], 500.0, hoje.year, hoje.month),
            _gasto(user.id, fora_da_cesta["id"], 9999.0, hoje.year, hoje.month),
            _gasto(user.id, lazer["id"], 9999.0, hoje.year, hoje.month, priority="nao_essencial"),
        ]
    )
    db_session.commit()

    response = client.get("/resumo/inflacao", headers=auth_headers)
    body = response.json()

    assert body["cesta"] == ["Casa"]
    assert body["mensal"][-1]["total_cesta"] == 500.0


def test_mes_base_sem_gasto_na_cesta_gera_variacao_none(client, auth_headers, db_session, user):
    casa = _create_item_na_cesta(client, auth_headers, "Casa")
    hoje = date.today()

    db_session.add(_gasto(user.id, casa["id"], 500.0, hoje.year, hoje.month))
    db_session.commit()

    response = client.get("/resumo/inflacao", headers=auth_headers)
    body = response.json()

    # o mes anterior (base) nao tem nenhum gasto na cesta -> sem base de comparacao valida
    assert body["mensal"][-1]["variacao_pct"] is None


def test_respeita_corte_ate_mes_selecionado(client, auth_headers, db_session, user):
    casa = _create_item_na_cesta(client, auth_headers, "Casa")

    db_session.add_all(
        [
            _gasto(user.id, casa["id"], 100.0, 2025, 5),
            _gasto(user.id, casa["id"], 150.0, 2025, 6),
            _gasto(user.id, casa["id"], 9999.0, 2025, 12),  # fora da janela, nao deve aparecer
        ]
    )
    db_session.commit()

    response = client.get(
        "/resumo/inflacao", headers=auth_headers, params={"meses": 12, "ate_ano": 2025, "ate_mes": 6}
    )
    assert response.status_code == 200
    body = response.json()

    ultimo = body["mensal"][-1]
    assert (ultimo["ano"], ultimo["mes"]) == (2025, 6)
    assert ultimo["total_cesta"] == 150.0


def test_requires_auth(client):
    response = client.get("/resumo/inflacao")
    assert response.status_code == 401
