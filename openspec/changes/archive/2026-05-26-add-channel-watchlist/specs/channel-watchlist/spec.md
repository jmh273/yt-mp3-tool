## ADDED Requirements

### Requirement: 觀察名單本地儲存與帳號隔離

系統 SHALL 在前端 localStorage 維護一份觀察名單頻道清單，依目前登入帳號 (`authStore.currentAccount`) 隔離；不存於後端、不跨帳號共用、不跨裝置同步。觀察名單每筆 MUST 包含 `channel_id`、`title`、`thumbnail`、`added_at` (ISO 8601 字串) 四個欄位。

#### Scenario: 初次加入後 reload 仍可見

- **WHEN** 使用者把頻道 X 加入觀察名單
- **AND** 重新整理頁面
- **THEN** 觀察名單仍包含頻道 X，且 `added_at` 為原始加入時間

#### Scenario: 切換帳號自動換清單

- **WHEN** 使用者在帳號 A 已有觀察名單 `[X, Y]`，帳號 B 已有觀察名單 `[Z]`
- **AND** 從帳號 A 切換到帳號 B
- **THEN** 觀察名單面板顯示 `[Z]`，**不**顯示 `[X, Y]`
- **AND** 切回帳號 A 時觀察名單恢復為 `[X, Y]`

#### Scenario: localStorage key 規約

- **WHEN** 帳號 `alice@example.com` 加入頻道
- **THEN** 該資料 MUST 儲存於 localStorage key `watchlist:alice@example.com`，值為 JSON 陣列

#### Scenario: 未登入狀態（currentAccount 為空字串）

- **WHEN** `authStore.currentAccount === ''`
- **THEN** 觀察名單 store 的 `items` MUST 為空陣列
- **AND** 觀察名單 tab 內容顯示「請先登入」提示，不嘗試讀取任何 localStorage key

### Requirement: 加入與移除觀察名單

系統 SHALL 提供 `add(channel)` 與 `remove(channel_id)` 兩個動作；`has(channel_id)` 查詢用於 UI 狀態判斷。重複 `add` 同一個 `channel_id` MUST 為 no-op（不更新 `added_at`、不重複出現）。

#### Scenario: 重複加入同頻道為 no-op

- **WHEN** 頻道 X 已在觀察名單，再次呼叫 `add(X)`
- **THEN** 觀察名單長度不變，X 的 `added_at` 不變

#### Scenario: 移除頻道

- **WHEN** 呼叫 `remove('UC123')`
- **THEN** 觀察名單立即移除該項，無確認 dialog
- **AND** localStorage 同步更新

#### Scenario: has() 查詢

- **WHEN** 頻道 X 在觀察名單
- **THEN** `has('X')` 回傳 `true`
- **AND** `has('not-in-list')` 回傳 `false`

### Requirement: 排序

系統 SHALL 在觀察名單面板依 `added_at` 倒序顯示（最新加入排在最上）。

#### Scenario: 加入新項出現在最上

- **WHEN** 觀察名單已有 `[Y (昨天), Z (前天)]`
- **AND** 加入頻道 X
- **THEN** 觀察名單面板顯示順序為 `[X, Y, Z]`

### Requirement: 升級為訂閱

系統 SHALL 提供「➕ 訂閱」動作（在觀察名單面板每 row 上），呼叫 `POST /subscriptions/{channel_id}`；**成功**時 MUST 從觀察名單移除該項，並把頻道補進左欄訂閱清單；**失敗**時項目留在觀察名單。

#### Scenario: 升級成功

- **WHEN** 使用者點觀察名單頻道 X 的「➕ 訂閱」icon
- **AND** `POST /subscriptions/{X}` 回傳成功
- **THEN** 觀察名單面板移除 X
- **AND** 左欄訂閱清單追加 X（含 `subscription_id`、`title`、`thumbnail`），不重新呼叫 `GET /subscriptions` 全量
- **AND** 顯示成功 toast「已訂閱：{title}」
- **AND** 配額計入正常（後端負責）

#### Scenario: 升級失敗保留項目

- **WHEN** 使用者點「➕ 訂閱」
- **AND** `POST /subscriptions/{X}` 回傳非 2xx（例如頻道關閉訂閱、quota 耗盡）
- **THEN** 觀察名單 MUST NOT 移除 X
- **AND** 顯示錯誤 toast「訂閱失敗：<原因>」
- **AND** 左欄訂閱清單不變更

#### Scenario: 升級中防止重複點擊

- **WHEN** 「➕ 訂閱」呼叫進行中
- **THEN** 該 row 的「➕ 訂閱」與「✕ 移除」icon 皆 disabled，直到 promise 結束

### Requirement: 觀察名單面板 UI

系統 SHALL 在左欄提供觀察名單面板，每筆顯示縮圖 + 頻道名 + `[✕ 移除]`、`[➕ 訂閱]` 兩個動作 icon；row 本體可點，點擊後右側中欄改顯示該頻道近期影片（複用既有 channel videos 元件）。

#### Scenario: 點觀察名單 row 載入影片

- **WHEN** 觀察名單包含頻道 X，使用者點該 row 本體（非 icon 區）
- **THEN** 中欄改顯示頻道 X 的近期影片，提供與訂閱頻道影片相同的播放與下載 UI
- **AND** 影片清單透過 `GET /channels/{X}/videos` 取得，配額照計

#### Scenario: 觀察名單空狀態

- **WHEN** 使用者已登入但觀察名單為空
- **THEN** 面板顯示空狀態文字「還沒加入任何頻道，從『🔍 同類新頻道』把感興趣的頻道加進來」

#### Scenario: 觀察名單搜尋

- **WHEN** 觀察名單超過數項，使用者在面板上方搜尋框輸入文字
- **THEN** 列表 SHALL 即時過濾 `title` 包含該文字（不分大小寫）的項目
