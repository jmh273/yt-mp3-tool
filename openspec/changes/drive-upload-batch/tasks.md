## 1. 下載目標資料夾覆寫(後端)

- [x] 1.1 `/download` request model 新增可選 `target_dir`(資料夾葉名)
- [x] 1.2 後端以 `(output_path / target_dir).resolve()` + `relative_to(output_path)` 驗證,拒絕越界(比照 normalize_start main.py:2313)
- [x] 1.3 未帶 `target_dir` 時回退 `datetime.now().%Y%m%d`,維持既有行為
- [x] 1.4 對 `target_dir` 做檔名級別清理(sanitize)
- [x] 1.5 確認序號前綴以該批目標資料夾既有檔計算(`_scan_next_seq`),一日多批互不影響
- [x] 1.6 後端測試:帶/不帶 target_dir、越界拒絕、同日多批序號隔離

## 2. 下載路徑對話框(前端)

- [x] 2.1 下載前彈出「下載到」對話框,預設值=本地 `YYYYMMDD`
- [x] 2.2 支援加標籤形成 `YYYYMMDD_<標籤>`(方案 C),空白/未改即用預設
- [x] 2.3 `download.ts` store 下載 payload 帶 `target_dir`,並記錄「最後工作資料夾」
- [x] 2.4 前端測試:預設下載、加標籤下載

## 3. Google Drive 授權(drive.file)

- [x] 3.1 OAuth scopes 增列 `https://www.googleapis.com/auth/drive.file`
- [x] 3.2 記錄/偵測帳號已授予的 scopes,判斷是否含 drive.file
- [x] 3.3 首次上傳偵測權限不足時,觸發一次性重新授權流程(沿用既有登入 UI)
- [x] 3.4 UI 顯示「scope 變更需重新授權一次」說明
- [x] 3.5 測試:無 drive.file → 引導授權;已授權 → 直接放行

## 4. Drive 上傳後端

- [x] 4.1 新增 Drive API 用戶端(沿用既有 google-api-python-client / 憑證)
- [x] 4.2 find-or-create 根目錄(預設 `YT-MP3`)與葉子資料夾,快取 folderId
- [x] 4.3 上傳前以 `files.list` 列目標資料夾既有檔名,做防重複(已存在則跳過)
- [x] 4.4 新增 `POST /drive/upload`(收 `directory` 絕對路徑,驗證在 output_path 內),回 `task_id`
- [x] 4.5 新增 `GET /drive/upload/progress/<id>` SSE,逐檔狀態 pending/uploading/skipped/done/error
- [x] 4.6 上傳失敗不動本機檔、可重觸發(重觸發靠防重複自動跳過已成功)
- [x] 4.7 後端測試:資料夾鏡像、防重複跳過、失敗回報、越界目錄拒絕

## 5. 上傳 UI(前端)

- [x] 5.1 下載區新增「⬆ 上傳今天到 Drive」按鈕
- [x] 5.2 預設目標=最後工作資料夾;一日多批時彈窗列出 output_path 下子資料夾供改選
- [x] 5.3 新增 drive upload store,訂閱 SSE 進度(比照 download/normalize 模式)
- [x] 5.4 顯示逐檔進度與成功/跳過/失敗,失敗可重新觸發
- [x] 5.5 改選彈窗對各資料夾顯示「已上傳/部分/未上傳」標記(D8)
- [x] 5.6 前端測試:預設上傳、改選上傳、已上傳標記、進度顯示、重試

## 6. 設定與文件

- [x] 6.1 後端 settings model 新增 `drive_root_folder` 欄位(預設 `YT-MP3`),納入 PUT settings 驗證
- [x] 6.2 設定頁(SettingsView)新增 Drive 根目錄名輸入欄位(D7)
- [x] 6.3 上傳改用 settings 的 `drive_root_folder` 作為 Drive 根目錄
- [x] 6.4 新增「已上傳」狀態查詢端點/邏輯:列 Drive 子夾與檔名供前端比對(D8)
- [x] 6.5 文件/UI 提醒:Drive 舊檔不自動清理、勿在 Drive 手動先建根目錄
- [x] 6.6 設定頁測試:drive_root_folder 編輯與儲存

## 7. 驗證

- [x] 7.1 撰寫並執行 `frontend/e2e/verify-drive-upload-batch.ts`(下載→改路徑→正規化→上傳→改選)
- [x] 7.2 確認向後相容:不調整路徑、不上傳時,行為與現行一致

