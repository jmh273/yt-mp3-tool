"""下載功能測試"""
import json
import pathlib
import time
import asyncio
from unittest.mock import MagicMock, patch

import pytest
import main


SAMPLE_VIDEOS = [
    {"video_id": "abc123", "title": "Test Song", "url": "https://www.youtube.com/watch?v=abc123"},
]


# ── run_download（同步下載邏輯）───────────────────────────────────────────────
def test_run_download_success(tmp_path):
    """模擬 yt-dlp 成功下載，progress 應標記 done"""
    task_id = "test-task-1"

    with patch("yt_dlp.YoutubeDL") as MockYDL:
        instance = MagicMock()
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)
        instance.download = MagicMock(return_value=0)
        MockYDL.return_value = instance

        main.run_download(SAMPLE_VIDEOS, str(tmp_path), task_id)

    assert main.download_progress[task_id]["status"] == "done"
    assert main.download_progress[task_id]["items"]["abc123"]["status"] == "done"


def test_run_download_failure(tmp_path):
    """yt-dlp 拋出例外時，progress 應標記 error"""
    task_id = "test-task-2"

    with patch("yt_dlp.YoutubeDL") as MockYDL:
        instance = MagicMock()
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)
        instance.download = MagicMock(side_effect=Exception("video unavailable"))
        MockYDL.return_value = instance

        main.run_download(SAMPLE_VIDEOS, str(tmp_path), task_id)

    item = main.download_progress[task_id]["items"]["abc123"]
    assert item["status"] == "error"
    assert "video unavailable" in item["error"]
    assert main.download_progress[task_id]["status"] == "done"


def test_run_download_progress_hook(tmp_path):
    """進度 hook 應正確更新百分比"""
    task_id = "test-task-3"
    captured_hook = []

    def fake_ydl_init(opts):
        captured_hook.extend(opts.get("progress_hooks", []))
        return MagicMock(__enter__=MagicMock(return_value=MagicMock(download=MagicMock())),
                         __exit__=MagicMock(return_value=False))

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        main.run_download(SAMPLE_VIDEOS, str(tmp_path), task_id)

    # 手動觸發 hook 模擬進度
    assert len(captured_hook) == 1
    hook = captured_hook[0]

    # 模擬下載中
    hook({"status": "downloading", "_percent_str": " 50.0%"})
    assert main.download_progress[task_id]["items"]["abc123"]["percent"] == 50.0
    assert main.download_progress[task_id]["items"]["abc123"]["status"] == "downloading"

    # 模擬下載完成（進入轉檔）
    hook({"status": "finished"})
    assert main.download_progress[task_id]["items"]["abc123"]["percent"] == 100
    assert main.download_progress[task_id]["items"]["abc123"]["status"] == "converting"


def test_run_download_multiple_videos(tmp_path):
    """多支影片應全部處理完才標記整體 done"""
    task_id = "test-task-4"
    videos = [
        {"video_id": "v1", "title": "Song 1", "url": "https://www.youtube.com/watch?v=v1"},
        {"video_id": "v2", "title": "Song 2", "url": "https://www.youtube.com/watch?v=v2"},
    ]

    with patch("yt_dlp.YoutubeDL") as MockYDL:
        instance = MagicMock()
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)
        instance.download = MagicMock(return_value=0)
        MockYDL.return_value = instance

        main.run_download(videos, str(tmp_path), task_id)

    assert main.download_progress[task_id]["items"]["v1"]["status"] == "done"
    assert main.download_progress[task_id]["items"]["v2"]["status"] == "done"
    assert main.download_progress[task_id]["status"] == "done"


# ── POST /download ────────────────────────────────────────────────────────────
async def test_post_download_returns_task_id(client, tmp_path):
    """POST /download 應立即回傳 task_id"""
    with patch("main.run_download"):
        async with client as c:
            r = await c.post("/download", json={"videos": SAMPLE_VIDEOS})

    assert r.status_code == 200
    assert "task_id" in r.json()
    assert len(r.json()["task_id"]) == 36  # UUID 格式


