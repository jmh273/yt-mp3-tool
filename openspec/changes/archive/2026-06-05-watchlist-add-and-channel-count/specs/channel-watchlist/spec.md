## ADDED Requirements

### Requirement: 從影片清單加入觀察名單

系統 SHALL 在「🔥 發燒影片」「🔍 搜尋影片」「🔗 網址下載」三個影片清單的每張影片卡片提供「加入觀察名單」動作按鈕。點擊後 MUST 把該影片所屬頻道（`channel_id`、`title` 取 `channel_title`、`thumbnail`）以 `add()` 複製進共用觀察名單；行為與「🧭 同類新頻道」一致——加入後按鈕 SHALL 切換為 already-added 狀態（顯示「✅ 已在觀察名單」並 `disabled`），再次點擊 MUST 為 no-op。

當影片缺少 `channel_id`（為空字串或未提供）時，該按鈕 SHALL 停用，並以按鈕文字或 tooltip 提示無法加入；`add()` MUST NOT 以空 `channel_id` 寫入觀察名單。

此動作 MUST NOT 變更影片的下載勾選狀態，亦 MUST NOT 觸發任何後端訂閱或下載呼叫。

#### Scenario: 從發燒影片加入觀察名單

- **WHEN** 使用者在「🔥 發燒影片」某張影片卡片點「加入觀察名單」按鈕，且該影片帶有 `channel_id`
- **THEN** 共用觀察名單追加該頻道（含 `channel_id`、`title`、`thumbnail`、`added_at`）
- **AND** 該卡片按鈕切換為「✅ 已在觀察名單」且 `disabled`
- **AND** `watchlist:shared` 同步更新

#### Scenario: 從搜尋影片加入觀察名單

- **WHEN** 使用者在「🔍 搜尋影片」某張帶 `channel_id` 的影片卡片點「加入觀察名單」按鈕
- **THEN** 共用觀察名單追加該頻道，按鈕切換為 already-added 狀態

#### Scenario: 從網址下載清單加入觀察名單

- **WHEN** 使用者在「🔗 網址下載」某張帶 `channel_id` 的影片卡片點「加入觀察名單」按鈕
- **THEN** 共用觀察名單追加該頻道，按鈕切換為 already-added 狀態

#### Scenario: 已在觀察名單顯示 already-added 狀態

- **WHEN** 影片所屬頻道 X 已在共用觀察名單（`has('X') === true`）
- **THEN** 該卡片的「加入觀察名單」按鈕 SHALL 呈現 already-added 狀態（「✅ 已在觀察名單」、`disabled`）
- **AND** 再次點擊 MUST 為 no-op，不重複加入

#### Scenario: 缺少 channel_id 時停用按鈕

- **WHEN** 某影片卡片的 `channel_id` 為空字串或未提供
- **THEN** 該卡片的「加入觀察名單」按鈕 SHALL 為 `disabled`，並以按鈕文字或 tooltip 提示無法加入
- **AND** 即使被觸發，`add()` MUST NOT 以空 `channel_id` 寫入觀察名單

### Requirement: 左欄分頁標題顯示頻道數量

系統 SHALL 在左欄「訂閱 / 觀察名單」分頁列的兩個分頁標題顯示對應頻道數量，格式為 `訂閱 (nn)` 與 `觀察名單 (nn)`，其中 `nn` 分別為目前帳號訂閱清單的頻道數與共用觀察名單的項目數。數量 SHALL 隨資料變動即時更新；當數量為 0 時 SHALL 顯示 `(0)`（不隱藏括號）。

#### Scenario: 分頁標題顯示初始數量

- **WHEN** 目前帳號訂閱 5 個頻道、觀察名單有 2 個項目
- **THEN** 左欄分頁標題分別顯示「訂閱 (5)」與「觀察名單 (2)」

#### Scenario: 加入觀察名單後數量即時更新

- **WHEN** 觀察名單原為 2，使用者從任一影片清單加入一個新頻道
- **THEN** 「觀察名單」分頁標題即時更新為「觀察名單 (3)」

#### Scenario: 訂閱數量隨訂閱清單變動

- **WHEN** 使用者取消訂閱一個頻道，訂閱清單由 5 變為 4
- **THEN** 「訂閱」分頁標題即時更新為「訂閱 (4)」

#### Scenario: 數量為零顯示括號

- **WHEN** 觀察名單為空
- **THEN** 「觀察名單」分頁標題顯示「觀察名單 (0)」
