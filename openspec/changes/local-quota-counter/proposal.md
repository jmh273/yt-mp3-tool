## Why
YouTube Data API v3 每天提供 10,000 點的免費配額。若配額耗盡，系統功能將會中斷（無法取得訂閱列表或過濾未開播影片）。
因為官方不提供查詢配額的 API，我們需要在本地端（`settings.json`）實作一個計數器，在每次向 YouTube 發出請求時自動加 1，讓使用者能在介面上直觀地看到當天大約還有多少額度可以使用。

## What Changes
- 後端新增配額計數與日期重置邏輯（依據太平洋時間 PT 每日重置）。
- 每次呼叫 `youtube.subscriptions().list` 或 `youtube.videos().list` 時，自動消耗 1 點配額。
- 新增 API `/quota` 讓前端查詢目前使用量。
- 前端 `HomeView.vue` 頂部選單新增「API 配額狀態列」，顯示已使用/總量，當用量接近 10,000 時顯示紅色警告。

## Capabilities
- `local-quota-counter`: 本地端配額計數機制
- `quota-ui-indicator`: 配額視覺化顯示