async def test_post_download_empty_videos(client):
    """空影片列表也應正常接受（由前端保證非空）"""
    with patch("main.run_download"):
        async with client as c:
            r = await c.post("/download", json={"videos": []})
    assert r.status_code == 200


# ── GET /download/progress/{task_id} ─────────────────────────────────────────
async def test_progress_task_not_found(client):
    """不存在的 task_id 應回傳 error 事件"""
    async with client as c:
        r = await c.get("/download/progress/nonexistent-id")

    assert r.status_code == 200
    assert "task not found" in r.text


async def test_progress_done_state(client):
    """已完成的任務應回傳 done 狀態並關閉 SSE"""
    task_id = "done-task"
    main.download_progress[task_id] = {
        "status": "done",
        "items": {"v1": {"title": "T", "percent": 100, "status": "done"}},
    }

    async with client as c:
        r = await c.get(f"/download/progress/{task_id}")

    assert r.status_code == 200
    lines = [l for l in r.text.split("\n") if l.startswith("data:")]
    assert len(lines) >= 1
    data = json.loads(lines[0].replace("data: ", ""))
    assert data["status"] == "done"


# ── _scan_next_seq ────────────────────────────────────────────────────────────
def test_scan_next_seq_empty_dir(tmp_path):
    assert main._scan_next_seq(tmp_path) == 1
    assert main._scan_next_seq(tmp_path / "does-not-exist") == 1


def test_scan_next_seq_continues_from_max(tmp_path):
    (tmp_path / "01_a.mp3").write_bytes(b"x")
    (tmp_path / "02_b.mp3").write_bytes(b"x")
    (tmp_path / "05_c.mp3").write_bytes(b"x")
    assert main._scan_next_seq(tmp_path) == 6


def test_scan_next_seq_mixed_extensions(tmp_path):
    (tmp_path / "03_a.mp4").write_bytes(b"x")
    (tmp_path / "04_b.part").write_bytes(b"x")
    assert main._scan_next_seq(tmp_path) == 5


def test_scan_next_seq_ignores_unprefixed_files(tmp_path):
    (tmp_path / "no_prefix.mp3").write_bytes(b"x")
    (tmp_path / "abc_song.mp3").write_bytes(b"x")
    assert main._scan_next_seq(tmp_path) == 1


def test_scan_next_seq_reads_three_digit_existing(tmp_path):
    (tmp_path / "120_old.mp3").write_bytes(b"x")
    assert main._scan_next_seq(tmp_path) == 121


# ── _format_seq ───────────────────────────────────────────────────────────────
def test_format_seq_two_digit_padding():
    assert main._format_seq(1) == "01"
    assert main._format_seq(9) == "09"
    assert main._format_seq(99) == "99"


def test_format_seq_expands_past_99():
    assert main._format_seq(100) == "100"
    assert main._format_seq(121) == "121"
    assert main._format_seq(1000) == "1000"


# ── _build_ydl_opts with prefix ───────────────────────────────────────────────
def test_build_ydl_opts_includes_prefix(tmp_path):
    opts = main._build_ydl_opts(
        str(tmp_path), "Hello World", lambda d: None, "mp3", 192, seq_prefix="01_"
    )
    assert opts["outtmpl"].endswith("01_Hello World.%(ext)s")


def test_build_ydl_opts_default_no_prefix(tmp_path):
    """Backwards-compatible default: omitting seq_prefix yields the bare title."""
    opts = main._build_ydl_opts(str(tmp_path), "Song", lambda d: None, "mp3", 192)
    assert opts["outtmpl"].endswith("Song.%(ext)s")


