## Context

「🔍 搜尋影片」目前走 yt-dlp `ytsearch50`（[main.py:2004-2052](backend/main.py#L2004)），**0 quota**，只回影片。專案另有 discovery 分支已用 `youtube.search().list(type="channel")`（[main.py:1434](backend/main.py#L1434)）作頻道搜尋的先例，成本常數 `_QUOTA_SEARCH_LIST = 100`，日額 `YOUTUBE_QUOTA_DAILY_LIMIT = 10000`。

頻道層級的下游動作零件都已存在：觀察名單 `watchlist.add`/`has`（[[channel-watchlist]]）、訂閱 `POST /subscriptions/{id}`、`subscribedIds` 判定（HomeView 已維護）。本變更主要是「新增一條頻道搜尋路由 + 一個頻道卡版面 + 範圍 checkbox」，不造新輪子。

## Goals / Non-Goals

**Goals:**

- 讓使用者按關鍵字找到特定頻道，並一鍵加入觀察名單或訂閱。
- 搜尋範圍可選（影片／頻道／兩者），預設只勾影片以維持免費預設。
- 在使用者付出 100 quota 前，於 UI 明示成本。

**Non-Goals:**

- 不做頻道卡「點卡片 → 看該頻道近期影片」的導頁（省去 SearchFeed→HomeView 的事件接線）。
- 不做 quota 不足時的警示／二次確認；僅在「頻道」checkbox 旁標注耗額。
- 不改影片搜尋既有行為（yt-dlp、結果版面、下載勾選）。
- 不做頻道結果分頁 / 載入更多（單發 search.list 最多 50 筆，v1 一次顯示）。

## Decisions

### 決策一：新路由 `GET /search-channels`，不擴充 `/search-videos`

頻道與影片回傳結構不同（頻道無 video_id/duration、影片無 channel 卡動作），且兩者後端來源不同（Data API vs yt-dlp）。獨立路由讓影片路由零改動、回傳結構單純、前端各自呼叫各自渲染。

- **替代（不採用）**：`/search-videos?types=video,channel` 合併回傳。會讓回應結構與前端渲染條件變雜，且把免費路徑與付費路徑綁在同一端點，誤觸風險高。

### 決策二：頻道搜尋只打一次 `search.list?type=channel`，不抓 uploads

discovery 之所以貴在後續 playlistItems + videos.list；但本功能只需頻道本身（id/title/thumbnail），`search.list` 的 snippet 已含這三者。因此成本固定為**乾淨的 100**，無尾巴。`maxResults` 取 50（單發 100 quota 不因筆數變動）。

頻道結果欄位：`channel_id`（`item.id.channelId`）、`title`（`snippet.title`）、`thumbnail`（`snippet.thumbnails.default/medium.url`）。

### 決策三：兩個獨立 checkbox + 分區渲染（非 toggle、非混排）

依使用者選擇：兩個 checkbox 可同時勾。結果**分區**呈現，順序固定「頻道」區在上、「影片」區在下，各區有標題列；避免異質卡片交錯。

```
☑ 影片   ☐ 頻道 (約耗 100 配額)

── 頻道 ──   (僅當勾頻道)
[頻道卡...]
── 影片 ──   (僅當勾影片)
[影片卡...]
```

- 至少一種：兩者皆未勾時，搜尋按鈕 `disabled`。
- 各區獨立 loading／空狀態（頻道搜尋較慢且耗額，影片免費）。

### 決策四：頻道卡複用既有動作，狀態以現有資料判定

頻道卡動作：
- `👁 加入觀察名單` → `watchlist.add({channel_id, title, thumbnail})`；`watchlist.has(channel_id)` 為 true 時顯示 `✓ 已在觀察名單` 並 disabled。
- `➕ 訂閱` → `POST /subscriptions/{channel_id}`；`subscribedIds.has(channel_id)` 為 true 時顯示 `✓ 已訂閱` 並 disabled。成功後把頻道補進左欄訂閱清單並更新 `subscribedIds`，沿用觀察名單面板既有的 promote/subscribed 事件慣例。

`SearchVideosFeed` 需新增 prop `subscribedIds?: Set<string>`（由 HomeView 傳入，同 WatchlistPanel 模式）與 `subscribed` emit。

### 決策五：耗額標注沿用既有措辭風格

「頻道」checkbox label 後綴「(約耗 100 配額)」，比照既有「載入更多 (約消耗 1 配額)」措辭。搜尋完成後呼叫 `quota.refresh()` 更新配額指示。

## Risks / Trade-offs

- [使用者沒注意 100 quota，連打數次燒掉日額] → checkbox 旁明示耗額；預設只勾免費影片；搜尋由按鈕/Enter 觸發（非逐字），本身已較安全。若日後仍有誤觸，再評估加確認流程（已列 Non-Goal）。
- [頻道搜尋結果與「已訂閱/已在觀察名單」狀態需即時反映] → 沿用響應式 `watchlist.has` 與傳入的 `subscribedIds`；訂閱成功後更新來源 set。
- [search.list 配額由訂閱(50)/discovery(100) 共用，頻道搜尋可能與它們競爭日額] → 屬使用量問題非 bug；耗額已對使用者透明。
- [頻道縮圖尺寸/形狀與影片卡不一致] → 頻道卡採圓形小縮圖（比照訂閱清單 channel-card），與影片卡分區隔開，不要求視覺統一。
