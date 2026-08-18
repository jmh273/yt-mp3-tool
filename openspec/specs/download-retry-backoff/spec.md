# download-retry-backoff Specification

## Purpose

定義單一下載批次內針對暫時性失敗的自動重試。YouTube 的媒體端會間歇性拒絕請求，而串流 URL 常與特定一次解析綁定，重試同一個 URL 無效——因此重試必須重新解析取得新的 URL。此能力將原本需要使用者手動再按一次下載的成本自動化。

## Requirements

### Requirement: 失敗後以新解析結果自動重試

單一影片下載失敗時，系統 SHALL 自動重試。每次重試 SHALL 重新解析該影片以取得新的串流 URL，SHALL NOT 重複使用先前失敗的 URL。

重試 SHALL 採遞增（退避）間隔，並於達到上限後才將該影片標記為失敗。重試 MUST 僅作用於該影片，SHALL NOT 影響同批次其他影片的進行。

#### Scenario: 暫時性失敗經重試後成功
- **GIVEN** 一支影片的首次下載因暫時性錯誤失敗
- **WHEN** 系統自動重試且該次成功
- **THEN** 該影片 SHALL 標記為完成
- **AND** SHALL NOT 呈現為失敗

#### Scenario: 重試使用新的串流 URL
- **WHEN** 系統重試一支先前失敗的影片
- **THEN** 系統 SHALL 重新解析該影片
- **AND** SHALL NOT 直接重用先前那次解析產生的串流 URL

#### Scenario: 達上限後才標記失敗
- **WHEN** 一支影片的所有重試皆失敗
- **THEN** 該影片 SHALL 標記為 `error`
- **AND** 其錯誤資訊 SHALL 為最後一次嘗試的錯誤

#### Scenario: 單支重試不影響同批其他影片
- **GIVEN** 批次中某支影片正在重試
- **WHEN** 其他影片的下載持續進行
- **THEN** 其他影片 SHALL NOT 因該支的重試而中斷或延後標記為失敗

### Requirement: 重試狀態在進度中可見

重試進行中的影片 SHALL 於進度資訊中呈現為重試狀態並包含目前嘗試次數，使使用者能區分「正在重試」與「卡住」。

#### Scenario: 重試中可辨識
- **WHEN** 一支影片正在重試
- **THEN** 其進度項目 SHALL 呈現重試狀態
- **AND** SHALL 顯示目前為第幾次嘗試

### Requirement: 重試參數由設定控制

重試次數上限與退避間隔 SHALL 由設定控制，並沿用既有設定的夾限與容錯行為：型別錯誤或超出範圍的值 SHALL 靜默重設為預設值。

#### Scenario: 超出範圍的設定值被夾限
- **WHEN** 設定中的重試次數為超出允許範圍的值
- **THEN** 系統 SHALL 以預設值取代，SHALL NOT 拋錯或中斷啟動
