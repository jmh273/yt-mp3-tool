## 1. 左側功能按鈕 icon

- [x] 1.1 在 HomeView.vue「最新影片」按鈕文字前加 🆕 前綴
- [x] 1.2 將「同類新頻道」按鈕的 🔍 改為 🧭
- [x] 1.3 確認五個功能按鈕 emoji 皆不重複(🆕/🔥/🔍/🔗/🧭)

## 2. 頻道名稱完整顯示 tooltip

- [x] 2.1 HomeView.vue 訂閱清單 channel-title `<span>` 加 `:title="ch.title"`
- [x] 2.2 WatchlistPanel.vue watchlist-title `<span>` 加 `:title="item.title"`

## 3. 後端工作資料夾列表端點

- [x] 3.1 從 `_collect_upload_folders` 抽出「列出 output_path 下日期子資料夾」的共用 helper(只 iterdir + 依名稱倒序,不查 Drive)
- [x] 3.2 `_collect_upload_folders` 改用該 helper,維持原「已上傳」判定行為不變
- [x] 3.3 新增 `GET /folders` 端點,回傳 `{ folders: [{ name, directory }] }`,不碰 Drive API、不需授權
- [x] 3.4 後端測試:`/folders` 列出子資料夾、未授權 Drive 仍正常回傳、不發出 Drive 請求

## 4. DirectoryPicker 共用元件

- [x] 4.1 新增 `frontend/src/components/DirectoryPicker.vue`:輸入欄 + 尾端 📁 icon + 資料夾彈窗
- [x] 4.2 定義 props `modelValue` / `folders`({ name, directory, badge? }) / `disabled`;emits `update:modelValue` / `pick`
- [x] 4.3 實作「選定資料夾只填路徑並關閉彈窗,不觸發任何執行動作」
- [x] 4.4 將 `dirEdited` + `defaultDir()` 同步邏輯集中(共用 composable useWorkDir),供兩面板複用
- [x] 4.5 新增 `DirectoryPicker.test.ts`:icon 開彈窗、清單來自 props、選取只填路徑不執行、可手動輸入

## 5. DriveUploadPanel 套用

- [x] 5.1 以 DirectoryPicker 取代本地端目錄 input,移除獨立「選擇資料夾」按鈕與 `openFolderPicker`/`showFolderPicker`/`folder-modal` 區塊
- [x] 5.2 將 `drive.folders` 的 `uploaded` 映成 picker 的 `badge`(「已上傳」)餵入
- [x] 5.3 開啟彈窗時仍呼叫 `drive.loadFolders()` 取得清單;選取後僅填路徑、按鈕才上傳
- [x] 5.4 更新 `DriveUploadPanel.test.ts` 對齊新互動(icon 入口、選取不上傳、已上傳 badge)

## 6. VolumeNormalizer 套用

- [x] 6.1 以 DirectoryPicker 取代 dir-input,清單改抓 `GET /folders`(badge 留空)
- [x] 6.2 維持「載入」按鈕為唯一執行入口;從彈窗選資料夾只填路徑不自動載入
- [x] 6.3 移除面板內重複的 `dirEdited`/`defaultDir` 邏輯(已集中於共用 composable useWorkDir)
- [x] 6.4 更新 `VolumeNormalizer.test.ts` 對齊新互動(icon 入口、選取不載入、仍可手打路徑)

## 7. 驗證

- [x] 7.1 跑前端與後端測試,全綠(前端 184 + vue-tsc 0 err、後端 216)
- [x] 7.2 撰寫並執行 `frontend/e2e/verify-ui-consistency-polish.ts` 驗證三項:icon 顯示、tooltip title、兩面板 picker 選取只填路徑(10 pass / 0 fail)
