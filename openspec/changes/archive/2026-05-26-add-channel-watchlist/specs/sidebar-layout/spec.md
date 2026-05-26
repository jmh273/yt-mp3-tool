## ADDED Requirements

### Requirement: 左欄訂閱／觀察名單頁籤切換

左欄 SHALL 在頂部 5 個全域導覽按鈕（最新影片 / 發燒影片 / 搜尋 / URL / 同類新頻道）下方提供 `[訂閱]` / `[觀察名單]` 頁籤切換列；兩 tab 共用左欄下半部視覺空間，僅顯示當前 active tab 的內容。預設 active = 訂閱。

#### Scenario: 預設顯示訂閱 tab

- **WHEN** 使用者載入首頁
- **THEN** 左欄下半部顯示既有頻道清單（含搜尋頻道輸入框 + 訂閱頻道卡片 + 「檢查更新日期」按鈕）
- **AND** tab bar 上「訂閱」呈現 active 狀態

#### Scenario: 切換到觀察名單 tab

- **WHEN** 使用者點 tab bar 上「觀察名單」
- **THEN** 左欄下半部 SHALL 改顯示觀察名單面板（其行為見 `channel-watchlist` capability）
- **AND** tab bar 上「觀察名單」呈現 active 狀態
- **AND** 既有頻道清單與「檢查更新日期」按鈕 SHALL 隱藏（不被移除，只是不顯示在此 tab）

#### Scenario: tab 切換不影響中欄內容

- **WHEN** 中欄正顯示某頻道影片 (`activeView === 'channel'`)
- **AND** 使用者切換左欄 tab
- **THEN** 中欄內容 MUST 保持不變，僅左欄下半部切換

### Requirement: 檢查更新日期按鈕歸屬訂閱 tab

「檢查更新日期」按鈕 SHALL 僅在「訂閱」tab 內顯示；切到「觀察名單」tab 時隱藏。

#### Scenario: 觀察名單 tab 不顯示檢查更新日期

- **WHEN** 使用者切到「觀察名單」tab
- **THEN** 「檢查更新日期」按鈕 MUST NOT 出現在左欄
