import io
from datetime import date

import pytest

from app import models
from app.empresa import cnpj_valido, limite_do_ano, situacao_limite
from app.nfse_xml import NfseXmlError, ler_nfse
from app.utils import today_local
from tests.conftest import _create_user, _login_headers

# CNPJs fictícios com dígitos verificadores válidos
CNPJ_EMPRESA = "11222333000181"
CNPJ_OUTRA = "11444777000161"

NFSE_NACIONAL = f"""<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS35503082{CNPJ_EMPRESA}000000000000012250300000000012">
    <xLocEmi>São Paulo</xLocEmi>
    <nNFSe>12</nNFSe>
    <cStat>100</cStat>
    <dhProc>2025-03-10T09:31:00-03:00</dhProc>
    <emit>
      <CNPJ>{CNPJ_EMPRESA}</CNPJ>
      <xNome>Empresa Exemplo</xNome>
    </emit>
    <valores>
      <vLiq>1500.00</vLiq>
    </valores>
    <DPS versao="1.00">
      <infDPS Id="DPS355030821122233300018100900000000000012">
        <tpAmb>1</tpAmb>
        <dhEmi>2025-03-10T09:30:00-03:00</dhEmi>
        <serie>900</serie>
        <nDPS>12</nDPS>
        <dCompet>2025-02-28</dCompet>
        <prest><CNPJ>{CNPJ_EMPRESA}</CNPJ></prest>
        <toma>
          <CNPJ>{CNPJ_OUTRA}</CNPJ>
          <xNome>Cliente Exemplo Ltda</xNome>
        </toma>
        <serv>
          <cServ>
            <cTribNac>010101</cTribNac>
            <xDescServ>Desenvolvimento de software</xDescServ>
          </cServ>
        </serv>
        <valores>
          <vServPrest><vServ>1500.00</vServ></vServPrest>
        </valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>
""".encode()

NFSE_ABRASF = """<?xml version="1.0" encoding="UTF-8"?>
<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Nfse>
    <InfNfse>
      <Numero>345</Numero>
      <CodigoVerificacao>ABC123</CodigoVerificacao>
      <DataEmissao>2025-04-02T14:00:00</DataEmissao>
      <Competencia>2025-04-01</Competencia>
      <Servico>
        <Valores><ValorServicos>800,50</ValorServicos></Valores>
        <Discriminacao>Consultoria</Discriminacao>
      </Servico>
      <PrestadorServico>
        <IdentificacaoPrestador><CpfCnpj><Cnpj>11222333000181</Cnpj></CpfCnpj></IdentificacaoPrestador>
      </PrestadorServico>
      <TomadorServico>
        <IdentificacaoTomador><CpfCnpj><Cpf>12345678909</Cpf></CpfCnpj></IdentificacaoTomador>
        <RazaoSocial>Fulano de Tal</RazaoSocial>
      </TomadorServico>
    </InfNfse>
  </Nfse>
</CompNfse>
""".encode()


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.attachments.settings.upload_dir", str(tmp_path))


