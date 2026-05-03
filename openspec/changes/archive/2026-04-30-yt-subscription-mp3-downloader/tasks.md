## 1. 環境準備

- [x] 1.1 確認 Python 3.10+ 已安裝，建立 `backend/` 資料夾與 `requirements.txt`
- [x] 1.2 安裝 yt-dlp：`pip install yt-dlp`
- [x] 1.3 確認 ffmpeg 已安裝並加入 PATH，撰寫啟動時檢查邏輯
- [x] 1.4 初始化 Vue 3 + Vite 前端專案於 `frontend/`
- [x] 1.5 在 GCP 建立 OAuth 2.0 credentials（Desktop App 類型），下載 `client_secret.json`

## 2. Google OAuth 後端

- [x] 2.1 建立 FastAPI 應用程式骨架（`backend/main.py`）
- [x] 2.2 實作 `GET /auth/login` — 產生 Google OAuth 授權 URL 並回傳給前端
- [x] 2.3 實作 `GET /auth/callback` — 接收 code，交換 token，儲存至 `~/.yt-mp3-tool/token.json`
- [x] 2.4 實作 `GET /auth/status` — 回傳目前登入狀態
- [x] 2.5 實作 `POST /auth/logout` — 刪除 token 檔案
- [x] 2.6 實作 token 自動刷新 middleware（401 時自動 refresh）

## 3. 訂閱清單後端

- [x] 3.1 實作 `GET /subscriptions` — 呼叫 YouTube Data API v3 取得訂閱頻道列表（channel ID、名稱、縮圖）
- [x] 3.2 實作 `GET /subscriptions/{channel_id}/videos` — 以 aiohttp 抓取頻道 RSS feed，解析並回傳最新 5 支影片
- [x] 3.3 加入並行抓取邏輯（asyncio.gather），支援多頻道同時請求

## 4. 下載後端

- [x] 4.1 實作 `POST /download` — 接收影片 URL 列表，啟動下載任務
- [x] 4.2 整合 yt-dlp Python API，設定 `bestaudio` 格式與 ffmpeg 後處理轉 MP3
- [x] 4.3 實作 `GET /download/progress` — SSE endpoint，即時推送每支影片的下載進度
- [x] 4.4 實作輸出路徑讀取（從設定檔，預設 `~/Music/YT-MP3/`）
- [x] 4.5 下載失敗時記錄錯誤並繼續處理佇列中其他影片

## 5. 設定管理

- [x] 5.1 實作 `GET /settings` 與 `PUT /settings` — 讀寫設定檔（輸出路徑等）
- [x] 5.2 設定檔儲存於 `~/.yt-mp3-tool/settings.json`，不存在時使用預設值
- [x] 5.3 `PUT /settings` 收到新路徑時，若路徑不存在則自動建立

## 6. Vue 前端 — 基礎架構

- [x] 6.1 設定 Vite proxy，將 `/api` 轉發至 `localhost:8000`
- [x] 6.2 建立路由：`/`（主頁）、`/settings`（設定）
- [x] 6.3 建立全域狀態管理（Pinia）：`authStore`、`downloadStore`

## 7. Vue 前端 — OAuth 畫面

- [x] 7.1 建立登入頁面（`LoginView.vue`），顯示「登入 Google」按鈕
- [x] 7.2 點擊後呼叫 `/api/auth/login`，開啟授權 URL
- [x] 7.3 授權完成後自動偵測登入狀態，跳轉主頁面

## 8. Vue 前端 — 訂閱清單與影片選取

- [x] 8.1 建立 `SubscriptionList.vue`，呼叫 `/api/subscriptions` 顯示頻道卡片
- [x] 8.2 建立 `ChannelVideos.vue`，點擊頻道後展開最新影片列表
- [x] 8.3 每支影片加入 checkbox，勾選後更新 `downloadStore` 的待下載清單
- [x] 8.4 建立 `SelectedVideos.vue`，顯示已選取影片清單與「清除全部」按鈕

## 9. Vue 前端 — 下載與進度

- [x] 9.1 建立「下載選取影片」按鈕，呼叫 `POST /api/download`
- [x] 9.2 建立 `DownloadProgress.vue`，透過 SSE 監聽 `/api/download/progress` 顯示進度條
- [x] 9.3 下載完成後顯示成功/失敗摘要通知

## 10. Vue 前端 — 設定頁面

- [x] 10.1 建立 `SettingsView.vue`，顯示當前輸出路徑
- [x] 10.2 允許使用者修改輸出路徑並呼叫 `PUT /api/settings` 儲存

## 11. 收尾

- [x] 11.1 撰寫 `README.md`，說明安裝步驟（GCP 設定、ffmpeg、Python 依賴）
- [x] 11.2 建立 `start.bat` 一鍵啟動前後端
- [ ] 11.3 手動測試完整流程：登入 → 瀏覽訂閱 → 勾選 → 下載 → 確認 MP3 產出
