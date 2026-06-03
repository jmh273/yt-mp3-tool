## 1. 設定:drive_upload_concurrency(比照 download_concurrency)

- [x] 1.1 `DEFAULT_SETTINGS` 新增 `"drive_upload_concurrency": 3`
- [x] 1.2 `SettingsUpdate` model 新增 `drive_upload_concurrency: int | None = Field(default=None, ge=1, le=8)`,並於 settings update 寫回(不動 `_SETTINGS_RANGES`)
- [x] 1.3 新增 `_resolve_drive_upload_concurrency(settings)`,clamp 1..8、fallback 3(對齊 `_resolve_concurrency`)

## 2. 後端:Drive 上傳並行化

- [x] 2.1 重構 `run_drive_upload_batch`:前置(ensure root/leaf、list existing)維持單執行緒只跑一次,取得 `leaf_id`、`existing`
- [x] 2.2 抽出 `upload_one(file_path, leaf_id)`:於 worker 內以 `_build_drive_service()` 建立該執行緒專屬 service 後上傳;沿用既有 mimetype 判斷與跳過已存在邏輯
- [x] 2.3 以 `asyncio.Semaphore(N) + gather`(或同等並行)fan-out 上傳;`concurrency<=1` 或檔數<=1 走序列短路
- [x] 2.4 進度寫入維持各檔更新自身 item;批次 `status="done"` 與錯誤匯整移到所有 worker 結束後設一次
- [x] 2.5 `drive_upload_start` 取得 `_resolve_drive_upload_concurrency(settings)` 並傳入批次函式

## 3. 前端:設定頁

- [x] 3.1 設定頁新增 `drive_upload_concurrency` 數字欄位(範圍 1..8,對齊 `download_concurrency` 欄位風格)
- [x] 3.2 確認 `DriveUploadPanel` 在多檔並行下進度顯示正常(逐檔狀態、整批完成時機)

## 4. 測試

- [x] 4.1 `backend/tests/test_settings.py`:新設定預設值、夾限、缺失/非法回退、與 download_concurrency 獨立
- [x] 4.2 後端 Drive 上傳測試:N>1 並行不漏檔/不重複、單檔失敗不影響其他、整批完成於全部結束後標記、各 worker 獨立 service
- [x] 4.3 跑過 backend + frontend 既有測試確認無回歸

## 5. 驗證

- [x] 5.1 撰寫 `frontend/e2e/verify-parallel-drive-upload.ts`,驗證多檔上傳逐檔進度與整批完成
- [x] 5.2 跑過 verify 腳本,通過後再建議 verify/archive
