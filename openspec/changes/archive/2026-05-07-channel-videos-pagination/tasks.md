## 1. 後端 API 實作
- [x] 1.1 `backend/main.py`: 實作 `_get_channel_uploads_playlist_id(youtube, channel_id)` 輔助函式，取得 `Uploads` ID 並快取（避免重複扣 Quota）。
- [x] 1.2 `backend/main.py`: 實作 `GET /api/channels/{channel_id}/videos` 路由，接收 `pageToken` 參數。
- [x] 1.3 在路由中呼叫 `playlistItems.list` 取得至多 50 筆影片資料。
- [x] 1.4 將取得的影片透過 `enhance_and_filter_videos` 取得時長並過濾（需確實整合 `consume_quota` 機制）。
- [x] 1.5 組合包含 `items` 與 `nextPageToken` 的 JSON 回傳。

## 2. 前端 Store 擴充
- [x] 2.1 `frontend/src/stores/...` (需根據現有 store 結構調整): 新增狀態 `currentChannelId`, `currentChannelTitle`, `channelVideos`, `channelNextPageToken`。 (註: 直接使用 Component State 完成)
- [x] 2.2 實作 `fetchChannelVideos(channelId, pageToken)` 動作，如果是首頁載入則覆蓋清單，如果是載入更多則 append 到陣列尾端。
- [x] 2.3 實作 `exitChannelView()` 動作，用於清除頻道選取狀態並回到原本的最新動態牆。 (註: 利用既有的 `showLatest` 處理)

## 3. 前端 UI 實作
- [x] 3.1 `HomeView.vue`: 修改左側頻道列表，點選頻道時觸發 `fetchChannelVideos` 進入頻道視圖模式，並突顯目前選取的頻道（Active 狀態樣式）。
- [x] 3.2 右側頂部增加狀態標頭 (Header)：「正在觀看頻道：XXX」，並加入一個「← 回首頁 / 最新影片」按鈕。
- [x] 3.3 右側影片列表根據模式動態切換來源（原始混合列表 vs 頻道列表）。
- [x] 3.4 影片列表底部實作「載入更多 (Load More)」按鈕，點擊後依據 `channelNextPageToken` 繼續載入；若 token 為空則隱藏按鈕或顯示「已無更多影片」。

## 4. 測試與驗證
- [ ] 4.1 手動測試：點擊左側任一頻道，右側成功切換為該頻道專屬影片，時間排序從新到舊，並顯示 50 筆。
- [ ] 4.2 手動測試：點選「載入更多」，確認能順利載入次 50 筆，且介面不會卡頓。
- [ ] 4.3 手動測試：點選「回最新影片」，確認 UI 正常切換回原始的多頻道混合動態牆，狀態恢復。
- [ ] 4.4 配額確認：點擊過程中檢視 Quota 消耗量，確認每次載入約增加 3。
