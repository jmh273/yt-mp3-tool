# Spec: Channel Search

## Purpose

定義「頻道搜尋」capability：在既有的搜尋區擴充搜尋範圍，讓使用者除了搜尋影片（yt-dlp，0 quota）外，也能以關鍵字搜尋 YouTube 頻道。透過兩個獨立 checkbox（「影片」預設勾選、「頻道」預設不勾選）決定本次搜尋範圍；頻道搜尋走後端路由 `GET /search-channels?q=`，以 YouTube Data API `search.list`（`type=channel`）取得結果並計入 100 quota，因此「頻道」checkbox 標注耗額提示。搜尋結果依範圍分區呈現（「頻道」區排在「影片」區之前、不交錯），各區各自有 loading 與空狀態，且影片搜尋的既有行為不變。每張頻道卡提供「加入觀察名單」（`watchlist.add`）與「訂閱」（`POST /subscriptions/{channel_id}`）兩個動作，並依已加入／已訂閱狀態呈現對應的 disabled 狀態。

## Requirements

### Requirement: 搜尋範圍選擇（影片／頻道）

系統 SHALL 在搜尋區提供兩個獨立 checkbox：「影片」與「頻道」，決定本次搜尋的範圍。「影片」SHALL 預設勾選、「頻道」SHALL 預設不勾選。兩者可同時勾選。「頻道」checkbox SHALL 在其標籤附近標注耗額提示（約耗 100 配額）。當兩者皆未勾選時，搜尋動作 SHALL 停用（按鈕 `disabled` 或等效阻擋），且 MUST NOT 發出任何搜尋請求。

#### Scenario: 預設只搜影片

- **WHEN** 使用者開啟搜尋區且未變更 checkbox
- **THEN** 「影片」為勾選、「頻道」為未勾選
- **AND** 執行搜尋只走影片搜尋（yt-dlp，0 quota），不呼叫 `GET /search-channels`

#### Scenario: 頻道 checkbox 標注耗額

- **WHEN** 使用者檢視「頻道」checkbox
- **THEN** 其標籤附近 SHALL 顯示耗額提示（約耗 100 配額）

#### Scenario: 兩者皆未勾選時停用搜尋

- **WHEN** 使用者取消勾選「影片」與「頻道」兩者
- **THEN** 搜尋按鈕 SHALL 為 `disabled`（或等效阻擋）
- **AND** 觸發搜尋 MUST NOT 發出任何請求

### Requirement: 頻道搜尋後端路由

系統 SHALL 提供 `GET /search-channels?q=<keyword>`，以 YouTube Data API `search.list`（`type=channel`）取得頻道結果，並 SHALL 計入 100 quota（`_QUOTA_SEARCH_LIST`）。每次請求 SHALL 只打一次 `search.list`（不抓 uploads / videos.list）。回傳每筆 SHALL 含 `channel_id`、`title`、`thumbnail`。`q` 為空白時 SHALL 回傳空結果且 MUST NOT 計入 quota。

#### Scenario: 關鍵字搜尋頻道

- **WHEN** 呼叫 `GET /search-channels?q=lofi`
- **THEN** 系統呼叫一次 `search.list?type=channel&q=lofi`
- **AND** 計入 100 quota
- **AND** 回傳頻道清單，每筆含 `channel_id`、`title`、`thumbnail`

#### Scenario: 空白關鍵字不計配額

- **WHEN** 呼叫 `GET /search-channels?q=`（空白）
- **THEN** 回傳空清單
- **AND** MUST NOT 呼叫 `search.list`、MUST NOT 計入 quota

### Requirement: 搜尋結果分區呈現

系統 SHALL 依勾選範圍分區呈現結果：勾「頻道」時顯示「頻道」區（頻道卡），勾「影片」時顯示「影片」區（沿用既有影片卡）。兩者都勾時兩區並存且 MUST NOT 交錯混排，「頻道」區 SHALL 排在「影片」區之前。各區 SHALL 各自有 loading 與空狀態。影片搜尋的既有行為（結果版面、下載勾選）MUST NOT 改變。

#### Scenario: 只勾頻道

- **WHEN** 只勾「頻道」並搜尋 `lofi`
- **THEN** 只顯示「頻道」區的頻道卡，不顯示「影片」區

#### Scenario: 兩者都勾分區並存

- **WHEN** 同時勾「影片」與「頻道」並搜尋
- **THEN** 頁面同時顯示「頻道」區與「影片」區
- **AND** 「頻道」區排在「影片」區之前，兩區卡片不交錯

#### Scenario: 影片搜尋行為不變

- **WHEN** 勾「影片」搜尋
- **THEN** 影片卡與下載勾選行為與既有「搜尋影片」一致

### Requirement: 頻道卡加入觀察名單與訂閱

系統 SHALL 在每張頻道卡提供「加入觀察名單」與「訂閱」兩個動作。「加入觀察名單」SHALL 呼叫 `watchlist.add({channel_id, title, thumbnail})`；當該頻道已在觀察名單（`watchlist.has` 為 true）時 SHALL 呈現 already-added 狀態並 `disabled`。「訂閱」SHALL 呼叫 `POST /subscriptions/{channel_id}`；當該頻道已在目前帳號訂閱清單（`subscribedIds` 含之）時 SHALL 呈現 already-subscribed 狀態並 `disabled`；訂閱成功後 SHALL 把該頻道補進左欄訂閱清單並使其後續呈現已訂閱。

#### Scenario: 頻道卡加入觀察名單

- **WHEN** 使用者點頻道卡的「加入觀察名單」
- **THEN** 共用觀察名單追加該頻道（`channel_id`、`title`、`thumbnail`、`added_at`）
- **AND** 該按鈕切換為 already-added 狀態並 `disabled`

#### Scenario: 頻道卡訂閱成功

- **WHEN** 使用者點未訂閱頻道卡的「訂閱」
- **AND** `POST /subscriptions/{channel_id}` 成功
- **THEN** 該頻道加入左欄訂閱清單
- **AND** 頻道卡的「訂閱」切換為已訂閱狀態並 `disabled`

#### Scenario: 已訂閱頻道的訂閱動作停用

- **WHEN** 頻道卡對應頻道已在目前帳號訂閱清單
- **THEN** 「訂閱」按鈕 SHALL 呈現已訂閱狀態並 `disabled`
- **AND** 點擊 MUST NOT 觸發 `POST /subscriptions/{channel_id}`
