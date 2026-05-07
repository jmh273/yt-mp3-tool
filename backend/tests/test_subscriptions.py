"""訂閱清單端點測試"""
from unittest.mock import MagicMock, patch

import pytest
import main


def _mock_valid_creds():
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    return creds


def _mock_youtube_api(channels: list[dict]):
    """建立模擬 YouTube API 回應，單頁無分頁"""
    items = [
        {
            "id": f"sub_{ch['channel_id']}",
            "snippet": {
                "title": ch["title"],
                "resourceId": {"channelId": ch["channel_id"]},
                "thumbnails": {"default": {"url": ch.get("thumbnail", "")}},
            }
        }
        for ch in channels
    ]
    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {
        "items": items,
        # nextPageToken 不存在 → 停止分頁
    }
    return mock_yt


# ── 未登入 ─────────────────────────────────────────────────────────────────────
async def test_subscriptions_requires_auth(client):
    """未登入時 GET /subscriptions 應回傳 401"""
    async with client as c:
        r = await c.get("/subscriptions")
    assert r.status_code == 401


# ── 正常取得清單 ────────────────────────────────────────────────────────────────
async def test_subscriptions_returns_channels(client):
    """登入後應回傳頻道清單"""
    fake_channels = [
        {"channel_id": "UC_aaa", "title": "Channel A", "thumbnail": "http://thumb/a.jpg"},
        {"channel_id": "UC_bbb", "title": "Channel B", "thumbnail": "http://thumb/b.jpg"},
    ]

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_api(fake_channels)):
        async with client as c:
            r = await c.get("/subscriptions")

    assert r.status_code == 200
    channels = r.json()["channels"]
    assert len(channels) == 2
    assert channels[0]["channel_id"] == "UC_aaa"
    assert channels[0]["title"] == "Channel A"
    assert channels[1]["channel_id"] == "UC_bbb"


async def test_subscriptions_empty(client):
    """訂閱清單為空時回傳空陣列"""
    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {"items": []}

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/subscriptions")

    assert r.status_code == 200
    assert r.json()["channels"] == []


async def test_subscriptions_pagination(client):
    """多頁訂閱應正確合併所有結果"""
    page1_items = [{"id": "sub_1", "snippet": {
        "title": "Ch1",
        "resourceId": {"channelId": "UC_1"},
        "thumbnails": {"default": {"url": ""}},
    }}]
    page2_items = [{"id": "sub_2", "snippet": {
        "title": "Ch2",
        "resourceId": {"channelId": "UC_2"},
        "thumbnails": {"default": {"url": ""}},
    }}]

    call_count = 0
    def fake_execute():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {"items": page1_items, "nextPageToken": "token-page2"}
        return {"items": page2_items}

    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.side_effect = fake_execute

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/subscriptions")

    channels = r.json()["channels"]
    assert len(channels) == 2
    assert {ch["channel_id"] for ch in channels} == {"UC_1", "UC_2"}
