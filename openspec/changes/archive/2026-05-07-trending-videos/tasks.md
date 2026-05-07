## 1. 後端 API 實作
- [x] 1.1 `backend/main.py`: 新增 `GET /trending-videos` 路由，並加上 auth credential 要求。
- [x] 1.2 使用 `youtube.videos().list(part="snippet,contentDetails", chart="mostPopular", regionCode="TW", maxResults=50)` 取得資料，並呼叫 `consume_quota(1)`。
- [x] 1.3 將回應轉換為標準的 videos list dict，解析 ISO 時間字串為 `duration_seconds`。
- [x] 1.4 套用 `settings` 中的 `min_duration_minutes` 與 `max_duration_minutes` 進行過濾，回傳 JSON。

## 2. 前端 UI 組件實作
- [x] 2.1 建立 `frontend/src/components/TrendingVideosFeed.vue`，負責呼叫 API `/trending-videos` 並渲染影片列表（使用與 ChannelVideos 雷同的 Grid 樣式）。
- [x] 2.2 `HomeView.vue`: 擴充 `activeView` 型別加入 `'trending'`。
- [x] 2.3 `HomeView.vue`: 在左側選單的「最新影片」下方新增「🔥 發燒影片」按鈕，綁定 `showTrending` 方法。
- [x] 2.4 `HomeView.vue`: 在中間主內容區加入 `<TrendingVideosFeed v-else-if="activeView === 'trending'" />`。

## 3. 測試與驗證
- [ ] 3.1 手動測試：點擊「發燒影片」，確認中間動態牆順利切換且顯示大約數十部熱門影片。
- [ ] 3.2 驗證影片長度：確認顯示出來的發燒影片，沒有太短的 Shorts，長度都符合設定檔中的時間限制。
- [ ] 3.3 下載測試：勾選其中一部發燒影片並點擊下載，確認能順利下載為 MP3。
