"""最新影片端點測試"""
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import main

# 在 autouse mock_enhance_and_filter fixture 替換之前保存真實函式 reference，
# 給需要驗證 duration filter 行為的 test 使用。
_REAL_ENHANCE = main.enhance_and_filter_videos


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


async def test_latest_videos_fetches_50_per_channel_ignoring_videos_per_channel_setting(client):
    """latest-videos 應對每個訂閱頻道從 YouTube API 抓 50 部（單次上限），
    不受 settings.videos_per_channel 限制——否則高頻道在時窗內的早期影片會被截斷。
    Regression: 使用者設 30h 時窗卻只看到 11h 內 53 部影片。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    captured_limits = []

    async def fake_fetch(youtube, channel_id, limit, channel_title=""):
        captured_limits.append(limit)
        return channel_id, []

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", side_effect=fake_fetch):
        async with client as c:
            # 故意把 videos_per_channel 設低，確認 latest-videos 不受影響
            await c.put("/settings", json={"videos_per_channel": 5})
            await c.get("/latest-videos?hours=30")

    assert captured_limits == [50], (
        f"latest-videos 應抓 50 部/頻道（API 單次上限），實際抓了 {captured_limits}。"
        " 若這裡又變回 5 表示 videos_per_channel 又被誤用了。"
    )


async def test_latest_videos_applies_duration_filter(client):
    """duration filter 應作用於整個時窗：範圍外的 shorts 全濾掉，合格的 normal 全留下。

    Setup: 1 channel, 200 videos within 48h:
      - 前 150 部 (時間較新, 0-15h) 全是 shorts (60 秒, 在 3min-60min 過濾範圍外)
      - 後 50 部 (時間較舊, 15-48h) 都是 normal (10 分鐘, 過濾範圍內)
    Expected: 回傳 50 部 normal 影片，全部位於 15-48h 區間，0 部 shorts。
    """
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]

    shorts = [_make_video(f"short{i}", hours_ago=i * 0.1) for i in range(150)]  # 0-15h, 全 shorts
    normals = [_make_video(f"norm{i}", hours_ago=15 + i * 0.5) for i in range(50)]  # 15-40h, 全 10min
    all_videos = shorts + normals

    def fake_videos_list(part, id):
        ids = id.split(",")
        items = []
        for vid in ids:
            duration = "PT1M" if vid.startswith("short") else "PT10M"
            items.append({
                "id": vid,
                "snippet": {"liveBroadcastContent": "none"},
                "contentDetails": {"duration": duration},
            })
        m = MagicMock()
        m.execute.return_value = {"items": items}
        return m

    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {
        "items": [{"snippet": {
            "title": "Chan A",
            "resourceId": {"channelId": "UC_a"},
            "thumbnails": {"default": {"url": ""}},
        }}]
    }
    mock_yt.videos.return_value.list.side_effect = fake_videos_list

    async def fake_fetch(youtube, channel_id, limit, channel_title=""):
        return channel_id, all_videos

    # 這個 test 要驗證 duration filter 真的有跑，所以用 _REAL_ENHANCE 覆寫 autouse 的 passthrough mock
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt), \
         patch("main.fetch_channel_videos_api", side_effect=fake_fetch), \
         patch("main.enhance_and_filter_videos", side_effect=_REAL_ENHANCE):
        async with client as c:
            await c.put("/settings", json={
                "min_duration_minutes": 3,
                "max_duration_minutes": 60,
            })
            r = await c.get("/latest-videos?hours=48")

    assert r.status_code == 200
    videos = r.json()["videos"]
    ids = [v["video_id"] for v in videos]
    # 應該收到 50 部 normal，0 部 shorts
    norm_count = sum(1 for vid in ids if vid.startswith("norm"))
    short_count = sum(1 for vid in ids if vid.startswith("short"))
    assert short_count == 0, f"shorts 應被 duration filter 全部濾掉，但有 {short_count} 部"
    assert norm_count == 50, f"normal 應全部留下，實際 {norm_count}"


async def test_latest_videos_returns_all_matching_videos(client):
    """移除 100 上限後，符合條件的影片應全部回傳，依 published 由新到舊排序。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    # 150 部 distinct 影片，全在時窗內；i 越大代表越舊（hours_ago 越大）
    all_videos = [_make_video(f"v{i:03d}", hours_ago=1 + i * 0.01) for i in range(150)]

    mock_yt = _mock_youtube_subscriptions(channels)

    async def fake_fetch(youtube, channel_id, limit, channel_title=""):
        return channel_id, all_videos

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt), \
         patch("main.fetch_channel_videos_api", side_effect=fake_fetch):
        async with client as c:
            r = await c.get("/latest-videos?hours=9999")

    assert r.status_code == 200
    videos = r.json()["videos"]
    assert len(videos) == 150, f"應回傳全部 150 部（無 100 上限），實際 {len(videos)}"
    published = [v["published"] for v in videos]
    assert published == sorted(published, reverse=True), "應依 published 由新到舊排序"


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


async def test_latest_videos_downloaded_today_highlight_prefix_matches_plain_file(client, tmp_path):
    """標題帶「【精華】」前綴的影片，應對上不含前綴的既有檔案（精華版重新上架）。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    highlight = _make_video("v_hl", hours_ago=1)
    highlight["title"] = "【精華】My Talk"

    today_dir = tmp_path / datetime.now().strftime("%Y%m%d")
    today_dir.mkdir(parents=True)
    # 既有檔案是不含前綴的原版（sanitize("My Talk") == "My Talk"）
    (today_dir / "03_My Talk.mp3").write_bytes(b"")

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [highlight])):
        async with client as c:
            await c.put("/settings", json={"output_path": str(tmp_path)})
            r = await c.get("/latest-videos?hours=24")

    assert r.json()["videos"][0]["downloaded_today"] is True


async def test_latest_videos_downloaded_today_plain_matches_highlight_file(client, tmp_path):
    """反向：不含前綴的候選影片，應對上磁碟上含「精華」前綴的既有檔案。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    plain = _make_video("v_plain", hours_ago=1)
    plain["title"] = "My Talk"

    today_dir = tmp_path / datetime.now().strftime("%Y%m%d")
    today_dir.mkdir(parents=True)
    # 既有檔案是先前下載的精華版（sanitize("【精華】My Talk") == "精華_My Talk"）
    (today_dir / "02_精華_My Talk.mp3").write_bytes(b"")

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [plain])):
        async with client as c:
            await c.put("/settings", json={"output_path": str(tmp_path)})
            r = await c.get("/latest-videos?hours=24")

    assert r.json()["videos"][0]["downloaded_today"] is True


async def test_latest_videos_downloaded_today_interior_highlight_not_stripped(client, tmp_path):
    """標題中間（非開頭）出現「精華」不應被正規化，無對應檔案時仍為 false。"""
    channels = [{"channel_id": "UC_a", "title": "Chan A"}]
    video = _make_video("v_mid", hours_ago=1)
    video["title"] = "年度精華回顧"

    today_dir = tmp_path / datetime.now().strftime("%Y%m%d")
    today_dir.mkdir(parents=True)  # 空資料夾

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main.fetch_channel_videos_api", return_value=("UC_a", [video])):
        async with client as c:
            await c.put("/settings", json={"output_path": str(tmp_path)})
            r = await c.get("/latest-videos?hours=24")

    assert r.json()["videos"][0]["downloaded_today"] is False
