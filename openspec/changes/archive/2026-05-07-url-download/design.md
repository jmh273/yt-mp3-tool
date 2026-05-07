# 網址下載功能 - 設計與任務 (Design & Tasks)

## 後端設計 (Backend)
- **API 路由**：新增 `GET /url-preview?url={encoded_url}`。
- **解析邏輯**：
  - 使用 `yt_dlp.YoutubeDL(extract_flat=True)` 呼叫 `extract_info(url, download=False)`。
  - 若回傳的 info 中有 `entries`，代表是播放清單 (Playlist)，遍歷擷取每一筆的資訊 (`id`, `title`, `duration`, `thumbnail` 等)。
  - 若 info 無 `entries`，代表是單一影片，直接將該 info 轉為一筆 `VideoItem` 格式陣列回傳。
- **錯誤處理**：捕捉 `yt_dlp.utils.DownloadError` 等例外，若解析失敗回傳 400 Bad Request。

## 前端設計 (Frontend)
- **元件 (`UrlDownloadFeed.vue`)**：
  - 頂部：包含一個 `input` 讓使用者貼上網址，以及一個「解析」按鈕。
  - 解析結果區塊：使用網格佈局 (Grid) 顯示抓取到的影片。
  - 若影片數量 > 1 (播放清單)，顯示「全選」與「全不選」按鈕，快速操作 `downloadStore` 的 `toggle`。
- **整合 (`HomeView.vue`)**：
  - 新增 `activeView = 'url'`。
  - 左側邊欄按鈕「🔗 網址下載」。

## 任務清單 (Tasks)
- [ ] 後端：實作 `_sync_url_preview_yt_dlp` 與 `/url-preview` 端點。
- [ ] 前端：撰寫 `UrlDownloadFeed.vue` 並處理各種狀態 (載入中、錯誤、無結果)。
- [ ] 前端：將 `UrlDownloadFeed.vue` 嵌入 `HomeView.vue` 中並測試行為。
