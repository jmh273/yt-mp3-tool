# parallel-normalize Specification

## Purpose
定義音量正規化批次的並行執行機制：以與下載共用的 `download_concurrency` 設定控制並發上限，透過背景執行緒 + 號誌（semaphore）同時進行多檔的「量測 → 跳過/套用」pipeline，吃滿多核縮短整批耗時。涵蓋並發上限讀取與夾限、逐檔（measuring/normalizing/skipped/done/error）獨立狀態、「全部檔案結束才判定任務完成」的語意，以及維持既有同目錄互斥保護。對前端進度面板透明（已為 per-file 渲染）。

## Requirements

### Requirement: 並行正規化執行
系統 SHALL 在 `run_normalize_batch()` 內並行處理批次中的多個檔案，每個檔案的「量測 → 跳過/套用」pipeline 透過背景執行緒執行，並以號誌（semaphore）限制同時進行的檔案數量不超過設定的並發上限 N。

#### Scenario: 多檔並行進行
- **WHEN** 使用者對 5 個檔案啟動正規化，且並發上限為 3
- **THEN** 任一時刻最多有 3 個檔案處於「量測中 / 套用中」，其餘排隊等待號誌釋放

#### Scenario: 單檔行為不變
- **WHEN** 批次僅含 1 個檔案
- **THEN** 該檔案如現況般量測與套用，並行機制不改變其結果

### Requirement: 正規化共用並發設定
系統 SHALL 在 `normalize_start()` 從 settings 讀取與下載**共用的** `download_concurrency` 作為並發上限，透過既有 `_resolve_concurrency()` 夾限於 `1`–`8`（缺漏或非法值 fallback 為 `3`）。

#### Scenario: 與下載共用同一設定值
- **WHEN** settings 的 `download_concurrency` 為 `5`
- **THEN** 正規化批次最多同時進行 5 個檔案（與下載批次一致）

#### Scenario: 超出範圍時夾限
- **WHEN** settings 的 `download_concurrency` 為 `0` 或 `99`
- **THEN** 正規化並發上限分別夾限為 `1` 與 `8`

### Requirement: 逐檔獨立狀態與完成判定
系統 SHALL 在批次內所有檔案皆結束後，才將任務 `status` 設為 `done`。個別檔案的 `status`（pending / measuring / normalizing / skipped / done / error）MUST 各自獨立更新，互不阻擋；單一檔案的失敗或跳過 MUST NOT 中斷其他檔案。

#### Scenario: 全部結束才完成任務
- **WHEN** 批次中 2 檔已完成、1 檔仍在套用
- **THEN** 任務 `status` 維持 `running`，SSE 持續推送進度，直到最後一檔結束才設為 `done`

#### Scenario: 跳過不阻擋其他檔案
- **WHEN** 某檔量測後建議調整量 `< 0.75 dB`
- **THEN** 該檔標記為 `skipped`，其餘檔案不受影響繼續並行處理

#### Scenario: 部分失敗不阻擋其他檔案
- **WHEN** 某檔 mp3gain 執行失敗
- **THEN** 該檔標記為 `error` 並記錄錯誤訊息，其餘檔案照常完成；待全部結束後任務 `status` 設為 `done`

### Requirement: 並行不破壞同目錄互斥
系統 SHALL 維持既有 `_active_normalize_dirs` 同目錄互斥保護：同一目錄同時只能有一個正規化任務；批次「內部」的多檔並行 MUST 各自就地修改不同檔案，不產生互相覆寫。

#### Scenario: 同目錄重複任務仍被拒
- **WHEN** 某目錄已有正在執行的正規化任務，再對同目錄發起正規化
- **THEN** 回傳 409（行為與現況一致），不因並行化而改變
