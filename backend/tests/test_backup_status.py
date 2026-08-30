from datetime import datetime, timezone

import pytest


@pytest.fixture(autouse=True)
def _isolated_marker_file(tmp_path, monkeypatch):
    marker = tmp_path / "last_backup.txt"
    monkeypatch.setattr("app.routers.backup_status.settings.backup_marker_file", str(marker))
    return marker


def test_no_marker_file_returns_null(client, master_headers):
    response = client.get("/backup-status", headers=master_headers)
    assert response.status_code == 200
    assert response.json() == {"last_backup_at": None}


def test_returns_timestamp_from_marker_file(client, master_headers, _isolated_marker_file):
    when = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc)
    _isolated_marker_file.write_text(when.isoformat())

    response = client.get("/backup-status", headers=master_headers)
    assert response.status_code == 200
    assert datetime.fromisoformat(response.json()["last_backup_at"].replace("Z", "+00:00")) == when


def test_invalid_marker_file_content_returns_null(client, master_headers, _isolated_marker_file):
    _isolated_marker_file.write_text("nao e uma data")

    response = client.get("/backup-status", headers=master_headers)
    assert response.status_code == 200
    assert response.json() == {"last_backup_at": None}


def test_restricted_to_master(client, auth_headers):
    response = client.get("/backup-status", headers=auth_headers)
    assert response.status_code == 403
