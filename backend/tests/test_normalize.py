"""音量正規化（mp3gain 引擎）端點與工具函式測試"""
import json
import pathlib
from unittest.mock import patch

import main


# ── _sanitize_filename ────────────────────────────────────────────────────────
def test_sanitize_filename_replaces_fullwidth_punctuation():
    s = main._sanitize_filename("馬斯克太空 AI 夢碎？「這一條線」｜EP.203")
    assert "？" not in s and "「" not in s and "」" not in s and "｜" not in s
    # CJK preserved
    assert "馬斯克太空" in s
    assert "EP.203" in s


def test_sanitize_filename_replaces_emoji_and_slash():
    s = main._sanitize_filename("重磅🔥分析 2026/05/01")
    assert "🔥" not in s
    assert "/" not in s
    assert "重磅" in s and "分析" in s


def test_sanitize_filename_preserves_cjk():
    assert main._sanitize_filename("台積電股價分析") == "台積電股價分析"


def test_sanitize_filename_collapses_underscores():
    s = main._sanitize_filename("a???b!!!c")
    assert "_" in s and "__" not in s


def test_sanitize_filename_truncates_to_120():
    long = "中" * 200
    out = main._sanitize_filename(long)
    assert len(out) <= 120


def test_sanitize_filename_empty_returns_untitled():
    assert main._sanitize_filename("") == "untitled"
    assert main._sanitize_filename("???") == "untitled"  # all replaced + stripped


def test_sanitize_filename_strips_trailing_dot_and_space():
    out = main._sanitize_filename("hello. ")
    assert not out.endswith(".") and not out.endswith(" ")


def test_sanitize_filename_drops_chars_not_in_system_codepage():
    """U+7287 (rare 犇 variant) is in CJK Unified Ideographs block but not in CP950.
    mp3gain.exe (Windows ANSI argv) fails on filenames containing it.
    The sanitizer MUST drop characters that the active system codepage cannot encode."""
    rare = chr(0x7287)
    # On a non-CP950 host this character may be encodable; only assert when it isn't.
    try:
        rare.encode(main._FS_ANSI_ENCODING)
        encodable_on_host = True
    except UnicodeEncodeError:
        encodable_on_host = False
    out = main._sanitize_filename(f"財富狂{rare}_玩股網")
    if not encodable_on_host:
        assert rare not in out
        assert "財富狂" in out and "玩股網" in out
    else:
        # Codepage supports it; sanitizer keeps it (no regression).
        assert rare in out


