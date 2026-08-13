## Why

`download` store 的 `downloadedIds` 是 append-only 的：只有 `markAsDownloaded()` 會寫入，全 codebase 沒有任何移除或清除的路徑，且持久化在 localStorage。任一影片一旦被標記為已下載，其 checkbox 在所有清單頁就永久停用。

目前唯一的逃生口是「最新影片」頁的「允許再次下載」toggle，其餘五個清單頁（頻道影片、發燒影片、搜尋影片、網址下載、同類新頻道）完全沒有覆寫手段——使用者只能手動清 localStorage。但想再次下載的情境很常見：原本下 mp3 現在想要 mp4（同一個 `video_id`）、檔案已刪除、輸出資料夾換過、下載其實失敗但 SSE 回報 `done`、或想在另一個目標資料夾再放一份。

順帶處理一個相關的使用體驗問題：最新影片頁每批只顯示 50 部，訂閱數多時需要反覆點「載入更多」。

## What Changes

- **「允許再次下載」由區域性 toggle 提升為全域開關**：狀態從 `LatestVideosFeed.vue` 的區域 `ref` 移入 `download` store，UI 從最新影片頁的 filter-bar 移至 `HomeView` 的 `<header>`（quota 徽章旁）。開關 SHALL NOT 持久化——切換頁面維持狀態，重新整理才回到 OFF。
- **覆寫行為套用到全部 6 個清單頁**：頻道影片、發燒影片、搜尋影片、網址下載、同類新頻道，行為與最新影片頁一致。
- **BREAKING（既有需求刻意廢除）**：移除「關閉 toggle 時把已選的已下載影片從 `selected` 移除」的行為。開關關閉後只會恢復 checkbox 的 `disabled`，SHALL NOT 更動 `downloadStore.selected`。
- **修正 `:checked` 綁定**：其餘五頁目前綁 `isSelected(id) || isDownloaded(id)`，開關開啟後 checkbox 會恆為勾選、點擊無視覺回饋。五頁的 `:checked` 需與 `:disabled` 一併納入開關條件。
- **網址下載頁「全選本頁 / 取消本頁」** 的已下載守門改為跟隨全域開關。
- **最新影片頁 `PAGE_SIZE` 由 50 改為 200**（純顯示批次量，不影響 API 請求）。
- 網址下載頁使用者可選的「每頁顯示」下拉（10/25/50/100，預設 25）維持原樣，不在本次範圍。

## Capabilities

### New Capabilities
- `redownload-override`: 全域「允許再次下載」覆寫開關——涵蓋開關的狀態歸屬（`download` store）、UI 落點（`HomeView` header）、非持久化語意，以及所有影片清單頁對「已下載」影片的 `disabled` / `checked` 判定與批次選取守門的統一規則。

### Modified Capabilities
- `latest-videos-feed`: 移除 `"Allow re-download" override toggle` 需求（整條遷移至 `redownload-override`）；`Disable selection of videos already downloaded` 改為引用全域開關；`Client-side pagination for latest videos feed` 的頁面大小由 50 改為 200；`Count badge reflects total matches without cap warning` 的情境數字同步對齊新的頁面大小。
- `url-download-preview`: `每頁勾選與跨頁狀態保留` 的「全選本頁」與「已下載影片」情境改為依全域開關決定是否停用與是否納入批次選取。

## Impact

- 前端 `frontend/src/stores/download.ts`：新增 `allowRedownload` ref 並匯出；不加 localStorage `watch`；不新增清除選取的邏輯。
- 前端 `frontend/src/views/HomeView.vue`：header 新增開關控制項與樣式。
- 前端 6 個清單元件：`LatestVideosFeed.vue`（移除區域 `ref` 與 ON→OFF 的 `watch`、`PAGE_SIZE` 改 200）、`ChannelVideos.vue`、`TrendingVideosFeed.vue`、`SearchVideosFeed.vue`、`SimilarChannelDiscoveryFeed.vue`、`UrlDownloadFeed.vue`（另含 `selectAllOnPage` / `deselectAllOnPage`）。
- 測試：`frontend/src/tests/LatestVideosFeed.test.ts` 需刪除「關閉時移除已下載影片」一案（對應刻意廢除的需求），並改用 store 的開關；其餘清單頁補上開關行為測試。
- 後端：無變更。`downloaded_on_disk` 仍僅由 `GET /latest-videos` 提供，其他 endpoint 不擴充。
- 不在本次範圍：設定頁「清除下載紀錄」（治本方案，另案處理）；其他 feed 接 `downloaded_on_disk`（需後端每個 endpoint 掃描下載根目錄，成本另議）。
