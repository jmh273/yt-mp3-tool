## Context

`/latest-videos` 目前回傳 `downloaded_today`，只比對 `<output_path>/<今日 YYYYMMDD>/`（`_today_downloaded_stems()`）。需求是把比對範圍擴大到整個下載根目錄，讓任一過去日期資料夾裡已存在的同名檔案也會 disable checkbox。

## Decisions

### 重用 `_downloaded_stems_all()`，不新寫掃描邏輯
後端已有 `_downloaded_stems_all()`（`backend/main.py:1233`）做整個 `output_path` 的遞迴掃描，且比對規則（跳過 `.part`、跳過非檔案、去 `^\d+_` 前綴）與今日版本完全一致。直接在 `get_latest_videos` 改呼叫它即可，避免重複實作與規則漂移。

### 欄位更名 `downloaded_today` → `downloaded_on_disk`
比對範圍變成整個根目錄後，「today」已不貼切。更名讓欄位語意正確；成本只是前端兩處（`download.ts` 型別、`LatestVideosFeed.vue`）跟著改。前端 UI 文案（「✅ 已下載」徽章、「允許再次下載」開關）本就無「今天」字樣，無需改動。

### 純標題比對的誤判：接受，靠覆寫開關兜底
跨整個資料庫時，`_sanitize_filename(title)` 相同的不同影片會互相誤判為已下載。改用 video_id 對應需要在下載時記錄 id↔檔名映射，超出本次範圍。決定**先接受純標題比對**；既有「允許再次下載」開關（預設 OFF、不持久化）即為使用者手動解鎖誤判項的逃生口。

### 效能：暫不加快取
`_downloaded_stems_all()` 每次請求 `rglob("*")` 整個根目錄。對數百～數千檔可接受；若日後資料庫過大再評估以 mtime 做快取。本次不引入快取以維持最小變更。

## Risks / Trade-offs

- **誤判上升**：見上，已接受並有覆寫開關。
- **大型資料庫掃描成本**：每次請求遞迴掃描；目前可接受。
- **`downloaded_today` 為破壞性欄位更名**：屬單機 app、前後端同版部署，無對外 API 相容性顧慮。