# ── _list_mp3s with needs_rename / suggested_name ────────────────────────────
def test_list_mp3s_safe_files_have_no_rename(tmp_path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    (tmp_path / "another-song.mp3").write_bytes(b"x")
    files = main._list_mp3s(tmp_path)
    for f in files:
        assert f["needs_rename"] is False
        assert f["suggested_name"] == f["filename"]


def test_list_mp3s_unsafe_files_flagged(tmp_path):
    unsafe = "馬斯克太空 AI 夢碎？.mp3"
    (tmp_path / unsafe).write_bytes(b"x")
    files = main._list_mp3s(tmp_path)
    entry = next(f for f in files if f["filename"] == unsafe)
    assert entry["needs_rename"] is True
    assert "？" not in entry["suggested_name"]


def test_list_mp3s_collision_disambiguated(tmp_path):
    # Two files that sanitize to the same suggestion (trailing `_` stripped → both → "a.mp3")
    (tmp_path / "a？.mp3").write_bytes(b"x")
    (tmp_path / "a！.mp3").write_bytes(b"x")
    files = main._list_mp3s(tmp_path)
    suggestions = sorted(f["suggested_name"] for f in files)
    assert "a.mp3" in suggestions
    assert any(s.startswith("a-") for s in suggestions)


def test_list_mp3s_excludes_subdir(tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "nested.mp3").write_bytes(b"x")
    files = main._list_mp3s(tmp_path)
    assert [f["filename"] for f in files] == ["a.mp3"]


def test_list_mp3s_includes_uppercase_extension(tmp_path):
    (tmp_path / "a.MP3").write_bytes(b"x")
    files = main._list_mp3s(tmp_path)
    assert any(f["filename"] == "a.MP3" for f in files)


# ── GET /normalize/list ──────────────────────────────────────────────────────
async def test_normalize_list_valid_dir(client, tmp_path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    async with client as c:
        r = await c.get("/normalize/list", params={"dir": str(tmp_path)})
    assert r.status_code == 200
    data = r.json()
    assert data["files"][0]["filename"] == "song.mp3"
    assert data["files"][0]["needs_rename"] is False


async def test_normalize_list_empty_dir(client, tmp_path):
    async with client as c:
        r = await c.get("/normalize/list", params={"dir": str(tmp_path)})
    assert r.status_code == 200
    assert r.json()["files"] == []


async def test_normalize_list_invalid_dir(client, tmp_path):
    bad = tmp_path / "does-not-exist"
    async with client as c:
        r = await c.get("/normalize/list", params={"dir": str(bad)})
    assert r.status_code == 400


# ── POST /normalize/start (validation) ───────────────────────────────────────
async def test_normalize_start_503_when_mp3gain_missing(client, tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    with patch("main.shutil.which", return_value=None):
        async with client as c:
            r = await c.post("/normalize/start", json={
                "directory": str(tmp_path),
                "filenames": ["a.mp3"],
            })
    assert r.status_code == 503
    assert "mp3gain" in r.json()["detail"]


async def test_normalize_start_422_when_target_db_out_of_range(client, tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    with patch("main.shutil.which", return_value="/usr/bin/mp3gain"):
        async with client as c:
            r = await c.post("/normalize/start", json={
                "directory": str(tmp_path),
                "filenames": ["a.mp3"],
                "target_db": 75.0,
            })
    assert r.status_code == 422


async def test_normalize_start_target_db_override_used(client, tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    with patch("main.shutil.which", return_value="/usr/bin/mp3gain"), \
         patch("main.asyncio.get_event_loop") as mock_loop:
        mock_loop.return_value.run_in_executor = lambda *a, **kw: None
        async with client as c:
            r = await c.post("/normalize/start", json={
                "directory": str(tmp_path),
                "filenames": ["a.mp3"],
                "target_db": 92.0,
            })
    assert r.status_code == 200
    task_id = r.json()["task_id"]
    item = main.normalize_progress[task_id]["items"]["a.mp3"]
    assert item["target_db"] == 92.0


async def test_normalize_start_400_when_dir_missing(client, tmp_path):
    bad = tmp_path / "nope"
    with patch("main.shutil.which", return_value="/usr/bin/mp3gain"):
        async with client as c:
            r = await c.post("/normalize/start", json={
                "directory": str(bad),
                "filenames": [],
            })
    assert r.status_code == 400


async def test_normalize_start_400_path_traversal_filename(client, tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    with patch("main.shutil.which", return_value="/usr/bin/mp3gain"):
        async with client as c:
            r = await c.post("/normalize/start", json={
                "directory": str(tmp_path),
                "filenames": ["../evil.mp3"],
            })
    assert r.status_code == 400


async def test_normalize_start_409_when_dir_already_active(client, tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    main._active_normalize_dirs.add(str(tmp_path.resolve()))
    with patch("main.shutil.which", return_value="/usr/bin/mp3gain"):
        async with client as c:
            r = await c.post("/normalize/start", json={
                "directory": str(tmp_path),
                "filenames": ["a.mp3"],
            })
    assert r.status_code == 409


# ── run_normalize_batch (skip / done / error) ────────────────────────────────
def _seed_task(filenames, target_db=89.0):
    task_id = "test-norm-task"
    main.normalize_progress[task_id] = {
        "status": "running",
        "items": {
            fn: {
                "filename": fn,
                "status": "pending",
                "measured_db": None,
                "target_db": target_db,
                "recommended_db_change": None,
                "error": None,
            } for fn in filenames
        },
    }
    return task_id


def test_run_normalize_batch_skips_when_within_tolerance(tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    task_id = _seed_task(["a.mp3"])
    main._active_normalize_dirs.add(str(tmp_path))

    def fake_analyze(_path, _target):
        return {"measured_db": 89.7, "recommended_db_change": 0.30}

    with patch("main._run_mp3gain_analyze", side_effect=fake_analyze), \
         patch("main._run_mp3gain_apply") as mock_apply:
        main.run_normalize_batch(task_id, str(tmp_path), ["a.mp3"], 89.0)

    item = main.normalize_progress[task_id]["items"]["a.mp3"]
    assert item["status"] == "skipped"
    assert item["measured_db"] == 89.7
    assert item["recommended_db_change"] == 0.30
    mock_apply.assert_not_called()


def test_run_normalize_batch_normalizes_when_outside_tolerance(tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"original")
    task_id = _seed_task(["a.mp3"])
    main._active_normalize_dirs.add(str(tmp_path))

    def fake_analyze(_path, _target):
        return {"measured_db": 84.5, "recommended_db_change": 4.50}

    with patch("main._run_mp3gain_analyze", side_effect=fake_analyze), \
         patch("main._run_mp3gain_apply") as mock_apply:
        main.run_normalize_batch(task_id, str(tmp_path), ["a.mp3"], 89.0)

    item = main.normalize_progress[task_id]["items"]["a.mp3"]
    assert item["status"] == "done"
    assert item["measured_db"] == 84.5
    mock_apply.assert_called_once()


def test_run_normalize_batch_skips_just_under_half_step(tmp_path):
    """Recommended change of -0.74 dB is below the 0.75 dB threshold → skipped."""
    (tmp_path / "a.mp3").write_bytes(b"x")
    task_id = _seed_task(["a.mp3"])
    main._active_normalize_dirs.add(str(tmp_path))

    def fake_analyze(_path, _target):
        return {"measured_db": 89.74, "recommended_db_change": -0.74}

    with patch("main._run_mp3gain_analyze", side_effect=fake_analyze), \
         patch("main._run_mp3gain_apply") as mock_apply:
        main.run_normalize_batch(task_id, str(tmp_path), ["a.mp3"], 89.0)

    assert main.normalize_progress[task_id]["items"]["a.mp3"]["status"] == "skipped"
    mock_apply.assert_not_called()


def test_run_normalize_batch_error_keeps_original_and_continues(tmp_path):
    (tmp_path / "bad.mp3").write_bytes(b"keep-me")
    (tmp_path / "good.mp3").write_bytes(b"original")
    task_id = _seed_task(["bad.mp3", "good.mp3"])
    main._active_normalize_dirs.add(str(tmp_path))

    def fake_analyze(input_path, _target):
        if input_path.name == "bad.mp3":
            raise RuntimeError("mp3gain analyze failed: boom")
        return {"measured_db": 84.0, "recommended_db_change": 5.0}

    apply_called: list[pathlib.Path] = []

    def fake_apply(input_path, _target):
        apply_called.append(input_path)

    with patch("main._run_mp3gain_analyze", side_effect=fake_analyze), \
         patch("main._run_mp3gain_apply", side_effect=fake_apply):
        main.run_normalize_batch(task_id, str(tmp_path), ["bad.mp3", "good.mp3"], 89.0)

    items = main.normalize_progress[task_id]["items"]
    assert items["bad.mp3"]["status"] == "error"
    assert "boom" in items["bad.mp3"]["error"]
    # 原檔保留
    assert (tmp_path / "bad.mp3").read_bytes() == b"keep-me"
    # 第二首仍完成（mp3gain apply 被呼叫，但因為是 mock 沒實際改檔）
    assert items["good.mp3"]["status"] == "done"
    assert apply_called == [tmp_path / "good.mp3"]
    assert main.normalize_progress[task_id]["status"] == "done"
    assert str(tmp_path) not in main._active_normalize_dirs


# ── POST /normalize/rename ───────────────────────────────────────────────────
async def test_normalize_rename_happy_path(client, tmp_path):
    (tmp_path / "a？.mp3").write_bytes(b"x")
    (tmp_path / "b！.mp3").write_bytes(b"y")
    async with client as c:
        r = await c.post("/normalize/rename", json={
            "directory": str(tmp_path),
            "renames": [
                {"from": "a？.mp3", "to": "a.mp3"},
                {"from": "b！.mp3", "to": "b.mp3"},
            ],
        })
    assert r.status_code == 200
    data = r.json()
    assert len(data["renamed"]) == 2
    assert data["skipped"] == []
    assert (tmp_path / "a.mp3").exists()
    assert (tmp_path / "b.mp3").exists()
    assert not (tmp_path / "a？.mp3").exists()

    # rename log written
    log_path = tmp_path / "_rename_log.json"
    assert log_path.exists()
    log = json.loads(log_path.read_text(encoding="utf-8"))
    assert isinstance(log, list) and len(log) == 1
    assert {"from": "a？.mp3", "to": "a.mp3"} in log[0]["mappings"]


async def test_normalize_rename_collision_skipped(client, tmp_path):
    (tmp_path / "a？.mp3").write_bytes(b"x")
    (tmp_path / "a.mp3").write_bytes(b"existing")  # 目標已存在
    async with client as c:
        r = await c.post("/normalize/rename", json={
            "directory": str(tmp_path),
            "renames": [{"from": "a？.mp3", "to": "a.mp3"}],
        })
    assert r.status_code == 200
    data = r.json()
    assert data["renamed"] == []
    assert len(data["skipped"]) == 1
    assert data["skipped"][0]["reason"] == "target exists"
    # original untouched
    assert (tmp_path / "a？.mp3").exists()
    assert (tmp_path / "a.mp3").read_bytes() == b"existing"


async def test_normalize_rename_path_traversal_400(client, tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x")
    async with client as c:
        r = await c.post("/normalize/rename", json={
            "directory": str(tmp_path),
            "renames": [{"from": "a.mp3", "to": "../evil.mp3"}],
        })
    assert r.status_code == 400
    # original untouched
    assert (tmp_path / "a.mp3").exists()


async def test_normalize_rename_appends_to_existing_log(client, tmp_path):
    (tmp_path / "a？.mp3").write_bytes(b"x")
    (tmp_path / "b！.mp3").write_bytes(b"y")
    async with client as c:
        await c.post("/normalize/rename", json={
            "directory": str(tmp_path),
            "renames": [{"from": "a？.mp3", "to": "a_.mp3"}],
        })
        await c.post("/normalize/rename", json={
            "directory": str(tmp_path),
            "renames": [{"from": "b！.mp3", "to": "b_.mp3"}],
        })
    log = json.loads((tmp_path / "_rename_log.json").read_text(encoding="utf-8"))
    assert len(log) == 2  # 兩個 rename batch 各一筆


# ── GET /normalize/progress/{task_id} ────────────────────────────────────────
async def test_normalize_progress_unknown_task(client):
    async with client as c:
        r = await c.get("/normalize/progress/nope")
    assert r.status_code == 200
    assert "task not found" in r.text


async def test_normalize_progress_done_state(client):
    main.normalize_progress["done-id"] = {
        "status": "done",
        "items": {"a.mp3": {
            "filename": "a.mp3", "status": "done",
            "measured_db": 89.0, "target_db": 89.0,
            "recommended_db_change": 0.0, "error": None,
        }},
    }
    async with client as c:
        r = await c.get("/normalize/progress/done-id")
    assert r.status_code == 200
    lines = [l for l in r.text.split("\n") if l.startswith("data:")]
    data = json.loads(lines[0].replace("data: ", ""))
    assert data["status"] == "done"
