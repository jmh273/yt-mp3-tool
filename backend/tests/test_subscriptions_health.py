"""訂閱頻道健檢端點測試"""
from unittest.mock import MagicMock, patch

import main


def _mock_valid_creds():
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    creds.token = "fake-token"
    return creds


def _mock_youtube_subscriptions(channels: list[dict]):
    """channels: [{subscription_id, channel_id, title}]"""
    items = [
        {
            "id": ch["subscription_id"],
            "snippet": {
                "title": ch["title"],
                "resourceId": {"channelId": ch["channel_id"]},
                "thumbnails": {"default": {"url": ch.get("thumbnail", "")}},
            },
        }
        for ch in channels
    ]
    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {"items": items}
    return mock_yt


# ── _classify_problem 單元測試 ────────────────────────────────────────────────
def test_classify_no_uploads_when_channel_exists():
    assert main._classify_problem("playlist_not_found", exists=True) == "no_uploads"
    assert main._classify_problem("empty", exists=True) == "no_uploads"


def test_classify_deleted_when_channel_missing():
    assert main._classify_problem("playlist_not_found", exists=False) == "deleted"
    assert main._classify_problem("error", exists=False) == "deleted"


def test_classify_forbidden():
    assert main._classify_problem("forbidden", exists=True) == "forbidden"
    assert main._classify_problem("forbidden", exists=False) == "forbidden"


def test_classify_unknown():
    assert main._classify_problem("error", exists=True) == "unknown"


# ── 端點：正常頻道被濾除 ──────────────────────────────────────────────────────
async def test_health_check_filters_ok_channels(client):
    channels = [
        {"subscription_id": "s_a", "channel_id": "UC_a", "title": "Chan A"},
        {"subscription_id": "s_b", "channel_id": "UC_b", "title": "Chan B"},
    ]

    async def fake_probe(creds, channel_id):
        return "ok" if channel_id == "UC_a" else "playlist_not_found"

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main._probe_channel_status", side_effect=fake_probe), \
         patch("main._fetch_existing_channel_ids", return_value={"UC_b"}):
        async with client as c:
            r = await c.get("/subscriptions/health-check")

    assert r.status_code == 200
    data = r.json()
    assert data["checked"] == 2
    problem_ids = [p["channel_id"] for p in data["problems"]]
    assert problem_ids == ["UC_b"]  # 正常的 UC_a 被濾除


# ── 端點：四種 reason 分類 ───────────────────────────────────────────────────
async def test_health_check_classifies_all_reasons(client):
    channels = [
        {"subscription_id": "s_up", "channel_id": "UC_noup", "title": "無上傳"},
        {"subscription_id": "s_del", "channel_id": "UC_del", "title": "已刪除"},
        {"subscription_id": "s_fbd", "channel_id": "UC_fbd", "title": "權限"},
        {"subscription_id": "s_unk", "channel_id": "UC_unk", "title": "未知"},
        {"subscription_id": "s_ok", "channel_id": "UC_ok", "title": "正常"},
    ]
    status_map = {
        "UC_noup": "playlist_not_found",
        "UC_del": "playlist_not_found",
        "UC_fbd": "forbidden",
        "UC_unk": "error",
        "UC_ok": "ok",
    }

    async def fake_probe(creds, channel_id):
        return status_map[channel_id]

    # UC_del 不在 existing → deleted；其餘失敗頻道存在
    existing = {"UC_noup", "UC_fbd", "UC_unk"}

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main._probe_channel_status", side_effect=fake_probe), \
         patch("main._fetch_existing_channel_ids", return_value=existing):
        async with client as c:
            r = await c.get("/subscriptions/health-check")

    assert r.status_code == 200
    data = r.json()
    assert data["checked"] == 5
    by_id = {p["channel_id"]: p for p in data["problems"]}
    assert set(by_id) == {"UC_noup", "UC_del", "UC_fbd", "UC_unk"}  # UC_ok 濾除
    assert by_id["UC_noup"]["reason"] == "no_uploads"
    assert by_id["UC_del"]["reason"] == "deleted"
    assert by_id["UC_fbd"]["reason"] == "forbidden"
    assert by_id["UC_unk"]["reason"] == "unknown"


# ── 端點：回應含 checked 與各欄位 ────────────────────────────────────────────
async def test_health_check_response_shape(client):
    channels = [
        {"subscription_id": "s_a", "channel_id": "UC_a", "title": "Chan A", "thumbnail": "http://t/a.jpg"},
    ]

    async def fake_probe(creds, channel_id):
        return "playlist_not_found"

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=_mock_youtube_subscriptions(channels)), \
         patch("main._probe_channel_status", side_effect=fake_probe), \
         patch("main._fetch_existing_channel_ids", return_value={"UC_a"}):
        async with client as c:
            r = await c.get("/subscriptions/health-check")

    data = r.json()
    assert data["checked"] == 1
    p = data["problems"][0]
    assert p["channel_id"] == "UC_a"
    assert p["subscription_id"] == "s_a"
    assert p["title"] == "Chan A"
    assert p["thumbnail"] == "http://t/a.jpg"
    assert p["reason"] == "no_uploads"
    assert "detail" in p


# ── 未登入 ───────────────────────────────────────────────────────────────────
async def test_health_check_requires_auth(client):
    from fastapi import HTTPException
    with patch("main.require_credentials", side_effect=HTTPException(status_code=401, detail="Missing auth")):
        async with client as c:
            r = await c.get("/subscriptions/health-check")
    assert r.status_code == 401
