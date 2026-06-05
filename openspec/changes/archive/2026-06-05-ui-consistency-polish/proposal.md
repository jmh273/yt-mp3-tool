## Why

介面累積了幾處小但礙眼的不一致:左側功能表只有「最新影片」沒有 icon、且「同類新頻道」與「搜尋影片」共用同一個 🔍;訂閱／觀察名單的頻道名稱被截斷後無法看到全名;右側下載／正規化／上傳三個面板各自用不同方式選資料夾(命名不同、只有上傳有 picker、同步邏輯重複實作)。這些都直接影響日常操作手感,趁開源自架前一併收斂。

## What Changes

- **左側功能表 icon 一致化**:「最新影片」加上 🆕 前綴;「同類新頻道」由 🔍 改為 🧭,消除與「搜尋影片」的重複。五個功能按鈕皆有不重複的 emoji 前綴。
- **頻道名稱完整顯示**:訂閱清單與觀察名單的頻道名稱 `<span>` 補上原生 `title` 屬性,hover 時瀏覽器顯示完整名稱。
- **目錄選單操作一致化(共用元件)**:
  - 新增純展示元件 `DirectoryPicker`(輸入欄 + 尾端 📁 icon + 資料夾彈窗),集中目前散落在各面板的「已編輯／預設值同步」邏輯。
  - 互動模型統一:**picker 只負責填入路徑,執行交給動作鈕**(載入／上傳)。從彈窗選資料夾不會自動載入或上傳。
  - `DriveUploadPanel` 移除獨立的「選擇資料夾」按鈕,改用欄位尾端 icon;仍餵入含「已上傳」標記的清單。
  - `VolumeNormalizer` 套用同元件;新增輕量後端端點列出工作資料夾(不觸碰 Drive API)供其填入清單。
  - 下載面板(`SelectedVideos`)維持原狀,不在本次調整範圍。

## Capabilities

### New Capabilities
- `directory-picker`: 跨面板共用的資料夾選擇互動 — 輸入欄 + 尾端 icon 開啟彈窗、picker 僅填路徑不執行動作,以及供非 Drive 消費者使用的工作資料夾列表端點。

### Modified Capabilities
- `sidebar-layout`: 左側功能按鈕的 icon 一致化(最新影片、同類新頻道),以及訂閱頻道名稱 hover 顯示完整名稱。
- `channel-watchlist`: 觀察名單頻道名稱 hover 顯示完整名稱。
- `parallel-normalize`: 目錄選擇改用共用 `DirectoryPicker`,以新端點取得工作資料夾清單。
- `drive-upload`: 以欄位尾端 icon 取代「選擇資料夾」按鈕,改用共用 `DirectoryPicker` 呈現含「已上傳」標記的清單。

## Impact

- 前端:`frontend/src/views/HomeView.vue`、`components/WatchlistPanel.vue`、`components/VolumeNormalizer.vue`、`components/DriveUploadPanel.vue`、`stores/driveUpload.ts`,新增 `components/DirectoryPicker.vue`。
- 後端:`backend/main.py` 新增列出 `output_path` 下日期子資料夾的輕量端點(沿用 `_collect_upload_folders` 附近邏輯,但不查 Drive)。
- 測試:對應元件測試(`VolumeNormalizer.test.ts`、`DriveUploadPanel.test.ts`)需配合新互動更新;新增 `DirectoryPicker` 元件測試與後端端點測試。
- 純展示與字串調整,無資料結構或破壞性 API 變更。
