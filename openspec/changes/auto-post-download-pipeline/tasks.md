## 1. 後端：下載回傳目錄

- [x] 1.1 `start_download()` 回應加入 `directory`（`str(final_output_path)`），與 `task_id` 一同回傳（additive，不破壞既有呼叫）
- [x] 1.2 更新 `test_download.py`：`POST /download` 回應含 `directory` 且等於 resolved 目錄

## 2. 後端：上傳支援 mp4

- [x] 2.1 `_local_mp3_files()` 泛化為 `_local_media_files()`（含 `.mp3` / `.mp4`），呼叫處（`run_drive_upload_batch`、`/drive/upload`、`_collect_upload_folders` 視需要）一併更新
- [x] 2.2 `run_drive_upload_batch` 上傳時 mimetype 依副檔名決定（`.mp3`→`audio/mpeg`、`.mp4`→`video/mp4`）
- [x] 2.3 更新 `test_drive.py`（或既有 drive 測試）：含 .mp4 的資料夾會列入並以正確 mimetype 上傳；重複上傳防護對 mp4 同樣有效

## 3. 前端：下載面板勾選框

- [x] 3.1 `SelectedVideos.vue` 新增「下載後自動正規化並上傳雲端」勾選框（預設關），狀態存 localStorage（如 `yt_mp3_auto_pipeline`）
- [x] 3.2 `download.ts`：記錄 `/download` 回傳的 `directory`（如 `lastDownloadDir`）；保存勾選狀態供協調器讀取

## 4. 前端：pipeline 協調器

- [x] 4.1 新增協調器（`usePipeline` composable 或 `HomeView` watcher）：勾選時，監看 download store `status=done` → 依 `format` 分支
- [x] 4.2 mp3 分支：對 `lastDownloadDir` 執行 `normalizeStore.loadDirectory` + `startBatch`；監看 normalize `done` → 觸發上傳
- [x] 4.3 mp4 分支：跳過正規化，下載 done 後直接觸發上傳（`POST /drive/upload` 於 `lastDownloadDir`）
- [x] 4.4 best-effort：階段內錯誤不阻擋推進；未勾選時協調器不啟動（零行為改變）
- [x] 4.5 隨階段切換 `activeRightTab`（download → normalize → upload）

## 5. 測試

- [x] 5.1 前端：勾選框預設關 + 持久化（reload 保留）
- [x] 5.2 前端：協調器分支——mp3 串 normalize 再 upload、mp4 跳過 normalize 直接 upload、未勾選不推進
- [x] 5.3 前端：best-effort——normalize 失敗仍進上傳；upload 失敗不影響前段
- [x] 5.4 跑既有 download / normalize / drive / settings 測試確認回歸（backend + frontend）

## 6. 驗證

- [x] 6.1 撰寫並執行 `frontend/e2e/verify-auto-post-download-pipeline.ts`：勾選 → mock 下載 done → 觀察自動進入正規化（mp3）→ 上傳；另測 mp4 跳過正規化直接上傳；未勾選不推進
