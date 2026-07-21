## 1. 後端：探測與分類

- [x] 1.1 在 `backend/main.py` 新增 `_probe_channel_status(creds, channel_id)`，回傳 `ok` / `empty` / `playlist_not_found` / `forbidden` / `error`（不吞錯、回傳狀態）
- [x] 1.2 新增輔助函式：對一批 `channel_id` 呼叫 `channels.list`（一次最多 50 個），回傳存在的頻道集合
- [x] 1.3 新增原因映射邏輯：由探測狀態 + 頻道是否存在，映射成 `no_uploads` / `deleted` / `forbidden` / `unknown`

## 2. 後端：健檢端點

- [x] 2.1 新增 `GET /subscriptions/health-check`：列訂閱 → semaphore fan-out 探測 → 對失敗頻道批次 `channels.list` → 組出 `problems`
- [x] 2.2 回應格式 `{ checked, problems: [{channel_id, subscription_id, title, thumbnail, reason, detail}] }`，正常頻道濾除
- [x] 2.3 探測正確累計配額（比照既有 `consume_quota` 用法）

## 3. 後端：log 降噪

- [x] 3.1 調整 `fetch_channel_videos_api`：`playlistNotFound` 只印一行精簡訊息（含頻道識別），非預期錯誤維持完整輸出

## 4. 後端測試

- [x] 4.1 新增 `backend/tests/test_subscriptions_health.py`：mock 訂閱與探測結果，驗證 `ok` 頻道被濾除
- [x] 4.2 驗證四種 `reason` 分類（`no_uploads` / `deleted` / `forbidden` / `unknown`）各自正確
- [x] 4.3 驗證回應含 `checked` 與問題項目各欄位

## 5. 前端：api 與設定頁

- [x] 5.1 在 `SettingsView.vue` 匯入 `apiDelete` 並定義健檢回應型別
- [x] 5.2 新增「訂閱頻道健檢」區塊：按鈕、成本提示、進行中狀態
- [x] 5.3 渲染問題頻道列（縮圖、頻道名、原因徽章）；無問題顯示「全部正常」
- [x] 5.4 每列「退訂」：確認對話框 → `apiDelete('/subscriptions/{subscription_id}')` → 成功就地移除 + toast；失敗顯示錯誤並保留該列
- [x] 5.5 原因徽章文字對映（`no_uploads`→無上傳影片 等）

## 6. 前端測試與驗證

- [x] 6.1 新增 SettingsView 健檢測試：mock 回傳 problems，點按鈕渲染列表；點退訂呼叫 `apiDelete` 並移除該列
- [x] 6.2 新增 `frontend/e2e/verify-channel-health.ts`（Playwright）走完檢查→顯示→退訂流程並截圖

## 7. 收尾

- [x] 7.1 執行後端測試（pytest）與前端測試（vitest）確認全綠
- [x] 7.2 跑 `verify-channel-health.ts` 確認實際流程可用
