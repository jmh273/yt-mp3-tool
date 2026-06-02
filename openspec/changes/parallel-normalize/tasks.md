## 1. 後端：正規化並行化

- [x] 1.1 將 `run_normalize_batch()` 的迴圈體抽成 `normalize_one(filename)`：量測 → `<0.75dB` 跳過 / 套用 → 狀態更新（含逐項 try/except，例外不向上拋）
- [x] 1.2 `run_normalize_batch` 新增 `concurrency` 參數（預設 1=序列、零回歸）；`concurrency > 1` 時內部 `asyncio.run` 跑協調器：`asyncio.Semaphore(concurrency)` + `async with sem: await asyncio.to_thread(normalize_one, fn)`，`asyncio.gather` 收斂後設 `status="done"`，`finally` 仍 `discard(_active_normalize_dirs)`
- [x] 1.3 `normalize_start()` 以 `_resolve_concurrency(load_settings())` 取得並發數並傳入 `run_normalize_batch`

## 2. 後端：並發設定可經 API 修改

- [x] 2.1 `SettingsUpdate` 新增 `download_concurrency: int | None = Field(default=None, ge=1, le=8)`
- [x] 2.2 `update_settings()` 收到 `download_concurrency` 時寫入 settings（越界由 Field 驗證回 422）

## 3. 前端：設定頁並發數欄位

- [x] 3.1 `SettingsView.vue` 新增 `concurrency` ref，onMounted 從 `/settings` 載入 `download_concurrency`（fallback 3）
- [x] 3.2 新增「並發數」number input（min=1 max=8，附說明：下載與正規化共用）
- [x] 3.3 `save()` 的 `PUT /settings` payload 納入 `download_concurrency`

## 4. 測試

- [x] 4.1 [backend/tests/test_normalize.py](backend/tests/test_normalize.py) 新增：並發上限生效（同時進行數不超過 N，semaphore gating）
- [x] 4.2 新增：批次完成判定（全部結束才 `done`）、跳過與部分失敗不阻擋其他檔案、`concurrency=1` 序列行為回歸
- [x] 4.3 後端測試 `PUT /settings` 接受 `download_concurrency`（合法值寫入、`0`/`99` 回 422）
- [x] 4.4 [frontend/src/tests/SettingsView.test.ts](frontend/src/tests/SettingsView.test.ts) 補：載入顯示 `download_concurrency`、儲存時送出該欄位
- [x] 4.5 跑既有正規化 / settings 測試確認回歸（backend + frontend）

## 5. 驗證

- [x] 5.1 撰寫並執行 `frontend/e2e/verify-parallel-normalize.ts`：設定頁改並發數→儲存→正規化批次觀察多檔同時「量測中/套用中」、最終全部完成（已實跑：A 送出全部檔名 / B 多檔並行 badge 並存 / C 設定頁並發數顯示+儲存，4 pass）
