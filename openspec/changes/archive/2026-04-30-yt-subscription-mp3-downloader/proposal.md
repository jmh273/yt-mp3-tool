## Why

使用者需要一個本機工具，能夠從自己的 YouTube 訂閱清單中手動選取影片，並將其下載轉換為 MP3 格式存到本機，方便離線收聽 Podcast 或音樂內容。

## What Changes

- 新增 Google OAuth2 登入流程，取得 YouTube 訂閱頻道存取權限
- 新增訂閱頻道清單顯示，並為每個頻道列出最新影片
- 新增影片勾選介面，讓使用者手動選取要下載的影片
- 新增後端下載服務，透過 yt-dlp 下載影片音訊並以 ffmpeg 轉換為 MP3
- 新增下載進度顯示與本機儲存路徑設定

## Capabilities

### New Capabilities

- `google-oauth`: 透過 Google OAuth2 取得使用者 YouTube 訂閱資料存取授權
- `subscription-browser`: 顯示訂閱頻道清單及每個頻道的最新影片列表
- `video-selector`: 使用者勾選想要下載的影片
- `mp3-downloader`: 呼叫 yt-dlp 下載影片音訊，ffmpeg 轉換為 MP3，儲存至本機

### Modified Capabilities

## Impact

- **新增依賴**：`yt-dlp`、`ffmpeg`、`google-auth-oauthlib`、`google-api-python-client`
- **後端**：Python（FastAPI 或簡單 HTTP server）處理 OAuth、下載、轉檔邏輯
- **前端**：Vue 3 顯示頻道/影片清單、勾選介面、下載進度
- **本機儲存**：MP3 檔案存至使用者指定資料夾
- **無雲端依賴**：全程本機執行，僅需 Google OAuth 取得 token
