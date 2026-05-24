import pathlib
import pytest
import main
from httpx import AsyncClient, ASGITransport


@pytest.fixture(autouse=True)
def isolate_config(tmp_path: pathlib.Path, monkeypatch):
    """每個測試使用獨立的 tmp 目錄，避免互相影響真實設定檔。"""
    token = tmp_path / "token.json"
    settings = tmp_path / "settings.json"
    discovery_dir = tmp_path / "discovery_profiles"
    discovery_dir.mkdir(exist_ok=True)
    monkeypatch.setattr(main, "TOKEN_FILE", token)
    monkeypatch.setattr(main, "SETTINGS_FILE", settings)
    monkeypatch.setattr(main, "DISCOVERY_PROFILES_DIR", discovery_dir)
    # 清空全域進度狀態
    main.download_progress.clear()
    main.normalize_progress.clear()
    main._active_normalize_dirs.clear()
    if hasattr(main, "discovery_cache"):
        main.discovery_cache.clear()
    yield


@pytest.fixture
def client():
    return AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test")
