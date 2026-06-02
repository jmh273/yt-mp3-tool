## ADDED Requirements

### Requirement: 並行下載執行
系統 SHALL 在 `run_download()` 內並行處理批次中的多支影片，每支影片的「下載 + 轉檔」pipeline 透過背景執行緒執行，並以號誌（semaphore）限制同時進行的影片數量不超過設定的並發上限 N。

#### Scenario: 多支影片並行進行
- **WHEN** 使用者送出含 5 支影片的下載批次，且並發上限為 3
- **THEN** 任一時刻最多有 3 支影片處於「下載中 / 轉檔中」，其餘排隊等待號誌釋放

#### Scenario: 單支影片行為不變
- **WHEN** 批次僅含 1 支影片
- **THEN** 該影片如現況般下載與轉檔，並行機制不改變其結果

### Requirement: 並發上限由設定控制
系統 SHALL 從 settings 讀取 `download_concurrency` 作為並發上限，預設值為 `3`。讀取後 MUST 夾限於 `1`–`8` 之間（含端點）；缺漏或非法值 MUST fallback 為 `3`。前端不提供調整此值的 UI。

#### Scenario: 缺漏時使用預設值
- **WHEN** settings 未設定 `download_concurrency`
- **THEN** 並發上限為 `3`

#### Scenario: 自訂並發上限
- **WHEN** settings 設定 `download_concurrency` 為 `5`
- **THEN** 下載批次最多同時進行 5 支影片

#### Scenario: 超出範圍時夾限
- **WHEN** settings 設定 `download_concurrency` 為 `0` 或 `99`
- **THEN** 並發上限分別夾限為 `1` 與 `8`

### Requirement: 並行下序號編號正確性
系統 SHALL 確保啟用序號前綴時，每支影片的 `nn_` 前綴依其在批次中的索引（idx）計算，與下載/轉檔的實際完成順序無關。

#### Scenario: 完成順序不影響檔名編號
- **WHEN** 批次 `[A, B, C]` 並行下載，且 C 比 A 先完成轉檔
- **THEN** 檔名前綴仍為 A=`01_`、B=`02_`、C=`03_`，不因 C 先完成而錯位

### Requirement: 批次完成判定
系統 SHALL 在批次內所有影片皆結束（成功或失敗）後，才將該任務的 `status` 設為 `done`。個別影片的 `status`（pending / downloading / converting / done / error）MUST 各自獨立更新，互不阻擋。

#### Scenario: 全部完成才結束任務
- **WHEN** 批次中 2 支已完成、1 支仍在轉檔
- **THEN** 任務 `status` 維持 `running`，SSE 持續推送進度，直到最後一支結束才設為 `done`

#### Scenario: 部分失敗不阻擋其他影片
- **WHEN** 批次中某支影片下載失敗
- **THEN** 該支標記為 `error` 並記錄錯誤訊息，其餘影片不受影響繼續完成；待全部結束後任務 `status` 設為 `done`
