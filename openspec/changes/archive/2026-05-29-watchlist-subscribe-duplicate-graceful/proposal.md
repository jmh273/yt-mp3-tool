## Why

從觀察名單點「➕ 訂閱」時，若該頻道在目前帳號其實已訂閱，YouTube 會回傳 `subscriptionDuplicate`（HTTP 400/409），前端就跳出紅色錯誤 toast：「訂閱失敗：訂閱失敗：<HttpError 400 ... The subscription that you are trying to create already exists ...>」。這對使用者其實不是錯誤——該帳號已訂閱；而且訊息把「訂閱失敗：」前綴重複兩次、又攤出原始 HttpError，體驗很差。

根因：YouTube `subscriptions.list(mine=true)` 有**資料同步延遲**——某頻道明明已訂閱，卻可能一段時間不出現在 `GET /subscriptions` 結果中（實測：在 YouTube 取消訂閱再重新訂閱後，清單才會反映、icon 才正確 disable）。因此前端的訂閱清單 `channels` 可能缺漏實際已訂閱的頻道，UI 的「已訂閱就停用訂閱鈕」無法保證涵蓋；唯有 `subscriptions.insert` 會誠實回報 `subscriptionDuplicate`。（共用觀察名單跨帳號顯示，使得「名單有、目前帳號訂閱清單沒有」更常見，但本案的主因是上述 list 同步延遲。）故需在升級流程本身對 duplicate 做防呆。

## What Changes

- 升級（promote）遇到 `subscriptionDuplicate` 時，前端 SHALL 視為非錯誤：以中性樣式提示「「{title}」此帳號已訂閱」，**保留**該項於共用觀察名單（不自動移除——它可能要搬到其他帳號，且不一定出現在目前帳號的訂閱清單）；不顯示紅色錯誤，也不在訂閱清單追加該頻道。
- 其他升級失敗（quota 耗盡、forbidden、notFound…）維持原本的錯誤提示與「保留項目」行為。
- 修正錯誤 toast 重複前綴「訂閱失敗：訂閱失敗：」——後端 detail 已含一次，前端不再二次前綴。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `channel-watchlist`: 修改「升級為訂閱」要求，加入「已訂閱（subscriptionDuplicate）視為成功之冪等處理」與「錯誤 toast 不重複前綴」。

## Impact

- Frontend：`frontend/src/stores/watchlist.ts`（`promote()` 偵測 duplicate → 移除並回傳 alreadySubscribed 結果）、`frontend/src/components/WatchlistPanel.vue`（依結果顯示中性提示；錯誤分支不再二次前綴）。
- Tests：`frontend/src/tests/watchlist.test.ts`、`WatchlistPanel.test.ts`。
- 後端無需變更（沿用既有 `subscriptionDuplicate` 偵測；偵測字串 `subscriptionDuplicate` 已穩定出現在 detail 中）。
- 與其他未封存變更（`shared-watchlist-channel-transfer`、`watchlist-disable-subscribe-if-subscribed`）作用於 `channel-watchlist` 的**不同 requirement**，spec delta 無重疊。
