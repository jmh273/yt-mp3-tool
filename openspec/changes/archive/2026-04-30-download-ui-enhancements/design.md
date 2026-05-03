## Context
目前的下載進度只有條狀顯示，缺乏具體數字。影片長度則是顯示在文字資訊區，不如原生 YouTube 直覺。

## Goals
- 從 yt-dlp 的 progress hook 中提取 `_speed_str`。
- 透過 Server-Sent Events (SSE) 將 `speed` 與現有的 `percent` 一同傳遞給前端。
- 前端進度列能顯示如 "45.2% - 3.2MiB/s" 的即時資訊。
- 前端影片列表：將縮圖外層加上 `position: relative`，時間標籤設為 `position: absolute` 固定於右下角。

## Technical Approach

### Backend (`backend/main.py`)
- 在 `make_hook` 的 `status == "downloading"` 判斷中，新增擷取 `d.get("_speed_str", "0KiB/s")`。
- 將取得的速率寫入 `download_progress[task_id]["items"][vid]["speed"]`。

### Frontend (`frontend/src/components/*`)
- **CSS 結構調整**: 在 `ChannelVideos.vue` 與 `LatestVideosFeed.vue` 中，用 `<div class="thumb-wrapper">` 把 `<img>` 和 `<span class="duration">` 包起來。
- **樣式 (Styles)**:
  - `.thumb-wrapper { position: relative; display: inline-block; line-height: 0; }`
  - `.duration { position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.8); color: white; padding: 2px 4px; border-radius: 4px; font-size: 0.75rem; line-height: 1; }`
- **DownloadProgress.vue**: 讀取 `item.percent` 與 `item.speed` 並渲染在進度條旁邊的文字標籤中。