# ── run_download batch assigns sequential prefixes ────────────────────────────
def test_run_download_batch_assigns_sequential_prefixes(tmp_path):
    """3 videos in an empty folder → outtmpl prefixed 01_, 02_, 03_."""
    task_id = "test-seq-batch"
    videos = [
        {"video_id": "v1", "title": "First",  "url": "https://www.youtube.com/watch?v=v1"},
        {"video_id": "v2", "title": "Second", "url": "https://www.youtube.com/watch?v=v2"},
        {"video_id": "v3", "title": "Third",  "url": "https://www.youtube.com/watch?v=v3"},
    ]
    captured_outtmpls: list[str] = []

    def fake_ydl_init(opts):
        captured_outtmpls.append(opts["outtmpl"])
        return MagicMock(__enter__=MagicMock(return_value=MagicMock(download=MagicMock())),
                         __exit__=MagicMock(return_value=False))

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        main.run_download(videos, str(tmp_path), task_id)

    assert len(captured_outtmpls) == 3
    assert captured_outtmpls[0].endswith("01_First.%(ext)s")
    assert captured_outtmpls[1].endswith("02_Second.%(ext)s")
    assert captured_outtmpls[2].endswith("03_Third.%(ext)s")


def test_run_download_batch_continues_from_existing(tmp_path):
    """Folder already has 99_old.mp3 → next batch starts at 100_."""
    (tmp_path / "99_old.mp3").write_bytes(b"x")
    task_id = "test-seq-continue"
    videos = [{"video_id": "v1", "title": "Next", "url": "https://www.youtube.com/watch?v=v1"}]
    captured_outtmpls: list[str] = []

    def fake_ydl_init(opts):
        captured_outtmpls.append(opts["outtmpl"])
        return MagicMock(__enter__=MagicMock(return_value=MagicMock(download=MagicMock())),
                         __exit__=MagicMock(return_value=False))

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        main.run_download(videos, str(tmp_path), task_id)

    assert captured_outtmpls[0].endswith("100_Next.%(ext)s")


# ── _scan_existing_seqs ───────────────────────────────────────────────────────
def test_scan_existing_seqs_empty(tmp_path):
    assert main._scan_existing_seqs(tmp_path) == []
    assert main._scan_existing_seqs(tmp_path / "missing") == []


def test_scan_existing_seqs_sorted(tmp_path):
    (tmp_path / "05_c.mp3").write_bytes(b"x")
    (tmp_path / "01_a.mp3").write_bytes(b"x")
    (tmp_path / "120_old.mp4").write_bytes(b"x")
    (tmp_path / "abc_unprefixed.mp3").write_bytes(b"x")
    assert main._scan_existing_seqs(tmp_path) == [1, 5, 120]


# ── _compute_seq_prefix ───────────────────────────────────────────────────────
def test_compute_seq_prefix_none_uses_default():
    assert main._compute_seq_prefix(None, 1, 0) == "01_"
    assert main._compute_seq_prefix(None, 99, 0) == "99_"
    assert main._compute_seq_prefix(None, 99, 1) == "100_"


def test_compute_seq_prefix_follows_string_width():
    assert main._compute_seq_prefix("01", 1, 0) == "01_"
    assert main._compute_seq_prefix("01", 1, 2) == "03_"
    assert main._compute_seq_prefix("001", 99, 0) == "001_"
    assert main._compute_seq_prefix("001", 99, 4) == "005_"


def test_compute_seq_prefix_expands_past_width():
    assert main._compute_seq_prefix("999", 1, 0) == "999_"
    assert main._compute_seq_prefix("999", 1, 1) == "1000_"
    assert main._compute_seq_prefix("999", 1, 2) == "1001_"


# ── run_download with seq_enabled / start_seq ─────────────────────────────────
def _capture_outtmpls(videos, tmp_path, **kwargs):
    captured: list[str] = []

    def fake_ydl_init(opts):
        captured.append(opts["outtmpl"])
        return MagicMock(__enter__=MagicMock(return_value=MagicMock(download=MagicMock())),
                         __exit__=MagicMock(return_value=False))

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        main.run_download(videos, str(tmp_path), "task-x", **kwargs)
    return captured


def test_run_download_seq_disabled_omits_prefix(tmp_path):
    """seq_enabled=False → outtmpl contains bare title."""
    videos = [{"video_id": "v1", "title": "Hello", "url": "u"}]
    outtmpls = _capture_outtmpls(videos, tmp_path, seq_enabled=False)
    assert outtmpls[0].endswith("Hello.%(ext)s")
    assert "01_Hello" not in outtmpls[0]


