## Why

「上傳今天到 Drive」目前塞在「下載」分頁底部，與下載操作混在一起，動線不直覺；而「下載到」欄位只顯示日期資料夾名稱（如 `20260601`），不像「音量正規化」分頁顯示完整路徑，使用者無法一眼確認檔案實際落在哪個磁碟位置。把上傳獨立成第三個分頁、並讓兩處目錄欄位都顯示完整路徑，可讓三個動作（下載 / 音量正規化 / 上傳）地位對等、路徑資訊一致。

## What Changes

- 右欄分頁列由 2 個（下載、音量正規化）擴充為 3 個，新增第三個分頁「上傳雲端硬碟」，與前兩者並排。
- 將既有的 Drive 上傳 UI（上傳按鈕、選擇資料夾、進度、重新授權）從「下載」分頁底部移出，搬到新的「上傳雲端硬碟」分頁。
- 「下載」分頁的「下載到」欄位由僅顯示日期資料夾名稱改為顯示完整路徑（`<output_path>\YYYYMMDD`），與「音量正規化」分頁一致。
- 上傳分頁的本地端目錄欄位顯示完整路徑（同上）。
- 上傳按鈕文字由「⬆ 上傳今天到 Drive」改為「上傳雲端硬碟」。

## Capabilities

### New Capabilities
- `right-pane-tabs`: 右欄三分頁（下載 / 音量正規化 / 上傳雲端硬碟）的分頁列結構、各分頁目錄欄位以完整路徑呈現，以及上傳分頁的內容與按鈕標籤。

### Modified Capabilities
<!-- 無：右欄上傳 UI 來自尚未歸檔的 drive-upload-batch change，本變更僅重新安置其呈現位置，不更動上傳的後端行為需求 -->

## Impact

- 前端：`frontend/src/views/HomeView.vue`（分頁列 + `activeRightTab` 型別新增 `upload`）、`frontend/src/components/SelectedVideos.vue`（移除內嵌的 Drive 上傳區塊、改下載目錄為完整路徑）、新增 `frontend/src/components/DriveUploadPanel.vue`（承載搬出的上傳 UI）。
- store：`frontend/src/stores/driveUpload.ts`、`frontend/src/stores/download.ts` 行為不變，僅由新元件取用。
- 測試：`frontend/src/tests/SelectedVideos.test.ts` 需調整（上傳相關斷言移至新元件測試）、新增上傳分頁元件測試、`frontend/e2e/verify-drive-upload-batch.ts` 走訪路徑更新。
- 後端：無變更。
