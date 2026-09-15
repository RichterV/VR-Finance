import csv
import io
import zipfile

import pytest

from app import models
from app.security import hash_password


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.export.settings.upload_dir", str(tmp_path))
    monkeypatch.setattr("app.routers.attachments.settings.upload_dir", str(tmp_path))
    return tmp_path


def _pdf_file(name="comprovante.pdf"):
    return {"file": (name, io.BytesIO(b"%PDF-1.4 conteudo fake"), "application/pdf")}


def _upload(client, headers, entity_type, entity_id, name="comprovante.pdf"):
    response = client.post(
        "/attachments/upload",
        headers=headers,
        data={"entity_type": entity_type, "entity_id": str(entity_id)},
        files=_pdf_file(name),
    )
    assert response.status_code == 201
    return response.json()


def _create_item(client, headers, priority="essencial", name="Casa"):
    return client.post("/dropdown-options", headers=headers, json={"priority": priority, "name": name}).json()


def _create_gasto(client, headers, parcelado=False, installment_count=3, value=50.0):
    """POST /gastos sempre retorna uma lista (uma linha por parcela, ou 1 linha se avulso) --
    devolve a lista inteira se parcelado, ou só o dict da linha unica caso contrario."""
    item = _create_item(client, headers)
    payload = {"priority": "essencial", "item_id": item["id"], "value": value}
    if parcelado:
        payload["is_installment"] = True
        payload["installment_count"] = installment_count
    rows = client.post("/gastos", headers=headers, json=payload).json()
    return rows if parcelado else rows[0]


def _create_receita(client, headers, value=100.0):
    return client.post("/receitas", headers=headers, json={"value": value, "cash_percentage": 50}).json()


def _create_vehicle(client, headers, name="Voyage"):
    return client.post("/veiculos", headers=headers, json={"name": name, "year": 2015}).json()


def _create_servico(client, headers, vehicle_id, value=200.0):
    return client.post(
        "/servicos-veiculos",
        headers=headers,
        json={"vehicle_id": vehicle_id, "description": "Troca de óleo", "value": value, "mileage": 1000},
    ).json()


def _create_devedor(client, headers, installment_count=1, value=69.38):
    return client.post(
        "/devedores",
        headers=headers,
        json={"devedor": "Kaoane", "value": value, "installment_count": installment_count},
    ).json()


