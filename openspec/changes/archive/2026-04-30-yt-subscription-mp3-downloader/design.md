## Context

這是一個純本機工具，目標使用者為個人，用途是從自己的 YouTube 訂閱頻道手動挑選影片並下載為 MP3。
專案目錄目前為空，無現有程式碼需相容。
技術限制：Windows 11 本機環境，需要 Python 環境與 Node.js（Vue 前端）。

## Goals / Non-Goals

**Goals:**
- Google OAuth2 授權流程（本機 redirect URI）
- 訂閱頻道清單 + 每頻道最新影片列表（透過 YouTube Data API v3 + RSS）
- 勾選影片後觸發下載，後端以 yt-dlp + ffmpeg 完成轉檔
- Vue 3 前端顯示清單、勾選、下載進度
- MP3 存至使用者指定本機路徑

**Non-Goals:**
- 自動排程下載
- 多使用者 / 雲端部署
- 播放器功能
- 批次訂閱管理

## Decisions

### 1. 後端：FastAPI（Python）
**選擇 FastAPI 而非純 script**：前端需要 API 溝通，FastAPI 輕量且支援非同步，適合長時間下載任務。
**替代考慮**：Flask（同步，較慢處理下載）、直接 subprocess（無法即時推送進度）。

### 2. OAuth token 儲存：本機 JSON 檔
token 存在 `~/.yt-mp3-tool/token.json`，工具啟動時自動讀取並 refresh。
**替代考慮**：keyring（複雜度高，不必要）。

### 3. 訂閱清單取得：API + RSS 混合
- YouTube Data API v3 `subscriptions.list` 取得頻道 ID 列表（一次性，有配額成本）
- 每個頻道的最新影片改用 RSS feed（`/feeds/videos.xml?channel_id=...`）省配額，無需 API key
**替代考慮**：純 API（配額消耗快，10,000 units/day 限制）。

### 4. 前端：Vue 3 + Vite
現有專案為 Vue，保持一致。透過 `fetch` 呼叫本機 FastAPI（`localhost:8000`）。

### 5. 下載進度：Server-Sent Events（SSE）
yt-dlp 進度透過 SSE 即時推送到前端，不需要 WebSocket 複雜度。

## Risks / Trade-offs

- **yt-dlp 穩定性** → YouTube 反爬更新可能導致下載失敗。緩解：定期 `pip install -U yt-dlp`，工具啟動時顯示版本。
- **YouTube ToS** → 個人使用灰色地帶，不部署為服務即可。
- **OAuth 設定複雜度** → 使用者需在 GCP 建立 OAuth credentials。緩解：README 提供逐步指引。
- **ffmpeg 路徑問題** → Windows 環境 ffmpeg 需手動加入 PATH。緩解：啟動時檢查並提示。
- **大量訂閱** → 頻道數多時 RSS 抓取較慢。緩解：並行抓取（asyncio + aiohttp），並顯示載入狀態。

## Open Questions

- 每個頻道預設顯示幾支最新影片？（建議 5，可設定）
- MP3 預設輸出路徑？（建議 `~/Music/YT-MP3/`）
- 是否需要記憶已下載清單避免重複下載？
