# 強化發燒影片頁面 (Enhance Trending Videos)

## Why

目前發燒影片頁面有三個體驗痛點：

1. **看不出熱門程度**：使用者看到「發燒」標籤，但沒有播放數佐證，無法直觀判斷哪部片真的爆紅。
2. **看到的不是真正的 Top 50**：後端用全域時長過濾把短片／長片刷掉，導致實際顯示常常少於 50 部，且偏離 YouTube 的真實熱門排行。
3. **無法瀏覽更深的排行**：YouTube `mostPopular` chart 支援分頁，但目前一次只回 50 部就結束，使用者沒有「看更多」的入口。

這三個問題剛好可以用同一組後端／前端改動解決，因此一次處理。

## What Changes

- **新增**：發燒影片回傳資料含 `view_count`，前端 meta 行顯示「5月7日 · 1.23M views」(採 3 個有效數字格式)
- **新增**：發燒影片支援 `?page_token=...` 分頁，前端提供「載入更多」按鈕（顯示「(約消耗 1 配額)」提示）
- **移除**：發燒影片端點不再套用 `min_duration_minutes` / `max_duration_minutes` 全域時長過濾
  - **保留**：這兩個設定仍給最新影片、頻道影片、搜尋影片使用，行為不變
- **不變**：其他 feed (最新影片、頻道影片、搜尋影片、URL 下載) 完全不動

## Capabilities

### New Capabilities
- `trending-videos-feed`: 涵蓋 `/trending-videos` 後端端點與發燒影片前端視圖的所有需求 — 取得 YouTube 台灣地區 mostPopular 排行、播放數欄位、分頁支援、不套用時長過濾、UI 呈現規則

### Modified Capabilities
- *(無)* — 此次不修改 `latest-videos-feed`、`local-quota-counter` 等既有 spec 的需求

## Impact

**程式碼**：
- `backend/main.py`：`get_trending_videos` (約第 826-881 行) 加 `statistics` part、解析 viewCount、移除時長過濾、加 `page_token` 參數、回傳 `next_page_token`
- `frontend/src/stores/download.ts`：`VideoItem` 介面增加 `view_count?: number` 欄位
- `frontend/src/components/TrendingVideosFeed.vue`：新增 `formatViewCount` helper、meta 行加顯示、追蹤 `nextPageToken`、加「載入更多」按鈕與相關 loading／error 狀態

**API**：
- `GET /trending-videos` 響應格式擴充：新增 `next_page_token` 欄位、影片物件新增 `view_count` 欄位（向下相容，新欄位）
- `GET /trending-videos?page_token=...` 為新支援的查詢參數

**配額**：
- `videos.list` 加 `statistics` 不增加成本（仍是 1 unit / call）
- 「載入更多」每次點擊額外消耗 1 unit

**測試**：
- `frontend/src/tests/TrendingVideosFeed.test.ts` (檔案已存在，新增 case)

**依賴 / 設定**：無新依賴、無新設定。
