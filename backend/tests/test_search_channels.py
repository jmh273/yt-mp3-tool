"""頻道搜尋端點測試"""
from unittest.mock import MagicMock, patch

import main


def _mock_valid_creds():
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    return creds


def _mock_youtube_channel_search():
    mock_yt = MagicMock()
    search_resource = MagicMock()
    list_request = MagicMock()
    list_request.execute.return_value = {
        "items": [
            {
                "id": {"channelId": "UC_lofi"},
                "snippet": {
                    "title": "Lo-fi Channel",
                    "thumbnails": {
                        "medium": {"url": "https://example.com/medium.jpg"},
                        "default": {"url": "https://example.com/default.jpg"},
                    },
                },
            },
            {
                "id": {},
                "snippet": {"title": "Missing channel id"},
            },
        ]
    }
    search_resource.list.return_value = list_request
    mock_yt.search.return_value = search_resource
    return mock_yt


async def test_search_channels_returns_channels_and_consumes_search_quota(client):
    mock_yt = _mock_youtube_channel_search()

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/search-channels?q=lofi")

    assert r.status_code == 200
    assert r.json()["channels"] == [
        {
            "channel_id": "UC_lofi",
            "title": "Lo-fi Channel",
            "thumbnail": "https://example.com/medium.jpg",
        }
    ]
    mock_yt.search().list.assert_called_once_with(
        part="snippet",
        q="lofi",
        type="channel",
        maxResults=50,
    )
    assert main.load_settings()["quota_used"] == main._QUOTA_SEARCH_LIST


async def test_search_channels_blank_query_does_not_call_youtube_or_consume_quota(client):
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build") as mock_build:
        async with client as c:
            r = await c.get("/search-channels?q=%20%20")

    assert r.status_code == 200
    assert r.json() == {"channels": []}
    mock_build.assert_not_called()
    assert main.load_settings()["quota_used"] == 0
