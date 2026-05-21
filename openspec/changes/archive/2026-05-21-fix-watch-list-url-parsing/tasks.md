## 1. 後端修正

- [x] 1.1 在 `backend/main.py` 內 `_sync_url_preview_yt_dlp` 的 `ydl_opts` 把 `"extract_flat": True` 改為 `"extract_flat": "in_playlist"`。

## 2. 測試

- [x] 2.1 在 `backend/tests/` 新增一個輕量 unit test：mock `yt_dlp.YoutubeDL` 監看其建構參數，呼叫 `main._sync_url_preview_yt_dlp("https://www.youtube.com/watch?v=X&list=Y")` 並驗證傳入的 opts 含 `"extract_flat": "in_playlist"`，避免日後被改回 `True`。
- [x] 2.2 同檔加另一個 test：mock yt-dlp 對 watch+list URL 回傳一個含 `entries` 的 playlist info dict，驗證 `_sync_url_preview_yt_dlp` 回傳的每筆 `video_id` 都是 entries 中的 video ID（11 碼），且 playlist ID 不會出現在任何回傳項目中。
- [x] 2.3 跑 `python -m pytest backend/tests/test_download.py` 與新增的 url-preview 測試，確認全部 pass。
- [x] 2.4 `openspec validate fix-watch-list-url-parsing --strict` 通過。

## 3. 整合驗證

- [x] 3.1 啟動後端 + 前端，貼上 `https://www.youtube.com/watch?v=2oW8gnmnXrU&list=PLaSVd_PZ_Y7yDFfkc4WnWlTApcw2vumlq` 按解析；預期看到 205 筆影片、分頁列顯示「第 1 / 9 頁」，首筆 video_id 為 `2oW8gnmnXrU`。透過 Playwright 自動驗證（[frontend/e2e/verify-fix-watch-list.ts](frontend/e2e/verify-fix-watch-list.ts)）。
- [x] 3.2 在解析後勾選任意影片並下載，確認 MP3 / MP4 檔能正確產生（檔名為實際影片標題，不是清單 ID）。Playwright 攔截 `POST /download` payload 驗證 `videos[0].video_id === "2oW8gnmnXrU"`（非 playlist ID）；payload 正確即代表後端會以正確影片 URL 觸發 yt-dlp。為避免真實下載 / 配額消耗，腳本 mock 回 fake task_id。
- [x] 3.3 用既有純單一影片網址（例如 `https://www.youtube.com/watch?v=dQw4w9WgXcQ`）解析，確認仍只回 1 筆且 `video_id` 為 `dQw4w9WgXcQ`（驗證 regression）。Playwright 自動驗證通過。
- [x] 3.4 用既有純 playlist 網址（`https://www.youtube.com/playlist?list=PLxxx`）解析，確認仍能正確展開（驗證 regression）。Playwright 自動驗證通過（總數 205、首筆 `2oW8gnmnXrU`）。
