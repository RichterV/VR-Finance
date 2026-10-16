"""Compartilhamento de imóveis (Manutenção Casa) entre usuários -- app/compartilhamento.py."""

import csv
import io
import zipfile
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, inspect, text

from app import models
from tests.conftest import _create_user, _login_headers

GENERICO = "Não foi possível enviar para esse usuário."


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


@pytest.fixture()
def dono(client, db_session):
    user = _create_user(db_session, "dona", "senha-dona", first_name="Ana", last_name="Dona")
    return user, _login_headers(client, "dona", "senha-dona")


@pytest.fixture()
def convidado(client, db_session):
    user = _create_user(db_session, "convidado", "senha-conv", first_name="Bruno", last_name="Convidado")
    return user, _login_headers(client, "convidado", "senha-conv")


def _imovel(client, headers, name="Casa 1"):
    response = client.post("/casa/imoveis", headers=headers, json={"name": name})
    assert response.status_code == 201
    return response.json()


def _servico(client, headers, imovel_id, **extra):
    payload = {"imovel_id": imovel_id, "description": "Troca do chuveiro", "value": 100.0, "categoria": "eletrica"}
    payload.update(extra)
    return client.post("/casa/servicos", headers=headers, json=payload)


def _enviar(client, headers, imovel_id, username="convidado", nivel="cadastro"):
    return client.post(
        "/compartilhamentos",
        headers=headers,
        json={"item_tipo": "imovel", "item_id": imovel_id, "username": username, "nivel": nivel},
    )


def _notificacoes(client, headers):
    return [n for n in client.get("/notificacoes", headers=headers).json() if n["tipo"].startswith("compartilhamento")]


def _compartilhar(client, dono_headers, conv_headers, imovel_id, nivel="cadastro"):
    share = _enviar(client, dono_headers, imovel_id, nivel=nivel).json()
    assert client.post(f"/compartilhamentos/{share['id']}/aceitar", headers=conv_headers).status_code == 200
    return share


def _upload(client, headers, service_id):
    return client.post(
        "/attachments/upload",
        headers=headers,
        data={"entity_type": "servico_casa", "entity_id": str(service_id)},
        files={"file": ("nota.pdf", b"%PDF-1.4 teste", "application/pdf")},
    )


# --- Envio ------------------------------------------------------------------------------------------


def test_envio_cria_convite_pendente_e_avisa_o_convidado(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)

    response = _enviar(client, dono_h, casa["id"])
    assert response.status_code == 201
    share = response.json()
    assert share["status"] == "pendente"
    assert share["dono"]["username"] == "dona"
    assert share["convidado"]["nome"] == "Bruno Convidado"
    assert share["expira_em"] is not None

    [convite] = _notificacoes(client, conv_h)
    assert convite["tipo"] == "compartilhamento_convite"
    assert convite["titulo"] == (
        'O usuário Ana Dona (dona) deseja compartilhar o imóvel "Casa 1" com você '
        "(permissão: Cadastro). Deseja aceitar?"
    )
    assert convite["ano"] is None and convite["lida"] is False
    assert convite["payload"]["status"] == "pendente"
    assert convite["payload"]["compartilhamento_id"] == share["id"]

    # Pendente ainda não dá acesso.
    assert client.get("/casa/imoveis", headers=conv_h).json() == []
    assert client.get("/compartilhamentos/recebidos", headers=conv_h).json()[0]["status"] == "pendente"


def test_envio_invalido_responde_sempre_a_mesma_mensagem(client, db_session, dono, convidado):
    _, dono_h = dono
    _create_user(db_session, "sem_modulo", "senha-x", modules=())
    casa = _imovel(client, dono_h)

    for username in ("nao_existe", "dona", "sem_modulo"):
        response = _enviar(client, dono_h, casa["id"], username=username)
        assert response.status_code == 400
        assert response.json()["detail"] == GENERICO

    assert _enviar(client, dono_h, casa["id"]).status_code == 201
    duplicado = _enviar(client, dono_h, casa["id"])
    assert duplicado.status_code == 400
    assert duplicado.json()["detail"] != GENERICO


def test_so_o_dono_compartilha_o_imovel(client, dono, convidado, db_session):
    _, dono_h = dono
    _, conv_h = convidado
    _create_user(db_session, "terceiro", "senha-3")
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"], nivel="total")

    assert _enviar(client, conv_h, casa["id"], username="terceiro").status_code == 404


