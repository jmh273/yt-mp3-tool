## 1. 影片清單加入觀察名單按鈕

- [x] 1.1 在 `TrendingVideosFeed.vue` 引入 `useWatchlistStore`，於每張卡片 `.info` 內加入「加入觀察名單」按鈕（沿用 `SimilarChannelDiscoveryFeed.vue` 的 `watch-btn` 樣式與文字邏輯），並新增 `handleAddToWatchlist(video)`（含 `if (!video.channel_id) return` 防衛）
- [x] 1.2 在 `TrendingVideosFeed.vue` 按鈕綁定：`watchlist.has(v.channel_id || '')` 顯示「✓ 已在觀察名單」並 `disabled`；`!v.channel_id` 時 `disabled` 並以 tooltip／文字提示無法加入
- [x] 1.3 在 `SearchVideosFeed.vue` 重複 1.1–1.2 的按鈕與 handler（搜尋結果 `channel_id` 可能為空，停用提示須生效）
- [x] 1.4 在 `UrlDownloadFeed.vue` 重複 1.1–1.2 的按鈕與 handler（播放清單預覽 `channel_id` 常缺，停用提示須生效）

## 2. 左欄分頁標題顯示頻道數量

- [x] 2.1 在 `HomeView.vue` 的 `.left-tab-bar`，把「訂閱」標籤改為 `訂閱 ({{ channels.length }})`
- [x] 2.2 在 `HomeView.vue` 的 `.left-tab-bar`，把「觀察名單」標籤改為 `觀察名單 ({{ watchlist.items.length }})`

## 3. 測試

- [x] 3.1 為三個 feed 元件新增（或擴充）單元測試：帶 `channel_id` 點按後 `watchlist.has` 為 true 且按鈕進入 already-added 狀態；缺 `channel_id` 時按鈕 `disabled` 且不寫入名單
- [x] 3.2 擴充 `HomeView.watchlist.test.ts`：驗證分頁標題顯示 `訂閱 (n)` / `觀察名單 (n)`，且加入後數量即時更新
- [x] 3.3 撰寫並執行 `frontend/e2e/verify-watchlist-add-and-channel-count.ts`（Playwright），覆蓋三個 feed 加入觀察名單、缺 channel_id 停用、分頁數量更新 —— 7/7 PASS；並註冊進 `e2e/verify.ts` dispatcher

## 4. 驗收

- [x] 4.1 執行 `npx vitest run`（frontend）確認單元測試全綠（191 passed）
- [x] 4.2 執行 `vue-tsc --noEmit` type-check，確認無新增錯誤（exit 0）