def test_run_download_start_seq_two_digit(tmp_path):
    videos = [
        {"video_id": "v1", "title": "A", "url": "u"},
        {"video_id": "v2", "title": "B", "url": "u"},
        {"video_id": "v3", "title": "C", "url": "u"},
    ]
    outtmpls = _capture_outtmpls(videos, tmp_path, start_seq="01")
    assert outtmpls[0].endswith("01_A.%(ext)s")
    assert outtmpls[1].endswith("02_B.%(ext)s")
    assert outtmpls[2].endswith("03_C.%(ext)s")


def test_run_download_start_seq_three_digit(tmp_path):
    videos = [
        {"video_id": "v1", "title": "A", "url": "u"},
        {"video_id": "v2", "title": "B", "url": "u"},
    ]
    outtmpls = _capture_outtmpls(videos, tmp_path, start_seq="050")
    assert outtmpls[0].endswith("050_A.%(ext)s")
    assert outtmpls[1].endswith("051_B.%(ext)s")


def test_run_download_start_seq_expands_past_999(tmp_path):
    videos = [
        {"video_id": "v1", "title": "A", "url": "u"},
        {"video_id": "v2", "title": "B", "url": "u"},
        {"video_id": "v3", "title": "C", "url": "u"},
    ]
    outtmpls = _capture_outtmpls(videos, tmp_path, start_seq="999")
    assert outtmpls[0].endswith("999_A.%(ext)s")
    assert outtmpls[1].endswith("1000_B.%(ext)s")
    assert outtmpls[2].endswith("1001_C.%(ext)s")


# ── POST /download with new fields ────────────────────────────────────────────
async def test_post_download_invalid_start_seq(client):
    """Non-numeric start_seq should be rejected by Pydantic with 422."""
    with patch("main.run_download"):
        async with client as c:
            r = await c.post(
                "/download",
                json={"videos": SAMPLE_VIDEOS, "start_seq": "abc"},
            )
    assert r.status_code == 422


async def test_post_download_too_long_start_seq(client):
    with patch("main.run_download"):
        async with client as c:
            r = await c.post(
                "/download",
                json={"videos": SAMPLE_VIDEOS, "start_seq": "12345678901"},
            )
    assert r.status_code == 422


async def test_post_download_propagates_seq_fields(client):
    """run_download should receive seq_enabled / start_seq from the request body."""
    with patch("main.run_download") as mock_run:
        async with client as c:
            r = await c.post(
                "/download",
                json={
                    "videos": SAMPLE_VIDEOS,
                    "seq_enabled": False,
                    "start_seq": "07",
                },
            )
    assert r.status_code == 200
    # run_download is dispatched via loop.run_in_executor as a positional call
    # of (videos, output_path, task_id, fmt, quality, seq_enabled, start_seq).
    # Inspect the most recent invocation regardless of executor wrapper.
    last_call = mock_run.call_args
    args = last_call.args if last_call.args else last_call.kwargs
    if isinstance(args, tuple):
        assert args[5] is False
        assert args[6] == "07"
    else:
        assert args["seq_enabled"] is False
        assert args["start_seq"] == "07"


async def test_post_download_default_seq_fields(client):
    """Legacy callers without seq fields → seq_enabled=True, start_seq=None."""
    with patch("main.run_download") as mock_run:
        async with client as c:
            r = await c.post("/download", json={"videos": SAMPLE_VIDEOS})
    assert r.status_code == 200
    last_call = mock_run.call_args
    args = last_call.args if last_call.args else last_call.kwargs
    if isinstance(args, tuple):
        assert args[5] is True
        assert args[6] is None
    else:
        assert args["seq_enabled"] is True
        assert args["start_seq"] is None


