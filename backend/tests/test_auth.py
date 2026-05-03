"""Auth 相關端點測試"""
import json
import pathlib
from unittest.mock import MagicMock, patch

import pytest
import main


# ── 工具：建立假 token 檔 ─────────────────────────────────────────────────────
def write_fake_token(token_file: pathlib.Path):
    token_file.write_text(json.dumps({
        "token": "fake-access-token",
        "refresh_token": "fake-refresh-token",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "fake-client-id",
        "client_secret": "fake-client-secret",
        "scopes": ["https://www.googleapis.com/auth/youtube.readonly"],
    }))


# ── /auth/status ──────────────────────────────────────────────────────────────
async def test_auth_status_not_logged_in(client):
    """未登入時回傳 logged_in: false"""
    async with client as c:
        r = await c.get("/auth/status")
    assert r.status_code == 200
    assert r.json() == {"logged_in": False}


async def test_auth_status_logged_in(client, monkeypatch):
    """有有效 token 時回傳 logged_in: true"""
    write_fake_token(main.TOKEN_FILE)

    mock_creds = MagicMock()
    mock_creds.valid = True
    mock_creds.expired = False

    with patch("main.Credentials.from_authorized_user_file", return_value=mock_creds):
        async with client as c:
            r = await c.get("/auth/status")

    assert r.status_code == 200
    assert r.json() == {"logged_in": True}


async def test_auth_status_expired_no_refresh(client, monkeypatch):
    """token 過期且無 refresh_token → logged_in: false"""
    write_fake_token(main.TOKEN_FILE)

    mock_creds = MagicMock()
    mock_creds.valid = False
    mock_creds.expired = True
    mock_creds.refresh_token = None

    with patch("main.Credentials.from_authorized_user_file", return_value=mock_creds):
        async with client as c:
            r = await c.get("/auth/status")

    assert r.json() == {"logged_in": False}


# ── /auth/logout ──────────────────────────────────────────────────────────────
async def test_logout_removes_token(client):
    """登出後 token 檔案應被刪除"""
    write_fake_token(main.TOKEN_FILE)
    assert main.TOKEN_FILE.exists()

    async with client as c:
        r = await c.post("/auth/logout")

    assert r.status_code == 200
    assert r.json() == {"message": "已登出"}
    assert not main.TOKEN_FILE.exists()


async def test_logout_without_token(client):
    """未登入時登出不應報錯"""
    assert not main.TOKEN_FILE.exists()
    async with client as c:
        r = await c.post("/auth/logout")
    assert r.status_code == 200


# ── /auth/login ───────────────────────────────────────────────────────────────
async def test_login_missing_client_secret(client, monkeypatch):
    """缺少 client_secret.json 時回傳 500"""
    monkeypatch.setattr(main, "CLIENT_SECRET_FILE", pathlib.Path("/nonexistent/client_secret.json"))
    async with client as c:
        r = await c.get("/auth/login")
    assert r.status_code == 500
    assert "client_secret.json" in r.json()["detail"]


async def test_login_starts_oauth_thread(client, tmp_path, monkeypatch):
    """有 client_secret.json 時應啟動背景 OAuth 流程並回傳訊息"""
    secret = tmp_path / "client_secret.json"
    secret.write_text(json.dumps({
        "installed": {
            "client_id": "fake.apps.googleusercontent.com",
            "client_secret": "fake-secret",
            "redirect_uris": ["http://localhost"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }))
    monkeypatch.setattr(main, "CLIENT_SECRET_FILE", secret)

    fake_creds = MagicMock()
    fake_creds.to_json.return_value = json.dumps({"token": "t"})

    with patch("main.InstalledAppFlow.from_client_secrets_file") as mock_flow_cls:
        mock_flow = MagicMock()
        mock_flow.run_local_server.return_value = fake_creds
        mock_flow_cls.return_value = mock_flow

        async with client as c:
            r = await c.get("/auth/login")

    assert r.status_code == 200
    data = r.json()
    assert "message" in data