def _criar_empresa(client, headers, abertura="2020-05-10", **extra):
    payload = {"nome": "Empresa Exemplo", "cnpj": "11.222.333/0001-81", "data_abertura": abertura, **extra}
    response = client.put("/empresa", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _nota(numero="1", valor=1000.0, competencia=None, **extra):
    competencia = competencia or today_local().replace(day=1).isoformat()
    return {
        "numero": numero,
        "data_emissao": today_local().isoformat(),
        "competencia": competencia,
        "tomador_nome": "Cliente Exemplo",
        "valor": valor,
        **extra,
    }


# --- Regras puras ---

def test_cnpj_valido():
    assert cnpj_valido(CNPJ_EMPRESA)
    assert cnpj_valido(CNPJ_OUTRA)
    assert not cnpj_valido("11222333000182")
    assert not cnpj_valido("11111111111111")
    assert not cnpj_valido("123")


def test_limite_proporcional_no_ano_de_abertura():
    empresa = models.Empresa(data_abertura=date(2025, 10, 15))
    assert limite_do_ano(empresa, 2025) == 6750 * 3  # out, nov, dez
    assert limite_do_ano(empresa, 2026) == 81000
    assert limite_do_ano(empresa, 2024) == 0


def test_situacao_do_limite():
    assert situacao_limite(50) == "ok"
    assert situacao_limite(80) == "atencao"
    assert situacao_limite(110) == "excedido_ate_20"
    assert situacao_limite(121) == "excedido_acima_20"


# --- Leitura do XML ---

def test_le_nfse_nacional():
    nota = ler_nfse(NFSE_NACIONAL)
    assert nota.numero == "12"
    assert nota.data_emissao == date(2025, 3, 10)
    assert nota.competencia == date(2025, 2, 1)  # dCompet, não a emissão
    assert nota.valor == 1500.0
    assert nota.tomador_nome == "Cliente Exemplo Ltda"
    assert nota.tomador_documento == CNPJ_OUTRA
    assert nota.descricao == "Desenvolvimento de software"
    assert nota.prestador_documento == CNPJ_EMPRESA
    assert nota.chave_acesso.startswith("35503082" + CNPJ_EMPRESA)


def test_le_nfse_abrasf():
    nota = ler_nfse(NFSE_ABRASF)
    assert nota.numero == "345"
    assert nota.data_emissao == date(2025, 4, 2)
    assert nota.competencia == date(2025, 4, 1)
    assert nota.valor == 800.5
    assert nota.tomador_nome == "Fulano de Tal"
    assert nota.tomador_documento == "12345678909"
    assert nota.prestador_documento == CNPJ_EMPRESA


@pytest.mark.parametrize(
    "conteudo",
    [
        b"isso nao e xml",
        b"<?xml version='1.0'?><outra><coisa/></outra>",
        b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "a">]><x>&a;</x>',
    ],
)
def test_xml_invalido_ou_desconhecido(conteudo):
    with pytest.raises(NfseXmlError):
        ler_nfse(conteudo)


def test_xml_sem_valor_explica_o_que_falta():
    sem_valor = NFSE_NACIONAL.replace(b"<vServ>1500.00</vServ>", b"").replace(b"<vLiq>1500.00</vLiq>", b"")
    with pytest.raises(NfseXmlError, match="valor do serviço"):
        ler_nfse(sem_valor)


# --- Cadastro da empresa ---

def test_empresa_comeca_vazia_e_cadastra(client, auth_headers):
    assert client.get("/empresa", headers=auth_headers).json() is None
    empresa = _criar_empresa(client, auth_headers)
    assert empresa["cnpj"] == CNPJ_EMPRESA  # pontuação removida


def test_empresa_rejeita_cnpj_invalido(client, auth_headers):
    response = client.put(
        "/empresa", headers=auth_headers, json={"nome": "X", "cnpj": "11222333000182", "data_abertura": "2020-01-01"}
    )
    assert response.status_code == 400


def test_modulo_bloqueado_sem_permissao(client, db_session):
    _create_user(db_session, "sem_empresa", "senha", modules=("devedores",))
    headers = _login_headers(client, "sem_empresa", "senha")
    assert client.get("/empresa", headers=headers).status_code == 403
    assert client.get("/empresa/notas", headers=headers).status_code == 403


# --- Notas ---

