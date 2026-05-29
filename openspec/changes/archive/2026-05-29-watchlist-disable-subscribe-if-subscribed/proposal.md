## Why

觀察名單改為跨帳號共用後，一個頻道可能同時存在於共用觀察名單與「目前帳號的訂閱清單」中（例如使用者把已訂閱的頻道加進共用名單以便搬到其他帳號）。此時觀察名單面板仍顯示可點的「➕ 訂閱」icon，重複訂閱沒有意義，且會浪費 quota 或造成困惑。應在進入觀察名單時，對「已在目前帳號訂閱清單中的頻道」停用其「➕ 訂閱」icon。

## What Changes

- 觀察名單面板每個 row 的「➕ 訂閱」icon SHALL 在該頻道已存在於目前帳號訂閱清單時 disabled，並以 tooltip 標示「已訂閱」。
- 是否已訂閱由目前帳號的訂閱清單（`channel_id` 集合）判定；訂閱/取消訂閱後該狀態即時更新。
- 「✕ 移除」icon 不受影響，已訂閱頻道仍可從共用名單移除。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `channel-watchlist`: 新增「已訂閱頻道在觀察名單停用升級（訂閱）動作」的要求。

## Impact

- Frontend：`frontend/src/components/WatchlistPanel.vue` 新增 `subscribedIds` prop，依其判斷停用「➕ 訂閱」按鈕；`frontend/src/views/HomeView.vue` 把目前訂閱清單的 `channel_id` 集合傳入。
- Tests：`frontend/src/tests/WatchlistPanel.test.ts`。
- 無後端 / API 變更。
- 相依：建立於 `shared-watchlist-channel-transfer`（共用觀察名單）之上；本變更的 spec delta 只新增需求、與該變更的 delta 作用於不同 requirement，無重疊。
