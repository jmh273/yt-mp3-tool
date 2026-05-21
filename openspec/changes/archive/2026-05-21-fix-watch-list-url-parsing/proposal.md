## Why

回報案例：使用者貼上 `https://www.youtube.com/watch?v=2oW8gnmnXrU&list=PLaSVd_PZ_Y7yDFfkc4WnWlTApcw2vumlq`（一個 watch URL 同時帶 `v=` 與 `list=` 參數）按「解析網址」後，畫面看似成功（顯示標題「歐麗娟 紅樓夢 (台大開放式課程)」），但實際上：

- yt-dlp 在 `extract_flat=True` 模式下對這種「watch + list」URL 只回一個 `_type: 'url'` 的 stub，**沒有展開清單**，且 `id` 是 playlist ID（`PLaSVd_...`）而不是 video ID。
- 前端拿到一筆「假的單一影片」，其 `video_id` 是 playlist ID。
- 使用者勾選後按下載 → yt-dlp 拿 playlist ID 當 video ID 構成 `https://www.youtube.com/watch?v=PLaSVd_...` → **下載失敗**。

這直接違反 `url-download-preview` spec 的 「解析播放清單網址」requirement：「使用者送出指向播放清單（含 `list=` 參數）的網址 → 系統 SHALL 回傳該清單中所有影片的 `VideoItem` 陣列」。是 bug，不是新功能。

實測 fix：把 `extract_flat=True` 改成 `extract_flat='in_playlist'`，三種網址型態（純單一影片、純 playlist URL、watch+list 混合）都能正確解析；該紅樓夢清單可拿到完整 205 筆 entries。

## What Changes

- **後端 `_sync_url_preview_yt_dlp`**（[backend/main.py:1086](backend/main.py#L1086)）：把 `ydl_opts` 中的 `"extract_flat": True` 改為 `"extract_flat": "in_playlist"`，讓 yt-dlp 在 playlist URL 上強制展開 entries，同時對單一影片 URL 仍走原本「沒有 entries」的單筆路徑。
- **測試**：補一個 unit test 直接 mock `yt_dlp.YoutubeDL` 驗證 `_sync_url_preview_yt_dlp` 傳給 yt-dlp 的 opts 含 `extract_flat='in_playlist'`，避免日後再被改回 `True`。

不需要前端、API 介面、或 `paginate-playlist-preview` 任何改動。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `url-download-preview`: 把「解析播放清單網址」的 scenario 補強，明示「watch URL 同時帶 `v=` 與 `list=` 參數」也必須回完整清單而非單筆 stub。

## Impact

- **後端 (`backend/main.py`)**：一行 ydl_opts 變更。
- **後端測試 (`backend/tests/test_main_rss.py` 或新增 `tests/test_url_preview.py`)**：mock yt-dlp 並驗證 opts 內容。
- **使用者體驗**：類似 `watch?v=X&list=Y` 的網址（例如從 YouTube 播放清單裡點開的單一影片連結）現在會正確被當作播放清單解析，配合 `paginate-playlist-preview` 直接進入分頁瀏覽。
- **向後相容**：純單一影片網址行為不變；純 `playlist?list=...` 網址行為不變。
- **無資料遷移、無 API 介面變更**。
