"""同類新頻道發現端點測試"""
from unittest.mock import MagicMock, patch

import pytest
import main


def _mock_valid_creds():
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    creds.token = "fake_token"
    return creds


@pytest.fixture(autouse=True)
def clear_discovery_cache():
    main.discovery_cache.clear()
    yield
    main.discovery_cache.clear()


# ── _extract_channel_keywords unit tests ─────────────────────────────────────


def test_extract_keywords_english_branding():
    ch = {
        "snippet": {"title": "Linus Tech Tips"},
        "brandingSettings": {"channel": {"keywords": "tech computer hardware review"}},
    }
    kws = main._extract_channel_keywords(ch)
    assert "linus" in kws
    assert "tech" in kws
    assert "computer" in kws
    assert "hardware" in kws
    assert "review" in kws


def test_extract_keywords_chinese():
    ch = {
        "snippet": {"title": "老高與小茉 Mr Gao"},
        "brandingSettings": {"channel": {"keywords": "老高 小茉 神秘 知識"}},
    }
    kws = main._extract_channel_keywords(ch)
    assert "老高與小茉" in kws or "老高" in kws  # tokenizer 連續 CJK 為一 token
    assert "神秘" in kws
    assert "知識" in kws
    assert "gao" in kws


def test_extract_keywords_filters_stopwords():
    ch = {
        "snippet": {"title": "The Official Channel of Music"},
        "brandingSettings": {"channel": {"keywords": "the a videos channel"}},
    }
    kws = main._extract_channel_keywords(ch)
    assert "the" not in kws
    assert "a" not in kws
    assert "channel" not in kws
    assert "official" not in kws
    assert "videos" not in kws
    assert "music" not in kws  # 在 stopwords 內


def test_extract_keywords_empty_branding_falls_back_to_title():
    ch = {"snippet": {"title": "技客 Geek"}, "brandingSettings": {}}
    kws = main._extract_channel_keywords(ch)
    assert "技客" in kws
    assert "geek" in kws


def test_extract_keywords_missing_branding_section():
    ch = {"snippet": {"title": "純標題頻道"}}
    kws = main._extract_channel_keywords(ch)
    assert "純標題頻道" in kws


def test_extract_keywords_lowercases_and_dedupes():
    ch = {
        "snippet": {"title": "Tech TECH tech"},
        "brandingSettings": {"channel": {"keywords": "Tech"}},
    }
    kws = main._extract_channel_keywords(ch)
    assert kws.count("tech") == 1


def test_extract_keywords_drops_single_char_tokens():
    ch = {
        "snippet": {"title": "A B"},
        "brandingSettings": {"channel": {"keywords": "x y"}},
    }
    kws = main._extract_channel_keywords(ch)
    assert kws == []


# ── _score_and_rank unit tests ────────────────────────────────────────────────


def test_score_and_rank_per_channel_cap():
    """同一頻道最多 _DISCOVERY_MAX_PER_CHANNEL (2) 部"""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    videos = [
        {
            "video_id": f"v{i}",
            "title": f"title {i}",
            "channel_id": "UC_same",
            "published": (now - timedelta(hours=i)).isoformat().replace("+00:00", "Z"),
            "view_count": 1000 * (10 - i),
        }
        for i in range(5)
    ]
    profile = {"keywords": [], "subscribed_channel_ids": set()}
    ranked = main._score_and_rank(videos, profile)
    same_channel = [v for v in ranked if v["channel_id"] == "UC_same"]
    assert len(same_channel) == main._DISCOVERY_MAX_PER_CHANNEL


