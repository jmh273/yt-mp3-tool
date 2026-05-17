"""下載功能測試"""
import json
import time
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
