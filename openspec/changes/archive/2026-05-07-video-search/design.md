# 影片搜尋功能 - 系統設計 (Design)

## 架構概覽
本功能採用 `yt_dlp` 作為底層搜尋引擎，以避開 YouTube Data API 昂貴的配額消耗。後端實作一支新的 API 端點處理搜尋請求；前端在側邊欄加入「搜尋影片」按鈕，主視圖新增搜尋列及結果呈現組件。

## 後端設計 (Backend)
1. **API 路由**：新增 `GET /search-videos?q={keyword}` 端點。
2. **搜尋邏輯 (`yt_dlp`)**：
   - 使用 `yt_dlp.YoutubeDL`，設置 `extract_flat=True` 以求最快速度擷取中介資料，不需下載完整影片內容。
   - 搜尋指令使用 `ytsearch50:{keyword}` (搜尋前 50 筆結果)。
3. **過濾邏輯**：
   - 撈取 `yt_dlp` 提取的 `entries`。
   - 根據 `settings.json` 的 `min_duration_minutes` 與 `max_duration_minutes` 過濾影片長度。
   - 將格式轉換成與前端預期一致的結構 (包含 `video_id`, `title`, `duration_seconds`, `channel_title` 等欄位)。
4. **非同步處理**：由於 `yt_dlp.extract_info` 為阻塞 (blocking) 函式，需利用 `asyncio.to_thread` 在背景執行緒中執行，避免卡住 FastAPI 的主事件迴圈 (Event Loop)。

## 前端設計 (Frontend)
1. **導覽列 (`HomeView.vue`)**：
   - 左側選單加入「🔍 搜尋影片」按鈕。
   - 視圖切換狀態機新增 `activeView = 'search'`。
2. **搜尋結果組件 (`SearchVideosFeed.vue`)**：
   - **UI**：上方配置一個有質感的 `input` 輸入框與「搜尋」按鈕。下方使用與 `LatestVideosFeed` 一致的網格 (Grid) 排版來呈現影片。
   - **狀態管理**：維護 `searchQuery`, `isSearching`, `error`, `videos` 狀態。
   - **API 串接**：呼叫後端的 `/search-videos?q=...` 獲取資料，並整合進 `download` Store，支援點擊 checkbox 直接加入下載佇列。
