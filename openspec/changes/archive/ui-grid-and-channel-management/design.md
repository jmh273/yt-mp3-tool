## Context
使用者認為目前版面配置無法有效利用畫面空間。希望能重新設計使用者介面，將視窗分為三部分（左側訂閱、中間影片、右側進度），並縮小影片縮圖與頂部標題區域。同時，為了管理龐大的訂閱清單，需要一個機制來識別並移除久未更新的頻道。此外，使用者希望能夠過濾掉太短或太長的影片。

## Goals
- **UI 調整 (三欄式佈局)**：
  - 取消下方勾選轉換的進度列表，改為右側邊欄顯示。
  - 將主畫面分為三部分：左側（訂閱清單）、中間（影片清單）、右側（轉換進度）。
  - 影片縮圖減為 1/2，並配合中間區塊寬度採用彈性網格（依寬度自動 2~3 欄）。
  - 上方標題區域高度縮小，提升資訊密度。
- **頻道管理**：
  - 在左側訂閱清單下方新增「檢查更新日期」功能按鈕。
  - 在每個頻道項目旁新增「刪除（取消訂閱）」按鈕。
  - 支援透過 API 實際取消訂閱該 YouTube 頻道。
- **影片長度過濾**：
  - 於設定頁面新增影片長度區間設定（預設 3 ~ 60 分鐘）。
  - 後端在回傳頻道影片與最新影片前，依據設定的長度區間自動過濾。

## Technical Approach

### 1. UI 版面調整為三欄式佈局
- **Frontend (`HomeView.vue` / `App.vue` / `SelectedVideos.vue`)**:
  - 將原本的兩欄式 `layout` (左選單、右內容) 改為三欄式 (`display: grid; grid-template-columns: 240px 1fr 300px;`)。
  - 將原本置底的 `SelectedVideos` 元件移至右欄 (Right Pane)，取消 fixed 定位，改為跟隨右欄滾動的內嵌清單。
  - 縮小 `header` 的 padding 與 font-size，減少頂部佔用的垂直空間。
- **Frontend (`ChannelVideos.vue` / `LatestVideosFeed.vue`)**:
  - 將縮圖大小減為原本的 1/2。
  - 將原本的單欄垂直排列轉換為 CSS Grid：`display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;` (視寬度自動排成多欄)。
  - 影片卡片內部排版維持緊湊，適應縮小的縮圖與區塊寬度。

### 2. 頻道最後更新日期與取消訂閱功能
- **Backend API (`main.py`)**:
  - 修改 `GET /subscriptions`: YouTube Data API 的 `subscriptions().list()` 會回傳資源的 `id` (即 Subscription ID)。需要將此 `subscription_id` 一併回傳給前端，以便後續執行取消訂閱。
  - 新增 `DELETE /subscriptions/{subscription_id}`: 呼叫 YouTube API 的 `youtube.subscriptions().delete(id=subscription_id).execute()` 來取消訂閱。
  - 新增 `GET /subscriptions/latest-dates`: 並發取得所有頻道的 RSS，擷取各頻道第一部（最新）影片的 `published` 日期，並回傳 `{ "channel_id": "iso_date_string" }` 格式供前端顯示。
- **Frontend (`HomeView.vue`)**:
  - 左欄下方增加「顯示頻道最後更新日期」按鈕，點擊後呼叫 `/subscriptions/latest-dates`，並將取得的日期渲染於對應的頻道卡片上。
  - 頻道卡片右側增加「刪除」按鈕（或 icon），點擊後跳出確認視窗，確認後呼叫 DELETE API，成功後從本地端 `channels` 陣列移除該頻道。

### 3. 影片長度過濾設定
- **Backend (`main.py`)**:
  - `DEFAULT_SETTINGS` 新增 `min_duration_minutes: 3` 與 `max_duration_minutes: 60`。
  - `SettingsUpdate` Model 新增這兩個欄位以支援更新。
  - 在 `enhance_and_filter_videos` 函式中載入設定，取得影片長度 `duration_seconds` 後，若該值不介於 `min_duration * 60` 到 `max_duration * 60` 的範圍內，則將該影片過濾不予回傳。
- **Frontend (`SettingsView.vue`)**:
  - 新增兩個數字輸入框欄位：「最短影片長度(分鐘)」與「最長影片長度(分鐘)」，並串接設定的讀取與儲存。