async def test_post_download_uses_target_dir_under_output_path(client, tmp_path):
    """target_dir overrides today's folder but stays under output_path."""
    with patch("main.load_settings", return_value={"output_path": str(tmp_path)}), \
         patch("main.run_download") as mock_run:
        async with client as c:
            r = await c.post(
                "/download",
                json={"videos": SAMPLE_VIDEOS, "target_dir": "20260601_sports"},
            )

    assert r.status_code == 200
    args = mock_run.call_args.args
    expected_dir = tmp_path / "20260601_sports"
    assert pathlib.Path(args[1]) == expected_dir
    assert pathlib.Path(r.json()["directory"]) == expected_dir.resolve()
    assert expected_dir.is_dir()


async def test_post_download_rejects_target_dir_path_traversal(client, tmp_path):
    with patch("main.load_settings", return_value={"output_path": str(tmp_path)}), \
         patch("main.run_download") as mock_run:
        async with client as c:
            r = await c.post(
                "/download",
                json={"videos": SAMPLE_VIDEOS, "target_dir": "..\\outside"},
            )

    assert r.status_code == 400
    mock_run.assert_not_called()


async def test_post_download_target_dir_has_independent_sequence_base(client, tmp_path):
    (tmp_path / "20260601").mkdir()
    (tmp_path / "20260601" / "99_old.mp3").write_bytes(b"x")
    (tmp_path / "20260601_evening").mkdir()
    captured: list[str] = []
    original_run_download = main.run_download

    def fake_run(videos, output_path, task_id, *args):
        def fake_ydl_init(opts):
            captured.append(opts["outtmpl"])
            return MagicMock(__enter__=MagicMock(return_value=MagicMock(download=MagicMock())),
                             __exit__=MagicMock(return_value=False))

        with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
            original_run_download(videos, output_path, task_id)

    with patch("main.load_settings", return_value={"output_path": str(tmp_path)}), \
         patch("main.run_download", side_effect=fake_run):
        async with client as c:
            r = await c.post(
                "/download",
                json={"videos": SAMPLE_VIDEOS, "target_dir": "20260601_evening"},
            )

    assert r.status_code == 200
    await asyncio.sleep(0.05)
    assert captured[0].endswith("01_Test Song.%(ext)s")


# ── GET /download/next-seq ────────────────────────────────────────────────────
async def test_next_seq_empty_dir(client, tmp_path):
    with patch("main.require_credentials"), \
         patch("main._today_download_dir", return_value=tmp_path / "empty"):
        async with client as c:
            r = await c.get("/download/next-seq")
    assert r.status_code == 200
    assert r.json() == {"next_seq": "01", "existing": []}


async def test_next_seq_with_existing(client, tmp_path):
    (tmp_path / "01_a.mp3").write_bytes(b"x")
    (tmp_path / "05_b.mp4").write_bytes(b"x")
    with patch("main.require_credentials"), \
         patch("main._today_download_dir", return_value=tmp_path):
        async with client as c:
            r = await c.get("/download/next-seq")
    assert r.status_code == 200
    assert r.json() == {"next_seq": "06", "existing": [1, 5]}


async def test_next_seq_widens_past_99(client, tmp_path):
    (tmp_path / "120_old.mp3").write_bytes(b"x")
    with patch("main.require_credentials"), \
         patch("main._today_download_dir", return_value=tmp_path):
        async with client as c:
            r = await c.get("/download/next-seq")
    assert r.status_code == 200
    assert r.json() == {"next_seq": "121", "existing": [120]}


async def test_next_seq_with_target_dir_scans_that_folder(client, tmp_path):
    today = tmp_path / "20260623"
    custom = tmp_path / "myalbum"
    today.mkdir()
    custom.mkdir()
    (today / "99_today.mp3").write_bytes(b"x")
    (custom / "01_a.mp3").write_bytes(b"x")
    (custom / "02_b.mp4").write_bytes(b"x")

    with patch("main.require_credentials"), \
         patch("main.load_settings", return_value={"output_path": str(tmp_path)}):
        async with client as c:
            r = await c.get("/download/next-seq?dir=myalbum")

    assert r.status_code == 200
    assert r.json() == {"next_seq": "03", "existing": [1, 2]}


async def test_next_seq_rejects_target_dir_path_traversal(client, tmp_path):
    with patch("main.require_credentials"), \
         patch("main.load_settings", return_value={"output_path": str(tmp_path)}):
        async with client as c:
            r = await c.get("/download/next-seq?dir=..\\secret")

    assert r.status_code == 400


