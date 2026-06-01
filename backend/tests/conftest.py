import pathlib
import pytest
import main
from httpx import AsyncClient, ASGITransport


@pytest.fixture(autouse=True)
def isolate_config(tmp_path: pathlib.Path, monkeypatch):
    """每個測試使用獨立的 tmp 目錄，避免互相影響真實設定檔。"""
    token = tmp_path / "token.json"
    tokens_dir = tmp_path / "tokens"
    current_account = tmp_path / "current_account.txt"
    settings = tmp_path / "settings.json"
    discovery_dir = tmp_path / "discovery_profiles"
    tokens_dir.mkdir(exist_ok=True)
    discovery_dir.mkdir(exist_ok=True)
    monkeypatch.setattr(main, "TOKEN_FILE", token)
    monkeypatch.setattr(main, "TOKENS_DIR", tokens_dir)
    monkeypatch.setattr(main, "CURRENT_ACCOUNT_FILE", current_account)
    monkeypatch.setattr(main, "SETTINGS_FILE", settings)
    monkeypatch.setattr(main, "DISCOVERY_PROFILES_DIR", discovery_dir)
    # 清空全域進度狀態
    main.download_progress.clear()
    main.normalize_progress.clear()
    if hasattr(main, "drive_upload_progress"):
        main.drive_upload_progress.clear()
    main._active_normalize_dirs.clear()
    if hasattr(main, "discovery_cache"):
        main.discovery_cache.clear()
    yield


@pytest.fixture
def client():
    return AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test")