def _other_user_headers(client, db_session, username="outro_export"):
    other = models.User(username=username, password_hash=hash_password("senha123"), role="user")
    db_session.add(other)
    db_session.commit()
    login = client.post("/auth/login", data={"username": username, "password": "senha123"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _unzip(response) -> zipfile.ZipFile:
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    return zipfile.ZipFile(io.BytesIO(response.content))


def _read_csv_rows(zf: zipfile.ZipFile, name: str) -> list[list[str]]:
    raw = zf.read(name).decode("latin-1")
    return list(csv.reader(io.StringIO(raw), delimiter=";"))


def _raw_values(rows: list[list[str]]) -> str:
    return "".join("".join(r) for r in rows)


def test_modulo_invalido_retorna_422(client, auth_headers):
    response = client.get("/export/nao-existe", headers=auth_headers)
    assert response.status_code == 422


def test_export_gastos_apenas_do_usuario_logado(client, auth_headers, db_session):
    _create_gasto(client, auth_headers, value=50.0)
    outro_headers = _other_user_headers(client, db_session)
    _create_gasto(client, outro_headers, value=999.0)

    response = client.get("/export/gastos", headers=auth_headers)
    zf = _unzip(response)
    rows = _read_csv_rows(zf, "gastos.csv")

    assert rows[0] == [
        "id", "data", "prioridade", "categoria", "valor", "descricao", "parcelado",
        "parcela_numero", "parcela_total", "grupo_parcelamento", "anexos", "criado_em",
    ]
    assert len(rows) == 2  # header + 1 linha (nao 2 -- o gasto do outro usuario nao aparece)
    assert rows[1][4] == "50,00"
    assert "999" not in _raw_values(rows)


def test_export_gastos_sem_dados_retorna_csv_so_com_cabecalho(client, auth_headers):
    response = client.get("/export/gastos", headers=auth_headers)
    zf = _unzip(response)
    rows = _read_csv_rows(zf, "gastos.csv")
    assert len(rows) == 1
    assert "anexos/" not in zf.namelist()


def test_export_gastos_com_anexo_simples(client, auth_headers):
    gasto = _create_gasto(client, auth_headers, parcelado=False)
    _upload(client, auth_headers, "gasto", gasto["id"], name="nota-fiscal.pdf")

    response = client.get("/export/gastos", headers=auth_headers)
    zf = _unzip(response)
    rows = _read_csv_rows(zf, "gastos.csv")

    anexos_cell = rows[1][10]
    assert anexos_cell != ""
    assert anexos_cell.startswith(f"gasto_{gasto['id']}_")
    assert anexos_cell.endswith("nota-fiscal.pdf")
    assert f"anexos/{anexos_cell}" in zf.namelist()
    assert zf.read(f"anexos/{anexos_cell}") == b"%PDF-1.4 conteudo fake"


def test_export_gasto_parcelado_repete_anexo_em_todas_as_parcelas(client, auth_headers):
    parcelas = _create_gasto(client, auth_headers, parcelado=True, installment_count=3)
    group_id = parcelas[0]["installment_group_id"]
    _upload(client, auth_headers, "gasto", group_id, name="comprovante-compra.pdf")

    response = client.get("/export/gastos", headers=auth_headers)
    zf = _unzip(response)
    rows = _read_csv_rows(zf, "gastos.csv")

    data_rows = rows[1:]
    assert len(data_rows) == 3
    anexos_cells = {row[10] for row in data_rows}
    assert len(anexos_cells) == 1  # mesma referencia em todas as 3 parcelas
    anexo_nome = anexos_cells.pop()
    assert anexo_nome.startswith(f"gasto_{group_id}_")
    assert f"anexos/{anexo_nome}" in zf.namelist()
    # so 1 copia fisica do arquivo no zip, nao 3
    assert len([n for n in zf.namelist() if n.startswith("anexos/")]) == 1


def test_export_receitas(client, auth_headers):
    receita = _create_receita(client, auth_headers, value=250.5)
    _upload(client, auth_headers, "receita", receita["id"])

    response = client.get("/export/receitas", headers=auth_headers)
    zf = _unzip(response)
    rows = _read_csv_rows(zf, "receitas.csv")

    assert rows[0] == ["id", "data", "valor", "percentual_caixa", "valor_caixa", "descricao", "anexos", "criado_em"]
    assert rows[1][2] == "250,50"
    assert rows[1][3] == "50,00"
    assert rows[1][6] != ""


def test_export_veiculos_gera_dois_csvs(client, auth_headers):
    vehicle = _create_vehicle(client, auth_headers, name="Biz 125")
    servico = _create_servico(client, auth_headers, vehicle["id"], value=120.0)
    _upload(client, auth_headers, "servico_veiculo", servico["id"])

    response = client.get("/export/veiculos", headers=auth_headers)
    zf = _unzip(response)

    veiculos_rows = _read_csv_rows(zf, "veiculos.csv")
    assert veiculos_rows[0] == ["id", "nome", "ano", "ativo", "criado_em"]
    assert veiculos_rows[1][1] == "Biz 125"
    assert veiculos_rows[1][3] == "Sim"

    servicos_rows = _read_csv_rows(zf, "servicos_veiculos.csv")
    assert servicos_rows[0] == [
        "id", "veiculo", "descricao", "observacao", "valor", "tipo_servico",
        "quilometragem", "data", "anexos", "criado_em",
    ]
    assert servicos_rows[1][1] == "Biz 125"
    assert servicos_rows[1][4] == "120,00"
    assert servicos_rows[1][8] != ""




def test_export_categorias_inclui_ativas_e_inativas(client, auth_headers):
    ativa = _create_item(client, auth_headers, name="Alimentação")
    inativa = _create_item(client, auth_headers, name="Categoria Antiga")
    client.delete(f"/dropdown-options/{inativa['id']}", headers=auth_headers)

    response = client.get("/export/categorias", headers=auth_headers)
    zf = _unzip(response)
    rows = _read_csv_rows(zf, "categorias.csv")

    by_name = {row[1]: row for row in rows[1:]}
    assert by_name["Alimentação"][3] == "Sim"
    assert by_name["Categoria Antiga"][3] == "Não"
