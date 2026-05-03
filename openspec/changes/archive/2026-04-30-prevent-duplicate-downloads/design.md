## Context
目前的系統允許使用者無限次勾選同一支影片並送出下載請求。為了提升使用者體驗與效率，需要自動將已成功下載的影片鎖定。

## Goals
- 下載成功後，UI 上該影片的 checkbox 必須自動變為 `disabled` 狀態。
- 保留跨 session 的紀錄，使用者關閉網頁下次再開，已下載過的 checkbox 依舊保持 disabled。

## Technical Approach

### Frontend (`frontend/src/stores/download.ts`)
- 在 Pinia store 內新增一個 state: `downloadedIds = ref<Set<string>>(new Set())`。
- 在 store 初始化時，嘗試從 `localStorage.getItem('yt_mp3_downloaded_ids')` 讀取並還原 `Set`。
- 新增 `markAsDownloaded(videoId: string)` 函式，將 ID 加入 `Set` 並回存 `localStorage`。
- 新增 `isDownloaded(videoId: string)` 函式供 UI 判斷。

### Frontend (`frontend/src/components/DownloadProgress.vue`)
- 當透過 SSE 接收到進度 `status === 'done'` 時，呼叫 `downloadStore.markAsDownloaded(vid)`。

### Frontend (`frontend/src/components/ChannelVideos.vue` & `LatestVideosFeed.vue`)
- Checkbox 綁定屬性：`:disabled="download.isDownloaded(v.video_id)"`
- 若已被下載，可考慮將 Checkbox 預設打勾 (`:checked="true"`)，或是額外加上一個「✅ 已下載」的標籤，讓使用者清楚知道為什麼不能點。
