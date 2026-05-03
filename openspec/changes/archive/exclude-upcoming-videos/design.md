## Context
目前的影片列表是直接解析 RSS Feed (`/feeds/videos.xml`)。雖然 RSS 速度快且不耗配額，但它不包含明確的「是否為首播/直播」的標記。
而 YouTube Data API 的 `videos.list(part="snippet")` 則會精準回傳 `snippet.liveBroadcastContent`，其值可能是 `none` (一般影片)、`live` (直播中) 或 `upcoming` (即將到來)。

## Goals
- 在不大幅增加 API Quota 消耗的前提下，準確過濾掉 `upcoming` 狀態的影片。
- 保持前端顯示的影片必定是目前可被 yt-dlp 下載的狀態。

## Technical Approach

### Backend (`backend/main.py`)
- 在 `fetch_channel_rss` 取得初步的 `videos` 列表後，收集所有的 `video_id`。
- 呼叫 YouTube Data API: `youtube.videos().list(part="snippet", id=",".join(video_ids)).execute()`。
  *(註：此 API 呼叫支援一次最多 50 個 IDs，且只耗費 1 單位配額，非常划算)*
- 建立一個排除名單（`liveBroadcastContent == 'upcoming'` 的影片 ID）。
- 將這些 ID 從最終回傳的 `videos` 陣列中過濾掉。
- 注意：這項檢查需要被整合到 `/subscriptions/{channel_id}/videos` 以及 `/latest-videos` 的最終合併階段。為了效能，`/latest-videos` 應該在收集完所有 RSS 的 100 支影片後，分批（每 50 個一組）打 API 確認狀態，再一次性過濾。
