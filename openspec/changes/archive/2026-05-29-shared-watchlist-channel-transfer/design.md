## Context

觀察名單目前是純前端 localStorage、依帳號隔離的 store（[frontend/src/stores/watchlist.ts](frontend/src/stores/watchlist.ts)）：

- `storageKey()` 回傳 `watchlist:${auth.currentAccount}`，未登入時回傳 `''`。
- `watch(() => auth.currentAccount, () => load(), { immediate: true })` 在帳號切換時重載 → 換帳號就換一份。
- `add()` 在 `!auth.currentAccount` 時 no-op。
- `promote()` 呼叫 `POST /subscriptions/{channel_id}`，成功後 `remove()`。

左欄訂閱清單在 [frontend/src/views/HomeView.vue](frontend/src/views/HomeView.vue)，每個訂閱 row 目前有 🗑️ 取消訂閱按鈕（`deleteChannel`，呼叫 `DELETE /subscriptions/{subscription_id}`）。觀察名單面板 [WatchlistPanel.vue](frontend/src/components/WatchlistPanel.vue) 提供 ➕ 訂閱 / ✕ 移除 / 點 row 看影片。

目標：把觀察名單變成跨帳號共用一份，作為「把訂閱頻道從一個帳號搬到另一個帳號」的中繼站。

## Goals / Non-Goals

**Goals:**
- 觀察名單改為單一份、跨帳號共用，存於固定 key `watchlist:shared`；切帳號不換內容。
- 訂閱頻道清單每 row 新增「加入觀察名單」icon，複製頻道進共用名單（不取消訂閱）。
- 既有「升級為訂閱（成功即移除）」行為不變。

**Non-Goals:**
- 不做舊 `watchlist:<email>` → `watchlist:shared` 資料遷移（使用者同意捨棄）。
- 不做後端持久化 / 跨裝置同步（仍是本機 localStorage）。
- 「加入觀察名單」不取消目前帳號訂閱（複製語意，非搬移語意）。
- 不在最新影片卡片上加按鈕（僅訂閱清單）。

## Decisions

**1. 固定共用 key `watchlist:shared`。** `storageKey()` 直接回傳常數 `'watchlist:shared'`，不再依 `auth.currentAccount`。移除 `watch(currentAccount, load)`；改在 store 初始化時 `load()` 一次即可（內容不隨帳號變動）。舊的 `watchlist:<email>` key 留在 localStorage 成為孤兒，不主動清除（無害，且避免誤刪）。

**2. `add()` 解除未登入 gate。** 改為只要 `!has(channel_id)` 就加入。來源（訂閱 row、同類新頻道）本就在登入後才出現，但共用名單本身與登入無關，故不應因 `currentAccount` 為空而拒絕。

**3. 訂閱 row 的「加入觀察名單」icon。** 在 HomeView 訂閱清單 row（🗑️ 旁）新增一個 icon 按鈕，`@click.stop` 呼叫 `watchlist.add({ channel_id, title, thumbnail })`。用 `watchlist.has(ch.channel_id)` 決定 already-added 樣式（勾選/disabled）。訂閱 `Channel` 物件需有 `channel_id`、`title`、`thumbnail`；若 thumbnail 欄位名不同，於 handler 對應。

**4. 升級為訂閱維持現行。** `promote()` 不改：成功後仍 `remove()`。跨帳號搬移流程靠「在 A 加入共用名單 → 在 B 訂閱」達成；B 訂閱後從共用名單移除是可接受的（單向搬移）。

**5. WatchlistPanel 未登入空狀態。** 不再顯示「請先登入」式阻擋；共用名單一律載入並顯示。空名單時顯示既有的空狀態文案。

## Spec sync note

`channel-watchlist` 的 `### Requirement: 觀察名單本地儲存與帳號隔離` 在本變更中**改名並改寫**為 `### Requirement: 觀察名單本地儲存（跨帳號共用）`。封存 sync 時需以新名稱取代主 spec 中的舊 requirement（移除舊標題、置入新標題與內容），避免主 spec 同時留下兩份。

## Risks / Trade-offs

- **舊資料消失。** 使用者切到新 key 後，原 per-account 名單看似清空。已與使用者確認可捨棄；如日後想保留，可加一次性遷移（合併所有 `watchlist:*` → `watchlist:shared`），目前不做。
- **複製非搬移可能造成重複訂閱。** 在 A 仍訂閱、又在 B 訂閱，兩帳號都有該頻道。符合「只複製」決策；使用者可自行於 A 用 🗑️ 取消。
- **訂閱 `Channel` 缺 thumbnail 欄位。** 需確認 `GET /subscriptions` 回傳的 channel 物件欄位名；若無 thumbnail 則加入名單時該欄位為空字串，面板縮圖顯示 fallback。
