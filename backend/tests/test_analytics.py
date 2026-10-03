from datetime import date

import pytest

from app import analytics, models
from app.utils import add_months
from tests.conftest import _create_user, _login_headers

HOJE = date(2026, 9, 15)


@pytest.fixture(autouse=True)
def _hoje_fixo(monkeypatch):
    monkeypatch.setattr(analytics, "today_local", lambda: HOJE)


def _item(db, user, name="Lanche", priority="nao_essencial"):
    item = models.DropdownOption(user_id=user.id, priority=priority, name=name)
    db.add(item)
    db.commit()
    return item


def _gasto(db, user, item, value, d, description=None, **extra):
    db.add(
        models.Gasto(
            user_id=user.id, priority=item.priority, item_id=item.id, value=value, description=description,
            is_installment=extra.pop("is_installment", False), date=d, **extra,
        )
    )
    db.commit()


def _receita(db, user, value, d, cash_pct=30):
    db.add(models.Receita(user_id=user.id, value=value, cash_percentage=cash_pct, cash_value=value * cash_pct / 100, date=d))
    db.commit()


# --- Anomalia ---


def _anomalia(client, headers, item_id, value):
    response = client.get("/gastos/anomalia", params={"item_id": item_id, "value": value}, headers=headers)
    assert response.status_code == 200
    return response.json()


def _historico_lanche(db, user, item, valores=(55, 60, 62, 58, 65, 70, 61, 59)):
    for i, v in enumerate(valores):
        _gasto(db, user, item, v, date(2026, 1 + i % 8, 10))


