"""最新影片端點測試"""
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import main


def _mock_valid_creds():
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    return creds


@pytest.fixture(autouse=True)
def mock_enhance_and_filter():
    with patch("main.enhance_and_filter_videos", side_effect=lambda yt, v, *a, **kw: v):
        yield


def _make_video(video_id: str, hours_ago: float, channel_id: str = "UC_test", channel_title: str = "Test") -> dict:
    pub = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
    return {
        "video_id": video_id,
        "title": f"Video {video_id}",
        "published": pub,
        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg",
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "duration_seconds": None,
        "channel_id": channel_id,
        "channel_title": channel_title,
    }


def _mock_youtube_subscriptions(channels: list[dict]):
    items = [
        {
            "snippet": {
                "title": ch["title"],
                "resourceId": {"channelId": ch["channel_id"]},
                "thumbnails": {"default": {"url": ""}},
            }
        }
        for ch in channels
    ]
    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {"items": items}
    return mock_yt


# ── 未登入 ─────────────────────────────────────────────────────────────────────
async def test_latest_videos_requires_auth(client):
    """未登入時應回傳 401"""
    with patch("main.require_credentials") as mock_req:
        from fastapi import HTTPException
        mock_req.side_effect = HTTPException(status_code=401, detail="Missing auth")
        async with client as c:
            r = await c.get("/latest-videos")
        assert r.status_code == 401


# ── 正常取得最新影片 ────────────────────────────────────────────────────────────
async def test_latest_videos_returns_recent(client):
    """只回傳指定時間範圍內的影片"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    recent = _make_video("v_new", hours_ago=1)
    old = _make_video("v_old", hours_ago=100)

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [recent, old])):
        async with client as c:
            r = await c.get("/latest-videos?hours=24")

    assert r.status_code == 200
    videos = r.json()["videos"]
    ids = [v["video_id"] for v in videos]
    assert "v_new" in ids
    assert "v_old" not in ids


async def test_latest_videos_sorted_newest_first(client):
    """影片應依發佈時間由新到舊排序"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    v1 = _make_video("v1", hours_ago=2)
    v2 = _make_video("v2", hours_ago=5)
    v3 = _make_video("v3", hours_ago=10)

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [v3, v1, v2])):
        async with client as c:
            r = await c.get("/latest-videos?hours=24")

    videos = r.json()["videos"]
    published_times = [v["published"] for v in videos]
    assert published_times == sorted(published_times, reverse=True)


async def test_latest_videos_no_channels(client):
    """無訂閱頻道時回傳空清單"""
    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {"items": []}

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/latest-videos")

    assert r.status_code == 200
    assert r.json()["videos"] == []