def test_ler_xml_preenche_e_avisa_prestador_diferente(client, auth_headers):
    _criar_empresa(client, auth_headers, cnpj=CNPJ_OUTRA)
    response = client.post(
        "/empresa/notas/ler-xml",
        headers=auth_headers,
        files={"file": ("nota.xml", io.BytesIO(NFSE_NACIONAL), "text/xml")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["numero"] == "12"
    assert body["competencia"] == "2025-02-01"
    assert any("prestador" in aviso for aviso in body["avisos"])


def test_ler_xml_invalido_responde_400(client, auth_headers):
    _criar_empresa(client, auth_headers)
    response = client.post(
        "/empresa/notas/ler-xml",
        headers=auth_headers,
        files={"file": ("nota.xml", io.BytesIO(b"<x/>"), "text/xml")},
    )
    assert response.status_code == 400
    assert "NFS-e" in response.json()["detail"]


def test_ler_xml_avisa_nota_ja_cadastrada(client, auth_headers):
    _criar_empresa(client, auth_headers)
    client.post("/empresa/notas", headers=auth_headers, json=_nota(numero="12"))
    body = client.post(
        "/empresa/notas/ler-xml",
        headers=auth_headers,
        files={"file": ("nota.xml", io.BytesIO(NFSE_NACIONAL), "application/xml")},
    ).json()
    assert body["avisos"][0] == "A nota 12 já está cadastrada."


def test_crud_de_nota(client, auth_headers):
    _criar_empresa(client, auth_headers)
    created = client.post(
        "/empresa/notas", headers=auth_headers, json=_nota(competencia="2026-03-15", tomador_documento="123.456.789-09")
    )
    assert created.status_code == 201
    nota = created.json()
    assert nota["competencia"] == "2026-03-01"
    assert nota["tomador_documento"] == "12345678909"

    updated = client.put(f"/empresa/notas/{nota['id']}", headers=auth_headers, json=_nota(valor=1200.0))
    assert updated.json()["valor"] == 1200.0

    assert client.delete(f"/empresa/notas/{nota['id']}", headers=auth_headers).status_code == 204
    assert client.get("/empresa/notas", headers=auth_headers).json()["total"] == 0


def test_nota_exige_empresa_cadastrada(client, auth_headers):
    assert client.post("/empresa/notas", headers=auth_headers, json=_nota()).status_code == 400


def test_nota_duplicada_e_rejeitada(client, auth_headers):
    _criar_empresa(client, auth_headers)
    assert client.post("/empresa/notas", headers=auth_headers, json=_nota(numero="7")).status_code == 201
    response = client.post("/empresa/notas", headers=auth_headers, json=_nota(numero="7"))
    assert response.status_code == 400
    assert "já está cadastrada" in response.json()["detail"]


def test_lista_filtra_por_competencia_e_busca_e_soma(client, auth_headers):
    _criar_empresa(client, auth_headers)
    client.post("/empresa/notas", headers=auth_headers, json=_nota("1", 100.0, "2026-01-01", tomador_nome="Alfa"))
    client.post("/empresa/notas", headers=auth_headers, json=_nota("2", 200.0, "2026-02-01", tomador_nome="Beta"))
    client.post("/empresa/notas", headers=auth_headers, json=_nota("3", 300.0, "2026-02-01", tomador_nome="Alfa"))

    fev = client.get("/empresa/notas", headers=auth_headers, params={"ano": 2026, "mes": 2}).json()
    assert fev["total"] == 2
    assert fev["soma_valor"] == 500.0

    alfa = client.get("/empresa/notas", headers=auth_headers, params={"busca": "alf"}).json()
    assert {n["numero"] for n in alfa["items"]} == {"1", "3"}


def test_notas_sao_por_usuario(client, auth_headers, db_session):
    _criar_empresa(client, auth_headers)
    nota = client.post("/empresa/notas", headers=auth_headers, json=_nota()).json()
    _create_user(db_session, "outro", "senha")
    outro = _login_headers(client, "outro", "senha")
    assert client.put(f"/empresa/notas/{nota['id']}", headers=outro, json=_nota()).status_code == 404
    assert client.get("/empresa/notas", headers=outro).json()["total"] == 0


# --- Limite ---

def test_limite_soma_notas_pela_competencia(client, auth_headers):
    _criar_empresa(client, auth_headers, abertura="2020-01-01")
    client.post("/empresa/notas", headers=auth_headers, json=_nota("1", 60000.0, "2026-01-01"))
    client.post("/empresa/notas", headers=auth_headers, json=_nota("2", 10000.0, "2026-03-01"))
    client.post("/empresa/notas", headers=auth_headers, json=_nota("3", 999.0, "2025-12-01"))

    limite = client.get("/empresa/limite", headers=auth_headers, params={"ano": 2026}).json()
    assert limite["limite"] == 81000
    assert limite["faturado"] == 70000
    assert limite["restante"] == 11000
    assert limite["pct"] == 86.4
    assert limite["situacao"] == "atencao"
    assert limite["por_mes"][0] == 60000 and limite["por_mes"][2] == 10000
    assert limite["proporcional"] is False


# --- Substituição de notas ---

def _xml_substituta(original_chave: str, numero: str = "19", chave: str = "9" * 50) -> bytes:
    return (
        NFSE_NACIONAL.replace(b"<nNFSe>12</nNFSe>", f"<nNFSe>{numero}</nNFSe>".encode())
        .replace(b'Id="NFS', f'Id="NFS{chave}" x="'.encode(), 1)
        .replace(
            b"<prest>",
            f"<subst><chSubstda>{original_chave}</chSubstda><cMotivo>99</cMotivo></subst><prest>".encode(),
        )
    )


def test_le_chave_da_nota_substituida():
    nota = ler_nfse(_xml_substituta("1" * 50))
    assert nota.substitui_chave == "1" * 50
    assert nota.chave_acesso == "9" * 50


@pytest.mark.parametrize("substituta_primeiro", [False, True])
def test_substituida_sai_do_limite_em_qualquer_ordem(client, auth_headers, substituta_primeiro):
    _criar_empresa(client, auth_headers)
    original = _nota("5", 5000.0, "2026-03-01", chave_acesso="1" * 50)
    substituta = _nota("19", 5000.0, "2026-03-01", chave_acesso="9" * 50, substitui_chave="1" * 50)
    ordem = [substituta, original] if substituta_primeiro else [original, substituta]
    for payload in ordem:
        assert client.post("/empresa/notas", headers=auth_headers, json=payload).status_code == 201

    notas = {n["numero"]: n for n in client.get("/empresa/notas", headers=auth_headers).json()["items"]}
    assert notas["5"]["substituida_por"] == notas["19"]["id"]
    assert notas["5"]["substituida_por_numero"] == "19"
    assert notas["19"]["substitui_numero"] == "5"
    assert client.get("/empresa/notas", headers=auth_headers).json()["soma_valor"] == 5000.0

    limite = client.get("/empresa/limite", headers=auth_headers, params={"ano": 2026}).json()
    assert limite["faturado"] == 5000.0


def test_excluir_substituta_faz_a_original_voltar_a_contar(client, auth_headers):
    _criar_empresa(client, auth_headers)
    client.post("/empresa/notas", headers=auth_headers, json=_nota("5", 5000.0, "2026-03-01", chave_acesso="1" * 50))
    sub = client.post(
        "/empresa/notas",
        headers=auth_headers,
        json=_nota("19", 5000.0, "2026-03-01", chave_acesso="9" * 50, substitui_chave="1" * 50),
    ).json()
    client.delete(f"/empresa/notas/{sub['id']}", headers=auth_headers)
    nota = client.get("/empresa/notas", headers=auth_headers).json()["items"][0]
    assert nota["substituida_por"] is None


def test_ler_xml_de_substituta_avisa_qual_nota_substitui(client, auth_headers):
    _criar_empresa(client, auth_headers)
    client.post("/empresa/notas", headers=auth_headers, json=_nota("5", chave_acesso="1" * 50))
    body = client.post(
        "/empresa/notas/ler-xml",
        headers=auth_headers,
        files={"file": ("nota.xml", io.BytesIO(_xml_substituta("1" * 50)), "text/xml")},
    ).json()
    assert body["substitui_chave"] == "1" * 50
    assert any("substitui a nº 5" in aviso for aviso in body["avisos"])


# --- Anexos ---

def test_xml_aceito_como_anexo_so_de_nota(client, auth_headers):
    _criar_empresa(client, auth_headers)
    nota = client.post("/empresa/notas", headers=auth_headers, json=_nota()).json()
    ok = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "nota_fiscal", "entity_id": str(nota["id"])},
        files={"file": ("nota.xml", io.BytesIO(NFSE_NACIONAL), "application/octet-stream")},
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["content_type"] == "application/xml"

    empresa = client.get("/empresa", headers=auth_headers).json()
    recusado = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "empresa", "entity_id": str(empresa["id"])},
        files={"file": ("nota.xml", io.BytesIO(NFSE_NACIONAL), "application/xml")},
    )
    assert recusado.status_code == 400


