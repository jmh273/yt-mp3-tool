# subscription-health-check Specification

## Purpose
TBD - created by archiving change subscription-health-check. Update Purpose after archive.
## Requirements
### Requirement: 訂閱頻道健檢端點

系統 SHALL 提供 `GET /subscriptions/health-check` 端點，盤點目前授權帳號的所有訂閱頻道，並回傳「抓不到影片」的問題頻道清單。回應 MUST 包含檢查總數與問題清單，每個問題項目 MUST 包含 `channel_id`、`subscription_id`、`title`、`thumbnail`、`reason` 與 `detail` 欄位。

正常頻道（探測到至少一部影片）MUST NOT 出現在問題清單中。

#### Scenario: 頻道正常則不列入問題

- **WHEN** 某訂閱頻道的上傳播放清單回傳至少一部影片
- **THEN** 該頻道不出現在 `problems` 清單中

#### Scenario: 回傳檢查總數與問題清單

- **WHEN** 使用者呼叫 `GET /subscriptions/health-check`
- **THEN** 回應包含 `checked`（檢查的頻道總數）與 `problems`（問題頻道陣列）
- **AND** 每個問題項目包含 `channel_id`、`subscription_id`、`title`、`thumbnail`、`reason`、`detail`

### Requirement: 問題頻道原因分類

系統 SHALL 為每個抓不到影片的頻道判定原因，`reason` 值 MUST 為下列之一：

- `no_uploads`：頻道存在但無可用上傳影片（含 `playlistNotFound` 與空播放清單）
- `deleted`：`channels.list` 查無此頻道（已刪除或終止）
- `forbidden`：探測回傳權限錯誤（403）
- `unknown`：其他非預期錯誤

#### Scenario: 頻道存在但無上傳影片

- **WHEN** 頻道的上傳播放清單回傳 `playlistNotFound` 或空清單，且 `channels.list` 仍能查到該頻道
- **THEN** 該頻道 `reason` 為 `no_uploads`

#### Scenario: 頻道已刪除或終止

- **WHEN** 頻道探測失敗且 `channels.list` 查無此頻道
- **THEN** 該頻道 `reason` 為 `deleted`

#### Scenario: 權限錯誤

- **WHEN** 頻道探測回傳 403
- **THEN** 該頻道 `reason` 為 `forbidden`

#### Scenario: 其他非預期錯誤

- **WHEN** 頻道探測發生非上述類別的錯誤
- **THEN** 該頻道 `reason` 為 `unknown`

### Requirement: 設定頁健檢介面

前端設定頁 SHALL 以頁籤（tabs）區分「設定」與「訂閱頻道健檢」兩個面板，預設顯示「設定」。切換至「訂閱頻道健檢」頁籤 SHALL 顯示健檢面板，含一顆觸發健檢的按鈕與成本提示。按下按鈕時 SHALL 顯示進行中狀態；完成後，若無問題 SHALL 顯示「全部正常」訊息，若有問題 SHALL 逐列顯示問題頻道的縮圖、頻道名與原因徽章。

#### Scenario: 預設顯示設定頁籤並可切換

- **WHEN** 使用者進入設定頁
- **THEN** 預設顯示「設定」面板，「訂閱頻道健檢」面板不顯示
- **AND** 點選「訂閱頻道健檢」頁籤後改為顯示健檢面板

#### Scenario: 觸發健檢並顯示問題清單

- **WHEN** 使用者切換到「訂閱頻道健檢」頁籤並按下「檢查訂閱頻道」
- **THEN** 呼叫 `GET /subscriptions/health-check` 並顯示進行中狀態
- **AND** 回應含問題頻道時，逐列顯示縮圖、頻道名與原因徽章

#### Scenario: 全部正常

- **WHEN** 健檢回傳的 `problems` 為空
- **THEN** 顯示「所有訂閱頻道皆正常」訊息，且不顯示任何頻道列

### Requirement: 從健檢結果直接退訂

前端 SHALL 允許使用者對每個問題頻道直接退訂。退訂前 SHALL 先要求確認；確認後 SHALL 呼叫 `DELETE /subscriptions/{subscription_id}`。退訂成功後 SHALL 將該頻道自清單移除並顯示成功提示；失敗時 SHALL 顯示錯誤提示且保留該列。

#### Scenario: 退訂成功

- **WHEN** 使用者對某問題頻道按下退訂並在確認對話框中確認
- **THEN** 呼叫 `DELETE /subscriptions/{subscription_id}`
- **AND** 成功後該頻道自清單移除並顯示成功提示

#### Scenario: 退訂前需確認

- **WHEN** 使用者按下退訂但在確認對話框中取消
- **THEN** 不呼叫退訂端點，該頻道保留在清單中

#### Scenario: 退訂失敗

- **WHEN** 退訂請求失敗
- **THEN** 顯示錯誤提示，且該頻道仍保留在清單中

### Requirement: 預期錯誤 log 降噪

後端在探測頻道影片遇到 `playlistNotFound` 這類預期錯誤時，SHALL 僅輸出一行精簡訊息（含頻道識別資訊），MUST NOT 輸出整段錯誤 JSON。非預期錯誤 SHALL 維持完整輸出以利除錯。

#### Scenario: 預期錯誤精簡輸出

- **WHEN** 探測頻道時回傳 `playlistNotFound`
- **THEN** log 僅輸出一行精簡訊息，不含整段 JSON

#### Scenario: 非預期錯誤保留完整輸出

- **WHEN** 探測頻道時發生非預期錯誤
- **THEN** log 維持輸出完整錯誤內容

