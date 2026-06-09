## 1. Toast store 與 host

- [x] 1.1 新增 `frontend/src/stores/toast.ts`（Pinia）：`notifications` 佇列 + `success/error/info/dismiss`，每則含唯一 `id`、`type`、`message`、`timeout`
- [x] 1.2 新增 `frontend/src/components/ToastHost.vue`：`v-for` 渲染佇列、依 `type` 套色、逾時自動 `dismiss`、可手動關閉、空佇列不佔版面
- [x] 1.3 在 `frontend/src/App.vue` 根掛載 `<ToastHost />`

## 2. 搜尋頻道訂閱冪等化 + toast

- [x] 2.1 先讀 `frontend/src/api.ts` 確認 `apiPost` 拋錯形態（是否帶 HTTP status / detail），決定 409 判定方式
- [x] 2.2 改寫 `SearchVideosFeed.vue` 的 `subscribeChannel`：成功 → `toast.success` +（既有）`emit('subscribed')`
- [x] 2.3 409 `subscriptionDuplicate` 分支 → 中性/成功 toast「『{title}』此帳號已訂閱」+ 樂觀 `emit('subscribed')`（用頻道卡自身 `c` 組 channel）
- [x] 2.4 其他錯誤分支 → `toast.error(detail)`，文案不重複「訂閱失敗：」前綴；不加入訂閱清單
- [x] 2.5 移除舊的靜默 `catch {}` 註解與行為

## 3. 測試

- [x] 3.1 新增 `frontend/src/tests/toast.test.ts`：store 的 success/error/info 入列、dismiss、自動消失
- [x] 3.2 更新/新增 `frontend/src/tests/SearchVideosFeed.test.ts`：成功、409 duplicate（中性 toast + emit）、其他錯誤（error toast、不 emit）三情境
- [x] 3.3 撰寫 e2e `frontend/e2e/verify-search-subscribe-graceful-toast.ts`（mock 後端：200 / 409 / 500 三回應，驗證 toast 與按鈕狀態）

## 4. 驗證

- [x] 4.1 跑前端單元測試（`npm test`）綠燈
- [x] 4.2 跑 `frontend/e2e/verify-search-subscribe-graceful-toast.ts` 通過，再建議 verify/archive
