"""RSS 解析測試"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import main

SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Test Video 1</title>
    <published>2024-01-15T10:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>def456</yt:videoId>
    <title>Test Video 2</title>
    <published>2024-01-14T10:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>ghi789</yt:videoId>
    <title>Test Video 3</title>
    <published>2024-01-13T10:00:00+00:00</published>
  </entry>
</feed>"""

EMPTY_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:yt="http://www.youtube.com/xml/schemas/2015">
</feed>"""


def _make_mock_session(text: str):
    """建立模擬 aiohttp session，回傳指定 XML 文字"""
    mock_response = AsyncMock()
    mock_response.text = AsyncMock(return_value=text)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_response)
    return mock_session


async def test_rss_parses_videos():
    """正常 RSS 應解析出影片清單"""
    session = _make_mock_session(SAMPLE_RSS)
    channel_id, videos = await main.fetch_channel_rss(session, "UC_test", limit=5)

    assert channel_id == "UC_test"
    assert len(videos) == 3
    assert videos[0]["video_id"] == "abc123"
    assert videos[0]["title"] == "Test Video 1"
    assert videos[0]["url"] == "https://www.youtube.com/watch?v=abc123"
    assert "mqdefault.jpg" in videos[0]["thumbnail"]


async def test_rss_respects_limit():
    """limit 參數應限制回傳影片數"""
    session = _make_mock_session(SAMPLE_RSS)
    _, videos = await main.fetch_channel_rss(session, "UC_test", limit=2)
    assert len(videos) == 2


async def test_rss_empty_feed():
    """空 feed 應回傳空清單"""
    session = _make_mock_session(EMPTY_RSS)
    _, videos = await main.fetch_channel_rss(session, "UC_empty", limit=5)
    assert videos == []


async def test_rss_network_error():
    """網路錯誤應回傳空清單，不拋出例外"""
    mock_response = AsyncMock()
    mock_response.__aenter__ = AsyncMock(side_effect=Exception("timeout"))
    mock_response.__aexit__ = AsyncMock(return_value=False)
    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_response)

    channel_id, videos = await main.fetch_channel_rss(mock_session, "UC_err", limit=5)
    assert channel_id == "UC_err"
    assert videos == []


async def test_rss_malformed_xml():
    """損壞的 XML 應回傳空清單，不拋出例外"""
    session = _make_mock_session("<not valid xml <<<")
    _, videos = await main.fetch_channel_rss(session, "UC_bad", limit=5)
    assert videos == []


async def test_channel_videos_endpoint(client):
    """GET /subscriptions/{channel_id}/videos 應透過 RSS 回傳影片"""
    with patch("aiohttp.ClientSession") as MockSession:
        instance = MagicMock()
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockSession.return_value = instance

        with patch("main.fetch_channel_rss", return_value=("UC_test", [
            {"video_id": "v1", "title": "影片一", "published": "2024-01-01T00:00:00+00:00",
             "thumbnail": "https://i.ytimg.com/vi/v1/mqdefault.jpg",
             "url": "https://www.youtube.com/watch?v=v1"}
        ])):
            async with client as c:
                r = await c.get("/subscriptions/UC_test/videos")

    assert r.status_code == 200
    videos = r.json()["videos"]
    assert len(videos) == 1
    assert videos[0]["video_id"] == "v1"
