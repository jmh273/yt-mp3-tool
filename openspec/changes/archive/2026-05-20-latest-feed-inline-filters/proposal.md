## Why

目前主頁「最新影片」面板只能顯示一個固定的時間範圍（小時數），若使用者想暫時看更長或更短時段的影片，必須切換到設定頁修改 `latest_hours` 後再回到首頁重新載入；影片長度（min/max minutes）的過濾條件也只能在設定頁調整。每次調整一個瀏覽偏好都要往返設定頁，破壞了瀏覽體驗的流暢性。

此次變更將時間範圍與影片長度區間的調整搬到「最新影片」面板本身，預設帶入使用者已儲存的設定值，讓使用者能即時試驗、即時看到結果，且不影響原有的設定持久化行為。

## What Changes

- 在 `LatestVideosFeed.vue` 的標題列右側新增一個內嵌篩選控制區，包含：
  - 「時間範圍（小時）」數值輸入（範圍 1–168），預設帶入 `settings.latest_hours`。
  - 「最短長度（分鐘）」與「最長長度（分鐘）」兩個數值輸入，預設帶入 `settings.min_duration_minutes` / `max_duration_minutes`。
  - 「套用」按鈕（或失焦自動觸發）：以目前面板上的三個參數重新呼叫 `/latest-videos`。
- `GET /latest-videos` 後端端點新增可選的 `min_duration_minutes` 與 `max_duration_minutes` 查詢參數；當存在時，覆蓋設定值用於本次請求，不修改設定檔。
- `enhance_and_filter_videos()` 在「最新影片」路徑中接受呼叫端傳入的 min/max overrides（仍維持 `apply_duration_filter=True` 行為）。
- 面板上的 `hours-badge` 取代為動態文字，反映目前生效的時間範圍與長度區間（例：「24h · 3–60 分鐘」）。
- 設定頁仍保留三個對應欄位作為「預設值來源」；面板上的調整僅影響當次瀏覽，不寫回設定。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `latest-videos-feed`: `/latest-videos` 增加 `min_duration_minutes` / `max_duration_minutes` 查詢參數；前端面板新增內嵌時間範圍與長度區間調整控制項，預設帶入設定值，調整僅影響當次請求。

## Impact

- 後端：`backend/main.py` 的 `/latest-videos` 處理器與 `enhance_and_filter_videos()` 簽名（新增可選 overrides）。
- 前端：`frontend/src/components/LatestVideosFeed.vue` UI 與 fetch 邏輯。
- 設定模型 (`UserSettings`)、設定頁、其他 feed (`/subscriptions/{channel_id}/videos`、`/trending-videos`、`/search-videos`) 不受影響。
- 既有 spec `latest-videos-feed` 需更新：endpoint 參數與 feed view 控制項描述。
- 既有 quota 行為、下載流程、duration 過濾範圍規則（僅最新影片套用）均維持不變。
