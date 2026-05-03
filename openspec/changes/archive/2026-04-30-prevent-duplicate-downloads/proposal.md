## Why
使用者若忘記哪些影片已經下載過，可能會重複點選下載，浪費本機儲存空間與網路頻寬。我們需要一個機制來防止重複下載已完成的檔案。

## What Changes
- 在前端的狀態管理（Pinia store）中，新增紀錄「已下載完成」的影片清單。
- 在下載進度完成時，自動將該影片標記為「已下載」。
- 修改影片列表（包含 `ChannelVideos.vue` 與 `LatestVideosFeed.vue`），對於已下載的影片，將其 Checkbox 設為停用（disabled）並改變視覺樣式（例如打勾並顯示灰色）。
- （可選）將已下載清單同步儲存到 `localStorage`，確保重新整理頁面後仍能記住歷史。

## Capabilities
- `prevent-duplicate-downloads`: 防止重複下載機制
- `download-history`: 本地端下載紀錄儲存
