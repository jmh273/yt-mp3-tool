"""發燒影片端點測試"""
from unittest.mock import MagicMock, patch

import main


def _mock_valid_creds():
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    return creds


def _make_yt_item(
    video_id: str,
    duration_iso: str = "PT3M",
    view_count: str | None = "1000",
    live_broadcast: str = "none",
):
    snippet = {
        "title": f"Trending {video_id}",
        "channelId": "UC_x",
        "channelTitle": "頻道",
        "publishedAt": "2026-05-08T00:00:00Z",
        "thumbnails": {"default": {"url": ""}},
        "liveBroadcastContent": live_broadcast,
    }
    item: dict = {
        "id": video_id,
        "snippet": snippet,
        "contentDetails": {"duration": duration_iso},
    }
    if view_count is not None:
        item["statistics"] = {"viewCount": view_count}
    return item


def _mock_youtube_videos(items: list[dict], next_page_token: str | None = None):
    mock_yt = MagicMock()
    resp = {"items": items}
    if next_page_token is not None:
        resp["nextPageToken"] = next_page_token
    mock_yt.videos().list().execute.return_value = resp
    return mock_yt


# ── 未登入 ─────────────────────────────────────────────────────────────────────
async def test_trending_requires_auth(client):
    """未登入時應回傳 401"""
    with patch("main.require_credentials") as mock_req:
        from fastapi import HTTPException
        mock_req.side_effect = HTTPException(status_code=401, detail="Missing auth")
        async with client as c:
            r = await c.get("/trending-videos")
        assert r.status_code == 401


# ── 基本回傳 ────────────────────────────────────────────────────────────────────
async def test_trending_returns_videos_with_view_count(client):
    """`/trending-videos` 應回傳含 view_count 的影片陣列"""
    items = [_make_yt_item("v1", view_count="1234567")]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items)):
        async with client as c:
            r = await c.get("/trending-videos")

    assert r.status_code == 200
    data = r.json()
    assert "videos" in data
    assert "next_page_token" in data
    assert len(data["videos"]) == 1
    assert data["videos"][0]["view_count"] == 1234567


async def test_trending_view_count_missing_falls_back_to_zero(client):
    """statistics.viewCount 缺失時 view_count 應為 0"""
    items = [_make_yt_item("v1", view_count=None)]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items)):
        async with client as c:
            r = await c.get("/trending-videos")

    assert r.json()["videos"][0]["view_count"] == 0


async def test_trending_view_count_invalid_falls_back_to_zero(client):
    """statistics.viewCount 非數字時 view_count 應為 0"""
    items = [_make_yt_item("v1", view_count="not-a-number")]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items)):
        async with client as c:
            r = await c.get("/trending-videos")

    assert r.json()["videos"][0]["view_count"] == 0


# ── 移除時長過濾 ────────────────────────────────────────────────────────────────
async def test_trending_short_video_not_filtered(client):
    """30 秒短片不應被時長過濾刷掉"""
    items = [_make_yt_item("short", duration_iso="PT30S")]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items)):
        async with client as c:
            # 即便設定 min_duration_minutes=3，短片仍應出現
            await c.put("/settings", json={"min_duration_minutes": 3, "max_duration_minutes": 60})
            r = await c.get("/trending-videos")

    ids = [v["video_id"] for v in r.json()["videos"]]
    assert "short" in ids


async def test_trending_long_video_not_filtered(client):
    """超長影片（90 分鐘）不應被時長過濾刷掉"""
    items = [_make_yt_item("long", duration_iso="PT1H30M")]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items)):
        async with client as c:
            await c.put("/settings", json={"min_duration_minutes": 3, "max_duration_minutes": 60})
            r = await c.get("/trending-videos")

    ids = [v["video_id"] for v in r.json()["videos"]]
    assert "long" in ids


# ── 即將直播排除 ────────────────────────────────────────────────────────────────
async def test_trending_upcoming_live_excluded(client):
    """liveBroadcastContent=='upcoming' 應被排除"""
    items = [
        _make_yt_item("normal", live_broadcast="none"),
        _make_yt_item("upcoming", live_broadcast="upcoming"),
    ]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items)):
        async with client as c:
            r = await c.get("/trending-videos")

    ids = [v["video_id"] for v in r.json()["videos"]]
    assert "normal" in ids
    assert "upcoming" not in ids


# ── 分頁 ────────────────────────────────────────────────────────────────────────
async def test_trending_no_page_token_returns_next_page_token(client):
    """初次請求時，回應應包含 next_page_token"""
    items = [_make_yt_item("v1")]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items, next_page_token="NEXT_ABC")):
        async with client as c:
            r = await c.get("/trending-videos")

    assert r.json()["next_page_token"] == "NEXT_ABC"


async def test_trending_last_page_returns_null_page_token(client):
    """YouTube 回傳沒有 nextPageToken 時應回 next_page_token: null"""
    items = [_make_yt_item("v1")]
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_videos(items, next_page_token=None)):
        async with client as c:
            r = await c.get("/trending-videos")

    assert r.json()["next_page_token"] is None


