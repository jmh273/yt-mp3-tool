## Why

目前「🔍 搜尋影片」只能搜影片(yt-dlp，免費)，使用者**無法按名字直接找特定頻道**來訂閱或加入觀察名單。現有頻道入口都不滿足此需求：訂閱清單只列已訂的、觀察名單只列已收藏的、「🧭 同類新頻道」是演算法依口味推的（非指定）。當使用者「聽說有個頻道叫 X」想找出來訂閱/觀察時，沒有任何路徑。

## What Changes

- 在搜尋區新增兩個 checkbox：`☑ 影片`（預設勾選）、`☐ 頻道`，可單選或同時勾選決定搜尋範圍。
- 「頻道」checkbox 旁標注耗額提示（約耗 100 配額），讓使用者在點搜尋前知道成本。
- 新增後端路由 `GET /search-channels?q=`，以 `search.list?type=channel` 取得頻道結果（每次 100 quota），單一 API call 即取齊 `channel_id`／標題／縮圖。
- 搜尋結果分區呈現：勾「頻道」時先顯示「頻道」區（頻道卡），勾「影片」時顯示「影片」區（沿用現有影片卡）；兩者都勾則兩區並存、不混排。
- 頻道卡提供 `👁 加入觀察名單`（複用 watchlist store）與 `➕ 訂閱`（複用 `POST /subscriptions/{id}`）；已在觀察名單／已訂閱時對應按鈕呈現 already 狀態並停用。
- 至少要勾一種；兩者皆未勾時搜尋按鈕停用或提示。

## Capabilities

### New Capabilities

- `channel-search`: 依關鍵字搜尋 YouTube 頻道（Data API search.list type=channel），含搜尋範圍 checkbox（影片/頻道）、頻道結果卡、以及從頻道卡加入觀察名單與訂閱的動作。

### Modified Capabilities

（無 —— 既有影片搜尋無 spec，且其搜尋行為不變，僅新增範圍 checkbox 作為頻道搜尋 capability 的一部分。）

## Impact

- 後端：`backend/main.py` 新增 `GET /search-channels` 路由（`search.list type=channel`、`consume_quota(_QUOTA_SEARCH_LIST)`=100）。
- 前端：`SearchVideosFeed.vue` 新增範圍 checkbox、頻道結果區與頻道卡；`HomeView.vue` 需把目前帳號 `subscribedIds` 傳入 `SearchVideosFeed`（判定已訂閱）。
- 複用：`stores/watchlist.ts`（`add`/`has`）、訂閱 API（`POST /subscriptions/{id}`）、`quotaStore.refresh()`。
- 配額：頻道搜尋每次 100 quota（日額 10000，與訂閱/discovery 共用）；影片搜尋維持 0 quota。
- 非目標（本次不做）：頻道卡「點卡片看該頻道影片」的導頁、quota 不足時的額外警示／確認流程。
