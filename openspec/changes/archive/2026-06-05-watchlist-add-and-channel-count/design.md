## Context

「觀察名單」是存在前端 localStorage（固定 key `watchlist:shared`）的共用頻道清單，store 提供 `add` / `has` / `remove`，由 [[channel-watchlist]] capability 定義。目前可加入觀察名單的入口只有：左欄訂閱清單每個頻道 row、以及「🧭 同類新頻道」每張卡片。後者（`SimilarChannelDiscoveryFeed.vue`）已有成熟的按鈕樣式與行為可複用。

「🔥 發燒影片」「🔍 搜尋影片」「🔗 網址下載」三個 feed 也以卡片呈現影片，卡片資料型別同為 `VideoItem`（含 optional `channel_id`、`channel_title`、`thumbnail`），但目前卡片沒有加入觀察名單的入口。

左欄「訂閱 / 觀察名單」分頁列（`HomeView.vue` 的 `.left-tab-bar`）目前只顯示純文字標籤。訂閱頻道數量為 `channels.value.length`，觀察名單數量為 `watchlist.items.length`，兩者皆已是現成的響應式資料。

## Goals / Non-Goals

**Goals:**

- 在三個影片 feed 的每張卡片提供「加入觀察名單」按鈕，行為與「同類新頻道」一致（加入後變「✅ 已在觀察名單」並停用）。
- 缺少 `channel_id` 的影片，按鈕停用且提示無法加入，不得加入空 channel_id。
- 左欄兩個分頁標題顯示頻道數量，格式 `訂閱 (nn)` / `觀察名單 (nn)`，即時反映增減。

**Non-Goals:**

- 不改動後端任何 endpoint；不為了補 `channel_id` 而新增 API 呼叫或額外配額消耗。
- 不調整觀察名單的儲存模型、升級訂閱流程、跨帳號搬移語意。
- 不在右欄分頁（下載／正規化／上傳）或其他位置加數量徽章。

## Decisions

### 決策一：複用「同類新頻道」的加入觀察名單模式，而非抽共用元件

三個 feed 各自加一個按鈕與一個 `handleAddToWatchlist(video)` handler，沿用 `SimilarChannelDiscoveryFeed.vue` 既有寫法：按鈕綁 `watchlist.has(v.channel_id || '')` 決定文字與 `disabled`，handler 內呼叫 `watchlist.add({ channel_id, title: channel_title || channel_id, thumbnail })`。

- **為何不抽共用元件**：三個 feed 的卡片版面、樣式 class 與互動細節各有差異（發燒有分類、網址有分頁、搜尋較精簡），現階段抽元件的收斂成本高於收益；沿用既有就地模式可降低風險，與 codebase 現況一致。後續若卡片要統一可另開重構 change（見 [[feedback_auto_playwright_verify]] 之外的重構筆記慣例）。

### 決策二：缺少 `channel_id` 時停用按鈕並提示

`/trending-videos` 後端必帶 `channel_id`；但 `/search-videos`、`/url-preview` 透過 yt-dlp 扁平解析，`channel_id` 在來源缺值時為空字串（尤其播放清單預覽 `extract_flat: "in_playlist"`）。觀察名單以 `channel_id` 為主鍵，加入空字串會污染名單。

因此按鈕在 `!v.channel_id` 時 `disabled`，文字顯示「無法加入（缺頻道資訊）」或以 tooltip 提示；`handleAddToWatchlist` 同時 early-return 防衛 `if (!video.channel_id) return`。

- **替代方案（不採用）**：點按時再打 API 補 `channel_id`。會引入額外配額消耗與延遲，違反 Non-Goals，且互動複雜。

### 決策三：分頁標題以 computed 直接插值數量

`HomeView.vue` 模板直接寫 `訂閱 ({{ channels.length }})` 與 `觀察名單 ({{ watchlist.items.length }})`。`channels` 為現有 ref、`watchlist.items` 為 store ref，皆響應式，訂閱新增/取消、觀察名單加入/移除/升級時自動更新，無需額外狀態。

- **格式**：採需求指定的 `名稱 (nn)`，數字與括號間留一空格以符合既有中英混排風格；數量為 0 時顯示 `(0)`（不隱藏），讓使用者明確知道為空。

## Risks / Trade-offs

- [搜尋／網址預覽常常缺 `channel_id`，按鈕大量停用，使用者困惑] → 以明確 tooltip／按鈕文字說明「缺頻道資訊無法加入」，而非靜默無反應；發燒影片一定可用，體驗主場景不受影響。
- [`channel_title` 為空時加入名單顯示不佳] → 沿用既有 fallback `title: channel_title || channel_id`，與「同類新頻道」一致。
- [三處重複按鈕邏輯造成日後維護分散] → 接受短期重複，於 proposal/Impact 記錄，未來可抽 `<WatchlistAddButton>` 共用元件再統一。
