## Why

音量正規化目前以單執行緒 for 迴圈逐檔處理：每個檔案要等前一個 mp3gain「量測 + 套用」跑完才開始。mp3gain 是 CPU 密集（掃整檔算 ReplayGain），在 SSD 上序列執行無法善用多核心，整批耗時隨檔數線性增加。改為並行可同時跑多個 mp3gain 行程吃滿多核，明顯縮短整批時間。同時，前次 `concurrent-downloads` 加入的並發旋鈕 `download_concurrency` 只存在 settings.json、無 API/UI 可改，使用者「看不到也設不了」——本次一併把它接進設定頁，並讓下載與正規化共用同一個值。

## What Changes

- 後端 `run_normalize_batch()` 由單執行緒序列迴圈，改為以 `asyncio.Semaphore` 控制的並行 pipeline：每個檔案的「量測 → 跳過/套用」透過 `asyncio.to_thread` 丟到執行緒，最多同時執行 N 個。
- 並發數**沿用既有 `download_concurrency` 設定**（下載與正規化共用一顆），`normalize_start()` 透過現成的 `_resolve_concurrency()` 讀取並夾限（1–8、預設 3）。
- `SettingsUpdate` 模型與 `PUT /settings` 新增 `download_concurrency` 欄位並驗證（1–8），讓設定可經 API 修改。
- 前端 `SettingsView.vue` 新增「並發數」輸入欄，使用者可調整這顆共用值。
- 全部檔案結束（`asyncio.gather` 收斂）後才將任務 `status` 設為 `done`，維持既有 SSE 進度語意；個別檔案 measuring / normalizing / done / skipped / error 狀態各自獨立更新。
- 前端 `VolumeNormalizer` 進度面板**無需改動**：已是 per-file 渲染，並行時自然同時顯示多檔狀態。

## Capabilities

### New Capabilities
- `parallel-normalize`: 音量正規化批次的並行執行機制——以 semaphore 限制同時進行的「量測+套用」pipeline 數、共用 `download_concurrency` 設定、跳過/錯誤/完成的逐檔獨立狀態、以及「全部檔案結束才判定任務完成」的語意。

### Modified Capabilities
- `concurrent-downloads`: 「並發上限由設定控制」需求變更——並發值不再僅供下載使用（改為下載與正規化共用），且**移除「前端不提供調整此值的 UI」限制**，改為可經 `PUT /settings` 與設定頁 UI 調整。

## Impact

- **後端**：[backend/main.py](backend/main.py) 的 `run_normalize_batch()`（[L2479](backend/main.py#L2479)）重構為並行協調；`normalize_start()`（[L2521](backend/main.py#L2521)）讀取並傳入並發數；`SettingsUpdate`（[L916](backend/main.py#L916)）與 `update_settings()`（[L927](backend/main.py#L927)）新增 `download_concurrency` 欄位 + 1–8 驗證。
- **前端**：[frontend/src/views/SettingsView.vue](frontend/src/views/SettingsView.vue) 新增「並發數」輸入與載入/儲存；`VolumeNormalizer.vue` 不變。
- **設定檔**：`download_concurrency` 已存在於 DEFAULT_SETTINGS（前次 change 引入），本次補上其 API/UI 可寫入路徑。
- **資源**：最壞情況同時 N 個 mp3gain 行程；SSD 上並行讀寫無 HDD 隨機讀互搶問題。收益上限 ≈ min(N, CPU 核心數)。
- **測試**：[backend/tests/test_normalize.py](backend/tests/test_normalize.py)（或既有正規化測試檔）新增並行情境（並發上限、完成判定、部分失敗/跳過不阻擋）；`PUT /settings` 接受/驗證 `download_concurrency`。前端 [SettingsView.test.ts](frontend/src/tests/SettingsView.test.ts) 補欄位。
