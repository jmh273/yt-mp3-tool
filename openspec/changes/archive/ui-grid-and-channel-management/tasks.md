## 1. 影片長度過濾設定
- [ ] 1.1 `backend/main.py`: 在 `DEFAULT_SETTINGS` 加入 `min_duration_minutes` (3) 與 `max_duration_minutes` (60)。
- [ ] 1.2 `backend/main.py`: 更新 `SettingsUpdate` 模型，加入上述兩個選填欄位，並修改 `update_settings` 中的邏輯以支援儲存這些設定。
- [ ] 1.3 `backend/main.py`: 修改 `enhance_and_filter_videos` 函式，讀取設定並過濾掉 `duration_seconds` 不在 `[min_duration * 60, max_duration * 60]` 區間內的影片。
- [ ] 1.4 `frontend/src/views/SettingsView.vue`: 新增「最短影片長度(分鐘)」與「最長影片長度(分鐘)」兩個設定選項 (input type="number")，並串接前後端設定更新。

## 2. 頻道管理與取消訂閱
- [ ] 2.1 `backend/main.py`: 修改 `GET /subscriptions` API，在回傳的每筆資料中，除了 `channel_id` 以外，再額外回傳 `subscription_id`（即 API response 的 `id` 欄位）。
- [ ] 2.2 `backend/main.py`: 新增 `DELETE /subscriptions/{subscription_id}` API，呼叫 `youtube.subscriptions().delete(id=subscription_id).execute()` 執行取消訂閱。
- [ ] 2.3 `backend/main.py`: 新增 `GET /subscriptions/latest-dates` API，透過平行發送 RSS 請求抓取每個頻道的首筆影片的 `<published>` 日期，回傳格式如 `{ "channelId": "iso_string" }`。
- [ ] 2.4 `frontend/src/views/HomeView.vue`: 在左側頻道清單的下方（或頂部），加入一個「檢查最後更新時間」按鈕。
- [ ] 2.5 `frontend/src/views/HomeView.vue`: 實作點擊按鈕後呼叫 `/subscriptions/latest-dates` API，並將回傳的日期渲染在對應頻道卡片的次要資訊列中。
- [ ] 2.6 `frontend/src/views/HomeView.vue`: 在每個頻道項目旁加上一個「刪除(垃圾桶)」按鈕，點擊後觸發確認框，確認後呼叫 DELETE API，並將該頻道自畫面列表中移除。

## 3. 版面改為三欄式佈局 (左側訂閱、中間影片、右側進度)
- [ ] 3.1 `frontend/src/views/HomeView.vue`: 縮小 `header` 的 padding (例如 `0.5rem 1rem`) 與 `h1` 的字體大小。取消 `.home` 下方的 padding (移除 `padding-bottom: 100px`)。
- [ ] 3.2 `frontend/src/views/HomeView.vue`: 將 `.layout` 改為三欄網格 `grid-template-columns: 240px 1fr 300px;`。新增第三欄 `<aside class="right-pane-progress">`。
- [ ] 3.3 `frontend/src/views/HomeView.vue`: 將原本在底部的 `<SelectedVideos />` 移至右側新增的第三欄內。
- [ ] 3.4 `frontend/src/components/SelectedVideos.vue`: 移除 `.selected-panel` 的 `position: fixed; bottom: 0;` 樣式，使其填滿右欄容器，並調整內部高度以支援滾動。
- [ ] 3.5 `frontend/src/components/ChannelVideos.vue`: 修改影片清單佈局為彈性網格 (`display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;`)。
- [ ] 3.6 `frontend/src/components/ChannelVideos.vue`: 將縮圖尺寸減為原本的一半，並調整卡片內部排版，使文字與小縮圖能更緊湊呈現。
- [ ] 3.7 `frontend/src/components/LatestVideosFeed.vue`: 套用與 `ChannelVideos.vue` 相同的網格與縮圖縮小樣式。
