## 1. 先讀清楚現況

- [x] 1.1 確認 `POST /subscriptions/{channel_id}` 回傳 body 是否含 `subscription_id`，若沒有要先補（backend/main.py 對應 handler）
- [x] 1.2 確認 `GET /channels/{id}/videos` ([backend/main.py:762](backend/main.py#L762)) 在使用者**未訂閱**該頻道時仍可正常呼叫（不該有 owner check 等限制）
- [x] 1.3 確認 [stores/auth.ts](frontend/src/stores/auth.ts) 的 `currentAccount` 在切換帳號時為反應式（Pinia state，可被 watch）

## 2. Watchlist store

- [x] 2.1 建立 `frontend/src/stores/watchlist.ts`，定義 `WatchlistItem { channel_id, title, thumbnail, added_at }` interface
- [x] 2.2 實作 state `items: Ref<WatchlistItem[]>`，依 `added_at` desc 排序
- [x] 2.3 實作 `load()`: 從 `localStorage.getItem('watchlist:' + auth.currentAccount)` 讀回；空字串 currentAccount → items = []
- [x] 2.4 實作 `persist()`: 將 items 寫回對應 key；currentAccount 為空時不寫入
- [x] 2.5 實作 `add(channel)`: 重複 channel_id 為 no-op；新增後呼叫 persist
- [x] 2.6 實作 `remove(channelId)`: splice + persist
- [x] 2.7 實作 `has(channelId)`: getter / computed
- [x] 2.8 實作 `promote(channelId)`: 呼叫 `POST /subscriptions/{channelId}`，成功 → remove + 回傳 `{ success, channel, subscription_id }` 給呼叫端，失敗 → 回傳 error 但不 remove
- [x] 2.9 在 store 初始化處 `watch(() => auth.currentAccount, () => load(), { immediate: true })`，切帳號自動換清單

## 3. Watchlist store 單元測試

- [x] 3.1 新增 `frontend/src/tests/watchlist.test.ts`
- [x] 3.2 測 add / remove / has / 重複 add no-op
- [x] 3.3 測 added_at desc 排序
- [x] 3.4 測 localStorage 持久化（mock localStorage，驗證 key 名稱與 JSON 內容）
- [x] 3.5 測切換 `auth.currentAccount` 時 items 重新載入正確帳號的資料
- [x] 3.6 測 currentAccount 為空字串時 items === [] 且不寫 localStorage
- [x] 3.7 測 promote 成功：呼叫 mock api、items 移除該項、回傳結果含 subscription_id
- [x] 3.8 測 promote 失敗：items 保留該項、回傳 error

## 4. WatchlistPanel 元件

- [x] 4.1 新增 `frontend/src/components/WatchlistPanel.vue`
- [x] 4.2 template: 搜尋輸入框 + 觀察名單 row 清單 + 空狀態提示（已登入空 / 未登入分別處理）
- [x] 4.3 每 row 顯示縮圖 + 頻道名 + hover 顯示 `[✕]`、`[➕]` 兩個 icon
- [x] 4.4 row 本體點擊 → emit `select-channel` 事件帶 `channel_id`
- [x] 4.5 `[✕]` 點擊 → `watchlist.remove(id)`，無確認 dialog，stopPropagation
- [x] 4.6 `[➕]` 點擊 → `watchlist.promote(id)`，pending 中兩個 icon 都 disable，stopPropagation
- [x] 4.7 promote 成功 → toast「已訂閱：{title}」+ emit `subscribed` 事件帶新 Channel object（給 HomeView 補進 channels 清單）
- [x] 4.8 promote 失敗 → toast「訂閱失敗：<原因>」
- [x] 4.9 樣式與既有 .channel-card 一致（圓形縮圖、hover 高亮）

## 5. WatchlistPanel 元件測試

- [x] 5.1 新增 `frontend/src/tests/WatchlistPanel.test.ts`
- [x] 5.2 測空狀態文案（已登入 vs 未登入）
- [x] 5.3 測 row 點擊 emit select-channel
- [x] 5.4 測 `[✕]` 點擊不冒泡 + 呼叫 remove
- [x] 5.5 測 `[➕]` 點擊呼叫 promote、pending 時 disabled
- [x] 5.6 測 promote 成功 emit subscribed + 顯示 toast
- [x] 5.7 測搜尋框過濾

## 6. SimilarChannelDiscoveryFeed 改造

- [x] 6.1 import `useWatchlistStore`
- [x] 6.2 卡片按鈕替換：刪除「➕ 訂閱」分支與相關狀態（`subscribing`、`fadingOut`、`handleSubscribe`、`.fade-out` CSS）
- [x] 6.3 新增「👁 加入觀察名單」按鈕；handler 呼叫 `watchlist.add({ channel_id, title, thumbnail })`
- [x] 6.4 已加入時按鈕顯示「✓ 已在觀察名單」、disabled（依 `watchlist.has(channel_id)`）
- [x] 6.5 按下後**不**從清單移除卡片（覆蓋既有的 `discovery.removeChannelFromList` 呼叫點）
- [x] 6.6 移除「訂閱中…」「已訂閱！」相關 toast 邏輯
- [x] 6.7 樣式微調：把 `.subscribe-btn` 樣式替換 / 重命名為 `.watch-btn`，顏色保持紫色系一致

## 7. SimilarChannelDiscoveryFeed 測試更新

- [x] 7.1 更新 [frontend/src/tests/SimilarChannelDiscoveryFeed.test.ts](frontend/src/tests/SimilarChannelDiscoveryFeed.test.ts) 中所有「訂閱」相關 case
- [x] 7.2 新增 case：點「👁 加入觀察名單」→ watchlist store 包含該頻道、卡片不消失
- [x] 7.3 新增 case：已在觀察名單的頻道，按鈕渲染為「✓ 已在觀察名單」+ disabled

## 8. HomeView.vue 左欄改成 tab

- [x] 8.1 新增 `activeLeftTab: 'subscribed' | 'watchlist'`，預設 `'subscribed'`
- [x] 8.2 在 5 個全域導覽按鈕下方加 tab bar：`[訂閱]` / `[觀察名單]`
- [x] 8.3 訂閱 tab 內容 = 既有 searchQuery 輸入框 + filteredChannels 清單 + 「檢查更新日期」按鈕（移入 tab 內，從現位置移走）
- [x] 8.4 觀察名單 tab 內容 = `<WatchlistPanel />`
- [x] 8.5 處理 `@select-channel` 事件：設 `selectedChannelId = id` + `activeView = 'channel'`
- [x] 8.6 處理 `@subscribed` 事件：把新 Channel object append 到 `channels.value`（含 `subscription_id`、`title`、`thumbnail`、`channel_id`）
- [x] 8.7 切 tab 時 MUST NOT 影響中欄 activeView / selectedChannelId
- [x] 8.8 樣式：tab bar 視覺與既有右欄 [下載][音量正規化] tab bar 風格一致

## 9. E2E 驗證腳本

- [x] 9.1 新增 `frontend/e2e/verify-add-channel-watchlist.ts`（沿用 [verify-similar-channel-discovery.ts](frontend/e2e/verify-similar-channel-discovery.ts) 模板）
- [x] 9.2 流程：登入 → 切到「同類新頻道」→ 點任一卡片「👁 加入觀察名單」→ 切到觀察名單 tab → 驗證該頻道出現 → 點該 row → 驗證中欄顯示影片
- [x] 9.3 流程：點 `[✕]` → 驗證從觀察名單消失
- [x] 9.4 流程：點 `[➕]` → 驗證從觀察名單消失、左欄訂閱清單出現新頻道（toast 顯示「已訂閱」）
- [x] 9.5 跨帳號隔離 case（若可在 e2e 環境切帳號）：帳號 A 加入後切到帳號 B → 觀察名單為空

## 10. 文件 & 收尾

- [x] 10.1 更新 README.md「同類新頻道」段落，加入觀察名單流程說明
- [x] 10.2 [openspec/project.md](openspec/project.md) 若有列出 frontend stores 清單，補上 `watchlist`（本 repo 無此檔，無需更新）
- [x] 10.3 跑 `npm run typecheck` + `npm run test` + `npm run lint` 全綠
- [x] 10.4 跑 e2e: `npm run verify -- add-channel-watchlist` 通過
- [x] 10.5 手動煙霧測試：跨帳號加入/移除、頁面 reload 還在、升級訂閱 + 失敗 toast、空狀態提示

## 11. 版本 bump

- [x] 11.1 `package.json` 與 `pyproject.toml` (若有 sync 機制) version → 0.13.0
- [x] 11.2 撰寫 changelog entry
