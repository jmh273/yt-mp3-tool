# Spec: Sidebar Layout

## Purpose

Defines the persistent two-column sidebar layout for the main page, where a fixed-width left pane holds the channel list and a flexible right pane displays video content. Covers channel selection behaviour, the Latest Videos shortcut button, and responsive collapse at narrow viewports.

## Requirements

### Requirement: Split-pane layout
The main page SHALL display a persistent two-column layout: a fixed-width left pane (260px) containing the channel list and a flexible right pane filling the remaining width displaying video content. Both panes SHALL scroll independently.

#### Scenario: Page loads with split layout
- **WHEN** an authenticated user navigates to the home page
- **THEN** the channel list SHALL be visible in the left pane and the right pane SHALL show a "請選擇頻道" placeholder

#### Scenario: Right pane does not scroll with left pane
- **WHEN** the user scrolls the channel list in the left pane
- **THEN** the right pane content position SHALL remain unchanged

### Requirement: Channel selection updates right pane
The system SHALL replace the right pane content with the selected channel's video list immediately upon the user clicking a channel in the left pane. No page navigation or accordion expand/collapse SHALL occur.

#### Scenario: User clicks a channel
- **WHEN** the user clicks a channel card in the left pane
- **THEN** the right pane SHALL display that channel's video list within 200ms (excluding network fetch time)

#### Scenario: Selected channel is visually highlighted
- **WHEN** a channel is selected
- **THEN** its card in the left pane SHALL have a distinct visual state (e.g., highlighted background) distinguishing it from unselected channels

#### Scenario: Clicking the same channel again keeps the right pane unchanged
- **WHEN** the user clicks the already-selected channel
- **THEN** the right pane content SHALL remain the same (no reload triggered)

### Requirement: Latest Videos button in left pane
The left pane SHALL contain a "最新影片" button above the channel list. Clicking it SHALL replace the right pane content with the latest-videos-feed view.

#### Scenario: User clicks Latest Videos button
- **WHEN** the user clicks the "最新影片" button
- **THEN** the right pane SHALL switch to the latest-videos-feed view and any channel selection highlight SHALL be cleared

### Requirement: Layout is responsive at narrow widths
At viewport widths below 768px the layout SHALL collapse to a single-column stacked view (channel list on top, content below).

#### Scenario: Viewport narrowed below 768px
- **WHEN** the viewport width is less than 768px
- **THEN** the two-column grid SHALL collapse to a single column with the channel list appearing above the video content area

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

### Requirement: 左欄功能按鈕 icon 一致化

左欄頂部 5 個全域功能按鈕 SHALL 各自帶一個不重複的 emoji 前綴 icon,使視覺一致。其中「最新影片」按鈕 SHALL 以 🆕 為前綴;「同類新頻道」按鈕 SHALL 以 🧭 為前綴(取代先前與「搜尋影片」重複的 🔍)。任兩個功能按鈕 SHALL NOT 共用同一個 emoji 前綴。

#### Scenario: 最新影片有 icon 前綴

- **WHEN** 使用者載入首頁
- **THEN** 「最新影片」按鈕 SHALL 顯示 🆕 前綴,與其他帶 icon 的功能按鈕一致

#### Scenario: 同類新頻道改用不重複的 icon

- **WHEN** 使用者載入首頁
- **THEN** 「同類新頻道」按鈕 SHALL 顯示 🧭 前綴
- **AND** 五個功能按鈕(最新影片 🆕 / 發燒影片 🔥 / 搜尋影片 🔍 / 網址下載 🔗 / 同類新頻道 🧭)中 MUST NOT 有任兩個共用同一個 emoji

### Requirement: 訂閱頻道名稱 hover 顯示完整名稱

左欄「訂閱」清單中,當頻道名稱因寬度受限而被截斷時,系統 SHALL 透過原生 `title` 屬性讓使用者 hover 該名稱即可看到完整頻道名稱。

#### Scenario: hover 截斷的訂閱頻道名稱

- **WHEN** 某訂閱頻道名稱在清單中被截斷顯示
- **AND** 使用者將游標停在該名稱上
- **THEN** 瀏覽器 SHALL 以原生 tooltip 顯示該頻道的完整名稱
