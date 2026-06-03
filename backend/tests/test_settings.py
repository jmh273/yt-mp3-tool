"""Settings 端點與工具函式測試"""
import json
import pathlib

import pytest
import main


# ── load_settings ─────────────────────────────────────────────────────────────
def test_load_settings_defaults():
    """無設定檔時回傳預設值"""
    assert not main.SETTINGS_FILE.exists()
    s = main.load_settings()
    assert s["videos_per_channel"] == 5
    assert "YT-MP3" in s["output_path"]
    assert s["drive_root_folder"] == "YT-MP3"


def test_load_settings_merges_file(tmp_path):
    """設定檔存在時合併覆蓋預設值"""
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text(json.dumps({"videos_per_channel": 10}))
    s = main.load_settings()
    assert s["videos_per_channel"] == 10
    assert "YT-MP3" in s["output_path"]  # 預設值保留


# ── GET /settings ─────────────────────────────────────────────────────────────
async def test_get_settings_defaults(client):
    """GET /settings 回傳預設設定"""
    async with client as c:
        r = await c.get("/settings")
    assert r.status_code == 200
    data = r.json()
    assert data["videos_per_channel"] == 5
    assert "output_path" in data
    assert data["drive_root_folder"] == "YT-MP3"
    assert data["download_concurrency"] == 3
    assert data["drive_upload_concurrency"] == 3


# ── PUT /settings ─────────────────────────────────────────────────────────────
async def test_put_settings_videos_per_channel(client):
    """PUT /settings 更新 videos_per_channel"""
    async with client as c:
        r = await c.put("/settings", json={"videos_per_channel": 8})
    assert r.status_code == 200
    assert r.json()["videos_per_channel"] == 8


async def test_put_settings_output_path_creates_dir(client, tmp_path):
    """PUT /settings 指定新路徑時自動建立資料夾"""
    new_path = str(tmp_path / "new_music" / "yt")
    async with client as c:
        r = await c.put("/settings", json={"output_path": new_path})
    assert r.status_code == 200
    assert pathlib.Path(new_path).exists()
    assert r.json()["output_path"] == new_path


async def test_put_settings_partial_update(client):
    """PUT /settings 只傳一個欄位，另一個欄位維持不變"""
    # 先設定初始值
    async with client as c:
        await c.put("/settings", json={"videos_per_channel": 7})
        r = await c.put("/settings", json={"videos_per_channel": None})
    # videos_per_channel 沒傳，應維持預設
    assert r.json()["videos_per_channel"] == 7


async def test_put_settings_persisted(client):
    """PUT /settings 儲存後，GET /settings 應看到新值"""
    async with client as c:
        await c.put("/settings", json={"videos_per_channel": 3})
        r = await c.get("/settings")
    assert r.json()["videos_per_channel"] == 3


async def test_put_settings_drive_root_folder(client):
    async with client as c:
        r = await c.put("/settings", json={"drive_root_folder": "音樂庫"})
        r2 = await c.get("/settings")
    assert r.status_code == 200
    assert r.json()["drive_root_folder"] == "音樂庫"
    assert r2.json()["drive_root_folder"] == "音樂庫"


async def test_put_settings_download_concurrency_valid(client):
    async with client as c:
        r = await c.put("/settings", json={"download_concurrency": 4})
        r2 = await c.get("/settings")
    assert r.status_code == 200
    assert r.json()["download_concurrency"] == 4
    assert r2.json()["download_concurrency"] == 4


async def test_put_settings_download_concurrency_too_low(client):
    async with client as c:
        r = await c.put("/settings", json={"download_concurrency": 0})
    assert r.status_code == 422


async def test_put_settings_download_concurrency_too_high(client):
    async with client as c:
        r = await c.put("/settings", json={"download_concurrency": 99})
    assert r.status_code == 422


async def test_put_settings_drive_upload_concurrency_valid(client):
    async with client as c:
        r = await c.put("/settings", json={"drive_upload_concurrency": 4})
        r2 = await c.get("/settings")
    assert r.status_code == 200
    assert r.json()["drive_upload_concurrency"] == 4
    assert r2.json()["drive_upload_concurrency"] == 4


async def test_put_settings_drive_upload_concurrency_too_low(client):
    async with client as c:
        r = await c.put("/settings", json={"drive_upload_concurrency": 0})
    assert r.status_code == 422


async def test_put_settings_drive_upload_concurrency_too_high(client):
    async with client as c:
        r = await c.put("/settings", json={"drive_upload_concurrency": 99})
    assert r.status_code == 422


async def test_put_settings_rejects_blank_drive_root_folder(client):
    async with client as c:
        r = await c.put("/settings", json={"drive_root_folder": "   "})
    assert r.status_code == 422


async def test_put_settings_latest_hours_valid(client):
    """PUT /settings latest_hours 在有效範圍內應更新成功"""
    async with client as c:
        r = await c.put("/settings", json={"latest_hours": 48})
    assert r.status_code == 200
    assert r.json()["latest_hours"] == 48


async def test_put_settings_latest_hours_min_boundary(client):
    """PUT /settings latest_hours=1 為下限，應接受"""
    async with client as c:
        r = await c.put("/settings", json={"latest_hours": 1})
    assert r.status_code == 200
    assert r.json()["latest_hours"] == 1


async def test_put_settings_latest_hours_max_boundary(client):
    """PUT /settings latest_hours=168 為上限，應接受"""
    async with client as c:
        r = await c.put("/settings", json={"latest_hours": 168})
    assert r.status_code == 200
    assert r.json()["latest_hours"] == 168


