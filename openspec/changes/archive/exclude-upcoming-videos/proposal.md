## Why
當 YouTube 頻道排定「首播 (Premiere)」或「即將開始的直播 (Upcoming Live)」時，這些影片會立刻出現在頻道的 RSS Feed 中。但因為實際內容尚未開放，若使用者勾選下載，`yt-dlp` 會報錯（例如 `Premieres in 2 days` 或 `live event will begin in 3 hours`）。
為了避免使用者選到根本還無法下載的影片，我們需要在前端顯示列表前，就將這些「未來的影片」排除。

## What Changes
- 修改後端取得影片列表的邏輯 (`/subscriptions/{channel_id}/videos` 與 `/latest-videos`)。
- 維持先用 RSS 快速抓取最新影片清單（以節省 API 配額），但抓取後，將取得的影片 IDs 收集起來。
- 透過 YouTube Data API v3 的 `videos.list` (一次傳入多個 ID 批次查詢) 取得這批影片的 `liveBroadcastContent` 狀態。
- 若狀態為 `upcoming`（即將首播或直播），則將該影片從回傳給前端的列表中剃除。

## Capabilities
- `upcoming-video-filter`: 自動過濾未開放的首播/直播影片
