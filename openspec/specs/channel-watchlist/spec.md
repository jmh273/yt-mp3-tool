# Spec: Channel Watchlist

## Purpose

定義「觀察名單」capability：一份儲存在前端 localStorage 的頻道清單，由所有登入帳號**共用一份**（固定 key `watchlist:shared`），不存於後端、不跨裝置同步。觀察名單作為「同類新頻道」探索與「訂閱頻道」之間的中間狀態，讓使用者把感興趣但尚未決定訂閱的頻道暫存起來，也可作為把訂閱頻道在不同帳號間搬移的中繼站；後續可在觀察名單面板瀏覽該頻道近期影片，並一鍵升級為正式訂閱（呼叫 `POST /subscriptions/{channel_id}`，扣 50 quota）。觀察名單只記錄頻道層級資料（`channel_id`、`title`、`thumbnail`、`added_at`），不快取影片清單。

## Requirements

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

### Requirement: 排序

系統 SHALL 在觀察名單面板依 `added_at` 倒序顯示（最新加入排在最上）。

#### Scenario: 加入新項出現在最上

- **WHEN** 觀察名單已有 `[Y (昨天), Z (前天)]`
- **AND** 加入頻道 X
- **THEN** 觀察名單面板顯示順序為 `[X, Y, Z]`

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

### Requirement: 觀察名單面板 UI

系統 SHALL 在左欄提供觀察名單面板，每筆顯示縮圖 + 頻道名 + `[✕ 移除]`、`[➕ 訂閱]` 兩個動作 icon；row 本體可點，點擊後右側中欄改顯示該頻道近期影片（複用既有 channel videos 元件）。

#### Scenario: 點觀察名單 row 載入影片

- **WHEN** 觀察名單包含頻道 X，使用者點該 row 本體（非 icon 區）
- **THEN** 中欄改顯示頻道 X 的近期影片，提供與訂閱頻道影片相同的播放與下載 UI
- **AND** 影片清單透過 `GET /channels/{X}/videos` 取得，配額照計

#### Scenario: 觀察名單空狀態

- **WHEN** 觀察名單為空（無論是否登入）
- **THEN** 面板顯示空狀態文字「還沒加入任何頻道，從訂閱清單或「🔍 同類新頻道」把頻道加進來」

#### Scenario: 觀察名單搜尋

- **WHEN** 觀察名單超過數項，使用者在面板上方搜尋框輸入文字
- **THEN** 列表 SHALL 即時過濾 `title` 包含該文字（不分大小寫）的項目

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

### Requirement: 觀察名單頻道名稱 hover 顯示完整名稱

觀察名單面板中，當頻道名稱因寬度受限而被截斷時，系統 SHALL 透過原生 `title` 屬性讓使用者 hover 該名稱即可看到完整頻道名稱。

#### Scenario: hover 截斷的觀察名單頻道名稱

- **WHEN** 某觀察名單頻道名稱在面板中被截斷顯示
- **AND** 使用者將游標停在該名稱上
- **THEN** 瀏覽器 SHALL 以原生 tooltip 顯示該頻道的完整名稱
