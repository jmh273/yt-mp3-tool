# YT → MP3 Tool

從 YouTube 訂閱頻道手動挑選影片並下載為 MP3 的本機工具。

## 需求

- Python 3.10+
- Node.js 18+
- [ffmpeg](https://ffmpeg.org/download.html)（需加入 PATH）
- Google Cloud Platform 帳號（設定 OAuth 2.0）

## 安裝步驟

### 1. 安裝 ffmpeg

前往 <https://ffmpeg.org/download.html> 下載 Windows 版本，解壓縮後將 `bin/` 資料夾加入系統 PATH。

確認安裝：
```
ffmpeg -version
```

### 2. 設定 Google OAuth 2.0

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案（或選擇現有專案）
3. 啟用 **YouTube Data API v3**
4. 前往「憑證」→「建立憑證」→「OAuth 用戶端 ID」
5. 應用程式類型選擇 **Desktop App**
6. 下載 JSON 憑證，重新命名為 `client_secret.json`，放置於 `backend/` 資料夾

### 3. 安裝 Python 依賴

```bash
cd backend
pip install -r requirements.txt
```

### 4. 安裝前端依賴

```bash
cd frontend
npm install
```

## 啟動

雙擊 `start.bat`（Windows），或手動執行：

```bash
# 後端（Terminal 1）
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# 前端（Terminal 2）
cd frontend
npm run dev
```

開啟瀏覽器至 <http://localhost:5173>

## 使用流程

1. 點擊「登入 Google」，完成 OAuth 授權
2. 左側選擇頻道，右側查看最新影片
3. 勾選要下載的影片
4. 點擊底部「下載選取影片」
5. 等待下載完成，MP3 儲存於設定的輸出資料夾（預設 `~/Music/YT-MP3/`）

## 設定

點擊右上角「設定」可修改：
- MP3 輸出資料夾
- 每頻道顯示影片數（預設 5）
- 最新影片時間範圍（預設 24 小時）

設定儲存於 `~/.yt-mp3-tool/settings.json`

## 注意事項

- 本工具僅供個人使用
- 需定期更新 yt-dlp：`pip install -U yt-dlp`
- 如遇下載失敗，通常是 yt-dlp 版本過舊或該影片有版權限制