def test_excluir_nota_apaga_anexos(client, auth_headers, db_session):
    _criar_empresa(client, auth_headers)
    nota = client.post("/empresa/notas", headers=auth_headers, json=_nota()).json()
    client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "nota_fiscal", "entity_id": str(nota["id"])},
        files={"file": ("nota.xml", io.BytesIO(NFSE_NACIONAL), "text/xml")},
    )
    client.delete(f"/empresa/notas/{nota['id']}", headers=auth_headers)
    assert db_session.query(models.Attachment).filter_by(entity_type="nota_fiscal").count() == 0


# --- Exportação e exclusão de usuário ---

def test_export_empresa_leva_notas_dados_e_documentos(client, auth_headers):
    import zipfile

    empresa = _criar_empresa(client, auth_headers)
    nota = client.post("/empresa/notas", headers=auth_headers, json=_nota(numero="55", valor=1234.5)).json()
    client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "nota_fiscal", "entity_id": str(nota["id"])},
        files={"file": ("nota.xml", io.BytesIO(NFSE_NACIONAL), "text/xml")},
    )
    doc = client.post(
        "/attachments/upload",
        headers=auth_headers,
        data={"entity_type": "empresa", "entity_id": str(empresa["id"])},
        files={"file": ("CCMEI.pdf", io.BytesIO(b"%PDF-1.4 teste"), "application/pdf")},
    )
    assert doc.status_code == 201

    response = client.get("/export/empresa", headers=auth_headers)
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        nomes = zf.namelist()
        assert {"notas_fiscais.csv", "empresa.csv"} <= set(nomes)
        assert any(n.startswith("anexos/nota_fiscal_") and n.endswith("nota.xml") for n in nomes)
        assert any(n.startswith("documentos/") and n.endswith("CCMEI.pdf") for n in nomes)
        notas_csv = zf.read("notas_fiscais.csv").decode("latin-1")
        assert "55" in notas_csv and "1234,50" in notas_csv


