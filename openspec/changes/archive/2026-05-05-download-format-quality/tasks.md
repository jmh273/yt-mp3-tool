## 1. 後端 API 與下載邏輯
- [x] 1.1 `backend/main.py`: 擴充 `DownloadRequest` 模型，新增 `format: str = "mp3"` 與 `quality: int = 192`。
- [x] 1.2 `backend/main.py`: 抽出 `_build_ydl_opts(output_path, safe_title, hook, fmt, quality)` 函式，分支處理 mp3 / mp4。
- [x] 1.3 `backend/main.py`: `run_download()` 改為接收 `format` / `quality`，並用 `_build_ydl_opts` 產生 `ydl_opts`。
- [x] 1.4 `backend/main.py`: `start_download` 端點做輕度驗證（白名單外回退預設值）並傳遞 `format` / `quality` 給 `run_download`。

## 2. 前端 store
- [x] 2.1 `frontend/src/stores/download.ts`: `startDownload()` 改為接收 `format`、`quality` 兩個參數（預設 `'mp3'` / `192`），payload 帶上這兩欄。

## 3. 前端 UI
- [x] 3.1 `frontend/src/components/SelectedVideos.vue`: 新增 `format` 與 `quality` 兩個 `<select>`，預設 `mp3` / `192`，緊鄰下載按鈕。
- [x] 3.2 `SelectedVideos.vue`: 加入 `QUALITY_OPTIONS` / `FORMAT_DEFAULTS` 常數，`watch(format)` 切換時將 `quality` 重置為對應預設值。
- [x] 3.3 `SelectedVideos.vue`: 點擊「下載選取影片」時呼叫 `download.startDownload(format, quality)`；下載中禁用兩個下拉。

## 4. 測試與驗證
- [x] 4.1 `frontend/src/tests/stores.test.ts`: 新增測試驗證 `startDownload(format, quality)` 將兩欄帶入 `POST /download` payload，並驗證預設值（不傳參數時送出 `mp3` / `192`）。
- [x] 4.2 `frontend/src/tests/SelectedVideos.test.ts`: 新增測試：(a) 預設顯示 MP3 + 192kbps、(b) 切換到 MP4 後品質自動變為 720p、(c) 切回 MP3 品質回到 192、(d) 下載中兩個下拉皆 disabled。
- [x] 4.3 手動驗證：實際下載 1 支影片於 4 種組合（mp3/192、mp3/320、mp4/720、mp4/1080），確認檔案副檔名與品質符合預期。
- [x] 4.4 手動驗證：缺欄位的舊請求（用 curl 模擬）仍以 mp3 / 192 完成下載。