# ── concurrent downloads ──────────────────────────────────────────────────────
def _capture_prefix_by_title(videos, tmp_path, **kwargs):
    """Run run_download with a fake yt-dlp; return {title: seq_prefix} by parsing
    each outtmpl. Decoupled from call order so it survives concurrent execution."""
    import os
    mapping: dict[str, str] = {}
    lock = __import__("threading").Lock()

    def fake_ydl_init(opts):
        # outtmpl tail looks like "<prefix><title>.%(ext)s"
        tail = os.path.basename(opts["outtmpl"]).replace(".%(ext)s", "")
        for v in videos:
            title = v["title"]
            if tail.endswith(title):
                with lock:
                    mapping[title] = tail[: len(tail) - len(title)]
        return MagicMock(__enter__=MagicMock(return_value=MagicMock(download=MagicMock())),
                         __exit__=MagicMock(return_value=False))

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        main.run_download(videos, str(tmp_path), "task-cc", **kwargs)
    return mapping


def test_concurrent_prefix_decoupled_from_completion_order(tmp_path):
    """concurrency>1: prefixes follow batch index, not finish order (C may finish first)."""
    videos = [
        {"video_id": "v1", "title": "AAA", "url": "u"},
        {"video_id": "v2", "title": "BBB", "url": "u"},
        {"video_id": "v3", "title": "CCC", "url": "u"},
    ]
    mapping = _capture_prefix_by_title(videos, tmp_path, concurrency=3)
    assert mapping == {"AAA": "01_", "BBB": "02_", "CCC": "03_"}


def test_concurrent_all_marked_done(tmp_path):
    """All videos in a concurrent batch reach done and the task finishes done."""
    task_id = "cc-done"
    videos = [
        {"video_id": "v1", "title": "S1", "url": "u"},
        {"video_id": "v2", "title": "S2", "url": "u"},
        {"video_id": "v3", "title": "S3", "url": "u"},
        {"video_id": "v4", "title": "S4", "url": "u"},
    ]
    with patch("yt_dlp.YoutubeDL") as MockYDL:
        instance = MagicMock()
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)
        instance.download = MagicMock(return_value=0)
        MockYDL.return_value = instance
        main.run_download(videos, str(tmp_path), task_id, concurrency=3)

    items = main.download_progress[task_id]["items"]
    assert all(items[v["video_id"]]["status"] == "done" for v in videos)
    assert main.download_progress[task_id]["status"] == "done"


def test_concurrent_respects_max_in_flight(tmp_path):
    """Semaphore caps simultaneous downloads at `concurrency`."""
    import threading
    task_id = "cc-cap"
    videos = [{"video_id": f"v{i}", "title": f"T{i}", "url": "u"} for i in range(8)]

    in_flight = 0
    peak = 0
    lock = threading.Lock()
    release = threading.Event()
    started = threading.Semaphore(0)

    def slow_download(_urls):
        nonlocal in_flight, peak
        with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        started.release()
        release.wait(timeout=5)
        with lock:
            in_flight -= 1
        return 0

    def fake_ydl_init(_opts):
        inst = MagicMock()
        inst.__enter__ = MagicMock(return_value=inst)
        inst.__exit__ = MagicMock(return_value=False)
        inst.download = MagicMock(side_effect=slow_download)
        return inst

    def run():
        with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
            main.run_download(videos, str(tmp_path), task_id, concurrency=3)

    t = threading.Thread(target=run)
    t.start()
    # wait until 3 downloads are in flight, then confirm no 4th starts
    for _ in range(3):
        assert started.acquire(timeout=5)
    assert started.acquire(timeout=0.3) is False  # 4th must be blocked by semaphore
    with lock:
        assert peak == 3
    release.set()
    t.join(timeout=5)
    assert peak == 3
    assert main.download_progress[task_id]["status"] == "done"


