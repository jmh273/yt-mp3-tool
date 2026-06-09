## MODIFIED Requirements

### Requirement: 頻道卡加入觀察名單與訂閱

系統 SHALL 在每張頻道卡提供「加入觀察名單」與「訂閱」兩個動作。「加入觀察名單」SHALL 呼叫 `watchlist.add({channel_id, title, thumbnail})`；當該頻道已在觀察名單（`watchlist.has` 為 true）時 SHALL 呈現 already-added 狀態並 `disabled`。「訂閱」SHALL 呼叫 `POST /subscriptions/{channel_id}`；當該頻道已在目前帳號訂閱清單（`subscribedIds` 含之）時 SHALL 呈現 already-subscribed 狀態並 `disabled`。

訂閱動作的結果 SHALL 一律以 toast 通知回饋使用者，MUST NOT 靜默吞掉結果：

- 訂閱**成功**時，SHALL 顯示成功 toast，並把該頻道補進左欄訂閱清單（既有 `emit('subscribed')`），使其後續呈現已訂閱並 `disabled`。
- 後端回 409 `subscriptionDuplicate`（該帳號其實已訂閱）時 SHALL 視為**非錯誤之冪等成功**：顯示中性／成功 toast 表明「此帳號已訂閱」，並**樂觀地**把該頻道補進訂閱清單（`emit('subscribed')`）使按鈕切換為已訂閱並 `disabled`；MUST NOT 顯示紅色錯誤、MUST NOT 重複送出 `POST /subscriptions`。
- 其他失敗（如 403 配額／forbidden、404、網路或 500）SHALL 顯示**錯誤 toast**，內容呈現後端 `detail`；toast 文案 MUST NOT 重複「訂閱失敗：」前綴。

#### Scenario: 頻道卡加入觀察名單

- **WHEN** 使用者點頻道卡的「加入觀察名單」
- **THEN** 共用觀察名單追加該頻道（`channel_id`、`title`、`thumbnail`、`added_at`）
- **AND** 該按鈕切換為 already-added 狀態並 `disabled`

#### Scenario: 頻道卡訂閱成功

- **WHEN** 使用者點未訂閱頻道卡的「訂閱」
- **AND** `POST /subscriptions/{channel_id}` 成功
- **THEN** 顯示成功 toast
- **AND** 該頻道加入左欄訂閱清單
- **AND** 頻道卡的「訂閱」切換為已訂閱狀態並 `disabled`

#### Scenario: 已訂閱頻道回 409 視為冪等成功

- **WHEN** 使用者點頻道卡的「訂閱」
- **AND** `POST /subscriptions/{channel_id}` 回 409 `subscriptionDuplicate`
- **THEN** 顯示中性／成功 toast 表明「此帳號已訂閱」（非紅色錯誤）
- **AND** 該頻道樂觀地加入左欄訂閱清單、按鈕切換為已訂閱並 `disabled`
- **AND** MUST NOT 重複送出訂閱請求

#### Scenario: 其他訂閱錯誤顯示錯誤 toast

- **WHEN** 使用者點頻道卡的「訂閱」
- **AND** `POST /subscriptions/{channel_id}` 失敗且非 409 duplicate（如配額耗盡、網路錯誤）
- **THEN** 顯示錯誤 toast，內容呈現後端 `detail`
- **AND** toast 文案 MUST NOT 重複「訂閱失敗：」前綴
- **AND** 該頻道 MUST NOT 加入訂閱清單

#### Scenario: 已訂閱頻道的訂閱動作停用

- **WHEN** 頻道卡對應頻道已在目前帳號訂閱清單
- **THEN** 「訂閱」按鈕 SHALL 呈現已訂閱狀態並 `disabled`
- **AND** 點擊 MUST NOT 觸發 `POST /subscriptions/{channel_id}`
