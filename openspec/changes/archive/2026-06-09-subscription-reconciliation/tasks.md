## 1. 後端：對帳路由

- [x] 1.1 在 `backend/main.py` 新增 `POST /subscriptions/reconcile`，body `{channel_ids: list[str]}`；空/缺漏回 400 且不打任何 API
- [x] 1.2 抽出或重用 `subscriptions.list(mine=true)` 分頁邏輯取得 `api_ids` 集合
- [x] 1.3 算差集 `missing = unique(channel_ids) − api_ids`
- [x] 1.4 對 `missing` 每 50 個一批 `channels.list(part="id", id=...)`，分類 `dead`（查無）/ `desynced`（查得到）；每批 `consume_quota(1)`
- [x] 1.5 回傳 `{takeout_count, api_count, missing_count, dead, desynced}`

## 2. 後端：測試

- [x] 2.1 `backend/tests/test_reconcile.py`：mock `build`，涵蓋「死+不同步混合」「全部一致 missing_count=0」「空清單 400 且未呼叫 API」三情境，並斷言 quota 計入

## 3. 前端：CSV 解析 + 對帳精靈

- [x] 3.1 client-side CSV 解析工具（FileReader）：略過標頭、取第一欄 channel_id、保留 title/url、容忍 BOM/空行；解析不到 id → 錯誤 toast
- [x] 3.2 `frontend/src/components/ReconcileWizard.vue`：Step1 指引 + Google Takeout 連結；Step2 檔案選擇/拖曳；Step3 結果（總數/死頻道數/不同步清單，每筆 title + 「在 YouTube 開啟」`https://www.youtube.com/channel/<id>`）
- [x] 3.3 呼叫 `POST /subscriptions/reconcile`，loading 狀態；失敗用 `app-toast` 錯誤回饋（依賴改動 A）
- [x] 3.4 在 `HomeView.vue` 訂閱分頁加「訂閱對帳」按鈕開啟精靈

## 4. 前端：測試

- [x] 4.1 `frontend/src/tests/ReconcileWizard.test.ts`：CSV 解析（含 BOM）、結果渲染（死/不同步分流）、解析失敗顯示錯誤 toast

## 5. 前端：手動再同步輔助（1b）+ 重新對帳

- [x] 5.1 改寫 Step 1 匯出指引文案：先取消全選→只勾「YouTube 和 YouTube Music」；點「包含所有 YouTube 資料」（非「進階」）→先取消全選→只勾「訂閱內容」；CSV、等 email、解壓
- [x] 5.2 不同步區加手勢說明（已訂閱→取消訂閱→再訂閱）+ 明確「退訂後務必再次訂閱」警告
- [x] 5.3 每個不同步列加「已處理」勾選，狀態存 localStorage（key 含 channel_id；可按帳號命名空間），重開精靈仍保留；顯示「已處理 X / N」進度
- [x] 5.4 結果頁加「重新對帳」按鈕：用已解析 channel_ids 直接重 POST，不需重新上傳；loading 後以新結果取代

## 6. 測試與驗證

- [x] 6.1 更新 `frontend/src/tests/ReconcileWizard.test.ts`：已處理勾選持久化（mock localStorage）、進度計數、重新對帳重用 channel_ids 不需重傳
- [x] 6.2 後端 `pytest`、前端 `npx vitest run`、`npx vue-tsc --noEmit` 全綠
- [x] 6.3 更新並跑 e2e `frontend/e2e/verify-subscription-reconciliation.ts`（含：勾「已處理」持久化、「重新對帳」重用 ids、新指引文案）通過，再建議 verify/archive
