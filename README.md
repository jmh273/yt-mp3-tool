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

> 在左欄「🔗 網址下載」可貼上 YouTube 影片或播放清單網址。大型播放清單會以分頁顯示，預設每頁 25 部，可在 UI 切換 10 / 25 / 50 / 100，並用「全選本頁 / 取消本頁」分梯次下載。

> 右欄下載面板可選擇是否加流水號（檔名 `01_xxx.mp3` 風格），並可自訂起始號；起始號的位數隨輸入字串長度而定（`01` → 2 位、`001` → 3 位，超過時自動擴充），分梯下載時可手動跳號避免重複。

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

## 完整 UI Walkthrough 測試（release 前驗收）

一次性 setup（首次或 token 過期時）：

```bash
npm run e2e:auth --prefix frontend
```

會開瀏覽器，請完成 Google 登入；登入後本工具自動把 storage state 存到 `frontend/e2e/.auth/storageState.json`，後續測試免重複登入。

執行 walkthrough：

```bash
npm run e2e --prefix frontend
```

前置條件：後端 (uvicorn :8000) + 前端 (vite :5173) 都在跑、已執行過 `npm run e2e:auth`。

17 個測試案例（~80 步驟）涵蓋全部 user-visible 功能（啟動 / 搜尋 / 頻道 / 影片勾選 / 最新影片 / 設定 / 右欄分頁 / 音量正規化 / rename / 發燒影片 / 影片搜尋 / URL 下載 / 影片播放 modal / 下載流程 / 配額計數）。每步驟都有繁中操作敘述 + 截圖。

完成後輸出 `frontend/e2e/report/walkthrough.html` — 開瀏覽器看，全綠才適合 release。

## 部署到其他 Windows PC

開發在這個 repo 內進行（`start.bat` / `npm run dev` + `uvicorn --reload`）。
要把工具裝到另一台 Windows，**不需要** Python / Node — 走 release zip 路線：

1. 在這台開發機打 git tag：`git tag v0.5.0 && git push --tags`
2. GitHub Actions 自動 build → 上傳 release zip
3. 在目標 PC 跑一次 `gh auth login`，之後每次只要 `update.bat`

完整步驟請看 [docs/DEPLOY.md](docs/DEPLOY.md)。