def test_poucos_lancamentos_nunca_alerta(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    _historico_lanche(db_session, user, item, valores=(50, 60, 55))
    assert _anomalia(client, auth_headers, item.id, 5000)["anomalo"] is False


def test_valor_normal_nao_alerta(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    _historico_lanche(db_session, user, item)
    assert _anomalia(client, auth_headers, item.id, 75)["anomalo"] is False


def test_valor_muito_acima_alerta(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    _historico_lanche(db_session, user, item)
    body = _anomalia(client, auth_headers, item.id, 380)
    assert body["anomalo"] is True
    assert body["mediana"] == 60.5
    assert body["multiplo"] == 6.3


def test_valor_sempre_igual_usa_multiplo(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Streaming")
    _historico_lanche(db_session, user, item, valores=(40,) * 8)
    assert _anomalia(client, auth_headers, item.id, 100)["anomalo"] is False  # 2,5×
    assert _anomalia(client, auth_headers, item.id, 130)["anomalo"] is True  # 3,25× e +R$ 90


def test_diferenca_pequena_nao_alerta_mesmo_com_z_alto(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Café")
    _historico_lanche(db_session, user, item, valores=(8, 8.5, 8, 9, 8.2, 8.1, 8.3, 8))
    assert _anomalia(client, auth_headers, item.id, 40)["anomalo"] is False  # só R$ 32 acima


def test_parcelas_nao_entram_no_historico(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    for i in range(8):
        _gasto(db_session, user, item, 500, date(2026, 1 + i, 10), is_installment=True,
               installment_count=8, installment_number=i + 1, installment_group_id="g")
    assert _anomalia(client, auth_headers, item.id, 500)["amostras"] == 0


def test_historico_de_outro_usuario_nao_conta(client, auth_headers, db_session, user):
    outro = _create_user(db_session, "outro", "senha")
    item_outro = _item(db_session, outro)
    _historico_lanche(db_session, outro, item_outro)
    assert _anomalia(client, auth_headers, item_outro.id, 380)["amostras"] == 0


# --- Previsão do fim do mês ---


def _mes_regular(db, user, item, ano, mes, ate_dia=30):
    """R$ 100 no dia 5, 15 e 25 de cada mês (avulsos) -- até o dia 15 sai 2/3 do variável do mês."""
    for dia in (5, 15, 25):
        if dia <= ate_dia:
            _gasto(db, user, item, 100, date(ano, mes, dia))


def test_previsao_mes_regular(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    for mes in range(3, 9):
        _mes_regular(db_session, user, item, 2026, mes)
        _receita(db_session, user, 1000, date(2026, mes, 1))
    _mes_regular(db_session, user, item, 2026, 9, ate_dia=15)
    _receita(db_session, user, 1000, date(2026, 9, 1))

    p = client.get("/resumo/previsao", headers=auth_headers).json()

    assert p["historico_suficiente"] is True
    assert p["comprometido"] == 200
    assert p["variavel_restante"] == 100  # 200 até hoje ÷ 2/3 = 300 no mês
    assert p["saldo_previsto"] == 1000 - 200 - 100 - 300


def test_previsao_sem_receita_no_mes_estima_pela_mediana(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    for mes, valor in zip(range(3, 9), (1000, 1000, 1000, 1000, 5000, 1000)):  # 5000 = PLR
        _mes_regular(db_session, user, item, 2026, mes)
        _receita(db_session, user, valor, date(2026, mes, 1))

    p = client.get("/resumo/previsao", headers=auth_headers).json()

    assert p["receita_estimada"] is True
    assert p["receita"] == 1000
    assert p["caixa_pretendido"] == 500  # padrão do usuário: 50%


def test_previsao_conta_parcelas_futuras_do_mes(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    for mes in range(3, 9):
        _mes_regular(db_session, user, item, 2026, mes)
    _gasto(db_session, user, item, 250, date(2026, 9, 28), is_installment=True,
           installment_count=3, installment_number=2, installment_group_id="tv")

    p = client.get("/resumo/previsao", headers=auth_headers).json()

    assert p["comprometido"] == 250
    assert p["saldo_min"] <= p["saldo_previsto"] <= p["saldo_max"]


def test_previsao_historico_curto(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    _mes_regular(db_session, user, item, 2026, 8)
    assert client.get("/resumo/previsao", headers=auth_headers).json()["historico_suficiente"] is False


def test_previsao_dia_31_em_mes_de_30_dias(client, auth_headers, db_session, user, monkeypatch):
    monkeypatch.setattr(analytics, "today_local", lambda: date(2026, 10, 31))
    item = _item(db_session, user)
    for mes in range(4, 10):
        _mes_regular(db_session, user, item, 2026, mes)
    assert client.get("/resumo/previsao", headers=auth_headers).status_code == 200


# --- Indicadores ---


def _indicadores(client, headers, ano=2026, mes=9):
    response = client.get("/resumo/indicadores", params={"ate_ano": ano, "ate_mes": mes}, headers=headers)
    assert response.status_code == 200
    return response.json()


def test_poupanca_movel_3_meses(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Casa", "essencial")
    for mes, gasto in ((7, 800), (8, 900), (9, 1300)):
        _receita(db_session, user, 1000, date(2026, mes, 1))
        _gasto(db_session, user, item, gasto, date(2026, mes, 10))

    p = _indicadores(client, auth_headers)["poupanca"]

    assert p["atual_3m_pct"] == 0  # (200 + 100 − 300) ÷ 3000
    assert p["serie"][-1] == {"ano": 2026, "mes": 9, "valor": -30}
    assert len(p["serie"]) == 12


def test_comprometimento_futuro(client, auth_headers, db_session, user):
    item = _item(db_session, user)
    for mes in range(4, 10):
        _receita(db_session, user, 1000, date(2026, mes, 1))
    for i, mes in enumerate((10, 11, 12)):
        _gasto(db_session, user, item, 200, date(2026, mes, 5), is_installment=True,
               installment_count=3, installment_number=i + 1, installment_group_id="g")

    c = _indicadores(client, auth_headers)["comprometimento"]

    assert c["total"] == 600
    assert c["pct"] == 10  # 600 ÷ (1000 × 6)
    assert [m["valor"] for m in c["meses"]] == [200, 200, 200, 0, 0, 0]


def test_custo_fixo_detecta_recorrencia(client, auth_headers, db_session, user):
    casa = _item(db_session, user, "Casa", "essencial")
    lanche = _item(db_session, user, "Lanche")
    for mes in (6, 7, 9):  # falta agosto: 3 de 4 meses ainda conta
        _gasto(db_session, user, casa, 120 if mes != 9 else 125, date(2026, mes, 5), description="Internet")
        _receita(db_session, user, 1000, date(2026, mes, 1))
    for mes, valor in ((6, 50), (7, 90), (8, 60), (9, 40)):  # varia demais
        _gasto(db_session, user, lanche, valor, date(2026, mes, 5), description="iFood")
    for mes in (6, 7, 8, 9):  # duas vezes no mês: não é conta fixa
        _gasto(db_session, user, lanche, 20, date(2026, mes, 3), description="Marmita")
        _gasto(db_session, user, lanche, 20, date(2026, mes, 20), description="marmita")

    f = _indicadores(client, auth_headers)["custo_fixo"]

    assert [i["descricao"] for i in f["itens"]] == ["Internet"]
    assert f["total"] == 120


def test_custo_fixo_ignora_series_com_fim(client, auth_headers, db_session, user):
    casa = _item(db_session, user, "Casa", "essencial")
    for mes in (6, 7, 8, 9):
        _receita(db_session, user, 1000, date(2026, mes, 1))
        _gasto(db_session, user, casa, 99, date(2026, mes, 5), description="Aluguel")
    for i in range(12):  # 12x lançado como avulso: vai até 2027
        _gasto(db_session, user, casa, 62.49, add_months(date(2026, 4, 21), i), description="HD externo")
    for mes in (5, 6, 7, 8):  # parou em agosto
        _gasto(db_session, user, casa, 24.98, date(2026, mes, 3), description="Camiseta")

    f = _indicadores(client, auth_headers)["custo_fixo"]

    assert [i["descricao"] for i in f["itens"]] == ["Aluguel"]


def test_custo_fixo_mes_em_andamento_espera_o_dia_de_costume(client, auth_headers, db_session, user, monkeypatch):
    casa = _item(db_session, user, "Casa", "essencial")
    for mes in (6, 7, 8):
        _receita(db_session, user, 1000, date(2026, mes, 1))
        _gasto(db_session, user, casa, 80, date(2026, mes, 20), description="Condomínio")

    monkeypatch.setattr(analytics, "today_local", lambda: date(2026, 9, 10))
    assert [i["descricao"] for i in _indicadores(client, auth_headers)["custo_fixo"]["itens"]] == ["Condomínio"]

    monkeypatch.setattr(analytics, "today_local", lambda: date(2026, 9, 25))
    assert _indicadores(client, auth_headers)["custo_fixo"]["itens"] == []


def test_custo_fixo_ligado_a_recorrencia_sempre_conta(client, auth_headers, db_session, user):
    casa = _item(db_session, user, "Casa", "essencial")
    rec = models.Recorrencia(user_id=user.id, tipo="gasto", priority="essencial", item_id=casa.id, value=50,
                             dia=5, proximo_mes=date(2027, 2, 1))
    db_session.add(rec)
    db_session.commit()
    for i in range(8):  # lançado até 2027 (ex: pago adiantado), mas é recorrência
        _gasto(db_session, user, casa, 50, add_months(date(2026, 6, 5), i), description="Academia", recorrencia_id=rec.id)

    f = _indicadores(client, auth_headers)["custo_fixo"]

    assert [i["descricao"] for i in f["itens"]] == ["Academia"]


def test_essencial_tendencia(client, auth_headers, db_session, user):
    casa = _item(db_session, user, "Casa", "essencial")
    lazer = _item(db_session, user, "Lazer")
    for i, mes in enumerate(range(1, 10)):
        _gasto(db_session, user, casa, 50 + i * 5, date(2026, mes, 5))
        _gasto(db_session, user, lazer, 50 - i * 5, date(2026, mes, 5))

    e = _indicadores(client, auth_headers)["essencial"]

    assert e["atual_pct"] == 90
    assert e["inclinacao_pp_mes"] == 5


def test_indicadores_sem_dados(client, db_session):
    _create_user(db_session, "vazio", "senha")
    headers = _login_headers(client, "vazio", "senha")
    body = _indicadores(client, headers)
    assert body["poupanca"]["atual_3m_pct"] is None
    assert body["comprometimento"]["pct"] is None
    assert body["custo_fixo"]["itens"] == []
    assert body["essencial"]["inclinacao_pp_mes"] is None
