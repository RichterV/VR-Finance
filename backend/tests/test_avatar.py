import io

import pytest
from PIL import Image

from app import models
from tests.conftest import _create_user, _login_headers


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.avatars.settings.upload_dir", str(tmp_path))
    return tmp_path


def _image_bytes(fmt="JPEG", size=(800, 600), color=(120, 180, 150), exif_gps=False) -> bytes:
    img = Image.new("RGBA" if fmt == "PNG" else "RGB", size, color)
    out = io.BytesIO()
    kwargs = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x010F] = "MarcaDoCelular"  # Make
        exif[0x8825] = {1: "S", 2: (23.0, 33.0, 0.0)}  # GPSInfo
        kwargs["exif"] = exif
    img.save(out, format=fmt, **kwargs)
    return out.getvalue()


def _upload(client, headers, data: bytes, name="foto.jpg", content_type="image/jpeg"):
    return client.put("/auth/me/avatar", headers=headers, files={"file": (name, io.BytesIO(data), content_type)})


def test_user_starts_without_avatar(client, auth_headers):
    me = client.get("/auth/me", headers=auth_headers).json()
    assert me["avatar_version"] is None
    assert client.get("/auth/me/avatar", headers=auth_headers).status_code == 404


def test_upload_normalizes_to_square_jpeg_and_serves_it(client, auth_headers, _isolated_upload_dir):
    response = _upload(client, auth_headers, _image_bytes(size=(1200, 800)))
    assert response.status_code == 200
    assert response.json()["avatar_version"] is not None

    served = client.get("/auth/me/avatar", headers=auth_headers)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    img = Image.open(io.BytesIO(served.content))
    assert img.format == "JPEG"
    assert img.size == (512, 512)
    assert len(list((_isolated_upload_dir / "avatars").iterdir())) == 1


def test_upload_strips_exif_metadata(client, auth_headers):
    _upload(client, auth_headers, _image_bytes(exif_gps=True))
    served = client.get("/auth/me/avatar", headers=auth_headers)
    img = Image.open(io.BytesIO(served.content))
    assert len(img.getexif()) == 0
    assert "exif" not in img.info


def test_png_with_transparency_is_accepted(client, auth_headers):
    response = _upload(client, auth_headers, _image_bytes(fmt="PNG"), name="foto.png", content_type="image/png")
    assert response.status_code == 200


def test_rejects_files_that_are_not_images(client, auth_headers):
    response = _upload(client, auth_headers, b"%PDF-1.4 nao e foto", name="foto.jpg")
    assert response.status_code == 400
    assert client.get("/auth/me", headers=auth_headers).json()["avatar_version"] is None


def test_rejects_unsupported_image_format(client, auth_headers):
    response = _upload(client, auth_headers, _image_bytes(fmt="GIF"), name="foto.gif", content_type="image/gif")
    assert response.status_code == 400
    assert "JPEG, PNG ou WebP" in response.json()["detail"]


def test_replacing_removes_the_old_file(client, auth_headers, _isolated_upload_dir):
    first = _upload(client, auth_headers, _image_bytes(color=(10, 10, 10))).json()
    _upload(client, auth_headers, _image_bytes(color=(200, 10, 10)))
    files = list((_isolated_upload_dir / "avatars").iterdir())
    assert len(files) == 1
    assert first["avatar_version"] is not None


def test_delete_removes_photo_and_file(client, auth_headers, _isolated_upload_dir):
    _upload(client, auth_headers, _image_bytes())
    response = client.delete("/auth/me/avatar", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["avatar_version"] is None
    assert list((_isolated_upload_dir / "avatars").iterdir()) == []
    assert client.get("/auth/me/avatar", headers=auth_headers).status_code == 404


def test_only_master_reads_another_users_avatar(client, db_session, user, auth_headers, master_headers):
    _upload(client, auth_headers, _image_bytes())
    assert client.get(f"/auth/users/{user.id}/avatar", headers=master_headers).status_code == 200

    _create_user(db_session, "outro", "senha-outro")
    outro_headers = _login_headers(client, "outro", "senha-outro")
    assert client.get(f"/auth/users/{user.id}/avatar", headers=outro_headers).status_code == 403


def test_deleting_user_removes_avatar_file(client, user, auth_headers, master_headers, _isolated_upload_dir):
    _upload(client, auth_headers, _image_bytes())
    assert client.delete(f"/auth/users/{user.id}", headers=master_headers).status_code == 204
    assert list((_isolated_upload_dir / "avatars").iterdir()) == []


def test_avatar_requires_login(client):
    assert client.put("/auth/me/avatar", files={"file": ("f.jpg", io.BytesIO(_image_bytes()), "image/jpeg")}).status_code == 401


def test_avatar_version_is_listed_for_master(client, user, auth_headers, master_headers, db_session):
    _upload(client, auth_headers, _image_bytes())
    users = client.get("/auth/users", headers=master_headers).json()
    alvo = next(u for u in users if u["id"] == user.id)
    assert alvo["avatar_version"] == db_session.get(models.User, user.id).avatar_version
