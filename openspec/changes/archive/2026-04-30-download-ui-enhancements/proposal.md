## Why
使用者需要更詳細的下載狀態資訊，以利掌握檔案的下載進度。同時，影片列表的長度資訊目前排版不夠直觀，希望能比照 YouTube 原生體驗，將影片長度標籤直接顯示在縮圖右下角。

## What Changes
- 修改後端 yt-dlp 進度解析邏輯，擷取並傳送「下載速率」給前端。
- 修改前端 `DownloadProgress.vue`，在進度條上或旁邊顯示「進度百分比」與「下載速率」。
- 修改 `ChannelVideos.vue` 與 `LatestVideosFeed.vue`，將原有的 `duration` 移至 `img` 縮圖的右下角，並套用半透明黑底白字的樣式。

## Capabilities
- `download-progress-ui`: 進度條增強（速率與百分比顯示）
- `video-thumbnail-ui`: 縮圖時間標記覆蓋層（Thumbnail Duration Overlay）
