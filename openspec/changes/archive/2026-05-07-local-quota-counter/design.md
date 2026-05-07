## Context
YouTube API v3 的讀取操作（如 `videos.list`, `subscriptions.list`）每次呼叫固定消耗 1 點配額，每日總上限為 10,000 點。
配額會在太平洋時間 (PT) 午夜（約台灣時間下午 3 點或 4 點）重置。為求實作簡化與容錯，我們可以直接以系統的當地時間（或 UTC）每天午夜作為重置基準，雖然不完美對齊 PT，但足以作為參考。更精確的做法是將時間轉換為 PT 再取日期。

## Goals
- 在 `settings.json` 記錄 `quota_used` 與 `quota_date`。
- 在發送 YouTube API 呼叫的函式旁加入 `consume_quota(1)` 的呼叫。
- 前端能獲取並顯示配額狀態。

## Technical Approach

### Backend (`backend/main.py`)
- 修改 `DEFAULT_SETTINGS` 加入 `"quota_used": 0, "quota_date": ""`。
- 新增 `consume_quota(amount=1)` 函式：
  1. 取得當下太平洋時間的日期字串 `YYYY-MM-DD`（可透過 `datetime.now(timezone(timedelta(hours=-8)))` 簡單推算）。
  2. 比較 `settings["quota_date"]`，若日期不同則重置 `quota_used = amount`，並更新 `quota_date`。
  3. 若日期相同，則 `quota_used += amount`。
  4. 儲存回 `settings.json`。
- 在 `get_latest_videos` 及 `get_channel_videos` 與 YouTube API 互動處，插入 `consume_quota(1)`。
- 新增 `@app.get("/quota")` 路由，回傳目前的配額使用狀況。

### Frontend
- 新增呼叫 `/quota` 的 API 函式。
- 在 `HomeView.vue` Header 中加上 `<div class="quota-badge">API Quota: {{ used }}/10000</div>`。
- 用 CSS 加上進度顏色（安全：綠色；警告：橘色；危險：紅色）。
