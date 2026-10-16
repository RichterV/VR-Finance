import io
from datetime import datetime, timedelta

import pytest

from app import models
from app.security import hash_password
from app.utils import today_local


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.attachments.settings.upload_dir", str(tmp_path))
    return tmp_path


def _pdf(name="comprovante.pdf"):
    return {"file": (name, io.BytesIO(b"%PDF-1.4 conteudo fake"), "application/pdf")}


def _item(client, headers, name="Carro"):
    # Nome de categoria é único por prioridade: reaproveita se já existir.
    existentes = client.get("/dropdown-options", headers=headers, params={"priority": "essencial"}).json()
    for item in existentes:
        if item["name"] == name:
            return item
    return client.post("/dropdown-options", headers=headers, json={"priority": "essencial", "name": name}).json()


def _gasto(client, headers, description="Pneu", installments=None):
    payload = {"priority": "essencial", "item_id": _item(client, headers)["id"], "value": 120.0, "description": description}
    if installments:
        payload |= {"is_installment": True, "installment_count": installments}
    response = client.post("/gastos", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _upload(client, headers, entity_type, entity_id, name="comprovante.pdf"):
    response = client.post(
        "/attachments/upload", headers=headers, data={"entity_type": entity_type, "entity_id": str(entity_id)}, files=_pdf(name)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _lixeira(client, headers):
    response = client.get("/lixeira", headers=headers)
    assert response.status_code == 200
    return response.json()


def _gasto_ids(client, headers):
    return [g["id"] for g in client.get("/gastos", headers=headers).json()["items"]]


def test_excluir_gasto_vai_pra_lixeira_com_o_anexo_e_restaura(client, auth_headers, tmp_path):
    gasto = _gasto(client, auth_headers)[0]
    _upload(client, auth_headers, "gasto", gasto["id"])

    assert client.delete(f"/gastos/{gasto['id']}", headers=auth_headers).status_code == 204
    assert _gasto_ids(client, auth_headers) == []
    assert len(list(tmp_path.rglob("*.pdf"))) == 1

    [item] = _lixeira(client, auth_headers)
    assert item["tipo"] == "registro"
    assert item["entity_type"] == "gasto"
    assert item["titulo"] == "Pneu"
    assert item["detalhe"] == "Carro"
    assert item["valor"] == 120.0
    assert item["data_registro"] == gasto["date"]
    assert [a["original_filename"] for a in item["anexos"]] == ["comprovante.pdf"]
    deleted_at = datetime.fromisoformat(item["deleted_at"])
    assert datetime.fromisoformat(item["expira_em"]) - deleted_at == timedelta(days=15)

    # anexo dá pra baixar direto da lixeira
    download = client.get(f"/lixeira/anexos/{item['anexos'][0]['id']}/download", headers=auth_headers)
    assert download.status_code == 200
    assert download.content.startswith(b"%PDF")

    response = client.post(f"/lixeira/{item['id']}/restaurar", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"entity_type": "gasto", "entity_id": str(gasto["id"])}
    assert _gasto_ids(client, auth_headers) == [gasto["id"]]
    anexos = client.get(
        "/attachments", headers=auth_headers, params={"entity_type": "gasto", "entity_id": str(gasto["id"])}
    ).json()
    assert [a["original_filename"] for a in anexos] == ["comprovante.pdf"]
    assert _lixeira(client, auth_headers) == []


def test_resumo_nao_conta_o_que_esta_na_lixeira(client, auth_headers):
    gasto = _gasto(client, auth_headers)[0]
    hoje = today_local()
    params = {"ano": hoje.year, "mes": hoje.month}
    assert client.get("/resumo/mensal", headers=auth_headers, params=params).json()["total_gastos"] == 120.0

    client.delete(f"/gastos/{gasto['id']}", headers=auth_headers)
    assert client.get("/resumo/mensal", headers=auth_headers, params=params).json()["total_gastos"] == 0


def test_restaurar_parcela_traz_o_anexo_do_grupo(client, auth_headers):
    rows = _gasto(client, auth_headers, installments=2)
    group_id = rows[0]["installment_group_id"]
    _upload(client, auth_headers, "gasto", group_id)

    client.delete(f"/gastos/{rows[0]['id']}", headers=auth_headers)
    client.delete(f"/gastos/{rows[1]['id']}", headers=auth_headers)
    itens = _lixeira(client, auth_headers)
    assert len(itens) == 2
    # o anexo do grupo saiu junto com a última parcela excluída
    por_id = {i["id"]: i for i in itens}
    com_anexo = [i for i in itens if i["anexos"]]
    assert len(com_anexo) == 1
    assert "parcela 2/2" in com_anexo[0]["detalhe"]

    # restaurar a outra parcela (a que saiu primeiro, sem o anexo) traz o anexo do grupo de volta
    sem_anexo = next(i for i in por_id.values() if not i["anexos"])
    assert client.post(f"/lixeira/{sem_anexo['id']}/restaurar", headers=auth_headers).status_code == 200
    anexos = client.get("/attachments", headers=auth_headers, params={"entity_type": "gasto", "entity_id": group_id}).json()
    assert len(anexos) == 1
    restante = _lixeira(client, auth_headers)
    assert len(restante) == 1 and restante[0]["anexos"] == []


def test_anexo_excluido_sozinho_restaura_no_registro(client, auth_headers):
    gasto = _gasto(client, auth_headers)[0]
    anexo = _upload(client, auth_headers, "gasto", gasto["id"], "nota.pdf")
    assert client.delete(f"/attachments/{anexo['id']}", headers=auth_headers).status_code == 204

    [item] = _lixeira(client, auth_headers)
    assert item["tipo"] == "anexo"
    assert item["titulo"] == "nota.pdf"
    assert item["detalhe"] == "Pneu"

    assert client.post(f"/lixeira/{item['id']}/restaurar", headers=auth_headers).status_code == 200
    anexos = client.get(
        "/attachments", headers=auth_headers, params={"entity_type": "gasto", "entity_id": str(gasto["id"])}
    ).json()
    assert [a["original_filename"] for a in anexos] == ["nota.pdf"]


def test_anexo_avulso_com_registro_na_lixeira_pede_pra_restaurar_o_registro_antes(client, auth_headers):
    gasto = _gasto(client, auth_headers)[0]
    anexo = _upload(client, auth_headers, "gasto", gasto["id"], "nota.pdf")
    client.delete(f"/attachments/{anexo['id']}", headers=auth_headers)
    client.delete(f"/gastos/{gasto['id']}", headers=auth_headers)

    itens = {i["tipo"]: i for i in _lixeira(client, auth_headers)}
    response = client.post(f"/lixeira/{itens['anexo']['id']}/restaurar", headers=auth_headers)
    assert response.status_code == 400
    assert "restaure ele primeiro" in response.json()["detail"]

    client.post(f"/lixeira/{itens['registro']['id']}/restaurar", headers=auth_headers)
    assert client.post(f"/lixeira/{itens['anexo']['id']}/restaurar", headers=auth_headers).status_code == 200


def test_restaura_com_id_novo_se_o_antigo_foi_reaproveitado(client, auth_headers):
    gasto = _gasto(client, auth_headers)[0]
    _upload(client, auth_headers, "gasto", gasto["id"])
    client.delete(f"/gastos/{gasto['id']}", headers=auth_headers)
    # o SQLite reaproveita o id do último registro excluído
    novo = _gasto(client, auth_headers, description="Outro")[0]
    assert novo["id"] == gasto["id"]

    [item] = _lixeira(client, auth_headers)
    response = client.post(f"/lixeira/{item['id']}/restaurar", headers=auth_headers)
    assert response.status_code == 200
    restaurado_id = int(response.json()["entity_id"])
    assert restaurado_id != gasto["id"]
    anexos_restaurado = client.get(
        "/attachments", headers=auth_headers, params={"entity_type": "gasto", "entity_id": str(restaurado_id)}
    ).json()
    anexos_novo = client.get(
        "/attachments", headers=auth_headers, params={"entity_type": "gasto", "entity_id": str(novo["id"])}
    ).json()
    assert len(anexos_restaurado) == 1
    assert anexos_novo == []


def test_recorrencia_excluida_volta_como_avulso(client, auth_headers, db_session):
    item = _item(client, auth_headers)
    gasto = client.post(
        "/gastos",
        headers=auth_headers,
        json={"priority": "essencial", "item_id": item["id"], "value": 50.0, "recorrente": True},
    ).json()[0]
    rec_id = gasto["recorrencia_id"]
    client.delete(f"/gastos/{gasto['id']}", headers=auth_headers)
    assert client.delete(f"/recorrencias/{rec_id}", headers=auth_headers).status_code == 204

    [trash] = _lixeira(client, auth_headers)
    assert client.post(f"/lixeira/{trash['id']}/restaurar", headers=auth_headers).status_code == 200
    assert db_session.get(models.Gasto, gasto["id"]).recorrencia_id is None


def test_excluir_definitivamente_e_esvaziar(client, auth_headers, tmp_path):
    g1, g2 = _gasto(client, auth_headers)[0], _gasto(client, auth_headers, description="Óleo")[0]
    _upload(client, auth_headers, "gasto", g1["id"])
    _upload(client, auth_headers, "gasto", g2["id"], "outro.pdf")
    client.delete(f"/gastos/{g1['id']}", headers=auth_headers)
    client.delete(f"/gastos/{g2['id']}", headers=auth_headers)
    assert len(list(tmp_path.rglob("*.pdf"))) == 2

    primeiro = _lixeira(client, auth_headers)[0]
    assert client.delete(f"/lixeira/{primeiro['id']}", headers=auth_headers).status_code == 204
    assert len(_lixeira(client, auth_headers)) == 1
    assert len(list(tmp_path.rglob("*.pdf"))) == 1

    assert client.delete("/lixeira", headers=auth_headers).status_code == 204
    assert _lixeira(client, auth_headers) == []
    assert not any(tmp_path.rglob("*.pdf"))


def test_some_de_vez_depois_de_15_dias(client, auth_headers, db_session, tmp_path):
    g1, g2 = _gasto(client, auth_headers)[0], _gasto(client, auth_headers, description="Óleo")[0]
    _upload(client, auth_headers, "gasto", g1["id"])
    client.delete(f"/gastos/{g1['id']}", headers=auth_headers)
    client.delete(f"/gastos/{g2['id']}", headers=auth_headers)

    antigo = db_session.query(models.LixeiraItem).filter(models.LixeiraItem.entity_id == str(g1["id"])).all()
    for entry in antigo:
        entry.deleted_at = entry.deleted_at - timedelta(days=15, minutes=1)
    db_session.commit()

    itens = _lixeira(client, auth_headers)
    assert [i["titulo"] for i in itens] == ["Óleo"]
    assert db_session.query(models.LixeiraItem).count() == 1
    assert not any(tmp_path.rglob("*.pdf"))


def test_lixeira_e_por_usuario(client, auth_headers, db_session):
    gasto = _gasto(client, auth_headers)[0]
    client.delete(f"/gastos/{gasto['id']}", headers=auth_headers)
    item_id = _lixeira(client, auth_headers)[0]["id"]

    db_session.add(models.User(username="outro_lixeira", password_hash=hash_password("senha123"), role="user"))
    db_session.commit()
    token = client.post("/auth/login", data={"username": "outro_lixeira", "password": "senha123"}).json()["access_token"]
    outro = {"Authorization": f"Bearer {token}"}

    assert _lixeira(client, outro) == []
    assert client.post(f"/lixeira/{item_id}/restaurar", headers=outro).status_code == 404
    assert client.delete(f"/lixeira/{item_id}", headers=outro).status_code == 404
    assert client.delete("/lixeira", headers=outro).status_code == 204
    assert len(_lixeira(client, auth_headers)) == 1


def test_servico_com_km_que_nao_cabe_mais_nao_restaura(client, auth_headers):
    vehicle = client.post("/veiculos", headers=auth_headers, json={"name": "Moto", "year": 2011}).json()
    servico = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de óleo", "value": 100.0, "mileage": 1000},
    ).json()
    client.delete(f"/servicos-veiculos/{servico['id']}", headers=auth_headers)
    client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Pneu", "value": 300.0, "mileage": 2000},
    )

    [item] = _lixeira(client, auth_headers)
    assert item["detalhe"] == "Moto · 1000 km"
    response = client.post(f"/lixeira/{item['id']}/restaurar", headers=auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"].startswith("Não dá pra restaurar: a quilometragem")


def test_modulo_desligado_esconde_os_itens_dele(client, auth_headers, user, db_session):
    vehicle = client.post("/veiculos", headers=auth_headers, json={"name": "Moto", "year": 2011}).json()
    servico = client.post(
        "/servicos-veiculos",
        headers=auth_headers,
        json={"vehicle_id": vehicle["id"], "description": "Troca de óleo", "value": 100.0, "mileage": 1000},
    ).json()
    client.delete(f"/servicos-veiculos/{servico['id']}", headers=auth_headers)
    item_id = _lixeira(client, auth_headers)[0]["id"]

    user.set_modules([])
    db_session.commit()
    assert _lixeira(client, auth_headers) == []
    assert client.post(f"/lixeira/{item_id}/restaurar", headers=auth_headers).status_code == 404
    client.delete("/lixeira", headers=auth_headers)
    assert db_session.query(models.LixeiraItem).count() == 1  # esvaziar não mexe no que está escondido


def _empresa(client, headers):
    payload = {"nome": "Empresa Exemplo", "cnpj": "11.222.333/0001-81", "data_abertura": "2020-05-10"}
    assert client.put("/empresa", headers=headers, json=payload).status_code == 200


def _nota(numero, **extra):
    return {
        "numero": numero,
        "data_emissao": today_local().isoformat(),
        "competencia": today_local().replace(day=1).isoformat(),
        "tomador_nome": "Cliente Exemplo",
        "valor": 500.0,
        **extra,
    }


def test_nota_substituta_restaurada_volta_a_substituir(client, auth_headers):
    _empresa(client, auth_headers)
    original = client.post("/empresa/notas", headers=auth_headers, json=_nota("2", chave_acesso="1" * 50)).json()
    substituta = client.post(
        "/empresa/notas", headers=auth_headers, json=_nota("5", chave_acesso="9" * 50, substitui_chave="1" * 50)
    ).json()

    client.delete(f"/empresa/notas/{substituta['id']}", headers=auth_headers)
    notas = {n["numero"]: n for n in client.get("/empresa/notas", headers=auth_headers).json()["items"]}
    assert notas["2"]["substituida_por"] is None

    [item] = _lixeira(client, auth_headers)
    assert (item["titulo"], item["detalhe"]) == ("Nota 5", "Cliente Exemplo")
    assert client.post(f"/lixeira/{item['id']}/restaurar", headers=auth_headers).status_code == 200
    notas = {n["numero"]: n for n in client.get("/empresa/notas", headers=auth_headers).json()["items"]}
    assert notas["2"]["substituida_por"] == substituta["id"]
    assert original["id"] == notas["2"]["id"]


def test_nota_com_numero_cadastrado_de_novo_nao_restaura(client, auth_headers):
    _empresa(client, auth_headers)
    nota = client.post("/empresa/notas", headers=auth_headers, json=_nota("7")).json()
    client.delete(f"/empresa/notas/{nota['id']}", headers=auth_headers)
    client.post("/empresa/notas", headers=auth_headers, json=_nota("7"))

    [item] = _lixeira(client, auth_headers)
    response = client.post(f"/lixeira/{item['id']}/restaurar", headers=auth_headers)
    assert response.status_code == 400
    assert "nota 7 já está cadastrada" in response.json()["detail"]


def test_excluir_usuario_apaga_a_lixeira_dele(client, master_headers, db_session, tmp_path):
    db_session.add(models.User(username="sai_do_app", password_hash=hash_password("senha123"), role="user"))
    db_session.commit()
    token = client.post("/auth/login", data={"username": "sai_do_app", "password": "senha123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    receita = client.post("/receitas", headers=headers, json={"value": 100.0, "cash_percentage": 50}).json()
    _upload(client, headers, "receita", receita["id"])
    client.delete(f"/receitas/{receita['id']}", headers=headers)
    assert len(list(tmp_path.rglob("*.pdf"))) == 1

    user_id = db_session.query(models.User).filter(models.User.username == "sai_do_app").one().id
    assert client.delete(f"/auth/users/{user_id}", headers=master_headers).status_code == 204
    assert db_session.query(models.LixeiraItem).count() == 0
    assert not any(tmp_path.rglob("*.pdf"))
