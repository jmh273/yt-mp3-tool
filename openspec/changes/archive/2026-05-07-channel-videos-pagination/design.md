# Design: 單一頻道全歷史影片分頁載入

## 架構策略
YouTube 每個頻道都有一個關聯的 `Uploads` 播放清單，裡面包含了該頻道所有上傳的影片，並且依照上傳時間由新到舊排序。
- 透過 `channels.list` 提取 `contentDetails.relatedPlaylists.uploads`。
- 透過 `playlistItems.list` 以 `maxResults=50` 及 `pageToken` 進行分頁獲取。

## 後端設計 (Backend)
1. **API 路由**: 新增 `GET /api/channels/{channel_id}/videos` (需考量既有 auth/auth_deps 認證)
2. **Query 參數**:
   - `pageToken` (string, optional): 請求下一頁的 token。
3. **處理邏輯**:
   - 如果是第一次請求，先呼叫 `youtube.channels().list` 取得該頻道的 `Uploads` playlist ID。
   - 呼叫 `youtube.playlistItems().list(playlistId=..., maxResults=50, pageToken=...)` 取得影片基本清單。
   - 將取得的影片 ID 整理後，呼叫現有的 `enhance_and_filter_videos()` 進行時長取得、長度過濾與資料整合。
   - 注意：執行這些 API 呼叫時，需使用 `consume_quota` 計數。
4. **回傳格式**:
   ```json
   {
     "items": [ { "video_id": "...", "title": "...", "duration_str": "...", ... } ],
     "nextPageToken": "CAUQAA",
     "channelTitle": "..."
   }
   ```

## 前端設計 (Frontend)
1. **Store (`stores/youtube.ts` 或相應的 store)**:
   - `currentChannelId`: 記錄目前選取的頻道 ID。
   - `channelVideos`: 儲存目前累計的單一頻道影片清單。
   - `channelNextPageToken`: 記錄下一頁的 token。
   - `isChannelView`: 布林值（可用 `currentChannelId !== null` 判斷），判斷目前是「最新動態牆」還是「單一頻道」。
2. **UI 元件 (`HomeView.vue`)**:
   - **左側列表**: 頻道項目增加 `onClick` 事件，觸發進入單一頻道模式。
   - **右側頂部**: 當進入單一頻道模式時，顯示「正在觀看：[頻道名稱]」，並增加一顆「← 回最新動態 (All Latest)」的返回按鈕。
   - **右側列表**: 根據模式切換渲染內容（顯示混合的最新影片，或是單一頻道的歷史影片）。
   - **分頁按鈕**: 當 `channelNextPageToken` 有值時，在影片列表最底部顯示「載入更多」按鈕。

## Quota 消耗計算
- `channels.list` (1 quota)
- `playlistItems.list` (1 quota)
- `videos.list` (取得時長，每 50 個影片 1 quota)
**總計**: 每載入一頁 50 個影片，耗費 **約 3 quota**。比起直接搜尋頻道節省超過 90% 以上配額。