async def test_trending_passes_page_token_to_youtube(client):
    """`?page_token=XYZ` 應作為 pageToken 傳給 YouTube API"""
    captured_kwargs: dict = {}
    mock_yt = MagicMock()

    def fake_list(**kwargs):
        captured_kwargs.update(kwargs)
        ret = MagicMock()
        ret.execute.return_value = {"items": [_make_yt_item("v1")], "nextPageToken": None}
        return ret

    mock_yt.videos.return_value.list.side_effect = fake_list

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/trending-videos?page_token=XYZ_TOKEN")

    assert r.status_code == 200
    assert captured_kwargs.get("pageToken") == "XYZ_TOKEN"


async def test_trending_no_page_token_omits_page_token_kwarg(client):
    """初次請求不應傳 pageToken kwarg 給 YouTube API"""
    captured_kwargs: dict = {}
    mock_yt = MagicMock()

    def fake_list(**kwargs):
        captured_kwargs.update(kwargs)
        ret = MagicMock()
        ret.execute.return_value = {"items": [], "nextPageToken": None}
        return ret

    mock_yt.videos.return_value.list.side_effect = fake_list

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            await c.get("/trending-videos")

    assert "pageToken" not in captured_kwargs


async def test_trending_includes_statistics_in_part(client):
    """videos.list 呼叫的 part 參數應包含 statistics"""
    captured_kwargs: dict = {}
    mock_yt = MagicMock()

    def fake_list(**kwargs):
        captured_kwargs.update(kwargs)
        ret = MagicMock()
        ret.execute.return_value = {"items": [], "nextPageToken": None}
        return ret

    mock_yt.videos.return_value.list.side_effect = fake_list

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            await c.get("/trending-videos")

    assert "statistics" in captured_kwargs.get("part", "")


async def test_trending_categories_require_auth(client):
    with patch("main.require_credentials") as mock_req:
        from fastapi import HTTPException
        mock_req.side_effect = HTTPException(status_code=401, detail="Missing auth")
        async with client as c:
            r = await c.get("/trending-videos/categories")
    assert r.status_code == 401


async def test_trending_categories_return_ordered_whitelist_without_youtube_call(client):
    with patch("main.require_credentials", return_value=_mock_valid_creds()), \
         patch("main.build") as mock_build, \
         patch("main.consume_quota") as mock_quota:
        async with client as c:
            r = await c.get("/trending-videos/categories")

    assert r.status_code == 200
    assert r.json()["categories"] == main.TRENDING_CATEGORIES
    assert [c["id"] for c in r.json()["categories"]] == [None, "10", "20", "24", "25", "17", "1", "23"]
    assert [c["label"] for c in r.json()["categories"]] == [
        "全部", "🎵 音樂", "🎮 遊戲", "🎬 娛樂", "📰 新聞", "⚽ 運動", "🎞 電影", "😄 喜劇",
    ]
    mock_build.assert_not_called()
    mock_quota.assert_not_called()


async def test_trending_category_adds_video_category_id(client):
    captured_kwargs: dict = {}
    mock_yt = MagicMock()

    def fake_list(**kwargs):
        captured_kwargs.update(kwargs)
        ret = MagicMock()
        ret.execute.return_value = {"items": [_make_yt_item("v1")], "nextPageToken": None}
        return ret

    mock_yt.videos.return_value.list.side_effect = fake_list

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/trending-videos?category=10")

    assert r.status_code == 200
    assert captured_kwargs.get("videoCategoryId") == "10"


async def test_trending_missing_category_omits_video_category_id(client):
    captured_kwargs: dict = {}
    mock_yt = MagicMock()

    def fake_list(**kwargs):
        captured_kwargs.update(kwargs)
        ret = MagicMock()
        ret.execute.return_value = {"items": [], "nextPageToken": None}
        return ret

    mock_yt.videos.return_value.list.side_effect = fake_list

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            await c.get("/trending-videos")

    assert "videoCategoryId" not in captured_kwargs


async def test_trending_invalid_category_returns_400_without_youtube_call(client):
    with patch("main.require_credentials") as mock_req, \
         patch("main.build") as mock_build:
        async with client as c:
            r = await c.get("/trending-videos?category=99")

    assert r.status_code == 400
    mock_req.assert_not_called()
    mock_build.assert_not_called()


async def test_trending_category_and_page_token_propagate(client):
    captured_kwargs: dict = {}
    mock_yt = MagicMock()

    def fake_list(**kwargs):
        captured_kwargs.update(kwargs)
        ret = MagicMock()
        ret.execute.return_value = {"items": [_make_yt_item("v1")], "nextPageToken": None}
        return ret

    mock_yt.videos.return_value.list.side_effect = fake_list

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/trending-videos?page_token=XYZ_TOKEN&category=20")

    assert r.status_code == 200
    assert captured_kwargs.get("pageToken") == "XYZ_TOKEN"
    assert captured_kwargs.get("videoCategoryId") == "20"
