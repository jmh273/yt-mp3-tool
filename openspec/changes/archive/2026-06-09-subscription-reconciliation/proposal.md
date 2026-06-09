## Why

YouTube `subscriptions.list(mine=true)` 有同步延遲，且實測確認**硬性不同步不會靠重讀 API 自行恢復**——某些確實已訂閱的頻道，可能長期不出現在 `GET /subscriptions`。使用者因此無法判斷「到底是 YouTube 後端少給了哪些頻道，還是自己的程式問題」。目前缺少一個**獨立於那條會延遲的 list API** 的事實來源來比對。唯一完全獨立的 ground truth 是 Google Takeout 的 `subscriptions.csv`，但一般使用者不熟悉去哪匯出、要勾哪些項目。

## What Changes

- 新增**訂閱對帳**能力：以使用者上傳的 Google Takeout `subscriptions.csv` 為獨立事實來源，比對 `GET /subscriptions` 實際回傳，找出「Takeout 有、API 看不到」的頻道，並區分：
  - **死頻道**（`channels.list` 查無 → 已終止／刪除，API 移除是正確的，Takeout 快照殘留）。
  - **真正不同步**（`channels.list` 查得到 → 確實存在卻被 list API 漏掉）。
- 新增引導式 **step-by-step 精靈** UI：圖文指引 + 連結到 Google Takeout，教使用者**先取消全選→只勾「YouTube 和 YouTube Music」→ 點「包含所有 YouTube 資料」→ 先取消全選→只勾「訂閱內容」→ CSV → 等 email 下載解壓**，再上傳；接著呈現比對結果（總數、死頻道數、不同步清單，每筆可在 YouTube 開啟）。
- CSV 於**前端解析**（client-side，不上傳整檔），只把 `channel_id` 清單送後端比對。
- **不同步頻道的手動再同步輔助（1b）**：因 API 無法刪除 list 看不到的訂閱（取不到 `subscription_id`），改引導使用者在 YouTube 網站手動退訂再訂——顯示手勢說明 + 漏訂警告、每列「已處理」勾選（localStorage 持久化）+「已處理 X/N」進度，並提供「重新對帳」（重用已解析 channel_ids，不必重傳）閉環驗證。
- 比對過程的錯誤／成功以改動 A 的 toast 回饋。

## Capabilities

### New Capabilities
- `subscription-reconciliation`: 上傳 Takeout 訂閱清單與 API 訂閱清單對帳，分類死頻道與真正不同步，並以引導精靈呈現。

### Modified Capabilities
<!-- none：不改既有 channel-search / channel-watchlist 的 requirement -->

## Impact

- Backend（新增）：`POST /subscriptions/reconcile`（body `{channel_ids: [...]}`）——抓現有訂閱、算差集、對差集批次 `channels.list` 分類死/活，回傳計數與兩類 id。`backend/main.py` + `backend/tests/test_reconcile.py`。
- Frontend（新增）：對帳精靈元件（如 `frontend/src/components/ReconcileWizard.vue`）、進入點（訂閱分頁的「訂閱對帳」按鈕）；client-side CSV 解析（FileReader）。
- 依賴改動 A：使用 `app-toast` 做錯誤/成功回饋（**A 須先完成**）。
- Tests：`backend/tests/test_reconcile.py`、`frontend/src/tests/ReconcileWizard.test.ts`、e2e `frontend/e2e/verify-subscription-reconciliation.ts`。
- 配額：`subscriptions.list` 分頁（每頁 1）+ `channels.list` 每 50 個差集 id 計 1；差集通常很小，成本低。
