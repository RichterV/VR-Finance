import io
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app import models
from app.config import settings
from app.login_guard import JANELA_USUARIO_S, LoginGuard
from app.security import ALGORITHM
from tests.conftest import _create_user, _login_headers


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.attachments.settings.upload_dir", str(tmp_path))


def _login(client, username, password):
    return client.post("/auth/login", data={"username": username, "password": password})


# --- Limite de tentativas de login ---


def test_bloqueia_depois_de_5_falhas_mesmo_com_senha_certa(client, user, user_password):
    for _ in range(5):
        assert _login(client, user.username, "errada").status_code == 401

    response = _login(client, user.username, user_password)

    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    assert "Muitas tentativas" in response.json()["detail"]


def test_login_certo_antes_do_limite_zera_o_contador(client, user, user_password):
    for _ in range(4):
        _login(client, user.username, "errada")
    assert _login(client, user.username, user_password).status_code == 200
    for _ in range(4):
        assert _login(client, user.username, "errada").status_code == 401


def test_username_conta_sem_diferenciar_maiusculas(client, user, user_password):
    for _ in range(5):
        _login(client, user.username.upper(), "errada")
    assert _login(client, user.username, user_password).status_code == 429


def test_usuario_inexistente_tambem_conta(client):
    for _ in range(5):
        assert _login(client, "fantasma", "x").status_code == 401
    assert _login(client, "fantasma", "x").status_code == 429


def test_janela_expira():
    agora = [1000.0]
    guard = LoginGuard(clock=lambda: agora[0])
    for _ in range(5):
        guard.register_failure("ana")
    with pytest.raises(Exception):
        guard.check("ana")
    agora[0] += JANELA_USUARIO_S
    guard.check("ana")  # não levanta


# --- Revogação de token ---


def test_troca_de_senha_revoga_tokens_antigos(client, user, user_password):
    antigo = _login_headers(client, user.username, user_password)
    outro_aparelho = _login_headers(client, user.username, user_password)

    response = client.put(
        "/auth/me/password",
        json={"current_password": user_password, "new_password": "senha-nova-123"},
        headers=antigo,
    )

    assert response.status_code == 200
    assert client.get("/auth/me", headers=antigo).status_code == 401
    assert client.get("/auth/me", headers=outro_aparelho).status_code == 401
    novo = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/auth/me", headers=novo).status_code == 200


def test_reset_pelo_master_revoga_tokens_do_usuario(client, master_headers, user, user_password):
    headers = _login_headers(client, user.username, user_password)
    client.put(
        f"/auth/users/{user.id}",
        json={"username": user.username, "first_name": "A", "last_name": "B", "password": "resetada123"},
        headers=master_headers,
    )
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_token_de_usuario_excluido_nao_vale_pra_conta_recriada(client, master_headers, db_session):
    antigo = _create_user(db_session, "reciclado", "senha-1")
    headers = _login_headers(client, "reciclado", "senha-1")
    assert client.delete(f"/auth/users/{antigo.id}", headers=master_headers).status_code == 204

    _create_user(db_session, "reciclado", "senha-2")

    assert client.get("/auth/me", headers=headers).status_code == 401


def test_token_legado_sem_versao_nao_vale(client, user):
    expire = datetime.now(timezone.utc) + timedelta(days=1)
    legado = jwt.encode({"sub": user.username, "exp": expire}, settings.secret_key, algorithm=ALGORITHM)
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {legado}"}).status_code == 401


# --- Upload: tipo real do arquivo ---


def _gasto(client, headers):
    item = client.post("/dropdown-options", json={"priority": "essencial", "name": "Casa"}, headers=headers).json()
    return client.post(
        "/gastos", json={"priority": "essencial", "item_id": item["id"], "value": 10}, headers=headers
    ).json()[0]


def _upload(client, headers, gasto_id, name, content, content_type):
    return client.post(
        "/attachments/upload",
        data={"entity_type": "gasto", "entity_id": str(gasto_id)},
        files={"file": (name, io.BytesIO(content), content_type)},
        headers=headers,
    )


def test_png_declarado_como_pdf_e_rejeitado(client, auth_headers):
    gasto = _gasto(client, auth_headers)
    response = _upload(client, auth_headers, gasto["id"], "nota.pdf", b"\x89PNG\r\n\x1a\nxxxx", "application/pdf")
    assert response.status_code == 400


def test_html_declarado_como_imagem_e_rejeitado(client, auth_headers):
    gasto = _gasto(client, auth_headers)
    response = _upload(client, auth_headers, gasto["id"], "x.png", b"<html><script>", "image/png")
    assert response.status_code == 400


@pytest.mark.parametrize(
    ("content", "content_type"),
    [
        (b"\xff\xd8\xff\xe0jpeg", "image/jpeg"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"),
        (b"\x00\x00\x00\x18ftypheic....", "image/heic"),
    ],
)
def test_assinaturas_validas_passam(client, auth_headers, content, content_type):
    gasto = _gasto(client, auth_headers)
    assert _upload(client, auth_headers, gasto["id"], "foto", content, content_type).status_code == 201


def test_nome_do_anexo_sem_diretorios(client, auth_headers):
    gasto = _gasto(client, auth_headers)
    response = _upload(client, auth_headers, gasto["id"], "../../etc/passwd.pdf", b"%PDF-1.4", "application/pdf")
    assert response.status_code == 201
    assert response.json()["original_filename"] == "passwd.pdf"


def test_respostas_tem_nosniff(client):
    assert client.get("/health").headers["X-Content-Type-Options"] == "nosniff"


def test_login_nao_revela_usuario_inexistente_pelo_codigo(client):
    response = _login(client, "nao-existe", "x")
    assert response.status_code == 401
    assert response.json()["detail"] == "Usuário ou senha inválidos"


def test_modelo_tem_token_version_zero_por_padrao(db_session):
    user = _create_user(db_session, "novo-tv", "senha")
    assert user.token_version == 0
    assert isinstance(db_session.get(models.User, user.id).token_version, int)