def test_score_and_rank_recency_dominates_for_equal_velocity():
    """同 view_count 的影片，新的應排前面"""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    videos = [
        {
            "video_id": "old",
            "title": "old",
            "channel_id": "UC_a",
            "published": (now - timedelta(days=30)).isoformat().replace("+00:00", "Z"),
            "view_count": 1000,
        },
        {
            "video_id": "new",
            "title": "new",
            "channel_id": "UC_b",
            "published": (now - timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
            "view_count": 1000,
        },
    ]
    profile = {"keywords": [], "subscribed_channel_ids": set()}
    ranked = main._score_and_rank(videos, profile)
    assert ranked[0]["video_id"] == "new"


def test_score_and_rank_keyword_boost():
    """命中 profile 關鍵字的標題應加分排前面"""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    base_pub = (now - timedelta(hours=24)).isoformat().replace("+00:00", "Z")
    videos = [
        {"video_id": "miss", "title": "unrelated content", "channel_id": "UC_a",
         "published": base_pub, "view_count": 5000},
        {"video_id": "hit", "title": "linus tech review", "channel_id": "UC_b",
         "published": base_pub, "view_count": 5000},
    ]
    profile = {"keywords": ["linus", "tech"], "subscribed_channel_ids": set()}
    ranked = main._score_and_rank(videos, profile)
    assert ranked[0]["video_id"] == "hit"


# ── _filter_candidates unit tests ─────────────────────────────────────────────


def test_filter_drops_subscribed_channels():
    videos = [
        {"video_id": "v1", "title": "x", "channel_id": "UC_sub"},
        {"video_id": "v2", "title": "y", "channel_id": "UC_new"},
    ]
    profile = {"subscribed_channel_ids": {"UC_sub"}}
    out = main._filter_candidates(videos, profile)
    assert [v["video_id"] for v in out] == ["v2"]


def test_filter_drops_duplicate_video_id():
    videos = [
        {"video_id": "v1", "title": "x", "channel_id": "UC_a"},
        {"video_id": "v1", "title": "x", "channel_id": "UC_a"},  # 重複
    ]
    profile = {"subscribed_channel_ids": set()}
    out = main._filter_candidates(videos, profile)
    assert len(out) == 1


def test_filter_requires_keyword_match_when_keywords_present():
    """profile.keywords 非空時，無關影片應被相關性過濾刷掉"""
    videos = [
        {"video_id": "v_off", "title": "K-pop new MV", "channel_id": "UC_a", "channel_title": "KPOP Hits"},
        {"video_id": "v_on", "title": "投資理財新觀念", "channel_id": "UC_b", "channel_title": "股海大哥"},
        {"video_id": "v_chmatch", "title": "今日大盤", "channel_id": "UC_c", "channel_title": "美股大本營"},
        {"video_id": "v_matched", "title": "無關內容", "channel_id": "UC_d",
         "channel_title": "無關頻道", "_matched_keyword": "投資"},
    ]
    profile = {
        "subscribed_channel_ids": set(),
        "keywords": ["投資", "理財", "股票", "etf", "台股", "美股", "財經", "存股"],
    }
    out = main._filter_candidates(videos, profile)
    ids = [v["video_id"] for v in out]
    assert "v_off" not in ids          # title 與 channel 都沒命中
    assert "v_on" in ids               # title 含 "投資" "理財"
    assert "v_chmatch" in ids          # channel_title 含 "美股"
    assert "v_matched" in ids          # _matched_keyword 算命中


def test_filter_allows_all_when_keywords_empty():
    """無 keyword profile（沒訂閱 / 萃取失敗）時不施加相關性過濾"""
    videos = [
        {"video_id": "v1", "title": "Anything", "channel_id": "UC_a", "channel_title": "Channel"},
        {"video_id": "v2", "title": "Random", "channel_id": "UC_b", "channel_title": "Random"},
    ]
    profile = {"subscribed_channel_ids": set(), "keywords": []}
    out = main._filter_candidates(videos, profile)
    assert len(out) == 2


def test_score_channel_title_keyword_hit_boosts_rank():
    """channel_title 命中關鍵字也應加分（不僅 title）"""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    base_pub = (now - timedelta(hours=24)).isoformat().replace("+00:00", "Z")
    videos = [
        {"video_id": "v_chmatch", "title": "今日大盤如何看", "channel_id": "UC_b",
         "channel_title": "美股大本營", "published": base_pub, "view_count": 5000},
        {"video_id": "v_neither", "title": "音樂榜單", "channel_id": "UC_c",
         "channel_title": "Pop Music", "published": base_pub, "view_count": 5000},
    ]
    profile = {"keywords": ["美股", "投資"], "subscribed_channel_ids": set()}
    ranked = main._score_and_rank(videos, profile)
    assert ranked[0]["video_id"] == "v_chmatch"


def test_filter_drops_downloaded(monkeypatch, tmp_path):
    """已下載的影片（依 sanitize 後的 title stem）應被過濾"""
    monkeypatch.setattr(main, "_downloaded_stems_all",
                        lambda: {main._sanitize_filename("Already Downloaded")})
    videos = [
        {"video_id": "v1", "title": "Already Downloaded", "channel_id": "UC_a"},
        {"video_id": "v2", "title": "Fresh Video", "channel_id": "UC_b"},
    ]
    profile = {"subscribed_channel_ids": set()}
    out = main._filter_candidates(videos, profile)
    ids = [v["video_id"] for v in out]
    assert "v1" not in ids
    assert "v2" in ids


# ── endpoint integration tests ────────────────────────────────────────────────


def _make_video_item(vid: str, channel_id: str = "UC_new", title: str | None = None,
                    duration: str = "PT3M", views: str = "1000",
                    live: str = "none", category_id: str = "10"):
    return {
        "id": vid,
        "snippet": {
            "title": title or f"Video {vid}",
            "channelId": channel_id,
            "channelTitle": f"Channel {channel_id}",
            "publishedAt": "2026-05-20T00:00:00Z",
            "thumbnails": {"default": {"url": ""}},
            "liveBroadcastContent": live,
            "categoryId": category_id,
        },
        "contentDetails": {"duration": duration},
        "statistics": {"viewCount": views},
    }


def _make_subscription_item(channel_id: str, title: str = "Sub Channel"):
    return {
        "id": f"sub_{channel_id}",
        "snippet": {
            "title": title,
            "resourceId": {"channelId": channel_id},
            "thumbnails": {"default": {"url": ""}},
        },
    }


def _make_channel_metadata(channel_id: str, title: str, keywords: str = ""):
    return {
        "id": channel_id,
        "snippet": {"title": title},
        "brandingSettings": {"channel": {"keywords": keywords}},
    }


def _make_playlist_item(video_id: str):
    return {"snippet": {"resourceId": {"videoId": video_id}}}


def _build_full_youtube_mock(
    subs: list[dict],
    sub_channel_meta: list[dict],
    sub_latest_videos: list[dict],
    fast_videos: list[dict],
    search_channel_ids: list[str] | None = None,
    full_uploads: list[dict] | None = None,
    full_videos: list[dict] | None = None,
):
    """build a comprehensive youtube mock that routes calls based on which resource is hit."""
    mock_yt = MagicMock()

    # subscriptions.list
    mock_yt.subscriptions().list().execute.return_value = {"items": subs}

    # channels.list 回應隨 part 不同：snippet+brandingSettings (profile metadata)
    mock_yt.channels().list().execute.return_value = {"items": sub_channel_meta}

    # playlistItems.list: 第一次傳訂閱頻道的 latest (1 item)，後面是 candidate uploads
    playlistitems_calls = {"count": 0}
    playlist_sequence = [
        # 每個訂閱頻道 1 部最新
        *[
            {"items": [_make_playlist_item(v["id"])]}
            for v in sub_latest_videos
        ],
        # 每個候選頻道的 uploads（若有）
        *([{"items": [_make_playlist_item(v["id"]) for v in (full_uploads or [])]}]
          if full_uploads else []),
    ]

    def fake_playlist_execute():
        idx = playlistitems_calls["count"]
        playlistitems_calls["count"] += 1
        if idx < len(playlist_sequence):
            return playlist_sequence[idx]
        return {"items": []}

    mock_yt.playlistItems().list().execute.side_effect = fake_playlist_execute

    # videos.list: 第一次抓 sub_latest_videos (for category histogram)
    # 第二次起：fast_videos / full_videos
    videos_calls = {"count": 0}
    videos_sequence = [
        {"items": sub_latest_videos},  # category 直方圖（含全部訂閱 latest）
        # fast_phase 一個 category 一次 → 我們合併成一個回應
        {"items": fast_videos},
        # full_phase videos.list 抓 contentDetails (合併成一個回應)
        *([{"items": full_videos}] if full_videos else []),
    ]

    def fake_videos_execute():
        idx = videos_calls["count"]
        videos_calls["count"] += 1
        if idx < len(videos_sequence):
            return videos_sequence[idx]
        return {"items": []}

    mock_yt.videos().list().execute.side_effect = fake_videos_execute

    # search.list: 回 channel ids
    search_items = [
        {"id": {"channelId": cid}, "snippet": {"title": f"Search {cid}"}}
        for cid in (search_channel_ids or [])
    ]
    mock_yt.search().list().execute.return_value = {"items": search_items}

    # subscriptions.insert
    mock_yt.subscriptions().insert().execute.return_value = {"success": True}

    return mock_yt


async def test_discovery_requires_auth(client):
    with patch("main.require_credentials") as mock_req:
        from fastapi import HTTPException
        mock_req.side_effect = HTTPException(status_code=401, detail="Missing auth")
        async with client as c:
            r = await c.get("/discovery/similar-channels")
    assert r.status_code == 401


async def test_discovery_empty_when_no_subscriptions(client):
    """沒有訂閱頻道時應回傳 empty_reason='no_subscriptions'"""
    mock_yt = MagicMock()
    mock_yt.subscriptions().list().execute.return_value = {"items": []}

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/discovery/similar-channels")

    assert r.status_code == 200
    data = r.json()
    assert data["videos"] == []
    assert data["empty_reason"] == "no_subscriptions"


async def test_discovery_fast_phase_returns_filtered_sorted(client, monkeypatch):
    """fast phase 過濾已訂閱頻道並排序"""
    monkeypatch.setattr(main, "_downloaded_stems_all", lambda: set())

    subs = [_make_subscription_item("UC_sub_a"), _make_subscription_item("UC_sub_b")]
    sub_meta = [_make_channel_metadata("UC_sub_a", "Linus Tech Tips", "tech review")]
    sub_latest = [_make_video_item("vsub1", channel_id="UC_sub_a", category_id="28")]
    fast_videos = [
        _make_video_item("v_new1", channel_id="UC_new1", title="New tech vid"),
        _make_video_item("v_subbed", channel_id="UC_sub_a", title="Subbed already"),
    ]
    mock_yt = _build_full_youtube_mock(subs, sub_meta, sub_latest, fast_videos)

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/discovery/similar-channels?phase=fast")

    assert r.status_code == 200
    data = r.json()
    ids = [v["video_id"] for v in data["videos"]]
    assert "v_new1" in ids
    assert "v_subbed" not in ids  # 已訂閱頻道應過濾掉


async def test_discovery_cache_hit_returns_quickly(client, monkeypatch):
    """同一 session 第二次 request 應命中 cache（不重新 build profile）"""
    monkeypatch.setattr(main, "_downloaded_stems_all", lambda: set())

    subs = [_make_subscription_item("UC_sub_a")]
    sub_meta = [_make_channel_metadata("UC_sub_a", "Tech")]
    sub_latest = [_make_video_item("vsub1", channel_id="UC_sub_a")]
    fast_videos = [_make_video_item("v1", channel_id="UC_new1")]
    mock_yt = _build_full_youtube_mock(subs, sub_meta, sub_latest, fast_videos)

    build_mock = MagicMock(return_value=mock_yt)
    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", build_mock):
        async with client as c:
            r1 = await c.get("/discovery/similar-channels?phase=fast")
            assert r1.status_code == 200
            # 第二次相同 phase + cursor=0 → 應命中 merged cache，不再 build profile
            subs_calls_before = mock_yt.subscriptions.call_count
            r2 = await c.get("/discovery/similar-channels?phase=fast")
            assert r2.status_code == 200
            # subscriptions() 應未再被呼叫（profile cache 命中）
            assert mock_yt.subscriptions.call_count == subs_calls_before


async def test_discovery_cache_isolated_per_email(client, monkeypatch):
    """不同 email 的 cache 互不干擾"""
    monkeypatch.setattr(main, "_downloaded_stems_all", lambda: set())

    subs_a = [_make_subscription_item("UC_a_sub")]
    sub_meta_a = [_make_channel_metadata("UC_a_sub", "A Channel")]
    fast_a = [_make_video_item("va1", channel_id="UC_a_new")]

    subs_b = [_make_subscription_item("UC_b_sub")]
    sub_meta_b = [_make_channel_metadata("UC_b_sub", "B Channel")]
    fast_b = [_make_video_item("vb1", channel_id="UC_b_new")]

    # 兩個獨立 mock
    mock_a = _build_full_youtube_mock(subs_a, sub_meta_a, [], fast_a)
    mock_b = _build_full_youtube_mock(subs_b, sub_meta_b, [], fast_b)

    current_email = {"v": "user_a@example.com"}
    current_mock = {"v": mock_a}

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", side_effect=lambda: current_email["v"]), \
         patch("main.build", side_effect=lambda *a, **kw: current_mock["v"]):
        async with client as c:
            r_a = await c.get("/discovery/similar-channels?phase=fast")
            ids_a = [v["video_id"] for v in r_a.json()["videos"]]
            assert "va1" in ids_a

            current_email["v"] = "user_b@example.com"
            current_mock["v"] = mock_b
            r_b = await c.get("/discovery/similar-channels?phase=fast")
            ids_b = [v["video_id"] for v in r_b.json()["videos"]]
            assert "vb1" in ids_b
            assert "va1" not in ids_b

    # 兩個 email 都應該在 cache
    assert "user_a@example.com" in main.discovery_cache
    assert "user_b@example.com" in main.discovery_cache


async def test_discovery_subscribe_success_removes_from_cache(client, monkeypatch):
    """訂閱成功應更新 cache + 移除該頻道影片"""
    monkeypatch.setattr(main, "_downloaded_stems_all", lambda: set())

    # 預先注入 cache
    main.discovery_cache["user_a@example.com"] = {
        "profile": {"subscribed_channel_ids": set(), "keywords": [], "categories": []},
        "fast_candidates": [{"video_id": "v1", "channel_id": "UC_target", "title": "x"}],
        "full_candidates": [],
        "merged": [{"video_id": "v1", "channel_id": "UC_target", "title": "x"}],
        "cursor": 0,
        "phase_done": {"fast"},
        "built_at": "now",
    }

    mock_yt = MagicMock()
    mock_yt.subscriptions().insert().execute.return_value = {"success": True}

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.post("/discovery/subscribe", json={"channel_id": "UC_target"})

    assert r.status_code == 200
    assert r.json()["success"] is True
    cache = main.discovery_cache["user_a@example.com"]
    assert "UC_target" in cache["profile"]["subscribed_channel_ids"]
    assert all(v["channel_id"] != "UC_target" for v in cache["merged"])
    assert all(v["channel_id"] != "UC_target" for v in cache["fast_candidates"])


async def test_discovery_subscribe_failure_returns_error(client):
    """API 失敗時應回傳對應錯誤"""
    mock_yt = MagicMock()
    mock_yt.subscriptions().insert().execute.side_effect = Exception("subscriptionForbidden: channel rejected")

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.post("/discovery/subscribe", json={"channel_id": "UC_target"})

    assert r.status_code == 403
    assert "訂閱失敗" in r.json()["detail"]


async def test_discovery_invalid_phase_returns_400(client):
    with patch("main.load_credentials", return_value=_mock_valid_creds()):
        async with client as c:
            r = await c.get("/discovery/similar-channels?phase=invalid")
    assert r.status_code == 400


# ── 語言過濾 ────────────────────────────────────────────────────────────────


def test_detect_text_lang_cjk():
    assert main._detect_text_lang("投資理財新觀念") == "cjk"
    assert main._detect_text_lang("美股 ETF 投資") == "cjk"  # CJK 主導
    assert main._detect_text_lang("Linus Tech Tips") == "latin"
    assert main._detect_text_lang("How to invest") == "latin"
    assert main._detect_text_lang("123") == "mixed"
    assert main._detect_text_lang("") == "mixed"


def test_detect_profile_lang_majority():
    cjk_titles = ["股海大哥", "美股大本營", "投資理財X"]
    assert main._detect_profile_lang(cjk_titles) == "cjk"

    latin_titles = ["Linus Tech Tips", "MKBHD", "Veritasium"]
    assert main._detect_profile_lang(latin_titles) == "latin"

    mixed = ["股海大哥", "Linus Tech Tips"]
    assert main._detect_profile_lang(mixed) == "mixed"


def test_filter_lang_excludes_cross_language():
    """profile.lang=cjk 時，純 latin 影片應被過濾"""
    videos = [
        {"video_id": "v_cjk", "title": "投資理財", "channel_id": "UC_a", "channel_title": "股海大哥"},
        {"video_id": "v_latin", "title": "How to invest in stocks", "channel_id": "UC_b",
         "channel_title": "Wall Street", "_matched_keyword": "投資"},
    ]
    profile = {
        "subscribed_channel_ids": set(),
        "keywords": ["投資"],
        "lang": "cjk",
    }
    out = main._filter_candidates(videos, profile)
    ids = [v["video_id"] for v in out]
    assert "v_cjk" in ids
    assert "v_latin" not in ids   # _matched_keyword 在但語言不符仍應濾掉


def test_filter_lang_mixed_passes_all():
    """profile.lang=mixed 不施加語言過濾"""
    videos = [
        {"video_id": "v_cjk", "title": "投資", "channel_id": "UC_a", "channel_title": "x"},
        {"video_id": "v_latin", "title": "Invest", "channel_id": "UC_b", "channel_title": "x"},
    ]
    profile = {"subscribed_channel_ids": set(), "keywords": [], "lang": "mixed"}
    out = main._filter_candidates(videos, profile)
    assert len(out) == 2


# ── disk persistence + force_rebuild ────────────────────────────────────────


def test_profile_disk_roundtrip():
    """profile 寫入磁碟後可以讀回，set 欄位正確還原"""
    profile = {
        "subscribed_channel_ids": {"UC_a", "UC_b"},
        "keywords": ["投資", "理財"],
        "categories": ["25"],
        "lang": "cjk",
        "analyzed_at": "2026-05-23T12:00:00Z",
    }
    main._save_profile_to_disk("user@example.com", profile)
    loaded = main._load_profile_from_disk("user@example.com")
    assert loaded is not None
    assert loaded["subscribed_channel_ids"] == {"UC_a", "UC_b"}
    assert loaded["keywords"] == ["投資", "理財"]
    assert loaded["lang"] == "cjk"
    assert loaded["analyzed_at"] == "2026-05-23T12:00:00Z"


def test_load_profile_missing_returns_none():
    assert main._load_profile_from_disk("never_existed@example.com") is None


async def test_discovery_uses_disk_cache_no_subscriptions_call(client, monkeypatch):
    """已有磁碟 profile 時，endpoint 不應呼叫 subscriptions.list"""
    monkeypatch.setattr(main, "_downloaded_stems_all", lambda: set())

    # 預先寫一份 profile 到磁碟
    main._save_profile_to_disk("user_a@example.com", {
        "subscribed_channel_ids": {"UC_sub_a"},
        "keywords": ["tech"],
        "categories": ["28"],
        "lang": "latin",
        "analyzed_at": "2026-05-23T12:00:00Z",
    })

    # mock youtube：只支援 videos.list (fast phase)，subscriptions.list 應不會被呼叫
    mock_yt = MagicMock()
    mock_yt.videos().list().execute.return_value = {
        "items": [_make_video_item("v1", channel_id="UC_new", title="latest tech news")],
    }
    # 若 subscriptions().list 被打到，會用真實的 MagicMock 回應（不會錯）但我們要驗證它沒被呼叫
    subs_list_mock = MagicMock()
    subs_list_mock.execute.return_value = {"items": []}
    mock_yt.subscriptions.return_value.list.return_value = subs_list_mock

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/discovery/similar-channels?phase=fast")

    assert r.status_code == 200
    # subscriptions.list 不應被呼叫（profile 從磁碟讀）
    subs_list_mock.execute.assert_not_called()


async def test_discovery_force_rebuild_re_analyzes(client, monkeypatch):
    """force_rebuild=true 時即使磁碟有 profile，仍重新呼叫 subscriptions.list"""
    monkeypatch.setattr(main, "_downloaded_stems_all", lambda: set())

    main._save_profile_to_disk("user_a@example.com", {
        "subscribed_channel_ids": {"UC_old"},
        "keywords": ["old_keyword"],
        "categories": [],
        "lang": "latin",
        "analyzed_at": "2020-01-01T00:00:00Z",
    })

    subs = [_make_subscription_item("UC_new_sub")]
    sub_meta = [_make_channel_metadata("UC_new_sub", "New Tech Channel", "new keyword")]
    sub_latest = [_make_video_item("vs1", channel_id="UC_new_sub", category_id="28")]
    fast_videos = [_make_video_item("vc1", channel_id="UC_candidate", title="latest tech update")]
    mock_yt = _build_full_youtube_mock(subs, sub_meta, sub_latest, fast_videos)

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            r = await c.get("/discovery/similar-channels?phase=fast&force_rebuild=true")

    assert r.status_code == 200
    # 重新分析應該寫入磁碟覆蓋舊資料
    on_disk = main._load_profile_from_disk("user_a@example.com")
    assert on_disk is not None
    assert "UC_new_sub" in on_disk["subscribed_channel_ids"]
    assert "UC_old" not in on_disk["subscribed_channel_ids"]
    # 摘要的 analyzed_at 應是新的，包含關鍵字 "new"
    summary = r.json()["profile_summary"]
    assert "new" in summary["keywords"]
    assert summary["lang"] == "latin"


async def test_discovery_no_auto_rebuild_on_cursor_exhaust(client, monkeypatch):
    """cursor 耗盡時應重撈候選但 **不** 重新分析訂閱（subscriptions.list 不應被打）"""
    monkeypatch.setattr(main, "_downloaded_stems_all", lambda: set())

    # 預先注入 in-memory cache（彷彿前一輪剛跑完，剩 0 cursor）
    main.discovery_cache["user_a@example.com"] = {
        "profile": {
            "subscribed_channel_ids": {"UC_sub_a"},
            "keywords": ["tech"],
            "categories": ["28"],
            "lang": "latin",
            "analyzed_at": "2026-05-23T12:00:00Z",
        },
        "fast_candidates": [],
        "full_candidates": [],
        "merged": [],
        "cursor": 0,
        "phase_done": {"fast"},  # 故意設成已跑過，避免再進 fast/full path
        "built_at": "2026-05-23T12:00:00Z",
    }

    mock_yt = MagicMock()
    # 模擬 fast phase 回傳新一批
    mock_yt.videos().list().execute.return_value = {
        "items": [_make_video_item("v_new_round", channel_id="UC_new", title="tech latest")],
    }
    subs_list_mock = mock_yt.subscriptions.return_value.list.return_value
    subs_list_mock.execute.return_value = {"items": []}

    with patch("main.load_credentials", return_value=_mock_valid_creds()), \
         patch("main._get_current_email", return_value="user_a@example.com"), \
         patch("main.build", return_value=mock_yt):
        async with client as c:
            # 帶 cursor=5（已超出 merged=0 長度）
            r = await c.get("/discovery/similar-channels?phase=fast&cursor=5")

    assert r.status_code == 200
    # 不該重新分析訂閱
    subs_list_mock.execute.assert_not_called()
