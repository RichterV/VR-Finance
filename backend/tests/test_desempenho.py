import tempfile
from contextlib import contextmanager
from datetime import date
from pathlib import Path

from sqlalchemy import event

from app import models
from tests.conftest import engine


@contextmanager
def _count_queries():
    counter = {"n": 0}

    def _before(*_args, **_kwargs):
        counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _before)


def _seed(db, user, months=36):
    item = models.DropdownOption(user_id=user.id, priority="essencial", name="Casa", include_in_inflation=True)
    db.add(item)
    db.commit()
    ref = date(2026, 9, 1)
    for i in range(months):
        ano, mes = (ref.year * 12 + ref.month - 1 - i) // 12, (ref.month - 1 - i) % 12 + 1
        db.add(models.Gasto(user_id=user.id, priority="essencial", item_id=item.id, value=100 + i,
                            is_installment=False, date=date(ano, mes, 10)))
        db.add(models.Receita(user_id=user.id, value=1000, cash_percentage=30, cash_value=300, date=date(ano, mes, 5)))
    db.commit()


def test_resumo_anual_36_meses_usa_poucas_consultas(client, auth_headers, db_session, user):
    _seed(db_session, user)
    with _count_queries() as counter:
        response = client.get("/resumo/anual", params={"ano": 2026, "meses": 36, "ate_ano": 2026, "ate_mes": 9},
                              headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()["evolucao_12_meses"]) == 36
    assert counter["n"] <= 12  # antes: ~97


def test_resumo_inflacao_36_meses_usa_poucas_consultas(client, auth_headers, db_session, user):
    _seed(db_session, user)
    with _count_queries() as counter:
        response = client.get("/resumo/inflacao", params={"meses": 36, "ate_ano": 2026, "ate_mes": 9},
                              headers=auth_headers)
    assert response.status_code == 200
    assert counter["n"] <= 12  # antes: ~229


def test_resumo_geral_agrega_no_banco(client, auth_headers, db_session, user):
    _seed(db_session, user, months=24)
    response = client.get("/resumo/geral", headers=auth_headers).json()
    assert response["total_receita"] == 24000
    assert sum(a["total_receita"] for a in response["anos"]) == 24000
    assert sum(m["total_receita"] for m in response["por_mes"]) == 24000


def test_export_apaga_o_zip_temporario(client, auth_headers, db_session, user, tmp_path, monkeypatch):
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    _seed(db_session, user, months=2)
    response = client.get("/export/gastos", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert not list(Path(tmp_path).glob("vrfinance-export-*.zip"))
