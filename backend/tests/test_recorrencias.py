from datetime import date

import pytest

from app import models
from app.recorrencias import occurrence_date
from tests.conftest import _create_user, _login_headers


class _Relogio:
    """Data de "hoje" controlável -- em todos os módulos que leem today_local()."""

    def __init__(self, monkeypatch, inicio: date):
        self.hoje = inicio
        for alvo in ("app.utils", "app.recorrencias", "app.routers.recorrencias", "app.routers.gastos"):
            monkeypatch.setattr(f"{alvo}.today_local", lambda: self.hoje)


@pytest.fixture()
def relogio(monkeypatch):
    return _Relogio(monkeypatch, date(2026, 10, 15))


def _item(client, headers, name="Casa", priority="essencial"):
    return client.post("/dropdown-options", json={"priority": priority, "name": name}, headers=headers).json()


def _gasto_recorrente(client, headers, item, value=100.0, dia=None, **extra):
    payload = {"priority": item["priority"], "item_id": item["id"], "value": value, "recorrente": True, **extra}
    if dia is not None:
        payload["recorrencia_dia"] = dia
    response = client.post("/gastos", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()[0]


def _gastos(client, headers):
    items = client.get("/gastos", params={"limit": 200}, headers=headers).json()["items"]
    return sorted(items, key=lambda g: (g["date"], g["id"]))


def _recorrencias(client, headers):
    response = client.get("/recorrencias", headers=headers)
    assert response.status_code == 200
    return response.json()


# --- Dia que não existe no mês ---


@pytest.mark.parametrize(
    ("ano", "mes", "dia", "esperado"),
    [
        (2026, 11, 31, date(2026, 11, 30)),
        (2027, 2, 31, date(2027, 2, 28)),
        (2028, 2, 31, date(2028, 2, 29)),  # bissexto
        (2027, 2, 29, date(2027, 2, 28)),
        (2028, 2, 29, date(2028, 2, 29)),
        (2026, 12, 31, date(2026, 12, 31)),
    ],
)
def test_dia_inexistente_usa_ultimo_dia_do_mes(ano, mes, dia, esperado):
    assert occurrence_date(date(ano, mes, 1), dia) == esperado


# --- Cadastro ---


def test_cadastro_recorrente_e_o_primeiro_lancamento(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    gasto = _gasto_recorrente(client, auth_headers, item)

    rec = _recorrencias(client, auth_headers)[0]
    assert gasto["recorrencia_id"] == rec["id"]
    assert gasto["date"] == "2026-10-15"
    assert rec["dia"] == 15  # dia omitido = dia da data do lançamento
    assert rec["status"] == "ativa"
    assert rec["proxima_data"] == "2026-11-15"
    assert rec["item_name"] == "Casa"


def test_parcelado_nao_pode_ser_recorrente(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    response = client.post(
        "/gastos",
        json={"priority": "essencial", "item_id": item["id"], "value": 10, "is_installment": True,
              "installment_count": 3, "recorrente": True},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_receita_recorrente(client, auth_headers, relogio):
    response = client.post(
        "/receitas",
        json={"value": 5000, "cash_percentage": 30, "recorrente": True, "recorrencia_dia": 5},
        headers=auth_headers,
    )
    assert response.status_code == 201

    relogio.hoje = date(2026, 11, 1)
    receitas = client.get("/receitas", headers=auth_headers).json()["items"]

    nova = next(r for r in receitas if r["date"] == "2026-11-05")
    assert nova["cash_value"] == 1500
    assert nova["recorrencia_id"] == response.json()["recorrencia_id"]


# --- Geração na virada do mês ---


def test_virada_do_mes_gera_com_data_do_dia_escolhido(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item, dia=31)

    relogio.hoje = date(2026, 11, 1)
    datas = [g["date"] for g in _gastos(client, auth_headers)]

    assert datas == ["2026-10-15", "2026-11-30"]  # gerado já no dia 1, com a data de 30/11
    assert _recorrencias(client, auth_headers)[0]["proxima_data"] == "2026-12-31"


def test_meses_sem_abrir_o_app_sao_todos_criados(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item, dia=31)

    relogio.hoje = date(2027, 3, 10)
    datas = [g["date"] for g in _gastos(client, auth_headers)]

    assert datas == ["2026-10-15", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]


def test_nao_duplica_em_chamadas_repetidas(client, auth_headers, relogio, db_session):
    from app.recorrencias import ensure_recurrences

    item = _item(client, auth_headers)
    gasto = _gasto_recorrente(client, auth_headers, item)
    relogio.hoje = date(2026, 12, 2)
    user_id = db_session.get(models.Gasto, gasto["id"]).user_id

    assert ensure_recurrences(db_session, user_id, force=True) == 2
    assert ensure_recurrences(db_session, user_id, force=True) == 0
    assert len(_gastos(client, auth_headers)) == 3


def test_lancamento_cadastrado_no_mes_seguinte(client, auth_headers, relogio):
    """Data do cadastro no mês seguinte: a recorrência só começa no mês depois dele."""
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item, date="2026-11-20")

    relogio.hoje = date(2026, 11, 1)
    assert [g["date"] for g in _gastos(client, auth_headers)] == ["2026-11-20"]
    assert _recorrencias(client, auth_headers)[0]["proxima_data"] == "2026-12-20"


# --- Pausar, término, edição ---


def test_pausada_nao_gera_e_retomar_nao_cria_meses_parados(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item)
    rec_id = _recorrencias(client, auth_headers)[0]["id"]

    pausada = client.post(f"/recorrencias/{rec_id}/pausar", headers=auth_headers).json()
    assert pausada["status"] == "pausada"
    assert pausada["proxima_data"] is None

    relogio.hoje = date(2027, 1, 20)
    assert len(_gastos(client, auth_headers)) == 1

    retomada = client.post(f"/recorrencias/{rec_id}/retomar", headers=auth_headers).json()
    assert retomada["status"] == "ativa"
    assert [g["date"] for g in _gastos(client, auth_headers)] == ["2026-10-15", "2027-01-15"]
    assert retomada["proxima_data"] == "2027-02-15"


def _editar(client, headers, rec, **mudancas):
    payload = {
        "priority": rec["priority"], "item_id": rec["item_id"], "value": rec["value"],
        "cash_percentage": rec["cash_percentage"], "description": rec["description"],
        "dia": rec["dia"], "fim_mes": rec["fim_mes"], **mudancas,
    }
    return client.put(f"/recorrencias/{rec['id']}", json=payload, headers=headers)


def test_data_de_termino(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item)
    rec = _recorrencias(client, auth_headers)[0]

    assert _editar(client, auth_headers, rec, fim_mes="2026-09-01").status_code == 400  # antes do mês atual
    assert _editar(client, auth_headers, rec, fim_mes="2026-11-30").json()["fim_mes"] == "2026-11-01"

    relogio.hoje = date(2027, 2, 1)
    assert [g["date"] for g in _gastos(client, auth_headers)] == ["2026-10-15", "2026-11-15"]
    assert _recorrencias(client, auth_headers)[0]["status"] == "encerrada"


def test_adiar_termino_de_encerrada_nao_cria_meses_parados(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item)
    rec = _recorrencias(client, auth_headers)[0]
    _editar(client, auth_headers, rec, fim_mes="2026-11-01")

    relogio.hoje = date(2027, 3, 5)
    rec = _recorrencias(client, auth_headers)[0]
    reaberta = _editar(client, auth_headers, rec, fim_mes=None).json()

    assert reaberta["status"] == "ativa"
    assert [g["date"] for g in _gastos(client, auth_headers)] == ["2026-10-15", "2026-11-15", "2027-03-15"]


def test_editar_vale_so_pros_proximos(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    outro = _item(client, auth_headers, "Lazer", "nao_essencial")
    _gasto_recorrente(client, auth_headers, item, value=100)
    rec = _recorrencias(client, auth_headers)[0]

    editada = _editar(client, auth_headers, rec, value=120, dia=31, priority="nao_essencial", item_id=outro["id"])
    assert editada.status_code == 200
    assert editada.json()["proxima_data"] == "2026-11-30"

    relogio.hoje = date(2026, 11, 1)
    gastos = _gastos(client, auth_headers)
    assert [(g["value"], g["item_name"]) for g in gastos] == [(100, "Casa"), (120, "Lazer")]


def test_categoria_excluida_continua_gerando(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    excluida = _item(client, auth_headers, "Antiga")
    _gasto_recorrente(client, auth_headers, item)
    client.delete(f"/dropdown-options/{item['id']}", headers=auth_headers)
    client.delete(f"/dropdown-options/{excluida['id']}", headers=auth_headers)

    relogio.hoje = date(2026, 11, 1)
    assert len(_gastos(client, auth_headers)) == 2
    rec = _recorrencias(client, auth_headers)[0]
    assert rec["item_active"] is False

    assert _editar(client, auth_headers, rec, value=50).status_code == 200  # mesma categoria: ok
    assert _editar(client, auth_headers, rec, item_id=excluida["id"]).status_code == 404


# --- Excluir ---


def test_excluir_mantem_os_lancamentos_criados(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item, dia=28)
    relogio.hoje = date(2026, 11, 3)
    rec = _recorrencias(client, auth_headers)[0]
    assert rec["lancamento_pendente_data"] == "2026-11-28"

    assert client.delete(f"/recorrencias/{rec['id']}", headers=auth_headers).status_code == 204

    gastos = _gastos(client, auth_headers)
    assert [g["date"] for g in gastos] == ["2026-10-15", "2026-11-28"]
    assert all(g["recorrencia_id"] is None for g in gastos)
    assert _recorrencias(client, auth_headers) == []


def test_excluir_apagando_o_lancamento_futuro(client, auth_headers, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item, dia=28)
    relogio.hoje = date(2026, 11, 3)
    rec_id = _recorrencias(client, auth_headers)[0]["id"]

    client.delete(f"/recorrencias/{rec_id}", params={"apagar_pendentes": True}, headers=auth_headers)

    assert [g["date"] for g in _gastos(client, auth_headers)] == ["2026-10-15"]


# --- Isolamento ---


def test_recorrencia_de_outro_usuario(client, auth_headers, db_session, relogio):
    item = _item(client, auth_headers)
    _gasto_recorrente(client, auth_headers, item)
    rec_id = _recorrencias(client, auth_headers)[0]["id"]

    _create_user(db_session, "outro", "senha")
    outro = _login_headers(client, "outro", "senha")

    assert _recorrencias(client, outro) == []
    assert client.post(f"/recorrencias/{rec_id}/pausar", headers=outro).status_code == 404
    assert client.delete(f"/recorrencias/{rec_id}", headers=outro).status_code == 404


def test_excluir_usuario_com_recorrencias(client, auth_headers, master_headers, db_session, relogio):
    item = _item(client, auth_headers)
    gasto = _gasto_recorrente(client, auth_headers, item)
    relogio.hoje = date(2026, 11, 1)
    _gastos(client, auth_headers)
    user_id = db_session.get(models.Gasto, gasto["id"]).user_id

    assert client.delete(f"/auth/users/{user_id}", headers=master_headers).status_code == 204
    assert db_session.query(models.Recorrencia).count() == 0
