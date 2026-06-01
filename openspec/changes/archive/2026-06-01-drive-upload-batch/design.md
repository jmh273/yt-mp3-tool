## Context

本機桌面工具:FastAPI 後端(PyInstaller 打包)+ Vue/Pinia 前端,下載落點為 `output_path/YYYYMMDD/`(main.py:1940、2121-2127),序號前綴依資料夾既有檔計算(`_scan_next_seq`)。音量正規化採 mp3gain **原地**處理(main.py:2269 `_run_mp3gain_apply`),因此「正規化後的資料夾」就是下載資料夾本身,沒有第二個輸出夾。專案已接好 Google OAuth(`client_secret.json`、每帳號 token,main.py:344 `_token_path`),目前 scope 僅 YouTube。手機端以 `com.marc.files` 從 Google 雲端硬碟整夾搬進播放目錄,故 app 只需讓檔案出現在 Drive 對應資料夾。

## Goals / Non-Goals

**Goals:**
- 下載前可覆寫目標資料夾名,預設今日日期,可加標籤(方案 C),支援一日多批。
- 手動把指定工作資料夾鏡像上傳到 Drive,結構與本機一致。
- 沿用既有 OAuth 基礎,最小新增 `drive.file` scope。
- 向後相容:不調整時行為與現行完全相同。

**Non-Goals:**
- 下載完成自動上傳(維持手動按鈕)。
- Drive 舊檔自動清理 / 配額管理。
- 區網直傳、跨網段、手機端 app 改動。

## Decisions

### D1:下載路徑覆寫走 `target_dir`(子資料夾名),非絕對路徑
`/download` body 新增可選 `target_dir`(僅資料夾葉名,如 `20260601_運動`)。後端以 `(output_path / target_dir).resolve()` 並驗證 `relative_to(output_path)` 防越界(比照 normalize_start 既有作法 main.py:2313-2315)。未提供時回退 `datetime.now().strftime("%Y%m%d")`。
- **替代方案**:讓前端傳完整絕對路徑 → 否決,越界風險高、與 `output_path` 設定脫鉤。

### D2:預設資料夾名在前端組,後端只收最終葉名
對話框預設值由前端以本地時間產生 `YYYYMMDD`,使用者加標籤即 `YYYYMMDD_<標籤>`。後端對名稱做 `_sanitize_filename` 級別清理。保持後端單一真實來源(防越界),前端負責 UX 預設。

### D3:上傳目標 = 工作資料夾的「絕對路徑」,由前端記住最後一批
前端 download store 記錄最後一次下載/正規化的資料夾(已有 `normalizeStore.directory`)。上傳按鈕預設帶該路徑;一日多批時彈窗可改選(列出 `output_path` 下的子資料夾)。新 `/drive/upload` 收 `directory`(絕對路徑,需在 `output_path` 內)+ 目標 Drive 根目錄名。
- **替代方案**:後端自行推算「今天的資料夾」→ 否決,一日多批下無法判斷要傳哪一批。

### D4:Drive 結構鏡像 + find-or-create + 防重複
根目錄預設 `YT-MP3`,於其下用本機葉名建同名子夾。以 Drive `files.list` 查 `name='<folder>' and mimeType='application/vnd.google-apps.folder' and '<parent>' in parents and trashed=false` 取得或建立,快取 folderId。上傳每檔前先 `files.list` 查同名檔,存在則跳過。`drive.file` scope 下只看得到 app 自建檔,故 app 全程擁有根目錄/子夾,查詢一致。
- **替代方案**:依賴 Drive 允許同名 → 否決,重跑會產生重複檔。

### D5:`drive.file` scope + 惰性重新授權
在既有 OAuth flow 的 scopes 增列 `https://www.googleapis.com/auth/drive.file`。既有 token 因 scope 變更會缺權限;首次上傳偵測權限不足(或本地記錄的 granted scopes 不含 drive.file)時,觸發重新授權流程(沿用既有登入 UI),完成後續傳。UI 明確說明此為一次性。
- **替代方案**:改用 full `drive` scope → 否決,過度授權、Google 驗證較嚴。

### D6:上傳進度沿用 SSE 模式
比照 `/download/progress` 與 `/normalize/progress`(EventSource + 全域 progress dict),新增 `/drive/upload` 回 `task_id` 與 `/drive/upload/progress/<id>`,前端新增 drive upload store 訂閱。逐檔狀態 pending/uploading/skipped/done/error;失敗不影響本機檔,可重觸發(重觸發時 D4 防重複會自動跳過已成功者)。

## Risks / Trade-offs

- [scope 變更使所有帳號需重新授權] → UI 事前說明為一次性;偵測缺權限時優雅引導,而非報錯。
- [`drive.file` 看不到使用者手動在 Drive 建的同名根目錄,可能各自建一份] → 由 app 全權建立/管理根目錄;文件說明勿手動先建。
- [Drive 配額(免費 15GB)隨上傳累積] → 本次不自動清理,於 UI/文件提醒;保留日後清理 capability。
- [大量檔案 `files.list` 查重的 API 次數] → 每批通常數十檔,量小;可一次列出目標資料夾全部檔名再本地比對,降低呼叫數。
- [一日多批序號接續錯亂] → 序號以「各批自身資料夾」為基準計算,天然隔離(D1 + `_scan_next_seq`)。

## Migration Plan

1. 後端加 `target_dir` 與越界驗證,預設回退不改既有行為(可先單獨上線、無 UI 也相容)。
2. 加 `drive.file` scope 與重新授權偵測。
3. 加 `/drive/upload` + 進度端點與 Drive 資料夾/防重複邏輯。
4. 前端:下載路徑對話框、上傳按鈕、改選彈窗、進度與授權提示。
5. Rollback:移除上傳按鈕與 `/drive/upload`;`target_dir` 未帶即等同舊行為,可保留。

### D7:Drive 根目錄名於設定頁可改(已定案)
設定頁(`/settings`,後端 settings model main.py:866 區段)新增 `drive_root_folder` 欄位,預設 `YT-MP3`。上傳時以此值作為 find-or-create 根目錄名。沿用既有設定儲存(`~/.yt-mp3-tool`)與 PUT settings 流程。

### D8:改選彈窗顯示「已上傳」標記(已定案)
彈窗列出 `output_path` 下子資料夾時,對每個資料夾比對其在 Drive 對應資料夾的狀態:Drive 子夾存在且該批檔名皆已存在 → 標記「已上傳」;部分存在 → 可標「部分」。為省 API 呼叫,每個資料夾以一次 `files.list`(列目標夾全部檔名)做本地比對。彈窗開啟時批次查詢,結果可短暫快取避免重複呼叫。

## Open Questions

- (無 — 先前兩個未決問題已於 D7/D8 定案)
