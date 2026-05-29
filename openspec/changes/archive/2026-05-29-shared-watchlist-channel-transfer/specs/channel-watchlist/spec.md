## MODIFIED Requirements

### Requirement: 觀察名單本地儲存（跨帳號共用）

系統 SHALL 在前端 localStorage 維護**單一份**觀察名單頻道清單，由所有登入帳號**共用**，儲存於固定 key `watchlist:shared`；不存於後端、不跨裝置同步。切換登入帳號 MUST NOT 更換或清空觀察名單內容。觀察名單每筆 MUST 包含 `channel_id`、`title`、`thumbnail`、`added_at` (ISO 8601 字串) 四個欄位。

先前依帳號隔離的 `watchlist:<email>` 資料 SHALL 直接捨棄、不遷移；系統只讀寫 `watchlist:shared`。

#### Scenario: 初次加入後 reload 仍可見

- **WHEN** 使用者把頻道 X 加入觀察名單
- **AND** 重新整理頁面
- **THEN** 觀察名單仍包含頻道 X，且 `added_at` 為原始加入時間

#### Scenario: 切換帳號名單不變

- **WHEN** 使用者在帳號 A 的觀察名單為 `[X, Y]`
- **AND** 從帳號 A 切換到帳號 B
- **THEN** 觀察名單面板仍顯示 `[X, Y]`（與帳號 A 相同）
- **AND** 在帳號 B 加入頻道 Z 後切回帳號 A，名單為 `[Z, X, Y]`（共用同一份）

#### Scenario: localStorage key 規約

- **WHEN** 任一帳號加入頻道
- **THEN** 該資料 MUST 儲存於固定 localStorage key `watchlist:shared`，值為 JSON 陣列
- **AND** 不再寫入任何 `watchlist:<email>` 形式的 key

#### Scenario: 未登入仍顯示共用名單

- **WHEN** `authStore.currentAccount === ''`（未登入）
- **THEN** 觀察名單 store 的 `items` MUST 載入自 `watchlist:shared`（不因未登入而清空）
- **AND** 觀察名單 tab 顯示名單內容；若名單為空則顯示空狀態文字

### Requirement: 加入與移除觀察名單

系統 SHALL 提供 `add(channel)` 與 `remove(channel_id)` 兩個動作；`has(channel_id)` 查詢用於 UI 狀態判斷。`add` MUST NOT 因未登入而被略過——只要提供合法 channel 即可加入共用名單。重複 `add` 同一個 `channel_id` MUST 為 no-op（不更新 `added_at`、不重複出現）。

#### Scenario: 重複加入同頻道為 no-op

- **WHEN** 頻道 X 已在觀察名單，再次呼叫 `add(X)`
- **THEN** 觀察名單長度不變，X 的 `added_at` 不變

#### Scenario: 移除頻道

- **WHEN** 呼叫 `remove('UC123')`
- **THEN** 觀察名單立即移除該項，無確認 dialog
- **AND** `watchlist:shared` 同步更新

#### Scenario: has() 查詢

- **WHEN** 頻道 X 在觀察名單
- **THEN** `has('X')` 回傳 `true`
- **AND** `has('not-in-list')` 回傳 `false`

## ADDED Requirements

### Requirement: 從訂閱頻道清單加入觀察名單

系統 SHALL 在左欄「訂閱」頻道清單的每個頻道 row 提供「加入觀察名單」動作 icon。點擊後 MUST 把該頻道（`channel_id`、`title`、`thumbnail`）**複製**進共用觀察名單，且 MUST NOT 取消該頻道在目前帳號的訂閱（不呼叫 `DELETE /subscriptions/{id}`）。此動作的目的為跨帳號搬移訂閱：在帳號 A 加入共用名單後，可切到帳號 B 從觀察名單「➕ 訂閱」。

#### Scenario: 從訂閱頻道加入觀察名單

- **WHEN** 使用者點訂閱頻道 X row 上的「加入觀察名單」icon
- **THEN** 共用觀察名單追加頻道 X（含 `channel_id`、`title`、`thumbnail`、`added_at`）
- **AND** 頻道 X 仍保留在目前帳號的訂閱清單（不取消訂閱）
- **AND** `watchlist:shared` 同步更新

#### Scenario: 已在觀察名單顯示 already-added 狀態

- **WHEN** 訂閱頻道 X 已在共用觀察名單（`has('X') === true`）
- **THEN** 該 row 的「加入觀察名單」icon SHALL 呈現 already-added 狀態（例如已勾選樣式或 disabled）
- **AND** 再次點擊 MUST 為 no-op，不重複加入

#### Scenario: 跨帳號搬移流程

- **WHEN** 使用者在帳號 A 把訂閱頻道 X 加入共用觀察名單
- **AND** 切換到帳號 B（帳號 B 未訂閱 X）
- **THEN** 帳號 B 的觀察名單面板顯示頻道 X
- **AND** 在帳號 B 點 X 的「➕ 訂閱」成功後，X 出現在帳號 B 的訂閱清單，並依現行行為從觀察名單移除