def test_reenviar_depois_de_recusa_e_permitido(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _enviar(client, dono_h, casa["id"]).json()
    assert client.post(f"/compartilhamentos/{share['id']}/recusar", headers=conv_h).status_code == 200
    assert _enviar(client, dono_h, casa["id"]).status_code == 201


# --- Respostas e encerramento -----------------------------------------------------------------------


def test_aceitar_da_acesso_e_avisa_o_remetente(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _compartilhar(client, dono_h, conv_h, casa["id"])

    [convite] = _notificacoes(client, conv_h)
    assert convite["lida"] is True
    assert convite["payload"]["status"] == "aceito"

    [aviso] = _notificacoes(client, dono_h)
    assert aviso["tipo"] == "compartilhamento_resposta"
    assert aviso["titulo"] == 'Bruno Convidado (convidado) aceitou o compartilhamento do imóvel "Casa 1".'

    [imovel] = client.get("/casa/imoveis", headers=conv_h).json()
    assert imovel["meu_nivel"] == "cadastro"
    assert imovel["dono"]["nome"] == "Ana Dona"
    assert imovel["compartilhamento_id"] == share["id"]
    [proprio] = client.get("/casa/imoveis", headers=dono_h).json()
    assert proprio["meu_nivel"] == "dono"
    assert proprio["compartilhado_com"] == 1

    # Aceitar de novo não vale.
    assert client.post(f"/compartilhamentos/{share['id']}/aceitar", headers=conv_h).status_code == 400


def test_recusar_avisa_o_remetente_e_nao_da_acesso(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _enviar(client, dono_h, casa["id"]).json()
    assert client.post(f"/compartilhamentos/{share['id']}/recusar", headers=conv_h).status_code == 200

    [aviso] = _notificacoes(client, dono_h)
    assert "recusou" in aviso["titulo"]
    assert client.get("/casa/imoveis", headers=conv_h).json() == []


def test_so_o_convidado_responde(client, dono, convidado):
    _, dono_h = dono
    casa = _imovel(client, dono_h)
    share = _enviar(client, dono_h, casa["id"]).json()
    assert client.post(f"/compartilhamentos/{share['id']}/aceitar", headers=dono_h).status_code == 404


def test_cancelar_convite_remove_a_notificacao_do_convidado(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _enviar(client, dono_h, casa["id"]).json()
    assert len(_notificacoes(client, conv_h)) == 1

    assert client.delete(f"/compartilhamentos/{share['id']}", headers=dono_h).status_code == 204
    assert _notificacoes(client, conv_h) == []
    assert client.get("/compartilhamentos", headers=dono_h, params={"item_tipo": "imovel", "item_id": casa["id"]}).json() == []
    assert client.post(f"/compartilhamentos/{share['id']}/aceitar", headers=conv_h).status_code == 400


def test_convite_expira_em_30_dias_sem_avisar_ninguem(client, db_session, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _enviar(client, dono_h, casa["id"]).json()
    row = db_session.get(models.Compartilhamento, share["id"])
    row.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
    db_session.commit()

    assert _notificacoes(client, conv_h) == []
    assert _notificacoes(client, dono_h) == []
    db_session.refresh(row)
    assert row.status == "expirado"
    assert client.post(f"/compartilhamentos/{share['id']}/aceitar", headers=conv_h).status_code == 400
    # Expirado pode ser reenviado.
    assert _enviar(client, dono_h, casa["id"]).status_code == 201


def test_dono_revoga_e_convidado_e_avisado(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _compartilhar(client, dono_h, conv_h, casa["id"])
    servico = _servico(client, dono_h, casa["id"]).json()

    assert client.delete(f"/compartilhamentos/{share['id']}", headers=dono_h).status_code == 204
    avisos = _notificacoes(client, conv_h)
    assert avisos[0]["tipo"] == "compartilhamento_encerrado"
    assert avisos[0]["titulo"] == 'Ana Dona (dona) encerrou o compartilhamento do imóvel "Casa 1".'
    assert client.get("/casa/imoveis", headers=conv_h).json() == []
    assert client.get("/casa/servicos", headers=conv_h).json()["total"] == 0
    assert client.put(
        f"/casa/servicos/{servico['id']}",
        headers=conv_h,
        json={"imovel_id": casa["id"], "description": "X", "value": 1, "categoria": "outros"},
    ).status_code == 404


def test_convidado_sai_e_dono_e_avisado(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _compartilhar(client, dono_h, conv_h, casa["id"])

    assert client.delete(f"/compartilhamentos/{share['id']}", headers=conv_h).status_code == 204
    avisos = _notificacoes(client, dono_h)
    assert avisos[0]["titulo"] == 'Bruno Convidado (convidado) deixou o compartilhamento do imóvel "Casa 1".'
    assert client.get("/casa/imoveis", headers=conv_h).json() == []


def test_mudar_nivel_so_o_dono_e_avisa_o_convidado(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _compartilhar(client, dono_h, conv_h, casa["id"], nivel="total")

    assert client.put(f"/compartilhamentos/{share['id']}", headers=conv_h, json={"nivel": "total"}).status_code == 403
    response = client.put(f"/compartilhamentos/{share['id']}", headers=dono_h, json={"nivel": "leitura"})
    assert response.status_code == 200
    assert response.json()["nivel"] == "leitura"
    aviso = _notificacoes(client, conv_h)[0]
    assert aviso["tipo"] == "compartilhamento_nivel"
    assert aviso["titulo"] == 'Ana Dona (dona) mudou sua permissão no imóvel "Casa 1" para Leitura.'
    assert _servico(client, conv_h, casa["id"]).status_code == 403


def test_excluir_imovel_encerra_e_avisa_os_convidados(client, db_session, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    share = _compartilhar(client, dono_h, conv_h, casa["id"])

    assert client.delete(f"/casa/imoveis/{casa['id']}", headers=dono_h).status_code == 204
    aviso = _notificacoes(client, conv_h)[0]
    assert aviso["titulo"] == 'O imóvel "Casa 1" foi excluído por Ana Dona (dona); o compartilhamento terminou.'
    assert db_session.get(models.Compartilhamento, share["id"]).status == "encerrado"
    assert client.get("/casa/imoveis", headers=conv_h).json() == []


def test_so_o_dono_renomeia_e_exclui_o_imovel(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"], nivel="total")
    assert client.put(f"/casa/imoveis/{casa['id']}", headers=conv_h, json={"name": "Minha"}).status_code == 403
    assert client.delete(f"/casa/imoveis/{casa['id']}", headers=conv_h).status_code == 403


# --- Permissões por nível ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "nivel,pode_cadastrar,pode_editar,pode_excluir",
    [
        ("leitura", False, False, False),
        ("cadastro", True, False, False),
        ("edicao", True, True, False),
        ("total", True, True, True),
    ],
)
def test_cada_nivel_libera_so_o_que_deve(client, dono, convidado, nivel, pode_cadastrar, pode_editar, pode_excluir):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"], nivel=nivel)
    servico = _servico(client, dono_h, casa["id"]).json()
    anexo = _upload(client, dono_h, servico["id"]).json()

    # Ver: todos os níveis.
    assert client.get("/casa/servicos", headers=conv_h).json()["total"] == 1
    params = {"entity_type": "servico_casa", "entity_id": str(servico["id"])}
    assert len(client.get("/attachments", headers=conv_h, params=params).json()) == 1
    exists = client.get(
        "/attachments/exists", headers=conv_h, params={"entity_type": "servico_casa", "entity_ids": [str(servico["id"])]}
    ).json()
    assert exists["entity_ids_with_attachments"] == [str(servico["id"])]
    assert client.get(f"/attachments/{anexo['id']}/download", headers=conv_h).status_code == 200

    assert _servico(client, conv_h, casa["id"]).status_code == (201 if pode_cadastrar else 403)
    assert _upload(client, conv_h, servico["id"]).status_code == (201 if pode_cadastrar else 403)

    editar = client.put(
        f"/casa/servicos/{servico['id']}",
        headers=conv_h,
        json={"imovel_id": casa["id"], "description": "Editado", "value": 50, "categoria": "pintura"},
    )
    assert editar.status_code == (200 if pode_editar else 403)

    assert client.delete(f"/attachments/{anexo['id']}", headers=conv_h).status_code == (204 if pode_excluir else 403)
    assert client.delete(f"/casa/servicos/{servico['id']}", headers=conv_h).status_code == (
        204 if pode_excluir else 403
    )


def test_quem_nao_tem_compartilhamento_nao_ve_nada(client, db_session, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    servico = _servico(client, dono_h, casa["id"]).json()
    anexo = _upload(client, dono_h, servico["id"]).json()

    assert client.get("/casa/servicos", headers=conv_h).json()["total"] == 0
    assert _servico(client, conv_h, casa["id"]).status_code == 404
    assert client.get(f"/attachments/{anexo['id']}/download", headers=conv_h).status_code == 404
    params = {"entity_type": "servico_casa", "entity_id": str(servico["id"])}
    assert client.get("/attachments", headers=conv_h, params=params).status_code == 404


# --- Onde fica o dado -------------------------------------------------------------------------------


def test_servico_do_convidado_fica_com_o_dono_e_registra_quem_cadastrou(client, db_session, dono, convidado):
    dono_user, dono_h = dono
    conv_user, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"])

    body = _servico(client, conv_h, casa["id"]).json()
    assert body["criado_por"] == conv_user.id
    assert body["criado_por_nome"] == "Bruno Convidado"
    row = db_session.get(models.ServicoCasa, body["id"])
    assert row.user_id == dono_user.id
    anexo = _upload(client, conv_h, body["id"]).json()
    assert db_session.get(models.Attachment, anexo["id"]).user_id == dono_user.id

    listed = client.get("/casa/servicos", headers=dono_h).json()["items"]
    assert listed[0]["criado_por_nome"] == "Bruno Convidado"


def test_exclusao_do_convidado_vai_pra_lixeira_do_dono(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"], nivel="total")
    servico = _servico(client, conv_h, casa["id"]).json()
    _upload(client, conv_h, servico["id"])

    assert client.delete(f"/casa/servicos/{servico['id']}", headers=conv_h).status_code == 204
    assert client.get("/lixeira", headers=conv_h).json() == []
    [item] = client.get("/lixeira", headers=dono_h).json()
    assert item["entity_type"] == "servico_casa"
    assert len(item["anexos"]) == 1
    assert client.post(f"/lixeira/{item['id']}/restaurar", headers=dono_h).status_code == 200
    assert client.get("/casa/servicos", headers=conv_h).json()["total"] == 1


def test_resumo_do_convidado_soma_proprios_e_compartilhados(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"], nivel="leitura")
    _servico(client, dono_h, casa["id"], value=300, garantia_ate=(datetime.now().date() + timedelta(days=30)).isoformat())
    proprio = _imovel(client, conv_h, "Apartamento")
    _servico(client, conv_h, proprio["id"], value=50, categoria="pintura")

    resumo = client.get("/casa/resumo", headers=conv_h).json()
    assert {i["imovel_name"]: i["total_gasto"] for i in resumo["imoveis"]} == {"Apartamento": 50, "Casa 1": 300}
    assert {c["categoria"] for c in resumo["categorias"]} == {"eletrica", "pintura"}
    assert resumo["garantias_vigentes"] == 1
    # O dono continua vendo só o dele.
    assert [i["imovel_name"] for i in client.get("/casa/resumo", headers=dono_h).json()["imoveis"]] == ["Casa 1"]


def test_exportacao_so_tem_os_proprios_imoveis(client, dono, convidado):
    _, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"])
    _servico(client, conv_h, casa["id"], description="Do convidado")
    _imovel(client, conv_h, "Apartamento")

    def nomes(headers, arquivo, coluna):
        zf = zipfile.ZipFile(io.BytesIO(client.get("/export/casa", headers=headers).content))
        rows = list(csv.DictReader(io.StringIO(zf.read(arquivo).decode("latin-1")), delimiter=";"))
        return [r[coluna] for r in rows]

    assert nomes(conv_h, "imoveis.csv", "nome") == ["Apartamento"]
    assert nomes(conv_h, "servicos_casa.csv", "descricao") == []
    # O serviço que o convidado cadastrou é do imóvel do dono -- vai na exportação dele.
    assert nomes(dono_h, "servicos_casa.csv", "descricao") == ["Do convidado"]


def test_modulo_desligado_do_dono_esconde_o_compartilhado(client, db_session, dono, convidado):
    dono_user, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"])
    dono_user.set_modules([])
    db_session.commit()

    assert client.get("/casa/imoveis", headers=conv_h).json() == []
    # Continua no banco.
    assert db_session.query(models.Compartilhamento).filter_by(status="aceito").count() == 1


# --- Admin e exclusão de conta ----------------------------------------------------------------------


def test_admin_ve_os_compartilhamentos_do_usuario(client, master_headers, dono, convidado):
    dono_user, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"])

    response = client.get(f"/auth/users/{dono_user.id}/compartilhamentos", headers=master_headers)
    assert response.status_code == 200
    [share] = response.json()
    assert (share["item_nome"], share["convidado"]["username"], share["status"]) == ("Casa 1", "convidado", "aceito")
    assert client.get(f"/auth/users/{dono_user.id}/compartilhamentos", headers=dono_h).status_code == 403


def test_excluir_convidado_mantem_os_servicos_sem_autor(client, db_session, master_headers, dono, convidado):
    _, dono_h = dono
    conv_user, conv_h = convidado
    casa = _imovel(client, dono_h)
    _compartilhar(client, dono_h, conv_h, casa["id"])
    servico = _servico(client, conv_h, casa["id"]).json()

    assert client.delete(f"/auth/users/{conv_user.id}", headers=master_headers).status_code == 204
    assert db_session.query(models.Compartilhamento).count() == 0
    [item] = client.get("/casa/servicos", headers=dono_h).json()["items"]
    assert item["id"] == servico["id"]
    assert item["criado_por"] is None and item["criado_por_nome"] is None


def test_excluir_dono_apaga_compartilhamentos_e_convites(client, db_session, master_headers, dono, convidado):
    dono_user, dono_h = dono
    _, conv_h = convidado
    casa = _imovel(client, dono_h)
    _enviar(client, dono_h, casa["id"])

    assert client.delete(f"/auth/users/{dono_user.id}", headers=master_headers).status_code == 204
    assert db_session.query(models.Compartilhamento).count() == 0
    assert _notificacoes(client, conv_h) == []


def test_convite_pendente_nao_some_pelo_limite_da_lista(client, db_session, dono, convidado):
    _, dono_h = dono
    conv_user, conv_h = convidado
    casa = _imovel(client, dono_h)
    _enviar(client, dono_h, casa["id"])
    for i in range(3):
        db_session.add(
            models.Notificacao(user_id=conv_user.id, tipo="relatorio_anual", ano=2099 - i, mes=12, titulo="x", payload="{}")
        )
    db_session.commit()
    tipos = [n["tipo"] for n in client.get("/notificacoes", headers=conv_h, params={"limit": 2}).json()]
    assert "compartilhamento_convite" in tipos


# --- Migração ---------------------------------------------------------------------------------------


def test_migracao_recria_notificacoes_preservando_os_resumos(tmp_path):
    from app.main import _rebuild_notificacoes

    engine = create_engine(f"sqlite:///{tmp_path / 'antigo.db'}")
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO users (id) VALUES (1)"))
        conn.execute(
            text(
                "CREATE TABLE notificacoes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, tipo VARCHAR NOT NULL, "
                "ano INTEGER NOT NULL, mes INTEGER NOT NULL, titulo VARCHAR NOT NULL, payload VARCHAR NOT NULL, "
                "lida_em DATETIME, created_at DATETIME, "
                "CONSTRAINT uq_notificacoes_user_tipo_mes UNIQUE (user_id, tipo, ano, mes))"
            )
        )
        conn.execute(text("CREATE INDEX ix_notificacoes_user_id ON notificacoes (user_id)"))
        conn.execute(
            text(
                "INSERT INTO notificacoes (id, user_id, tipo, ano, mes, titulo, payload) VALUES "
                "(7, 1, 'resumo_mensal', 2026, 9, 'Resumo de setembro/2026', '{\"a\": 1}')"
            )
        )
        conn.commit()

        _rebuild_notificacoes(conn)

        cols = {c["name"]: c for c in inspect(conn).get_columns("notificacoes")}
        assert "ref_id" in cols and cols["ano"]["nullable"] and cols["mes"]["nullable"]
        row = conn.execute(text("SELECT id, tipo, ano, mes, titulo, payload FROM notificacoes")).one()
        assert tuple(row) == (7, "resumo_mensal", 2026, 9, "Resumo de setembro/2026", '{"a": 1}')
        # Unicidade continua valendo pros resumos, e avisos sem mês podem repetir.
        conn.execute(
            text("INSERT INTO notificacoes (user_id, tipo, titulo, payload) VALUES (1, 'compartilhamento_nivel', 'a', '{}')")
        )
        conn.execute(
            text("INSERT INTO notificacoes (user_id, tipo, titulo, payload) VALUES (1, 'compartilhamento_nivel', 'b', '{}')")
        )
        with pytest.raises(Exception):
            conn.execute(
                text(
                    "INSERT INTO notificacoes (user_id, tipo, ano, mes, titulo, payload) "
                    "VALUES (1, 'resumo_mensal', 2026, 9, 'dup', '{}')"
                )
            )
        assert "notificacoes_old" not in inspect(conn).get_table_names()
