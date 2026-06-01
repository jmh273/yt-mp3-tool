## Context

右欄目前是 `HomeView.vue` 內的兩分頁結構（`activeRightTab: 'download' | 'normalize'`），以 `<KeepAlive>` 包住 `SelectedVideos`（下載）與 `VolumeNormalizer`（音量正規化）。Drive 上傳 UI 目前是內嵌在 `SelectedVideos.vue` 底部的 `.drive-upload` 區塊，與下載表單混在同一元件、同一捲動區。

`VolumeNormalizer.vue` 已示範了「完整路徑」模式：`onMounted` 時打 `GET /settings` 取 `output_path`，用本地 `joinPath(output_path, todayYyyymmdd())` 組成完整路徑放進輸入框。`SelectedVideos.vue` 已有同樣的 `joinPath` / `todayYyyymmdd` helper 與 `outputPath`/`selectedUploadDirectory` 狀態，但「下載到」欄位 `targetDirName` 只綁日期資料夾名稱。

## Goals / Non-Goals

**Goals:**
- 右欄改為三分頁，新增「上傳雲端硬碟」分頁，與下載、音量正規化並排。
- 把 Drive 上傳 UI 抽成獨立元件 `DriveUploadPanel.vue`，由新分頁承載。
- 「下載到」欄位與上傳分頁的本地端目錄欄位皆顯示完整路徑，並以完整路徑驅動實際動作。
- 上傳按鈕標籤改為「上傳雲端硬碟」。

**Non-Goals:**
- 不更動任何後端 API（`/download`、`/drive/upload*`、`/settings`）的行為或結構。
- 不更動 `download.ts` / `driveUpload.ts` store 的對外介面與後端契約。
- 不重做 drive-upload-batch change 的上傳邏輯，只搬移其呈現位置。

## Decisions

**抽出 `DriveUploadPanel.vue` 而非保留在 SelectedVideos**
將 `SelectedVideos.vue` 內的 `.drive-upload`、資料夾選擇 modal、以及 `onUpload`/`reauthDrive`/`openFolderPicker`/`chooseFolder`/`uploadStatusLabel` 與相關 ref（`drive`、`auth`、`reauthInProgress`、`selectedUploadDirectory`、`showFolderPicker`）整段移到新元件。理由：分頁切換要靠元件邊界，且讓下載元件回歸單一職責。替代方案是用 `v-if` 在同元件內切顯示區塊，但那樣 `<KeepAlive>` 切換與 `.dot` 進度提示無法乾淨對應三分頁，故捨棄。

**完整路徑改用 `output_path` 前綴的單一輸入框**
下載分頁將 `targetDirName`（僅日期）改為 `targetDirPath`（完整路徑），`onMounted`/loadSettings 時組 `joinPath(output_path, todayYyyymmdd())`。送出下載時需要的仍是「資料夾名稱」概念 —— 後端 `/download` 與序號掃描以日期資料夾為單位。決策：在送出前由完整路徑取 basename（最後一段）作為 `targetDir` 傳給 `download.startDownload`，維持後端契約不變。`joinPath` 已能判斷 `\` / `/` 分隔符，取 basename 用對應 split 即可。替代方案是後端接受完整路徑，但那會擴大變更面並牽動序號掃描，捨棄。

**`activeRightTab` 型別擴充為三值**
`'download' | 'normalize' | 'upload'`，分頁列新增第三顆按鈕，內容區由 `v-if`/`v-else-if`/`v-else` 對應三個元件，沿用既有 `<KeepAlive>` 與 `.dot`（上傳進行中 `driveUploadStore.status === 'running'` 時於非 active 的上傳分頁顯示提示點）。

## Risks / Trade-offs

- [完整路徑 basename 解析在混用分隔符或結尾斜線時可能取錯段] → 沿用 `VolumeNormalizer` 既有的 `joinPath` 規則並對結尾斜線 trim；basename 取 `path.replace(/[\\/]+$/, '').split(/[\\/]/).pop()`，並加單元測試覆蓋 Windows 路徑。
- [既有 `SelectedVideos.test.ts` 針對上傳的斷言會失效] → 將上傳相關測試移到新 `DriveUploadPanel` 測試，下載測試改驗完整路徑與 basename 解析。
- [使用者手改完整路徑前綴可能與真實 output_path 不符] → 維持現狀，輸入框可編輯；basename 仍以使用者輸入為準，與目前行為一致。
- [e2e `verify-drive-upload-batch.ts` 的點擊路徑改變] → 更新腳本先切到「上傳雲端硬碟」分頁再操作上傳。