def test_concurrent_partial_failure_does_not_block_others(tmp_path):
    """One failing video → error for it, others still complete; task ends done."""
    task_id = "cc-fail"
    videos = [
        {"video_id": "ok1", "title": "Ok1", "url": "u"},
        {"video_id": "bad", "title": "Bad", "url": "u"},
        {"video_id": "ok2", "title": "Ok2", "url": "u"},
    ]

    def fake_ydl_init(opts):
        inst = MagicMock()
        inst.__enter__ = MagicMock(return_value=inst)
        inst.__exit__ = MagicMock(return_value=False)
        if opts["outtmpl"].endswith("02_Bad.%(ext)s"):
            inst.download = MagicMock(side_effect=Exception("boom"))
        else:
            inst.download = MagicMock(return_value=0)
        return inst

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        main.run_download(videos, str(tmp_path), task_id, concurrency=3)

    items = main.download_progress[task_id]["items"]
    assert items["ok1"]["status"] == "done"
    assert items["ok2"]["status"] == "done"
    assert items["bad"]["status"] == "error"
    assert "boom" in items["bad"]["error"]
    assert main.download_progress[task_id]["status"] == "done"


# ── _resolve_concurrency ──────────────────────────────────────────────────────
def test_resolve_concurrency_default_when_missing():
    assert main._resolve_concurrency({}) == 3


def test_resolve_concurrency_clamps_range():
    assert main._resolve_concurrency({"download_concurrency": 0}) == 1
    assert main._resolve_concurrency({"download_concurrency": 99}) == 8
    assert main._resolve_concurrency({"download_concurrency": 5}) == 5


def test_resolve_concurrency_invalid_falls_back():
    assert main._resolve_concurrency({"download_concurrency": "abc"}) == 3
    assert main._resolve_concurrency({"download_concurrency": None}) == 3


def test_default_settings_includes_concurrency():
    assert main.DEFAULT_SETTINGS["download_concurrency"] == 3
    assert main.load_settings()["download_concurrency"] >= 1


# ── _sync_url_preview_yt_dlp: watch+list URLs must expand as playlist ─────────
def test_url_preview_uses_extract_flat_in_playlist():
    """Regression guard: opts must use 'in_playlist', not True.

    With extract_flat=True, yt-dlp returns a stub _type='url' for watch?v=X&list=Y
    URLs, with id set to the playlist ID — causing later downloads to fail.
    """
    captured_opts: dict = {}

    def fake_ydl_init(opts):
        captured_opts.update(opts)
        instance = MagicMock()
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)
        instance.extract_info = MagicMock(return_value={"entries": []})
        return instance

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        main._sync_url_preview_yt_dlp(
            "https://www.youtube.com/watch?v=2oW8gnmnXrU&list=PLaSVd_PZ_Y7yDFfkc4WnWlTApcw2vumlq"
        )

    assert captured_opts.get("extract_flat") == "in_playlist"


def test_url_preview_watch_list_returns_video_ids_not_playlist_id():
    """watch?v=X&list=Y URL → entries' video_ids in result, playlist ID absent."""
    playlist_id = "PLaSVd_PZ_Y7yDFfkc4WnWlTApcw2vumlq"
    fake_playlist_info = {
        "_type": "playlist",
        "id": playlist_id,
        "title": "歐麗娟 紅樓夢",
        "entries": [
            {"id": "2oW8gnmnXrU", "title": "EP1", "duration": 3600, "uploader": "NTU"},
            {"id": "etM0xAeaVDM", "title": "EP2", "duration": 3600, "uploader": "NTU"},
        ],
    }

    def fake_ydl_init(_opts):
        instance = MagicMock()
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)
        instance.extract_info = MagicMock(return_value=fake_playlist_info)
        return instance

    with patch("yt_dlp.YoutubeDL", side_effect=fake_ydl_init):
        videos = main._sync_url_preview_yt_dlp(
            f"https://www.youtube.com/watch?v=2oW8gnmnXrU&list={playlist_id}"
        )

    assert len(videos) == 2
    assert [v["video_id"] for v in videos] == ["2oW8gnmnXrU", "etM0xAeaVDM"]
    assert all(v["video_id"] != playlist_id for v in videos)
