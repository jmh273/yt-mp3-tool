## ADDED Requirements

### Requirement: 顯示訂閱頻道清單
系統 SHALL 在使用者登入後，顯示其 YouTube 訂閱的所有頻道名稱與縮圖。

#### Scenario: 載入訂閱清單
- **WHEN** 使用者登入後進入主頁面
- **THEN** 系統透過 YouTube Data API v3 取得訂閱頻道列表，並顯示頻道名稱與縮圖

#### Scenario: 無訂閱
- **WHEN** 使用者沒有任何訂閱頻道
- **THEN** 系統顯示「尚無訂閱頻道」提示訊息

### Requirement: 顯示頻道最新影片
系統 SHALL 為每個頻道顯示最新 N 支影片（預設 5 支），透過 RSS feed 取得。

#### Scenario: 展開頻道影片
- **WHEN** 使用者點擊某個頻道
- **THEN** 系統透過該頻道的 RSS feed 取得最新影片，顯示標題、縮圖、發布時間與影片長度

#### Scenario: RSS 取得失敗
- **WHEN** 頻道的 RSS feed 無法存取
- **THEN** 系統顯示「無法載入影片」並繼續顯示其他頻道

### Requirement: 並行載入
系統 SHALL 並行抓取多個頻道的 RSS feed，總載入時間 SHALL 不超過單一頻道的 3 倍。

#### Scenario: 並行抓取
- **WHEN** 使用者載入訂閱清單
- **THEN** 系統以 asyncio 並行方式抓取所有頻道的 RSS，顯示載入進度
