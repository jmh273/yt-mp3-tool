from unittest.mock import MagicMock, patch


def _mock_valid_creds():
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    return creds


def _mock_youtube(subscription_pages: list[dict], channel_items: list[dict] | None = None):
    mock_yt = MagicMock()

    sub_execute = MagicMock(side_effect=subscription_pages)
    mock_yt.subscriptions.return_value.list.return_value.execute = sub_execute

    channel_execute = MagicMock(return_value={"items": channel_items or []})
    mock_yt.channels.return_value.list.return_value.execute = channel_execute

    return mock_yt


async def test_reconcile_reports_dead_and_desynced_channels(client):
    page1 = {
        "items": [
            {"snippet": {"resourceId": {"channelId": "UC_A"}}},
            {"snippet": {"resourceId": {"channelId": "UC_B"}}},
        ],
        "nextPageToken": "next",
    }
    page2 = {
        "items": [
            {"snippet": {"resourceId": {"channelId": "UC_C"}}},
        ],
    }
    mock_yt = _mock_youtube([page1, page2], [{"id": "UC_D"}])

    quota_calls: list[int] = []
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt), \
         patch("main.consume_quota", side_effect=lambda amount=1: quota_calls.append(amount)):
        async with client as c:
            r = await c.post(
                "/subscriptions/reconcile",
                json={"channel_ids": ["UC_A", "UC_B", "UC_C", "UC_D", "UC_E"]},
            )

    assert r.status_code == 200
    body = r.json()
    assert body == {
        "takeout_count": 5,
        "api_count": 3,
        "missing_count": 2,
        "dead": ["UC_E"],
        "desynced": ["UC_D"],
    }
    assert mock_yt.subscriptions.return_value.list.call_count == 2
    mock_yt.channels.return_value.list.assert_called_once()
    assert quota_calls == [1, 1, 1]


async def test_reconcile_skips_channels_lookup_when_all_takeout_ids_exist(client):
    mock_yt = _mock_youtube([
        {
            "items": [
                {"snippet": {"resourceId": {"channelId": "UC_A"}}},
                {"snippet": {"resourceId": {"channelId": "UC_B"}}},
            ],
        },
    ])

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build", return_value=mock_yt), \
         patch("main.consume_quota"):
        async with client as c:
            r = await c.post("/subscriptions/reconcile", json={"channel_ids": ["UC_A", "UC_B", "UC_A"]})

    assert r.status_code == 200
    assert r.json()["takeout_count"] == 2
    assert r.json()["missing_count"] == 0
    assert r.json()["dead"] == []
    assert r.json()["desynced"] == []
    mock_yt.channels.return_value.list.assert_not_called()


async def test_reconcile_rejects_empty_body_before_building_youtube(client):
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main.build") as build, \
         patch("main.consume_quota") as consume_quota:
        async with client as c:
            r = await c.post("/subscriptions/reconcile", json={"channel_ids": []})

    assert r.status_code == 400
    build.assert_not_called()
    consume_quota.assert_not_called()
