from datetime import date

import pytest

from app import models, resumo_mensal, schemas
from tests.conftest import _create_user, _login_headers

HOJE = date(2026, 10, 3)  # resumo gerado = setembro/2026; meses base = jun/jul/ago


@pytest.fixture(autouse=True)
def _hoje_fixo(monkeypatch):
    monkeypatch.setattr(resumo_mensal, "today_local", lambda: HOJE)


def _item(db, user, name, priority="essencial", na_cesta=False):
    item = models.DropdownOption(user_id=user.id, priority=priority, name=name, include_in_inflation=na_cesta)
    db.add(item)
    db.commit()
    return item


def _gasto(db, user, item, value, ano, mes, dia=10, **extra):
    db.add(
        models.Gasto(
            user_id=user.id, priority=item.priority, item_id=item.id, value=value,
            is_installment=extra.pop("is_installment", False), date=date(ano, mes, dia), **extra,
        )
    )
    db.commit()


def _receita(db, user, value, ano, mes, cash_pct=30):
    db.add(
        models.Receita(
            user_id=user.id, value=value, cash_percentage=cash_pct, cash_value=value * cash_pct / 100,
            date=date(ano, mes, 5),
        )
    )
    db.commit()


def _base_e_setembro(db, user, item, base: float, setembro: float):
    for mes in (6, 7, 8):
        _gasto(db, user, item, base, 2026, mes)
    _gasto(db, user, item, setembro, 2026, 9)


