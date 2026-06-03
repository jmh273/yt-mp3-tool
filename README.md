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

> 左欄「🔍 同類新頻道」：依你的訂閱風格（從頻道標題與 keywords 萃取 8 組關鍵字）找出**同類但你還沒訂閱**的頻道近期影片，可先用「👁 加入觀察名單」暫存感興趣的頻道，不會立刻呼叫 YouTube 訂閱 API。左欄下方可在「訂閱 / 觀察名單」頁籤切換；觀察名單依登入帳號存於本機 `localStorage`，可點頻道查看近期影片、用 ✕ 移除，或用 ➕ 升級為訂閱。Profile 永續快取於 `~/.yt-mp3-tool/discovery_profiles/`，跨 backend 重啟保留；要重新分析訂閱請按「🔁 重新分析」按鈕。語言會自動偵測（中文 / 英文）以過濾跨語言雜訊。**首次切到此 tab 或按「重新分析」會消耗約 800 quota units**（主要是 8 次 `search.list`），後續「換一批」幾乎免費（用 cache）。

## 設定

點擊右上角「設定」可修改：
- MP3 輸出資料夾
- 每頻道顯示影片數（預設 5）
- 最新影片時間範圍（預設 24 小時）

設定儲存於 `~/.yt-mp3-tool/settings.json`

## 免責聲明

> ⚠️ **僅供個人使用，風險自負。**
> 從 YouTube 下載內容可能**違反 [YouTube 服務條款](https://www.youtube.com/t/terms)**。本工具僅供個人學習與私人備份用途，請勿用於侵犯著作權或商業散布。使用本工具所衍生的任何後果由使用者自行承擔；作者不對任何濫用負責，亦不提供任何擔保（見 [LICENSE](LICENSE)）。
> 本工具請求 YouTube／Google 授權時，採**自架者自帶**的 GCP OAuth 憑證——你只會用到自己的 API 配額，授權 token 僅存於你本機。

## 注意事項

- 本工具僅供個人使用
- 需定期更新 yt-dlp：`pip install -U yt-dlp`
- 如遇下載失敗，通常是 yt-dlp 版本過舊或該影片有版權限制
- 隨附的 ffmpeg / mp3gain 為 GPL 授權，詳見 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)

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

18 個測試案例（~90 步驟）涵蓋全部 user-visible 功能（啟動 / 搜尋 / 頻道 / 影片勾選 / 最新影片 / 設定 / 右欄分頁 / 音量正規化 / rename / 發燒影片 / 影片搜尋 / URL 下載 / 影片播放 modal / 下載流程 / 配額計數 / 同類新頻道發現）。每步驟都有繁中操作敘述 + 截圖。

完成後輸出 `frontend/e2e/report/walkthrough.html` — 開瀏覽器看，全綠才適合 release。

## 自架（給想自己裝來用的人）

上面那段是**開發**用（從原始碼跑）。如果你只是想把工具裝起來用，**不需要** Python /
Node / ffmpeg / GitHub 帳號——下載 release zip、用你自己的 Google 憑證即可。

完整圖解步驟（含 Google Cloud 申請、OAuth 設定、憑證下載）請看
**[docs/SELF-HOST-SETUP.md](docs/SELF-HOST-SETUP.md)**。

日後更新只要在安裝資料夾跑 `update.bat`（走公開下載網址，免登入 GitHub）。

> 維護者發布新版的流程（打 tag → CI build → release）見 [docs/DEPLOY.md](docs/DEPLOY.md)。
