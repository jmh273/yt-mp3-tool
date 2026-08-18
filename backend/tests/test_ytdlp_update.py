"""yt-dlp 受管版本載入與更新機制測試（download-403-resilience）"""
import importlib
import sys
from unittest.mock import patch

import pytest
import main
import ytdlp_loader


# ── 載入優先序與保底 ─────────────────────────────────────────────────────────
def test_no_managed_version_uses_bundled(tmp_path, monkeypatch):
    monkeypatch.setattr(ytdlp_loader, "MANAGED_ROOT", tmp_path / "absent")
    monkeypatch.setattr(ytdlp_loader, "_active_source", "bundled")
    monkeypatch.setitem(sys.modules, "yt_dlp", None)
    del sys.modules["yt_dlp"]
    try:
        assert ytdlp_loader.activate_managed_ytdlp() == "bundled"
    finally:
        importlib.import_module("yt_dlp")


def test_managed_version_none_when_absent(tmp_path, monkeypatch):
    monkeypatch.setattr(ytdlp_loader, "MANAGED_ROOT", tmp_path / "absent")
    assert ytdlp_loader.managed_version() is None


def test_managed_version_read_from_version_py(tmp_path, monkeypatch):
    root = tmp_path / "lib"
    (root / "yt_dlp").mkdir(parents=True)
    (root / "yt_dlp" / "version.py").write_text('__version__ = "2026.07.04"\n', encoding="utf-8")
    monkeypatch.setattr(ytdlp_loader, "MANAGED_ROOT", root)
    assert ytdlp_loader.managed_version() == "2026.07.04"


def test_activate_is_noop_once_yt_dlp_loaded(monkeypatch):
    """yt_dlp 已載入後不得假裝切換成功——回報現況即可。"""
    monkeypatch.setattr(ytdlp_loader, "_active_source", "bundled")
    assert "yt_dlp" in sys.modules
    assert ytdlp_loader.activate_managed_ytdlp() == "bundled"


def test_revert_removes_managed_dir(tmp_path, monkeypatch):
    root = tmp_path / "lib"
    (root / "yt_dlp").mkdir(parents=True)
    monkeypatch.setattr(ytdlp_loader, "MANAGED_ROOT", root)
    ytdlp_loader.revert_to_bundled()
    assert not root.exists()


# ── 安裝：成組更新與失敗不破壞既有安裝 ───────────────────────────────────────
def test_install_requires_both_packages(tmp_path, monkeypatch):
    """只裝到其中一個就必須視為失敗，不得換掉可用的舊版本。"""
    existing = tmp_path / "lib"
    (existing / "yt_dlp").mkdir(parents=True)
    (existing / "yt_dlp" / "__init__.py").write_text("# old", encoding="utf-8")
    monkeypatch.setattr(ytdlp_loader, "MANAGED_ROOT", existing)

    def fake_json(url, timeout=15.0):
        name = "yt-dlp-ejs" if "yt-dlp-ejs" in url else "yt-dlp"
        return {
            "info": {"version": "9.9.9"},
            "urls": [{"packagetype": "bdist_wheel",
                      "filename": f"{name}-9.9.9-py3-none-any.whl",
                      "url": f"https://example/{name}.whl"}],
        }

    import io, zipfile

    def fake_urlopen(req, timeout=120):
        # 回傳只含 yt_dlp（缺 yt_dlp_ejs）的 wheel
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("yt_dlp/__init__.py", "")
            z.writestr("yt_dlp/version.py", '__version__ = "9.9.9"')
        buf.seek(0)

        class R:
            def read(self_inner): return buf.getvalue()
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *a): return False
        return R()

    monkeypatch.setattr(ytdlp_loader, "_fetch_json", fake_json)
    with patch("urllib.request.urlopen", fake_urlopen):
        with pytest.raises(RuntimeError, match="yt_dlp_ejs"):
            ytdlp_loader.install_managed()

    # 既有安裝必須原封不動
    assert (existing / "yt_dlp" / "__init__.py").read_text(encoding="utf-8") == "# old"


# ── 端點 ────────────────────────────────────────────────────────────────────
async def test_version_endpoint_reports_source_and_runtime(client):
    r = await client.get("/ytdlp/version")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] in ("managed", "bundled")
    assert "yt_dlp" in body and "js_runtime" in body


async def test_latest_endpoint_degrades_gracefully_offline(client, monkeypatch):
    """離線時須降級為『無法查詢』，不得讓既有安裝進入不可用狀態。"""
    def boom():
        raise OSError("no network")
    monkeypatch.setattr(ytdlp_loader, "latest_versions", boom)

    r = await client.get("/ytdlp/latest")
    assert r.status_code == 200
    assert r.json()["available"] is False
    assert "無法查詢" in r.json()["error"]


async def test_update_endpoint_reports_failure_without_breaking(client, monkeypatch):
    def boom():
        raise RuntimeError("下載中斷")
    monkeypatch.setattr(ytdlp_loader, "install_managed", boom)

    r = await client.post("/ytdlp/update")
    assert r.status_code == 502
    assert "維持目前版本" in r.json()["detail"]


async def test_update_endpoint_installs_both(client, monkeypatch):
    monkeypatch.setattr(
        ytdlp_loader, "install_managed",
        lambda: {"yt_dlp": "2026.7.4", "yt_dlp_ejs": "0.8.0"},
    )
    r = await client.post("/ytdlp/update")
    assert r.status_code == 200
    assert r.json()["installed"] == {"yt_dlp": "2026.7.4", "yt_dlp_ejs": "0.8.0"}
    assert r.json()["restart_required"] is True


async def test_revert_endpoint(client, monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(ytdlp_loader, "revert_to_bundled", lambda: called.__setitem__("n", 1))
    r = await client.post("/ytdlp/revert")
    assert r.status_code == 200
    assert called["n"] == 1
