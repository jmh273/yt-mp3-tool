## Why

從「搜尋頻道」結果卡按「➕ 訂閱」時，若該頻道在目前帳號其實已訂閱，YouTube `subscriptions.insert` 會回 `subscriptionDuplicate`（後端對應 409），但前端 [SearchVideosFeed.vue](frontend/src/components/SearchVideosFeed.vue) 用 `catch {}` 把所有錯誤**靜默吞掉**——使用者點了沒反應、按鈕仍是「➕ 訂閱」可按，且真正的錯誤（配額耗盡、forbidden、網路）也一併消失。根因是 `subscriptions.list(mine=true)` 的同步延遲（已訂頻道暫不出現在訂閱清單，`subscribedIds` 缺漏），導致已訂閱頻道的訂閱鈕無法可靠 disable；唯有 `insert` 會誠實回報 duplicate。先前 `watchlist-subscribe-duplicate-graceful` 已對觀察名單路徑修了同一根因，但**搜尋頻道這條路徑未修**。

## What Changes

- 新增全站共用 **toast 通知** 機制（Pinia store + 掛在 App 根的 toast host），提供 `success` / `error` / `info` 三類短暫通知，供現在與未來各元件複用。
- 搜尋頻道卡「訂閱」動作改為**冪等處理**：
  - 成功 → 綠色 toast「已訂閱『{title}』」，並補進左欄訂閱清單（既有 `emit('subscribed')`）。
  - 409 `subscriptionDuplicate` → 視為**非錯誤**：中性／成功 toast「『{title}』此帳號已訂閱」，並**樂觀地**把該頻道補進訂閱清單（標記 `已訂閱` 並 disable 按鈕）；不顯示紅色錯誤。
  - 其他錯誤（403 配額／forbidden、404、網路、500）→ **紅色錯誤 toast**，顯示後端 `detail`（不再靜默）。
- 訂閱失敗的 toast 文案 MUST NOT 重複「訂閱失敗：」前綴（後端 `detail` 已含一次）。

## Capabilities

### New Capabilities
- `app-toast`: 全站共用的短暫通知（toast）機制——store 管理一佇列通知、host 元件渲染、提供 success/error/info API 與自動消失。

### Modified Capabilities
- `channel-search`: 修改「頻道卡加入觀察名單與訂閱」要求，加入「訂閱動作的結果回饋與 409 冪等處理」——成功/已訂閱/錯誤分別以 toast 呈現，duplicate 視為成功之冪等並樂觀標記，錯誤不再靜默且不重複前綴。

## Impact

- Frontend（新增）：toast store（如 `frontend/src/stores/toast.ts`）、toast host 元件（如 `frontend/src/components/ToastHost.vue`），並掛載於 `frontend/src/App.vue`。
- Frontend（修改）：[SearchVideosFeed.vue](frontend/src/components/SearchVideosFeed.vue) 的 `subscribeChannel`——以 toast 取代 `catch {}`，分流 409 duplicate 與其他錯誤，409 時樂觀 `emit('subscribed')`。
- 後端：**無需變更**（沿用既有 `_subscription_error_status` 與 `subscriptionDuplicate` 偵測；`detail` 已含一次「訂閱失敗：」前綴）。
- Tests：`frontend/src/tests/`（新增 toast store 測試、更新 SearchVideosFeed 訂閱行為測試）；e2e `frontend/e2e/verify-search-subscribe-graceful-toast.ts`。
- 為後續改動 B（`subscription-reconciliation` Takeout 對帳）提供通知基礎。
