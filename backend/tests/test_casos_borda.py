import io
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.utils import like_contains, month_range, year_range


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.attachments.settings.upload_dir", str(tmp_path))


def _item(client, headers, name="Casa", priority="essencial"):
    return client.post("/dropdown-options", json={"priority": priority, "name": name}, headers=headers).json()


# --- Helpers de data e busca ---


def test_month_range_vira_o_ano_em_dezembro():
    assert month_range(2026, 12) == (date(2026, 12, 1), date(2027, 1, 1))
    assert year_range(2026) == (date(2026, 1, 1), date(2027, 1, 1))


def test_like_contains_escapa_curingas():
    assert like_contains(" 50%_x ") == "%50\\%\\_x%"


def test_filtros_de_periodo_na_listagem(client, auth_headers, db_session, user):
    item = _item(client, auth_headers)
    for d in (date(2025, 12, 31), date(2026, 1, 1), date(2026, 1, 31), date(2026, 2, 1)):
        db_session.add(
            models.Gasto(user_id=user.id, priority="essencial", item_id=item["id"], value=1, is_installment=False, date=d)
        )
    db_session.commit()

    def total(params):
        return client.get("/gastos", params=params, headers=auth_headers).json()["total"]

    assert total({"ano": 2026, "mes": 1}) == 2
    assert total({"ano": 2026}) == 3
    assert total({"mes": 12}) == 1  # só mês = esse mês em qualquer ano


def test_busca_com_porcento_nao_vira_curinga(client, auth_headers):
    item = _item(client, auth_headers)
    for descricao in ("desconto 50%", "parcela 500"):
        client.post(
            "/gastos",
            json={"priority": "essencial", "item_id": item["id"], "value": 1, "description": descricao},
            headers=auth_headers,
        )
    body = client.get("/gastos", params={"busca": "50%"}, headers=auth_headers).json()
    assert [g["description"] for g in body["items"]] == ["desconto 50%"]


# --- Moeda ---


def test_cash_value_arredondado(client, auth_headers):
    receita = client.post("/receitas", json={"value": 1000.37, "cash_percentage": 33}, headers=auth_headers).json()
    assert receita["cash_value"] == 330.12


def test_valores_digitados_arredondados(client, auth_headers):
    item = _item(client, auth_headers)
    gasto = client.post(
        "/gastos", json={"priority": "essencial", "item_id": item["id"], "value": 10.456}, headers=auth_headers
    ).json()[0]
    assert gasto["value"] == 10.46


def test_valor_que_arredonda_pra_zero_e_rejeitado(client, auth_headers):
    item = _item(client, auth_headers)
    response = client.post(
        "/gastos", json={"priority": "essencial", "item_id": item["id"], "value": 0.004}, headers=auth_headers
    )
    assert response.status_code == 422


# --- Categoria inativa / nomes vazios ---


def test_editar_gasto_de_categoria_excluida(client, auth_headers):
    item = _item(client, auth_headers)
    gasto = client.post(
        "/gastos", json={"priority": "essencial", "item_id": item["id"], "value": 10}, headers=auth_headers
    ).json()[0]
    client.delete(f"/dropdown-options/{item['id']}", headers=auth_headers)

    response = client.put(
        f"/gastos/{gasto['id']}",
        json={"priority": "essencial", "item_id": item["id"], "value": 20},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["value"] == 20


def test_trocar_pra_outra_categoria_excluida_continua_proibido(client, auth_headers):
    ativa = _item(client, auth_headers, "Ativa")
    excluida = _item(client, auth_headers, "Excluída")
    client.delete(f"/dropdown-options/{excluida['id']}", headers=auth_headers)
    gasto = client.post(
        "/gastos", json={"priority": "essencial", "item_id": ativa["id"], "value": 10}, headers=auth_headers
    ).json()[0]

    response = client.put(
        f"/gastos/{gasto['id']}",
        json={"priority": "essencial", "item_id": excluida["id"], "value": 10},
        headers=auth_headers,
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("url", "payload"),
    [
        ("/dropdown-options", {"priority": "essencial", "name": "   "}),
        ("/veiculos", {"name": " ", "year": 2010}),
    ],
)
def test_texto_obrigatorio_vazio_e_rejeitado(client, auth_headers, url, payload):
    assert client.post(url, json=payload, headers=auth_headers).status_code == 422


def test_nome_de_categoria_sem_espacos_nas_pontas(client, auth_headers):
    assert _item(client, auth_headers, "  Mercado  ")["name"] == "Mercado"


# --- Integridade ---


def test_chaves_estrangeiras_ativas(db_session):
    assert db_session.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_anexo_so_some_do_disco_depois_do_commit(client, auth_headers, db_session, tmp_path):
    item = _item(client, auth_headers)
    gasto = client.post(
        "/gastos", json={"priority": "essencial", "item_id": item["id"], "value": 10}, headers=auth_headers
    ).json()[0]
    upload = client.post(
        "/attachments/upload",
        data={"entity_type": "gasto", "entity_id": str(gasto["id"])},
        files={"file": ("a.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        headers=auth_headers,
    ).json()
    arquivos = list(Path(tmp_path, "gasto").iterdir())
    assert len(arquivos) == 1

    def _commit_que_falha():
        raise RuntimeError("falha no commit")

    db_session.commit = _commit_que_falha
    try:
        with pytest.raises(RuntimeError):
            client.delete(f"/attachments/{upload['id']}", headers=auth_headers)
        db_session.rollback()
    finally:
        del db_session.commit  # volta pro método da classe

    assert arquivos[0].exists()  # o commit falhou: o arquivo continua
    assert db_session.get(models.Attachment, upload["id"]) is not None

    assert client.delete(f"/attachments/{upload['id']}", headers=auth_headers).status_code == 204
    assert not arquivos[0].exists()


def test_upload_que_falha_no_commit_nao_deixa_arquivo(client, auth_headers, db_session, tmp_path):
    item = _item(client, auth_headers)
    gasto = client.post(
        "/gastos", json={"priority": "essencial", "item_id": item["id"], "value": 10}, headers=auth_headers
    ).json()[0]

    def _commit_que_falha():
        raise RuntimeError("falha no commit")

    db_session.commit = _commit_que_falha
    try:
        with pytest.raises(RuntimeError):
            client.post(
                "/attachments/upload",
                data={"entity_type": "gasto", "entity_id": str(gasto["id"])},
                files={"file": ("a.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
                headers=auth_headers,
            )
    finally:
        del db_session.commit

    pasta = Path(tmp_path, "gasto")
    assert not pasta.exists() or not any(pasta.iterdir())
