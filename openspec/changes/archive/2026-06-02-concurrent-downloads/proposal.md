## Why

目前 `run_download()` 以單執行緒 for 迴圈逐部處理批次：每支影片要等前一支「下載 + ffmpeg 轉檔」全部完成才開始。由於 mp3 轉檔（FFmpegExtractAudio）耗時明顯，整條時間軸大量浪費在「下載已完成、卡在轉檔、後續影片乾等」。同時 YouTube 對單一連線限速，序列下載無法善用可並行的連線。改為並行可讓「下載」與「轉檔」在不同影片間互相填補空檔，縮短整批耗時。

## What Changes

- 後端 `run_download()` 由單執行緒序列迴圈，改為以 `asyncio.Semaphore` 控制的並行 pipeline：每支影片的「下載 + 轉檔」透過 `asyncio.to_thread` 丟到執行緒，最多同時執行 N 支。
- 新增 settings 旋鈕 `download_concurrency`（預設 `3`，有效範圍夾在 `1`–`8`），`start_download()` 讀取後傳入。
- 序號前綴維持以批次內 `idx` 計算，與完成順序解耦，確保並行下檔名編號仍正確。
- 全部影片完成（`asyncio.gather` 收斂）後才將任務 `status` 設為 `done`，維持既有 SSE 進度語意。
- 前端不變：`POST /download` payload、`download.ts`、SSE 進度結構、`SelectedVideos` UI 皆不調整；多支影片同時顯示進度為既有 per-vid 渲染自然支援。

## Capabilities

### New Capabilities
- `concurrent-downloads`: 批次下載的並行執行機制——settings 控制的並發上限、以 semaphore 限制同時進行的「下載+轉檔」pipeline 數、並行下序號編號正確性、以及任務完成判定語意。

### Modified Capabilities
<!-- 無。download-format-quality 的格式/品質/yt-dlp 調度需求不變，並行為新增的執行層行為。 -->

## Impact

- **後端**：[backend/main.py](backend/main.py) 的 `run_download()`（[L2263](backend/main.py#L2263)）重構為並行協調；`start_download()`（[L2316](backend/main.py#L2316)）讀取 settings 並傳入並發數；`load_settings()` / settings 預設補上 `download_concurrency`。
- **設定檔**：`settings.json` 新增 `download_concurrency` 欄位（缺漏時 fallback 3）。
- **資源**：最壞情況同時 N 個 ffmpeg 子程序；預設 3 對多核 CPU 安全。mp4 為 remux（非重編碼）且使用情境少，CPU 壓力低。
- **前端**：無變更。
- **測試**：[backend/tests/test_download.py](backend/tests/test_download.py) 新增並行情境（序號正確性、並發上限、完成判定）。
