# Design: 台灣地區發燒影片

## 架構策略
使用 YouTube Data API v3 的 `videos().list` 端點，並帶入 `chart="mostPopular"` 參數。

## 後端設計 (Backend)
1. **API 路由**: 新增 `GET /trending-videos`。
2. **處理邏輯**:
   - 呼叫 `youtube.videos().list(part="snippet,contentDetails", chart="mostPopular", regionCode="TW", maxResults=50).execute()`。
   - 計算消耗的 Quota（1次呼叫 = 1 Quota）。
   - 將拿到的影片資料轉換為與現有 UI 綁定的 `videos` 字典格式 (`video_id`, `title`, `thumbnail`, `published`, `channel_id`, `channel_title`, `duration_seconds`)。
   - 注意：因為 `mostPopular` 的 `part="contentDetails"` 已經回傳了 `duration`，所以可以直接拿到長度，不用額外呼叫 API。將 ISO 8601 時長轉換為秒數後，套用內部的長度過濾條件 (由 `settings` 取得 min/max)。
   - 回傳 `{"videos": [...] }`。

## 前端設計 (Frontend)
1. **UI 元件 (`HomeView.vue`)**:
   - 左側選單新增 `<button class="latest-btn" :class="{ active: activeView === 'trending' }" @click="showTrending">🔥 發燒影片</button>`。
   - `activeView` 狀態擴充支援 `'trending'`。
   - 中間欄引入 `<TrendingVideosFeed v-else-if="activeView === 'trending'" />`。
2. **新組件 (`TrendingVideosFeed.vue`)**:
   - 複製 `ChannelVideos.vue` 或 `LatestVideosFeed.vue` 的排版版型。
   - `onMounted` 時呼叫 `GET /trending-videos`。
   - 渲染成與其他列表相同的卡片形式，並支援 checkbox 勾選以加入 `downloadStore`。

## Quota 消耗計算
- `videos.list` 帶 `mostPopular` (1 quota)
- 由於直接拿到 `contentDetails`，不需要為了拿長度再批次呼叫 `videos.list`。
**總計**: 每次點擊發燒影片，只需耗費 **1 quota**。極度高效。
