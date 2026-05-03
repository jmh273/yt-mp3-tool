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
         patch("main.fetch_channel_rss", return_value=("UC_a", [recent, old])):
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
         patch("main.fetch_channel_rss", return_value=("UC_a", [v3, v1, v2])):
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
         patch("main.fetch_channel_rss", return_value=("UC_a", [v_within, v_outside])):
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

    async def fake_fetch(session, channel_id, limit, channel_title=""):
        call_args.append(channel_id)
        if channel_id == "UC_bad":
            raise Exception("RSS timeout")
        return channel_id, [good_video]

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_rss", side_effect=fake_fetch):
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

    async def fake_fetch(session, channel_id, limit, channel_title=""):
        return channel_id, all_videos[:30]

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt), \
         patch("main.fetch_channel_rss", side_effect=fake_fetch):
        async with client as c:
            r = await c.get("/latest-videos?hours=9999")

    assert len(r.json()["videos"]) <= 100
