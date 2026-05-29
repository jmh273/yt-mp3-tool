## ADDED Requirements

### Requirement: 觀察名單停用已訂閱頻道的升級動作

觀察名單面板每個 row 的「➕ 訂閱」（升級）動作 SHALL 在該頻道已存在於**目前帳號的訂閱清單**時停用（`disabled`），以避免重複訂閱。是否已訂閱以目前帳號訂閱清單的 `channel_id` 集合判定；該集合變動（訂閱新增或取消訂閱）時，停用狀態 SHALL 即時反映。停用的「➕ 訂閱」icon SHALL 以 tooltip（或等效提示）標示「已訂閱」。

此停用 MUST NOT 影響同 row 的「✕ 移除」動作——已訂閱頻道仍可從共用觀察名單移除。既有「升級中防止重複點擊」（promote pending 時 disabled）行為維持不變，與本停用條件以 OR 合併。

#### Scenario: 已訂閱頻道的訂閱 icon 停用

- **WHEN** 觀察名單包含頻道 X，且 X 已在目前帳號的訂閱清單中
- **THEN** 該 row 的「➕ 訂閱」icon SHALL 為 `disabled`
- **AND** 其 tooltip SHALL 標示「已訂閱」
- **AND** 點擊該 icon MUST NOT 觸發 `POST /subscriptions/{X}`

#### Scenario: 未訂閱頻道的訂閱 icon 可用

- **WHEN** 觀察名單包含頻道 Y，且 Y 不在目前帳號的訂閱清單中
- **THEN** 該 row 的「➕ 訂閱」icon SHALL 為可點（除非該 row 正在 promote 進行中）

#### Scenario: 取消訂閱後即時恢復可用

- **WHEN** 頻道 X 原本已訂閱、其觀察名單 row 的「➕ 訂閱」為 disabled
- **AND** 使用者於訂閱清單取消訂閱頻道 X（X 從目前帳號訂閱清單移除）
- **THEN** 觀察名單中 X 的「➕ 訂閱」icon SHALL 重新變為可點

#### Scenario: 移除動作不受停用影響

- **WHEN** 頻道 X 已訂閱，其「➕ 訂閱」icon 為 disabled
- **THEN** 同 row 的「✕ 移除」icon SHALL 仍可點，且點擊後將 X 從共用觀察名單移除
