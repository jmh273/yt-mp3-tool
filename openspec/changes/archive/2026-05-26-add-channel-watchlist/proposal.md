## Why

「同類新頻道」目前的「➕ 訂閱」是不可逆的單擊動作（直接呼叫 `subscriptions.insert` 並從清單淡出），使用者沒有「先觀察一陣子再決定」的中間狀態。需要一個輕量的「觀察名單」讓使用者把感興趣的新頻道暫存在本地，可隨時看其最近影片、想要時再升級成正式訂閱。

## What Changes

- **BREAKING**（UI 行為變更）：移除「同類新頻道」卡片上的「➕ 訂閱」按鈕，改為「👁 加入觀察名單」。卡片不再因動作而淡出，已加入後按鈕顯示「✓ 已在觀察名單」並 disable。
- 新增 frontend-only 觀察名單 store（`stores/watchlist.ts`），以 `watchlist:${currentAccount}` 為 key 存於 localStorage，跨帳號隔離；切換帳號自動換 key 重載。
- 左欄改成頁籤式：`[訂閱]` / `[觀察名單]` tab bar，預設「訂閱」。訂閱 tab 內容＝現有頻道清單 +「檢查更新日期」按鈕（移入 tab 內）；觀察名單 tab 內容＝觀察名單頻道清單，每 row 顯示 `[✕ 移除]`、`[➕ 訂閱]` 兩個 icon，row 本體可點。
- 點觀察名單 row：沿用既有 `activeView='channel'` + `selectedChannelId` 機制 + 既有 [ChannelVideos.vue](frontend/src/components/ChannelVideos.vue) 元件，右欄顯示該頻道近期影片（播放與下載功能完全沿用）。
- 觀察名單的「➕ 訂閱」icon：呼叫現有 `POST /subscriptions/{channel_id}` → 成功後從觀察名單移除、並把頻道補進左欄訂閱清單（不重打 `/subscriptions` 全量）。
- **後端零改動**：`GET /channels/{id}/videos` ([backend/main.py:762](backend/main.py#L762)) 已是泛用的會計 quota 的 endpoint，直接複用。

## Capabilities

### New Capabilities
- `channel-watchlist`: 在前端本地維護一份「觀察中的頻道」清單，依登入帳號隔離；提供加入/移除/升級訂閱、以及在側邊欄面板顯示與查看其影片的能力。

### Modified Capabilities
- `similar-channel-discovery`: 卡片上的「一鍵訂閱」要求替換為「加入觀察名單」，含按鈕語意、disabled 規則、不再淡出的行為差異。
- `sidebar-layout`: 左欄訂閱頻道區改為「訂閱 / 觀察名單」雙頁籤共用版面；「檢查更新日期」歸屬「訂閱」tab。

## Impact

- **Frontend**:
  - 修改：[frontend/src/components/SimilarChannelDiscoveryFeed.vue](frontend/src/components/SimilarChannelDiscoveryFeed.vue)、[frontend/src/views/HomeView.vue](frontend/src/views/HomeView.vue)
  - 新增：`frontend/src/stores/watchlist.ts`、`frontend/src/components/WatchlistPanel.vue`（新元件，集中觀察名單 tab 的 UI；HomeView 只負責 tab bar 與分派）
  - 既有 `discovery.subscribe()` store action 不刪（觀察名單升級訂閱仍會用到後端同一條 endpoint），但 SimilarChannelDiscoveryFeed 不再呼叫
- **Backend**: 無改動
- **本地儲存**: 新 localStorage key 規約 `watchlist:<email>`，內容為 JSON array of `{ channel_id, title, thumbnail, added_at }`
- **測試**:
  - 更新 [frontend/src/tests/SimilarChannelDiscoveryFeed.test.ts](frontend/src/tests/SimilarChannelDiscoveryFeed.test.ts)（按鈕語意改變）
  - 新增 watchlist store 的 unit test、`WatchlistPanel` component test
  - 新增 e2e: `frontend/e2e/verify-add-channel-watchlist.ts`
- **無遷移風險**: 觀察名單是新增、純本地的概念，無歷史資料；訂閱機制不動
