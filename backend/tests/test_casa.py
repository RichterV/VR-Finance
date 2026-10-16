import csv
import io
import zipfile
from datetime import timedelta

import pytest

from app import models
from app.utils import today_local
from tests.conftest import _create_user, _login_headers


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


def _create_imovel(client, headers, name="Casa"):
    response = client.post("/casa/imoveis", headers=headers, json={"name": name})
    assert response.status_code == 201
    return response.json()


def _create_servico(client, headers, imovel_id, **extra):
    payload = {"imovel_id": imovel_id, "description": "Troca do chuveiro", "value": 250.0, "categoria": "eletrica"}
    payload.update(extra)
    return client.post("/casa/servicos", headers=headers, json=payload)


def test_crud_imoveis_com_soft_delete(client, auth_headers):
    casa = _create_imovel(client, auth_headers, "Casa")
    _create_imovel(client, auth_headers, "Apartamento")

    names = [i["name"] for i in client.get("/casa/imoveis", headers=auth_headers).json()]
    assert names == ["Apartamento", "Casa"]

    response = client.put(f"/casa/imoveis/{casa['id']}", headers=auth_headers, json={"name": "Casa da praia"})
    assert response.status_code == 200
    assert response.json()["name"] == "Casa da praia"

    assert client.put(f"/casa/imoveis/{casa['id']}", headers=auth_headers, json={"name": "  "}).status_code == 422

    assert client.delete(f"/casa/imoveis/{casa['id']}", headers=auth_headers).status_code == 204
    names = [i["name"] for i in client.get("/casa/imoveis", headers=auth_headers).json()]
    assert names == ["Apartamento"]


