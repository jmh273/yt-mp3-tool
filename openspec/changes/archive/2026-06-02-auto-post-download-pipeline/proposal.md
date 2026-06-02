## Why

目前「下載 → 音量正規化 → 上傳 Google Drive」是三個各自獨立、需手動依序觸發的步驟（三個分頁、三次操作）。使用者常態流程其實固定：下載完就想正規化再上傳。提供一個下載面板的勾選框，勾選後自動串接這三步，可省去反覆切分頁與等待手動觸發的麻煩。

## What Changes

- 下載面板（`SelectedVideos`）新增一個勾選框「下載後自動正規化並上傳雲端」，**預設不勾選**，狀態持久化於 localStorage。
- 勾選後，下載完成即自動串接後續階段（前端協調，沿用既有 `/normalize/start`、`/drive/upload` 端點與各自的進度面板）：
  - **mp3**：下載 → 自動正規化（整個下載資料夾）→ 自動上傳。
  - **mp4**：下載 → **跳過**正規化（mp3gain 僅支援 mp3）→ 仍自動上傳。
- **best-effort 續行**：任一階段的個別錯誤（如部分檔正規化失敗、Drive API 未啟用）不中斷後續階段；錯誤照現有方式顯示在各自面板。
- `POST /download` 回應新增 resolved `directory` 欄位（加欄位、非破壞），讓前端能精準地對「實際下載到的資料夾」串接正規化/上傳。
- **Drive 上傳擴充為支援 `.mp3` 與 `.mp4`**（目前僅 `.mp3`），否則 mp4 下載無檔可傳；此擴充同時讓手動上傳面板也能上傳 mp4。
- 隨 pipeline 進度自動切換右欄分頁（下載 → 正規化 → 上傳），讓使用者看得到當前階段。

## Capabilities

### New Capabilities
- `auto-post-download-pipeline`: 下載後自動串接正規化與上傳的選用流程——勾選框（預設關、持久化）、下載完成的自動推進與條件（mp3 才正規化、mp4 跳過仍上傳）、best-effort 續行語意、以及 `POST /download` 回傳 resolved directory 作為串接依據。

### Modified Capabilities
- `drive-upload`: (1)「不自動上傳」改為「**預設**不自動上傳；使用者可經下載面板勾選框選用自動上傳」；(2) 上傳檔案範圍由「僅 `.mp3`」擴充為「`.mp3` 與 `.mp4`」（mimetype 依副檔名）。

## Impact

- **後端**：[backend/main.py](backend/main.py) `start_download()` 回應加 `directory`；`_local_mp3_files()` → 泛化為含 `.mp4`（影響 `run_drive_upload_batch` 與 `/drive/upload`，mimetype 依副檔名 `audio/mpeg` / `video/mp4`）。正規化、上傳的協調本身在前端，不新增後端 orchestration。
- **前端**：[SelectedVideos.vue](frontend/src/components/SelectedVideos.vue) 新增勾選框；[download.ts](frontend/src/stores/download.ts) 記錄 resolved 下載目錄並在完成時觸發 pipeline；新增一個協調器（小型 store / composable 或 `HomeView` 監看）依序驅動 normalize / drive 兩個既有 store，並切換右欄分頁。
- **設定/權限**：上傳沿用 `drive_root_folder` 設定與 `drive.file` 授權；Drive API 未啟用時 pipeline 仍完成下載+正規化，上傳階段顯示既有 403 訊息（見 [[project-drive-api-must-be-enabled]]）。
- **測試**：後端 `_local_media_files` 含 mp4 + `/download` 回 directory；前端勾選框持久化、pipeline 條件分支（mp3 串正規化、mp4 跳過）、best-effort 續行；e2e 串接流程。