async def test_put_settings_latest_hours_too_low(client):
    """PUT /settings latest_hours=0 超出下限，應回傳 422"""
    async with client as c:
        r = await c.put("/settings", json={"latest_hours": 0})
    assert r.status_code == 422


async def test_put_settings_latest_hours_too_high(client):
    """PUT /settings latest_hours=169 超出上限，應回傳 422"""
    async with client as c:
        r = await c.put("/settings", json={"latest_hours": 169})
    assert r.status_code == 422


# ── normalize_target_db ───────────────────────────────────────────────────────
async def test_get_settings_normalize_target_db_default(client):
    """GET /settings 預設 normalize_target_db=89.0 (mp3gain ReplayGain reference)"""
    async with client as c:
        r = await c.get("/settings")
    assert r.json()["normalize_target_db"] == 89.0


async def test_put_settings_normalize_target_db_valid(client):
    """PUT /settings normalize_target_db=92.0 應更新並持久化"""
    async with client as c:
        r1 = await c.put("/settings", json={"normalize_target_db": 92.0})
        r2 = await c.get("/settings")
    assert r1.status_code == 200
    assert r1.json()["normalize_target_db"] == 92.0
    assert r2.json()["normalize_target_db"] == 92.0


async def test_put_settings_normalize_target_db_min_boundary(client):
    """PUT /settings normalize_target_db=80.0 為下限，應接受"""
    async with client as c:
        r = await c.put("/settings", json={"normalize_target_db": 80.0})
    assert r.status_code == 200
    assert r.json()["normalize_target_db"] == 80.0


async def test_put_settings_normalize_target_db_max_boundary(client):
    """PUT /settings normalize_target_db=100.0 為上限，應接受"""
    async with client as c:
        r = await c.put("/settings", json={"normalize_target_db": 100.0})
    assert r.status_code == 200
    assert r.json()["normalize_target_db"] == 100.0


async def test_put_settings_normalize_target_db_too_high(client):
    """PUT /settings normalize_target_db=105.0 超出上限，應回傳 422"""
    async with client as c:
        r = await c.put("/settings", json={"normalize_target_db": 105.0})
    assert r.status_code == 422


async def test_put_settings_normalize_target_db_too_low(client):
    """PUT /settings normalize_target_db=75.0 超出下限，應回傳 422"""
    async with client as c:
        r = await c.put("/settings", json={"normalize_target_db": 75.0})
    assert r.status_code == 422


# ── Tolerant load_settings ───────────────────────────────────────────────────
def test_load_settings_resets_legacy_lufs_value():
    """舊版 LUFS = -14（在新版 dB SPL 80–100 範圍外）→ 載入時 reset 成預設 89.0"""
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text(json.dumps({"normalize_target_db": -14.0}))
    s = main.load_settings()
    assert s["normalize_target_db"] == 89.0


def test_load_settings_resets_wrong_type():
    """videos_per_channel 是字串 → reset 成預設"""
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text(json.dumps({"videos_per_channel": "five"}))
    s = main.load_settings()
    assert s["videos_per_channel"] == 5


def test_load_settings_preserves_unknown_legacy_key():
    """未知 key（早期版本留下的）應保留在 dict 中、不報錯"""
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text(json.dumps({"removed_old_setting": "something"}))
    s = main.load_settings()
    assert s["removed_old_setting"] == "something"


def test_load_settings_passes_through_in_range_value():
    """合法值原樣回傳，不亂改"""
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text(json.dumps({"normalize_target_db": 92.0}))
    s = main.load_settings()
    assert s["normalize_target_db"] == 92.0


def test_load_settings_does_not_reset_out_of_range_concurrency():
    """download_concurrency 不在 _SETTINGS_RANGES：load_settings 須原樣保留越界值，
    交由 _resolve_concurrency 夾限（0→1、99→8），而非 reset 成預設 3。"""
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text(json.dumps({"download_concurrency": 99}))
    s = main.load_settings()
    assert s["download_concurrency"] == 99
    assert main._resolve_concurrency(s) == 8


def test_resolve_drive_upload_concurrency_clamps_and_falls_back():
    assert main._resolve_drive_upload_concurrency({}) == 3
    assert main._resolve_drive_upload_concurrency({"drive_upload_concurrency": 0}) == 1
    assert main._resolve_drive_upload_concurrency({"drive_upload_concurrency": 99}) == 8
    assert main._resolve_drive_upload_concurrency({"drive_upload_concurrency": 5}) == 5
    assert main._resolve_drive_upload_concurrency({"drive_upload_concurrency": "abc"}) == 3
    assert main._resolve_drive_upload_concurrency({"drive_upload_concurrency": None}) == 3


def test_load_settings_does_not_reset_out_of_range_drive_upload_concurrency():
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text(json.dumps({"drive_upload_concurrency": 99}))
    s = main.load_settings()
    assert s["drive_upload_concurrency"] == 99
    assert main._resolve_drive_upload_concurrency(s) == 8


def test_load_settings_handles_corrupt_json():
    """設定檔內容不是合法 JSON → 全部 reset 成預設、不報錯"""
    main.SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_FILE.write_text("{ broken json")
    s = main.load_settings()
    assert s["normalize_target_db"] == 89.0
    assert s["videos_per_channel"] == 5


# ── /version endpoint ────────────────────────────────────────────────────────
async def test_version_endpoint(client):
    """GET /version 回傳 {version: __version__}"""
    async with client as c:
        r = await c.get("/version")
    assert r.status_code == 200
    body = r.json()
    assert "version" in body
    # 在 dev 環境（沒有 _version.txt）應該是 0.0.0-dev；CI build 會是真實版號
    assert body["version"] == main.__version__
