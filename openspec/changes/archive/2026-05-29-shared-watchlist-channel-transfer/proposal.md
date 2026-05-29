## Why

觀察名單目前依登入帳號隔離（localStorage key `watchlist:<email>`），切帳號就換一份。使用者想用觀察名單當作「把訂閱頻道在不同帳號間搬移」的中繼站，但帳號隔離讓在帳號 A 加入的頻道在帳號 B 看不到，無法達成跨帳號轉移。把觀察名單改為「所有帳號共用一份」，並讓訂閱頻道可一鍵加入觀察名單，就能：在帳號 A 把想搬移的訂閱頻道加進共用名單 → 切到帳號 B → 從共用名單一鍵訂閱。

## What Changes

- **BREAKING**（僅限本機資料）：觀察名單從「依帳號隔離」改為「所有帳號共用一份」。現有 `watchlist:<email>` 資料直接捨棄、不遷移；改用單一固定 key `watchlist:shared`。
- 切換帳號**不再**更換觀察名單內容；共用名單在任何帳號下都顯示同一份。
- 在左欄「訂閱」頻道清單每個 row 新增「加入觀察名單」icon：點擊把該訂閱頻道**複製**進共用觀察名單（目前帳號維持訂閱，不取消）。已在名單中的頻道顯示為 already-added 狀態。
- 既有「升級為訂閱」行為不變：從觀察名單「➕ 訂閱」成功後仍從名單移除。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `channel-watchlist`: 儲存從「依帳號隔離」改為「跨帳號共用單一份」；新增「從訂閱頻道清單加入觀察名單」要求；更新帳號切換與未登入相關行為。

## Impact

- Frontend store：`frontend/src/stores/watchlist.ts` — `storageKey()` 改為固定 `watchlist:shared`、移除依 `currentAccount` 切換/清空的邏輯、`add()` 不再因未登入而 no-op。
- Frontend UI：`frontend/src/views/HomeView.vue` — 訂閱頻道 row 加「加入觀察名單」按鈕與 handler；`frontend/src/components/WatchlistPanel.vue` 未登入空狀態文案調整。
- Tests：`frontend/src/tests/watchlist.test.ts`、`WatchlistPanel.test.ts`，以及 HomeView 相關測試。
- 無後端 API 變更（沿用 `GET /subscriptions`、`POST /subscriptions/{channel_id}`）。
- 既有使用者的 per-account 觀察名單資料會「消失」（改讀新 key）；屬預期，使用者已同意捨棄。
