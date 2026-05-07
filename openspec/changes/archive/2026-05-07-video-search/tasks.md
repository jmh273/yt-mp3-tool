# 影片搜尋功能 - 任務拆解 (Tasks)

## Task 1: 後端實作 `GET /search-videos` 端點
- [ ] 在 `backend/main.py` 新增 `/search-videos` GET 路由，接收 `q` (關鍵字) 參數。
- [ ] 撰寫 `_sync_search_videos_yt_dlp` 同步函式：使用 `yt_dlp.YoutubeDL` (設置 `extract_flat=True`) 執行 `ytsearch50:{q}`。
- [ ] 將擷取的 `entries` 轉換為前端預期的資料結構 (`video_id`, `title`, `duration_seconds` 等)，並套用 `settings.json` 的時長過濾限制 (`min_duration_minutes` / `max_duration_minutes`)。
- [ ] 透過 `asyncio.to_thread` 將搜尋邏輯包裝為非同步端點，確保不阻塞伺服器。

## Task 2: 前端實作 `SearchVideosFeed.vue` 組件
- [ ] 建立 `frontend/src/components/SearchVideosFeed.vue`。
- [ ] 實作上方搜尋區塊 (輸入框、搜尋按鈕)，支援 `Enter` 鍵觸發搜尋。
- [ ] 實作下方展示區塊：套用專案標準的網格佈局 (Grid)、縮圖、時長標籤、標題、頻道名稱。
- [ ] 將影片左上角的 checkbox 綁定 `useDownloadStore`，達成與最新影片/發燒影片相同的點擊下載體驗。
- [ ] 處理「載入中」、「查無結果」、「網路錯誤」等狀態顯示。

## Task 3: 整合進主畫面 `HomeView.vue`
- [ ] 在 `frontend/src/views/HomeView.vue` 左側選單新增「🔍 搜尋影片」按鈕。
- [ ] 新增視圖狀態機，支援切換 `activeView = 'search'`。
- [ ] 於 `<main class="middle-pane">` 區塊中，以 `v-else-if="activeView === 'search'"` 掛載並渲染 `<SearchVideosFeed />` 組件。
- [ ] 執行整體系統測試，確認搜尋行為正確無誤。
