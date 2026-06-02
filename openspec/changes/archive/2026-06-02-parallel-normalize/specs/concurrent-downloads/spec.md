## MODIFIED Requirements

### Requirement: 並發上限由設定控制
系統 SHALL 從 settings 讀取 `download_concurrency` 作為並發上限，預設值為 `3`。讀取後 MUST 夾限於 `1`–`8` 之間（含端點）；缺漏或非法值 MUST fallback 為 `3`。此並發值 SHALL **同時套用於下載與音量正規化批次**（兩者共用同一設定）。使用者 SHALL 能透過 `PUT /settings` 與設定頁 UI 調整此值；`PUT /settings` 收到的值 MUST 驗證落在 `1`–`8`，超出範圍回傳 422。

#### Scenario: 缺漏時使用預設值
- **WHEN** settings 未設定 `download_concurrency`
- **THEN** 並發上限為 `3`

#### Scenario: 自訂並發上限
- **WHEN** settings 設定 `download_concurrency` 為 `5`
- **THEN** 下載批次最多同時進行 5 支影片

#### Scenario: 超出範圍時夾限
- **WHEN** settings 設定 `download_concurrency` 為 `0` 或 `99`
- **THEN** 並發上限分別夾限為 `1` 與 `8`

#### Scenario: 經設定頁修改並發數
- **WHEN** 使用者在設定頁將「並發數」設為 `4` 並儲存
- **THEN** `PUT /settings` 接受並持久化 `download_concurrency: 4`，之後的下載與正規化批次皆以 4 為並發上限

#### Scenario: PUT /settings 拒絕越界值
- **WHEN** `PUT /settings` 收到 `download_concurrency` 為 `0` 或 `99`
- **THEN** 回傳 422（驗證失敗），不寫入設定