def test_export_empresa_exige_o_modulo(client, db_session):
    _create_user(db_session, "so_export", "senha", modules=("exportar_dados",))
    headers = _login_headers(client, "so_export", "senha")
    assert client.get("/export/empresa", headers=headers).status_code == 403


def test_excluir_usuario_apaga_dados_da_empresa(client, db_session, master_headers):
    alvo = _create_user(db_session, "alvo", "senha")
    headers = _login_headers(client, "alvo", "senha")
    _criar_empresa(client, headers)
    client.post("/empresa/notas", headers=headers, json=_nota())

    assert client.delete(f"/auth/users/{alvo.id}", headers=master_headers).status_code == 204
    for model in (models.Empresa, models.NotaFiscal):
        assert db_session.query(model).filter_by(user_id=alvo.id).count() == 0


# --- Declaração anual (DASN-SIMEI) ---

def _cenario_declaracao(client, headers):
    """Abertura em 16/10/2025; nota 2 substituída pela 5; falta a nota 3 na sequência."""
    _criar_empresa(client, headers, abertura="2025-10-16")
    for payload in (
        _nota("1", 1000.0, "2025-11-01"),
        _nota("2", 500.0, "2025-12-01", chave_acesso="1" * 50),
        _nota("4", 300.0, "2026-01-01"),
        _nota("5", 600.0, "2025-12-01", chave_acesso="9" * 50, substitui_chave="1" * 50),
    ):
        assert client.post("/empresa/notas", headers=headers, json=payload).status_code == 201


