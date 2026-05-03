## 1. 後端修改
- [ ] 1.1 `backend/main.py`: 在 yt-dlp 的 `make_hook` 中解析 `_speed_str` 欄位。
- [ ] 1.2 `backend/main.py`: 將 `speed` 資訊加入到 SSE 回傳的 JSON 資料結構中。

## 2. 前端介面修改 - 下載進度
- [ ] 2.1 `frontend/src/components/DownloadProgress.vue`: 接收來自 SSE 的 `speed` 資料。
- [ ] 2.2 `frontend/src/components/DownloadProgress.vue`: 在 UI 上加入文字標籤，顯示 `percent` 與 `speed`。

## 3. 前端介面修改 - 影片縮圖長度
- [ ] 3.1 `frontend/src/components/ChannelVideos.vue`: 將縮圖與 duration 包裝進 `.thumb-wrapper` 並套用 absolute 絕對定位。
- [ ] 3.2 `frontend/src/components/LatestVideosFeed.vue`: 套用與 ChannelVideos 相同的縮圖 duration CSS 樣式與 HTML 結構。

## 4. 測試
- [ ] 4.1 確認頻道影片與最新影片的清單，影片長度皆正確顯示在縮圖右下角。
- [ ] 4.2 實際勾選影片並下載，確認進度條有正常跳動並顯示速率文字（如 2.5MiB/s）。