async def test_latest_videos_uses_settings_hours(client):
    """未傳 hours 參數時應使用設定檔的 latest_hours"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    v_within = _make_video("v_in", hours_ago=10)
    v_outside = _make_video("v_out", hours_ago=30)

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [v_within, v_outside])):
        async with client as c:
            # 先設定 latest_hours=24（預設），不傳 hours 參數
            await c.put("/settings", json={"latest_hours": 24})
            r = await c.get("/latest-videos")

    videos = r.json()["videos"]
    ids = [v["video_id"] for v in videos]
    assert "v_in" in ids
    assert "v_out" not in ids


async def test_latest_videos_rss_error_skipped(client):
    """單一頻道 RSS 失敗（回傳 Exception）時，其他頻道仍正常回傳"""
    channels = [
        {"channel_id": "UC_ok", "title": "Good"},
        {"channel_id": "UC_bad", "title": "Bad"},
    ]
    good_video = _make_video("v_good", hours_ago=1, channel_id="UC_ok")

    call_args = []

    async def fake_fetch(youtube, channel_id, limit, channel_title=""):
        call_args.append(channel_id)
        if channel_id == "UC_bad":
            raise Exception("RSS timeout")
        return channel_id, [good_video]

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", side_effect=fake_fetch):
        async with client as c:
            r = await c.get("/latest-videos?hours=24")

    assert r.status_code == 200
    videos = r.json()["videos"]
    assert any(v["video_id"] == "v_good" for v in videos)


async def test_latest_videos_capped_at_100(client):
    """回傳影片數上限為 100"""
    channels = [{"channel_id": f"UC_{i}", "title": f"Chan {i}"} for i in range(5)]
    # 每頻道產生 30 支影片（共 150），應截斷至 100
    all_videos = [_make_video(f"v{i}", hours_ago=i * 0.01) for i in range(150)]

    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {
        "items": [
            {"snippet": {
                "title": ch["title"],
                "resourceId": {"channelId": ch["channel_id"]},
                "thumbnails": {"default": {"url": ""}},
            }}
            for ch in channels
        ]
    }

    async def fake_fetch(youtube, channel_id, limit, channel_title=""):
        return channel_id, all_videos[:30]

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt), \
         patch("main.fetch_channel_videos_api", side_effect=fake_fetch):
        async with client as c:
            r = await c.get("/latest-videos?hours=9999")

    assert len(r.json()["videos"]) <= 100


# ── downloaded_today 標記（依今日下載資料夾比對） ──────────────────────────────
async def test_latest_videos_downloaded_today_true_when_file_in_folder(client, tmp_path):
    """今日資料夾中存在 sanitized title 對應的檔案時，downloaded_today 為 true。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    matched = _make_video("v_match", hours_ago=1)
    unmatched = _make_video("v_miss", hours_ago=2)

    today_dir = tmp_path / datetime.now().strftime("%Y%m%d")
    today_dir.mkdir(parents=True)
    sanitized = main._sanitize_filename(matched["title"])
    (today_dir / f"03_{sanitized}.mp3").write_bytes(b"")

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [matched, unmatched])):
        async with client as c:
            await c.put("/settings", json={"output_path": str(tmp_path)})
            r = await c.get("/latest-videos?hours=24")

    videos = {v["video_id"]: v for v in r.json()["videos"]}
    assert videos["v_match"]["downloaded_today"] is True
    assert videos["v_miss"]["downloaded_today"] is False


async def test_latest_videos_downloaded_today_ignores_part_files(client, tmp_path):
    """.part 半下載檔案不應被視為已下載。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    pending = _make_video("v_pending", hours_ago=1)

    today_dir = tmp_path / datetime.now().strftime("%Y%m%d")
    today_dir.mkdir(parents=True)
    sanitized = main._sanitize_filename(pending["title"])
    (today_dir / f"01_{sanitized}.mp3.part").write_bytes(b"")

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [pending])):
        async with client as c:
            await c.put("/settings", json={"output_path": str(tmp_path)})
            r = await c.get("/latest-videos?hours=24")

    videos = r.json()["videos"]
    assert videos[0]["downloaded_today"] is False


async def test_latest_videos_downloaded_today_no_folder(client, tmp_path):
    """今日資料夾不存在時，所有 downloaded_today 皆為 false 且不報錯。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    video = _make_video("v1", hours_ago=1)

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [video])):
        async with client as c:
            await c.put("/settings", json={"output_path": str(tmp_path)})
            r = await c.get("/latest-videos?hours=24")

    assert r.status_code == 200
    assert r.json()["videos"][0]["downloaded_today"] is False


async def test_latest_videos_downloaded_today_strips_seq_prefix(client, tmp_path):
    """檔名無序號前綴時也能匹配（legacy 下載）。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    video = _make_video("v_legacy", hours_ago=1)

    today_dir = tmp_path / datetime.now().strftime("%Y%m%d")
    today_dir.mkdir(parents=True)
    sanitized = main._sanitize_filename(video["title"])
    (today_dir / f"{sanitized}.mp3").write_bytes(b"")

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [video])):
        async with client as c:
            await c.put("/settings", json={"output_path": str(tmp_path)})
            r = await c.get("/latest-videos?hours=24")

    assert r.json()["videos"][0]["downloaded_today"] is True