def test_declaracao_soma_pela_competencia_sem_substituidas(client, auth_headers, db_session):
    from app.declaracao_mei import montar_declaracao

    _cenario_declaracao(client, auth_headers)
    empresa = db_session.query(models.Empresa).one()
    dados = montar_declaracao(db_session, empresa, 2025, 100.0, date(2026, 3, 1))

    assert [n.numero for n in dados.notas] == ["1", "5"]
    assert dados.total_notas == 1600.0
    assert dados.receita_servicos == 1700.0  # + outras receitas sem nota
    assert [(n.numero, sub) for n, sub in dados.substituidas] == [("2", "5")]
    assert dados.periodo_inicio == date(2025, 10, 16)
    assert dados.por_mes == [(10, 0, 0.0), (11, 1, 1000.0), (12, 1, 600.0)]
    assert dados.limite == 6750.0 * 3
    assert dados.em_andamento is False
    assert any("Falta a nota nº 3" in aviso for aviso in dados.avisos)


def test_declaracao_avisa_ano_em_andamento_e_numeracao_nos_dois_anos(client, auth_headers, db_session):
    from app.declaracao_mei import montar_declaracao

    _cenario_declaracao(client, auth_headers)
    empresa = db_session.query(models.Empresa).one()
    dados = montar_declaracao(db_session, empresa, 2026, 0.0, date(2026, 3, 1))

    assert dados.total_notas == 300.0
    assert dados.periodo_inicio == date(2026, 1, 1)
    assert len(dados.por_mes) == 12
    assert dados.em_andamento is True
    assert any("ainda não terminou" in aviso for aviso in dados.avisos)
    assert any("Falta a nota nº 3" in aviso for aviso in dados.avisos)


def test_declaracao_avisa_limite_excedido(client, auth_headers, db_session):
    from app.declaracao_mei import montar_declaracao

    _criar_empresa(client, auth_headers, abertura="2020-01-01")
    client.post("/empresa/notas", headers=auth_headers, json=_nota("1", 90_000.0, "2024-06-01"))
    empresa = db_session.query(models.Empresa).one()
    dados = montar_declaracao(db_session, empresa, 2024, 0.0, date(2026, 3, 1))

    assert dados.situacao == "excedido_ate_20"
    assert any("Passou do limite" in aviso for aviso in dados.avisos)


def test_declaracao_anual_gera_pdf(client, auth_headers):
    _cenario_declaracao(client, auth_headers)
    response = client.get(
        "/empresa/declaracao-anual",
        headers=auth_headers,
        params={"ano": 2025, "empregado": "false", "outras_receitas": 460.89},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert 'filename="declaracao-anual-mei-2025.pdf"' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


@pytest.mark.parametrize(
    "params, esperado",
    [
        ({"ano": 2024}, 400),  # antes da abertura
        ({"ano": today_local().year + 1}, 400),  # ano que não começou
        ({"ano": 2025, "outras_receitas": -1}, 422),
        ({}, 422),
    ],
)
def test_declaracao_anual_valida_parametros(client, auth_headers, params, esperado):
    _criar_empresa(client, auth_headers, abertura="2025-10-16")
    assert client.get("/empresa/declaracao-anual", headers=auth_headers, params=params).status_code == esperado


def test_declaracao_anual_exige_empresa(client, auth_headers):
    assert client.get("/empresa/declaracao-anual", headers=auth_headers, params={"ano": 2025}).status_code == 400
