## Why

Drive 上傳目前在單一 worker thread 內逐檔阻塞上傳([run_drive_upload_batch](backend/main.py#L2757)),整批 wall time = Σ 每檔上傳時間。上傳是網路 I/O bound,逐檔等待浪費時間;批次檔數多時體感明顯偏慢。並行上傳可大幅縮短整批耗時。

## What Changes

- Drive 上傳改為並行:前置步驟(ensure root/leaf 資料夾、列既有檔名)維持單執行緒跑完後,再 fan-out 並行上傳各檔。
- 新增**獨立**設定 `drive_upload_concurrency`(預設 3,範圍 1..8),不沿用 `download_concurrency`,因網路/Drive API 配額性質與本機 CPU/磁碟並發不同。
- 此設定 SHALL 接進設定頁可調,並**完全比照既有 `download_concurrency` 的處理方式**:加入 `DEFAULT_SETTINGS`、由 `SettingsUpdate` 的 Pydantic 欄位(`ge=1, le=8`)驗證、以 resolve-clamp helper 夾限;**刻意不放進 `_SETTINGS_RANGES`**,以避免 load_settings 的「out-of-range reset 成預設」與 resolve 的「clamp」雙重行為衝突(與 `download_concurrency` 的既有理由一致)。
- 解決 Google API client thread-safety:每個 worker thread 各建自己的 service 物件(共用同一份 credentials),不共用單一 service。
- 維持既有逐檔進度回報與「失敗不影響其他檔/可重試」語意;並行下進度狀態的寫入須執行緒安全。

## Capabilities

### New Capabilities
<!-- 無新增 capability -->

### Modified Capabilities
- `drive-upload`: 新增「上傳並行化」需求與「`drive_upload_concurrency` 設定」需求;微調「上傳進度與失敗回報」以涵蓋並行下的執行緒安全與失敗隔離。

## Impact

- `backend/main.py`:
  - `run_drive_upload_batch` 改並行(asyncio.Semaphore + run_in_executor 包每檔上傳,或 ThreadPoolExecutor),前置步驟保持單次。
  - 每 worker 建獨立 service:`_build_drive_service()` 須可於 worker 內呼叫(credentials 共用)。
  - `DEFAULT_SETTINGS` 新增 `drive_upload_concurrency: 3`;`SettingsUpdate` model 加欄位(`ge=1, le=8`);**不**動 `_SETTINGS_RANGES`(同 `download_concurrency`)。
  - 新增 `_resolve_drive_upload_concurrency(settings)`(對齊既有 `_resolve_concurrency` 模式,clamp 1..8、fallback 3)。
- `frontend`:設定頁新增 `drive_upload_concurrency` 欄位;`DriveUploadPanel` 不需大改。
- 測試:`backend/tests/test_settings.py`(新設定夾限/reset)、Drive 上傳相關測試;`frontend` 設定頁測試。
- Drive API 配額:並行 3~4 在預設 per-user quota 內安全。
