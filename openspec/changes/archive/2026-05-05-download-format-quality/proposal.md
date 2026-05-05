## Why

目前下載僅輸出 MP3（固定 192 kbps），無法滿足想保留影像的使用者，也無法調整音訊或影片品質。需要在下載介面加入「格式 + 品質」兩段選擇，預設維持目前行為（MP3 / 192 kbps），讓使用者在不增加學習成本的前提下取得彈性。

## What Changes

- 前端 `SelectedVideos` 面板新增「格式」與「品質」兩個下拉選單，緊鄰「下載選取影片」按鈕
- 「格式」選項：MP3（預設）、MP4
- 「品質」選項依格式聯動：
  - MP3：128 / 192（預設）/ 256 / 320 kbps
  - MP4：360p / 480p / 720p（預設）/ 1080p
- 切換「格式」時自動將「品質」重置為該格式的預設值
- 前端 `POST /download` payload 新增 `format` 與 `quality` 兩個欄位
- 後端 `DownloadRequest` 接受新欄位；`run_download` 依 `format` 切換 yt-dlp 設定（MP3 走現有 `FFmpegExtractAudio` 流程；MP4 改 `format` selector + 不做 audio 抽取）
- 缺少欄位時後端 fallback 為 `mp3` / `192`，向後相容

## Capabilities

### New Capabilities

- `download-format-quality`: 下載格式與品質的選擇與後端調度

### Modified Capabilities

無（既有 `download` 行為保留為預設值，相容性完整）

## Impact

- `backend/main.py`：`DownloadRequest` 模型、`run_download()` 內 `ydl_opts` 組裝邏輯
- `frontend/src/components/SelectedVideos.vue`：新增兩個下拉選單與聯動邏輯
- `frontend/src/stores/download.ts`：`startDownload()` 改為接受 `format`/`quality` 並轉發到 API
- 既有測試（`SelectedVideos.test.ts`、`stores.test.ts > downloadStore`）需新增驗證新欄位的傳遞
- 不影響既有 `settings.json`、不影響配額計數
- yt-dlp 已支援所需格式選擇器，無新增第三方相依
