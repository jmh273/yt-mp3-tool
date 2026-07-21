## Why

訂閱清單中會累積一些「抓不到影片」的頻道（無上傳影片、已刪除或終止、權限問題等）。目前這些頻道只會在後端 log 噴出整段 `playlistNotFound` 的 JSON，使用者無從得知是哪個頻道、也不知道該不該退訂。需要一個能主動盤點問題頻道、標示原因、並讓使用者直接退訂的機制。

## What Changes

- 新增後端端點 `GET /subscriptions/health-check`：盤點所有訂閱頻道，回傳抓不到影片的頻道清單，並為每個頻道標示原因（`no_uploads` / `deleted` / `forbidden` / `unknown`）。
- 前端設定頁新增「訂閱頻道健檢」區塊：一顆「檢查訂閱頻道」按鈕觸發健檢，逐列顯示問題頻道（縮圖、頻道名、原因徽章），每列可直接退訂（沿用既有 `DELETE /subscriptions/{subscription_id}`）。
- 後端 log 降噪：`fetch_channel_videos_api` 對 `playlistNotFound` 這類預期錯誤，從印出整段 JSON 改為一行精簡訊息（含頻道名），非預期錯誤維持完整輸出。

## Capabilities

### New Capabilities
- `subscription-health-check`: 盤點訂閱頻道健康狀態、分類抓不到影片的原因，並在設定頁提供逐列退訂的能力。

### Modified Capabilities
<!-- 無 spec-level 需求變更；log 降噪屬實作細節 -->

## Impact

- 後端 `backend/main.py`：新增 `/subscriptions/health-check` 端點與探測/分類輔助函式；調整 `fetch_channel_videos_api` 的錯誤 log。
- 前端 `frontend/src/views/SettingsView.vue`：新增健檢區塊與退訂互動；沿用 `apiGet` / `apiDelete` 與既有 toast。
- 配額：健檢會對每個訂閱頻道各探測 1 單位（與既有 `/subscriptions/latest-dates` 同級），按鈕旁需標註成本提示。手動觸發，不影響背景流程。
- 相依：無新增外部相依；沿用既有 YouTube Data API 與 `aiohttp`。
