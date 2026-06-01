## 1. 抽出 DriveUploadPanel 元件

- [x] 1.1 新增 `frontend/src/components/DriveUploadPanel.vue`，搬入 `SelectedVideos.vue` 的 `.drive-upload` 區塊與資料夾選擇 modal
- [x] 1.2 搬入相關邏輯：`drive`/`auth` store、`reauthInProgress`/`selectedUploadDirectory`/`showFolderPicker` ref、`onUpload`/`reauthDrive`/`openFolderPicker`/`chooseFolder`/`uploadStatusLabel`
- [x] 1.3 新增本地端目錄輸入欄位，`onMounted` 以 `joinPath(output_path, todayYyyymmdd())` 帶入完整路徑，並作為上傳來源目錄
- [x] 1.4 上傳主按鈕文字改為「上傳雲端硬碟」（執行中顯示「上傳中...」），保留 `data-testid="drive-upload-button"`
- [x] 1.5 搬入對應的 scoped style（upload-btn/choose-btn/drive-error/reauth-btn/upload-progress/badge*/modal*）

## 2. 精簡 SelectedVideos（下載分頁）

- [x] 2.1 移除 `.drive-upload` 區塊、資料夾 modal 與所有上傳相關邏輯與 import
- [x] 2.2 將「下載到」由 `targetDirName`（日期）改為 `targetDirPath`（完整路徑），loadSettings 時組 `joinPath(output_path, today)`
- [x] 2.3 新增 basename 解析（`path.replace(/[\\/]+$/,'').split(/[\\/]/).pop()`），`onDownload` 以 basename 作為 `targetDir` 傳給 `download.startDownload`，維持後端契約不變
- [x] 2.4 移除僅供上傳使用的孤兒 style，避免 lint 警告

## 3. HomeView 三分頁

- [x] 3.1 `activeRightTab` 型別擴充為 `'download' | 'normalize' | 'upload'`
- [x] 3.2 分頁列新增第三顆「上傳雲端硬碟」按鈕，含上傳中 `.dot`（`normalizeStore` 旁加 `driveUploadStore`）
- [x] 3.3 內容區改為 `v-if`/`v-else-if`/`v-else` 對應 `SelectedVideos` / `VolumeNormalizer` / `DriveUploadPanel`，沿用 `<KeepAlive>`
- [x] 3.4 import 並註冊 `DriveUploadPanel`、引入 `useDriveUploadStore`

## 4. 測試與驗證

- [x] 4.1 新增 `frontend/src/tests/DriveUploadPanel.test.ts`：按鈕文字、完整路徑帶入、以完整路徑呼叫 `startUpload`、reauth 流程
- [x] 4.2 調整 `frontend/src/tests/SelectedVideos.test.ts`：移除上傳斷言、新增「下載到」顯示完整路徑、`onDownload` 以 basename 傳 `targetDir`
- [x] 4.3 更新 `frontend/e2e/verify-drive-upload-batch.ts`：操作上傳前先切到「上傳雲端硬碟」分頁
- [x] 4.4 新增 `frontend/e2e/verify-ui-drive-upload-tab.ts` 驗證三分頁切換與完整路徑顯示
- [x] 4.5 跑 `frontend` 單元測試與 verify 腳本，全綠後才建議 verify/archive
