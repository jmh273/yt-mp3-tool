## MODIFIED Requirements

### Requirement: 升級為訂閱

系統 SHALL 提供「➕ 訂閱」動作（在觀察名單面板每 row 上），呼叫 `POST /subscriptions/{channel_id}`；**成功**時 MUST 從觀察名單移除該項，並把頻道補進左欄訂閱清單；**失敗**時項目留在觀察名單並顯示錯誤提示。

當後端回報該頻道已訂閱（YouTube `subscriptionDuplicate`，「subscription already exists」）時，系統 SHALL 將其視為**非錯誤**：以中性樣式提示「「{title}」此帳號已訂閱」；MUST NOT 顯示紅色錯誤 toast。由於共用觀察名單可能保留「在其他帳號已訂閱、待搬移」的頻道，且該頻道不一定出現在目前帳號的訂閱清單，系統在此情境下 MUST **保留**該項於觀察名單（不自動移除），且 MUST NOT 在左欄訂閱清單追加該頻道。

錯誤提示文字 SHALL NOT 重複前綴「訂閱失敗：」——後端 HTTPException detail 已含一次前綴，前端 MUST NOT 再前綴一次。

#### Scenario: 升級成功

- **WHEN** 使用者點觀察名單頻道 X 的「➕ 訂閱」icon
- **AND** `POST /subscriptions/{X}` 回傳成功
- **THEN** 觀察名單面板移除 X
- **AND** 左欄訂閱清單追加 X（含 `subscription_id`、`title`、`thumbnail`），不重新呼叫 `GET /subscriptions` 全量
- **AND** 顯示成功 toast「已訂閱：{title}」
- **AND** 配額計入正常（後端負責）

#### Scenario: 升級遇已訂閱（subscriptionDuplicate）以中性提示保留項目

- **WHEN** 使用者點觀察名單頻道 X 的「➕ 訂閱」icon
- **AND** `POST /subscriptions/{X}` 失敗且原因為 `subscriptionDuplicate`（此帳號已訂閱）
- **THEN** 系統 SHALL 以中性樣式顯示「「{title}」此帳號已訂閱」
- **AND** MUST NOT 顯示紅色錯誤 toast
- **AND** 觀察名單 MUST **保留** X（不自動移除）
- **AND** MUST NOT 在左欄訂閱清單追加 X

#### Scenario: 升級失敗保留項目（非重複錯誤）

- **WHEN** 使用者點「➕ 訂閱」
- **AND** `POST /subscriptions/{X}` 回傳非 2xx 且原因**非** `subscriptionDuplicate`（例如 quota 耗盡、頻道關閉訂閱）
- **THEN** 觀察名單 MUST NOT 移除 X
- **AND** 顯示錯誤 toast，其文字 MUST NOT 重複「訂閱失敗：」前綴
- **AND** 左欄訂閱清單不變更

#### Scenario: 升級中防止重複點擊

- **WHEN** 「➕ 訂閱」呼叫進行中
- **THEN** 該 row 的「➕ 訂閱」與「✕ 移除」icon 皆 disabled，直到 promise 結束
