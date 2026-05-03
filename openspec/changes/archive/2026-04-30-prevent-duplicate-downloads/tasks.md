## 1. 前端狀態管理修改
- [ ] 1.1 `frontend/src/stores/download.ts`: 增加 `downloadedIds` state 與 `isDownloaded`、`markAsDownloaded` action。
- [ ] 1.2 `frontend/src/stores/download.ts`: 實作與 `localStorage` 之間的同步邏輯。

## 2. 下載完成事件連動
- [ ] 2.1 `frontend/src/components/DownloadProgress.vue`: 偵測 SSE 事件，若單一影片下載並轉檔成功 (`status === 'done'`)，將其標記為已下載並從待下載清單中移除。

## 3. UI 元件綁定
- [ ] 3.1 `frontend/src/components/ChannelVideos.vue`: 將 `<input type="checkbox">` 加上 `:disabled="download.isDownloaded(v.video_id)"`。
- [ ] 3.2 `frontend/src/components/LatestVideosFeed.vue`: 套用同樣的 `disabled` 邏輯。
- [ ] 3.3 （選做）在被 disable 的影片旁邊，顯示簡單的「已下載」提示字樣或更換 checkbox 顏色。

## 4. 測試
- [ ] 4.1 手動勾選一部影片並完成下載，確認該 checkbox 隨後變為不可點擊狀態。
- [ ] 4.2 重新整理頁面 (F5)，確認剛才下載過的影片 checkbox 依舊保持不可點擊 (disabled)。