def test_criar_servico_com_todos_os_campos(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    hoje = today_local()
    response = _create_servico(
        client,
        auth_headers,
        casa["id"],
        notes="Lorenzetti",
        service_type="material_mao_de_obra",
        prestador="  Eletricista João ",
        garantia_ate=(hoje + timedelta(days=90)).isoformat(),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["imovel_name"] == "Casa"
    assert body["date"] == hoje.isoformat()
    assert body["prestador"] == "Eletricista João"
    assert body["categoria"] == "eletrica"
    assert body["service_type"] == "material_mao_de_obra"


@pytest.mark.parametrize("categoria", ["impostos", "documentos"])
def test_categorias_impostos_e_documentos(client, auth_headers, categoria):
    casa = _create_imovel(client, auth_headers)
    response = _create_servico(client, auth_headers, casa["id"], description="IPTU", categoria=categoria)
    assert response.status_code == 201
    assert response.json()["categoria"] == categoria


def test_categoria_desconhecida_e_rejeitada(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    assert _create_servico(client, auth_headers, casa["id"], categoria="seguro").status_code == 422


def test_data_do_servico_pode_ser_passada_mas_nao_futura(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    hoje = today_local()

    passada = _create_servico(client, auth_headers, casa["id"], date=(hoje - timedelta(days=400)).isoformat())
    assert passada.status_code == 201
    assert passada.json()["date"] == (hoje - timedelta(days=400)).isoformat()

    futura = _create_servico(client, auth_headers, casa["id"], date=(hoje + timedelta(days=1)).isoformat())
    assert futura.status_code == 400


def test_garantia_antes_da_data_do_servico_e_rejeitada(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    hoje = today_local()
    response = _create_servico(
        client,
        auth_headers,
        casa["id"],
        date=(hoje - timedelta(days=10)).isoformat(),
        garantia_ate=(hoje - timedelta(days=20)).isoformat(),
    )
    assert response.status_code == 400


def test_categoria_invalida_e_valor_negativo_dao_422(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    assert _create_servico(client, auth_headers, casa["id"], categoria="carro").status_code == 422
    assert _create_servico(client, auth_headers, casa["id"], value=-1).status_code == 422
    assert _create_servico(client, auth_headers, casa["id"], value=0).status_code == 201


def test_servico_em_imovel_excluido_ou_de_outro_usuario(client, auth_headers, db_session):
    casa = _create_imovel(client, auth_headers)
    client.delete(f"/casa/imoveis/{casa['id']}", headers=auth_headers)
    assert _create_servico(client, auth_headers, casa["id"]).status_code == 400

    _create_user(db_session, "outro_casa", "senha-outro")
    outro = _login_headers(client, "outro_casa", "senha-outro")
    dele = _create_imovel(client, outro)
    assert _create_servico(client, auth_headers, dele["id"]).status_code == 404


def test_editar_servico_nao_muda_a_data(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    ape = _create_imovel(client, auth_headers, "Apartamento")
    servico = _create_servico(client, auth_headers, casa["id"]).json()

    response = client.put(
        f"/casa/servicos/{servico['id']}",
        headers=auth_headers,
        json={
            "imovel_id": ape["id"],
            "description": "Pintura da sala",
            "value": 900.0,
            "categoria": "pintura",
            "prestador": "",
            "date": "2020-01-01",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["imovel_name"] == "Apartamento"
    assert body["categoria"] == "pintura"
    assert body["prestador"] is None
    assert body["date"] == servico["date"]


def test_listagem_com_filtros_e_paginacao(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    ape = _create_imovel(client, auth_headers, "Apartamento")
    hoje = today_local()
    _create_servico(client, auth_headers, casa["id"], description="Chuveiro", prestador="Elétrica Silva")
    _create_servico(client, auth_headers, casa["id"], description="Vazamento pia", categoria="hidraulica")
    _create_servico(
        client,
        auth_headers,
        ape["id"],
        description="Geladeira",
        categoria="eletrodomesticos",
        garantia_ate=(hoje + timedelta(days=365)).isoformat(),
    )

    def listar(**params):
        return client.get("/casa/servicos", headers=auth_headers, params=params).json()

    assert listar()["total"] == 3
    assert listar(imovel_id=casa["id"])["total"] == 2
    assert [s["description"] for s in listar(categoria="hidraulica")["items"]] == ["Vazamento pia"]
    assert [s["description"] for s in listar(busca="silva")["items"]] == ["Chuveiro"]
    assert [s["description"] for s in listar(garantia_vigente="true")["items"]] == ["Geladeira"]
    page = listar(limit=2)
    assert page["total"] == 3 and len(page["items"]) == 2


def test_resumo_por_imovel_categoria_e_serie(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    excluido = _create_imovel(client, auth_headers, "Vendido")
    hoje = today_local()
    _create_servico(client, auth_headers, casa["id"], value=100.0)
    _create_servico(client, auth_headers, casa["id"], value=300.0, categoria="pintura")
    _create_servico(
        client,
        auth_headers,
        casa["id"],
        value=50.0,
        categoria="pintura",
        garantia_ate=(hoje + timedelta(days=30)).isoformat(),
    )
    _create_servico(client, auth_headers, excluido["id"], value=999.0)
    client.delete(f"/casa/imoveis/{excluido['id']}", headers=auth_headers)

    resumo = client.get("/casa/resumo", headers=auth_headers).json()
    assert [i["imovel_name"] for i in resumo["imoveis"]] == ["Casa"]
    assert resumo["imoveis"][0]["total_gasto"] == 450.0
    assert resumo["imoveis"][0]["quantidade_servicos"] == 3
    assert resumo["categorias"] == [
        {"categoria": "pintura", "total": 350.0, "quantidade": 2},
        {"categoria": "eletrica", "total": 100.0, "quantidade": 1},
    ]
    assert resumo["garantias_vigentes"] == 1
    assert len(resumo["meses"]) == 12
    assert resumo["series"][0]["valores"][-1] == 450.0

    outro_ano = client.get("/casa/resumo", headers=auth_headers, params={"ano": hoje.year - 1}).json()
    assert outro_ano["imoveis"][0]["total_gasto"] == 0
    assert outro_ano["categorias"] == []
    assert outro_ano["series"][0]["valores"][-1] == 450.0  # o gráfico ignora o filtro


def test_excluir_servico_vai_pra_lixeira_e_restaura_com_anexo(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    servico = _create_servico(client, auth_headers, casa["id"], prestador="Encanador").json()
    upload = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "servico_casa", "entity_id": str(servico["id"])},
        files={"file": ("nota.pdf", b"%PDF-1.4 teste", "application/pdf")},
    )
    assert upload.status_code == 201

    assert client.delete(f"/casa/servicos/{servico['id']}", headers=auth_headers).status_code == 204
    assert client.get("/casa/servicos", headers=auth_headers).json()["total"] == 0

    [item] = client.get("/lixeira", headers=auth_headers).json()
    assert item["entity_type"] == "servico_casa"
    assert item["detalhe"] == "Casa · Encanador"
    assert len(item["anexos"]) == 1

    assert client.post(f"/lixeira/{item['id']}/restaurar", headers=auth_headers).status_code == 200
    assert client.get("/casa/servicos", headers=auth_headers).json()["total"] == 1
    listed = client.get(
        "/attachments", headers=auth_headers, params={"entity_type": "servico_casa", "entity_id": str(servico["id"])}
    )
    assert len(listed.json()) == 1


def test_export_casa_gera_dois_csvs_com_anexo(client, auth_headers):
    casa = _create_imovel(client, auth_headers)
    servico = _create_servico(client, auth_headers, casa["id"], value=1234.5, prestador="Pintor").json()
    client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "servico_casa", "entity_id": str(servico["id"])},
        files={"file": ("orcamento.pdf", b"%PDF-1.4 teste", "application/pdf")},
    )

    response = client.get("/export/casa", headers=auth_headers)
    assert response.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(response.content))

    def rows(name):
        return list(csv.reader(io.StringIO(zf.read(name).decode("latin-1")), delimiter=";"))

    imoveis = rows("imoveis.csv")
    assert imoveis[0] == ["id", "nome", "ativo", "criado_em"]
    assert imoveis[1][1] == "Casa"
    servicos = rows("servicos_casa.csv")
    header = servicos[0]
    linha = dict(zip(header, servicos[1]))
    assert linha["valor"] == "1234,50"
    assert linha["prestador"] == "Pintor"
    assert linha["categoria"] == "eletrica"
    assert linha["anexos"].startswith("servico_casa_")
    assert f"anexos/{linha['anexos']}" in zf.namelist()


def test_modulo_desligado_bloqueia_anexo_e_export(client, db_session):
    _create_user(db_session, "sem_casa", "senha-sem", modules=("exportar_dados",))
    headers = _login_headers(client, "sem_casa", "senha-sem")
    assert client.get("/export/casa", headers=headers).status_code == 403
    response = client.get("/attachments", headers=headers, params={"entity_type": "servico_casa", "entity_id": "1"})
    assert response.status_code == 403


def test_excluir_usuario_apaga_imoveis_e_servicos(client, master_headers, db_session):
    user = _create_user(db_session, "dono_casa", "senha-dono")
    headers = _login_headers(client, "dono_casa", "senha-dono")
    casa = _create_imovel(client, headers)
    _create_servico(client, headers, casa["id"])

    assert client.delete(f"/auth/users/{user.id}", headers=master_headers).status_code == 204
    assert db_session.query(models.Imovel).count() == 0
    assert db_session.query(models.ServicoCasa).count() == 0
