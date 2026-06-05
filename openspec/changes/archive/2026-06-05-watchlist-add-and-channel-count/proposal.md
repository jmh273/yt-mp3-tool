## Why

目前「加入觀察名單」只在左欄訂閱清單與「🧭 同類新頻道」可用；瀏覽「🔥 發燒影片 / 🔍 搜尋影片 / 🔗 網址下載」時看到喜歡的頻道，得先點開頻道或繞路才能收藏，動線斷裂。同時，左欄「訂閱 / 觀察名單」兩個分頁無法一眼看出各自有多少頻道，使用者得切過去才知道數量。

## What Changes

- 在「🔥 發燒影片」「🔍 搜尋影片」「🔗 網址下載」三個影片清單，每張影片卡片加入「👁 加入觀察名單」按鈕，沿用「同類新頻道」既有的按鈕行為（加入後切換為「✅ 已在觀察名單」並停用）。
- 當影片缺少 `channel_id`（部分 yt-dlp 扁平解析結果，尤其播放清單預覽）時，該按鈕停用並提示無法加入，避免加入空頻道。
- 左欄「訂閱」與「觀察名單」兩個分頁標題顯示對應頻道數量，格式 `訂閱 (nn)`、`觀察名單 (nn)`；數量隨訂閱/觀察名單增減即時更新。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `channel-watchlist`: 新增「從影片清單（發燒／搜尋／網址下載）加入觀察名單」的要求，並涵蓋缺少 `channel_id` 時的停用行為；新增「左欄分頁標題顯示訂閱與觀察名單頻道數量」的要求。

## Impact

- 前端元件：`TrendingVideosFeed.vue`、`SearchVideosFeed.vue`、`UrlDownloadFeed.vue`（新增按鈕與 watchlist store 連動）、`HomeView.vue`（分頁標題顯示數量）。
- 共用 store：`stores/watchlist.ts`（沿用既有 `add` / `has`，不需後端變更）。
- 後端：不需變更；既有 `/trending-videos`、`/search-videos`、`/url-preview` 已回傳 `channel_id`（搜尋／網址預覽在來源缺值時可能為空字串）。
- 測試：新增三個 feed 元件的觀察名單按鈕測試與 HomeView 分頁數量測試；新增對應 Playwright verify 腳本。
