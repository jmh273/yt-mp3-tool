## 1. 設定旋鈕

- [x] 1.1 `load_settings()` 的預設 settings 補上 `download_concurrency: 3`
- [x] 1.2 在 `start_download()` 讀取 `settings.get("download_concurrency", 3)`，以 `max(1, min(8, int(...)))` 夾限，非整數/缺漏 fallback 3（抽成 `_resolve_concurrency` 便於測試）

## 2. run_download 並行重構

- [x] 2.1 將現有 for 迴圈體抽成 `download_one(idx, v, ...)`：sanitize 標題、`_compute_seq_prefix`、`_build_ydl_opts`、`make_hook`、`YoutubeDL.download`、更新 item status（含 try/except 逐項錯誤捕捉）
- [x] 2.2 在進入並行前保留 `_scan_next_seq()` 計算 `default_next`（只算一次）
- [x] 2.3 `run_download` 新增 `concurrency` 參數（預設 1=序列、零回歸）；`concurrency > 1` 時內部 `asyncio.run` 跑協調器：`asyncio.Semaphore(concurrency)` + `async with sem: await asyncio.to_thread(download_one, idx, v)`，`asyncio.gather` 收斂後設 `status="done"`
- [x] 2.4 確保 `download_one` 內例外不向上拋（各協程自吞），避免 `gather` 因單支失敗中斷其他

## 3. 端點排程調整

- [x] 3.1 `start_download()` 維持 `loop.run_in_executor(None, run_download, ...)`（run_download 保持 sync，API 合約不變），新增傳入 `_resolve_concurrency(settings)` 夾限後的並發數

## 4. 測試

- [x] 4.1 [backend/tests/test_download.py](backend/tests/test_download.py) 新增：序號編號與完成順序解耦（C 先完成仍 `03_`）
- [x] 4.2 新增：並發上限生效（同時進行數不超過 N）與夾限（0→1、99→8、缺漏→3）
- [x] 4.3 新增：批次完成判定（全部結束才 `done`）、部分失敗不阻擋其他影片
- [x] 4.4 跑既有下載相關測試確認單支/序列行為與現況一致（回歸）— 194 passed

## 5. 驗證

- [~] 5.1 已撰寫 `frontend/e2e/verify-concurrent-downloads.ts`（驗證多支批次 POST payload + 多條 `.bar.downloading` 並存）；腳本可正常載入，但**尚未執行通過**——需先起後端(8000)+前端(5173)並 `npm run e2e:auth` 完成 Google 授權。待使用者跑過綠燈再 archive。