def _resumo(client, headers):
    response = client.get("/notificacoes", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    return body[0]["payload"]


def test_gera_resumo_do_mes_anterior_uma_vez_so(client, auth_headers, db_session, user):
    _gasto(db_session, user, _item(db_session, user, "Casa"), 100, 2026, 9)

    client.get("/notificacoes", headers=auth_headers)
    body = client.get("/notificacoes", headers=auth_headers).json()

    assert len(body) == 1
    assert body[0]["titulo"] == "Resumo de setembro/2026"
    assert (body[0]["ano"], body[0]["mes"], body[0]["lida"]) == (2026, 9, False)
    assert db_session.query(models.Notificacao).count() == 1


def test_mes_sem_lancamentos_nao_gera_resumo(client, auth_headers, db_session, user):
    _gasto(db_session, user, _item(db_session, user, "Casa"), 100, 2026, 8)  # só agosto, não setembro

    assert client.get("/notificacoes", headers=auth_headers).json() == []


def test_nao_gera_meses_antigos(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Casa")
    for mes in (6, 7, 8, 9):
        _gasto(db_session, user, item, 100, 2026, mes)

    body = client.get("/notificacoes", headers=auth_headers).json()
    assert [(n["ano"], n["mes"]) for n in body] == [(2026, 9)]


def _resumo_antigo(user, ano, mes):
    ind = schemas.IndicadorMensal(valor=0, media=None, variacao_pct=None)
    payload = schemas.ResumoMensalPayload(
        ano=ano, mes=mes, meses_base=3, gastos=ind, receita=ind, caixa_real=ind, caixa_pretendido=ind,
        taxa_poupanca=schemas.TaxaPoupanca(valor_pct=None, media_pct=None, meta_pct=None),
        subiram=[], cairam=[], pontuais=[], parcelamentos_novos=[], parcelamentos_encerrados=[],
    )
    return models.Notificacao(
        user_id=user.id, tipo="resumo_mensal", ano=ano, mes=mes, titulo=f"{mes}/{ano}",
        payload=payload.model_dump_json(),
    )


def test_guarda_no_maximo_12_resumos(client, auth_headers, db_session, user):
    # 12 resumos já existentes, de set/2025 a ago/2026. Hoje é out/2026: a janela vai de out/2025 a
    # set/2026 -- set/2025 sai e o de setembro/2026 entra.
    for i in range(12):
        ref = date(2025, 9, 1).replace(year=2025 + (8 + i) // 12, month=(8 + i) % 12 + 1)
        db_session.add(_resumo_antigo(user, ref.year, ref.month))
    db_session.commit()
    _gasto(db_session, user, _item(db_session, user, "Casa"), 100, 2026, 9)

    body = client.get("/notificacoes", headers=auth_headers).json()

    meses = sorted((n["ano"], n["mes"]) for n in body)
    assert len(meses) == 12
    assert meses[0] == (2025, 10)
    assert meses[-1] == (2026, 9)
    assert db_session.query(models.Notificacao).count() == 12


def test_virada_usa_fuso_de_brasilia(client, auth_headers, db_session, user, monkeypatch):
    # 30/09 às 22h em Brasília já é 01/10 em UTC -- ainda não pode gerar o resumo de setembro.
    monkeypatch.setattr(resumo_mensal, "today_local", lambda: date(2026, 9, 30))
    _gasto(db_session, user, _item(db_session, user, "Casa"), 100, 2026, 9)

    assert client.get("/notificacoes", headers=auth_headers).json() == []


def test_totais_e_taxa_de_poupanca(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Casa")
    for mes in (6, 7, 8):
        _gasto(db_session, user, item, 1000, 2026, mes)
        _receita(db_session, user, 2000, 2026, mes)
    _gasto(db_session, user, item, 1500, 2026, 9)
    _receita(db_session, user, 2000, 2026, 9)

    p = _resumo(client, auth_headers)

    assert p["gastos"] == {"valor": 1500, "media": 1000, "variacao_pct": 50}
    assert p["receita"]["variacao_pct"] == 0
    assert p["taxa_poupanca"]["valor_pct"] == 25  # (2000 - 1500) / 2000
    assert p["taxa_poupanca"]["media_pct"] == 50
    assert p["taxa_poupanca"]["meta_pct"] == 30


def test_caixa_real_negativo_piorando_aparece_como_queda(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Casa")
    for mes in (6, 7, 8):
        _gasto(db_session, user, item, 1100, 2026, mes)
        _receita(db_session, user, 1000, 2026, mes)  # caixa real médio = -100
    _gasto(db_session, user, item, 1300, 2026, 9)
    _receita(db_session, user, 1000, 2026, 9)  # caixa real = -300 (piorou)

    p = _resumo(client, auth_headers)

    assert p["caixa_real"] == {"valor": -300, "media": -100, "variacao_pct": -200}


def test_sem_historico_fica_sem_comparacao(client, auth_headers, db_session, user):
    _gasto(db_session, user, _item(db_session, user, "Casa"), 800, 2026, 9)

    p = _resumo(client, auth_headers)

    assert p["gastos"] == {"valor": 800, "media": None, "variacao_pct": None}
    assert p["subiram"] == []


@pytest.mark.parametrize(
    ("base", "setembro", "entra"),
    [
        (500, 590, False),  # +18%: abaixo de 20%
        (100, 130, False),  # +30%, mas só R$ 30 de diferença
        (300, 400, True),  # +33% e R$ 100
    ],
)
def test_limiares_de_variacao(client, auth_headers, db_session, user, base, setembro, entra):
    _base_e_setembro(db_session, user, _item(db_session, user, "Lanche", "nao_essencial"), base, setembro)

    p = _resumo(client, auth_headers)

    assert bool(p["subiram"]) is entra


def test_subiram_e_cairam_ordenados_por_diferenca(client, auth_headers, db_session, user):
    _base_e_setembro(db_session, user, _item(db_session, user, "Lanche", "nao_essencial"), 300, 400)
    _base_e_setembro(db_session, user, _item(db_session, user, "Mercado"), 1000, 1500)
    _base_e_setembro(db_session, user, _item(db_session, user, "Combustível"), 600, 300)

    p = _resumo(client, auth_headers)

    assert [c["item_name"] for c in p["subiram"]] == ["Mercado", "Lanche"]
    assert p["subiram"][0]["variacao_pct"] == 50
    assert [c["item_name"] for c in p["cairam"]] == ["Combustível"]
    assert p["cairam"][0]["diferenca"] == -300


def test_categoria_rara_vira_gasto_pontual(client, auth_headers, db_session, user):
    ipva = _item(db_session, user, "IPVA")
    _gasto(db_session, user, ipva, 900, 2026, 9)
    _gasto(db_session, user, _item(db_session, user, "Presente", "nao_essencial"), 30, 2026, 9)  # irrelevante

    p = _resumo(client, auth_headers)

    assert p["subiram"] == []
    assert [c["item_name"] for c in p["pontuais"]] == ["IPVA"]


def test_parcelas_ficam_fora_da_comparacao(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Eletrônicos", "nao_essencial")
    for mes in (6, 7, 8):
        _gasto(db_session, user, item, 200, 2026, mes)
    _gasto(db_session, user, item, 200, 2026, 9)
    _gasto(
        db_session, user, item, 500, 2026, 9, description="TV", is_installment=True,
        installment_count=10, installment_number=1, installment_group_id="g-tv",
    )

    p = _resumo(client, auth_headers)

    assert p["subiram"] == []
    assert p["gastos"]["valor"] == 700  # o total continua incluindo a parcela
    assert p["parcelamentos_novos"] == [
        {"descricao": "TV", "item_name": "Eletrônicos", "valor_parcela": 500, "parcelas": 10}
    ]


def test_parcelamento_encerrado(client, auth_headers, db_session, user):
    item = _item(db_session, user, "Casa")
    _gasto(
        db_session, user, item, 300, 2026, 9, is_installment=True,
        installment_count=6, installment_number=6, installment_group_id="g-sofa",
    )

    p = _resumo(client, auth_headers)

    assert p["parcelamentos_encerrados"] == [
        {"descricao": "Casa", "item_name": "Casa", "valor_parcela": 300, "parcelas": 6}
    ]
    assert p["parcelamentos_novos"] == []


def test_inflacao_da_cesta(client, auth_headers, db_session, user):
    mercado = _item(db_session, user, "Mercado", na_cesta=True)
    _gasto(db_session, user, mercado, 1000, 2026, 8)
    _gasto(db_session, user, mercado, 1100, 2026, 9)

    p = _resumo(client, auth_headers)

    assert p["inflacao"]["cesta"] == ["Mercado"]
    assert p["inflacao"]["variacao_pct"] == pytest.approx(10)


def test_secoes_de_modulo_somem_sem_o_modulo(client, db_session):
    user = _create_user(db_session, "sem_modulos", "senha", modules=())
    headers = _login_headers(client, "sem_modulos", "senha")
    _gasto(db_session, user, _item(db_session, user, "Mercado", na_cesta=True), 100, 2026, 9)

    p = _resumo(client, headers)

    assert p["inflacao"] is None
    assert p["devedores"] is None


def test_marcar_como_lida(client, auth_headers, db_session, user):
    _gasto(db_session, user, _item(db_session, user, "Casa"), 100, 2026, 9)
    notificacao_id = client.get("/notificacoes", headers=auth_headers).json()[0]["id"]

    response = client.put(f"/notificacoes/{notificacao_id}/lida", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["lida"] is True
    assert client.get("/notificacoes", headers=auth_headers).json()[0]["lida"] is True


def test_marcar_todas_como_lidas(client, auth_headers, db_session, user):
    _gasto(db_session, user, _item(db_session, user, "Casa"), 100, 2026, 9)
    client.get("/notificacoes", headers=auth_headers)

    assert client.put("/notificacoes/lidas", headers=auth_headers).status_code == 204
    assert client.get("/notificacoes", headers=auth_headers).json()[0]["lida"] is True


def test_isolamento_por_usuario(client, auth_headers, db_session, user):
    outro = _create_user(db_session, "outro", "senha-outro")
    outro_headers = _login_headers(client, "outro", "senha-outro")
    _gasto(db_session, outro, _item(db_session, outro, "Casa"), 100, 2026, 9)
    notificacao_id = client.get("/notificacoes", headers=outro_headers).json()[0]["id"]

    assert client.get("/notificacoes", headers=auth_headers).json() == []
    assert client.put(f"/notificacoes/{notificacao_id}/lida", headers=auth_headers).status_code == 404


def test_excluir_usuario_apaga_notificacoes(client, master_headers, db_session):
    outro = _create_user(db_session, "outro", "senha-outro")
    outro_headers = _login_headers(client, "outro", "senha-outro")
    _gasto(db_session, outro, _item(db_session, outro, "Casa"), 100, 2026, 9)
    client.get("/notificacoes", headers=outro_headers)

    assert client.delete(f"/auth/users/{outro.id}", headers=master_headers).status_code == 204
    assert db_session.query(models.Notificacao).count() == 0
