# 自架安裝指南（Self-Host Setup）

把 yt-mp3-tool 裝到你自己的 Windows，並用**你自己的** Google 憑證讓它運作的完整步驟。
全程約 15–20 分鐘，其中大部分時間花在 Google Cloud 的一次性設定。

> 這個工具是「自架者自帶憑證」模型：你會用到**自己的** Google API 配額，
> 授權 token 只存在你本機（`%USERPROFILE%\.yt-mp3-tool\`），不會經過任何第三方伺服器。

---

## 你需要準備

- 一台 Windows 10/11
- 一個 Google 帳號
- 約 15 分鐘

> **不需要**自己安裝 ffmpeg —— release zip 已內建 `ffmpeg.exe` 與 `mp3gain.exe`。
> **不需要** Python / Node.js —— 直接用打包好的 exe。
> **不需要** GitHub 帳號或 `gh` —— 更新走公開下載網址。

---

## 步驟總覽

```
A. 下載並解壓 release zip
B. 設定 Google Cloud（建專案 → 開 API → 同意畫面 → 建憑證 → 下載 json）   ← 最花時間
C. 把 client_secret.json 放到 exe 同目錄
D. 啟動 → 完成 Google 授權
E. （日後）用 update.bat 更新
```

---

## A. 下載並解壓

1. 到本工具的 GitHub releases 頁，下載最新版的 `yt-mp3-tool-vX.Y.Z-windows-x64.zip`：
   <https://github.com/jmh273/yt-mp3-tool/releases/latest>
2. 解壓到一個你喜歡的資料夾，建議 `C:\Tools\YT-MP3\`。
3. 解開後裡面應該有 `yt-mp3-tool.exe`、`ffmpeg.exe`、`mp3gain.exe`、`update.bat`、`THIRD-PARTY-NOTICES.txt` 等。

> 先**不要**急著按 exe，會因為還沒有憑證而無法登入。先做 B。

---

## B. 設定 Google Cloud

### B-1. 建立專案

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 「選取專案」或頂端專案下拉選單 →「新增專案」→ 取個名字（例如 `yt-mp3-tool`）→ 建立。
   （第一次進入、還沒有任何專案時，頂端會顯示「選取專案」。）
3. 等右上角通知建立完成後，**確認頂端已切換到這個新專案**。

### B-2. 啟用 API

1. 左上選單 →「API 和服務」→「程式庫」。
2. 搜尋 **YouTube Data API v3** → 點進去 →「啟用」。**（必須）**
3. （**選用**）若你想用「上傳到 Google Drive」功能，再搜尋 **Google Drive API** → 啟用。
   不用 Drive 上傳就跳過這步。

### B-3. 設定 OAuth 同意畫面

> ⚠️ 這一段最容易踩雷，請照做。

1. 「API 和服務」→「OAuth 同意畫面」。
2. User Type 選 **外部（External）** → 建立。
3. 填必填欄位：應用程式名稱（隨意，例如 `yt-mp3-tool`）、使用者支援電子郵件（你自己）、開發人員聯絡資訊（你自己的 email）→ 儲存並繼續。
4. Scopes 這頁可以直接「儲存並繼續」（本工具會在登入時請求所需 scope）。
5. 測試使用者這頁：把**你自己的 Google 帳號 email**加進去 → 儲存並繼續。

#### ⭐ 重要：把同意畫面「發布到正式」

設定完成後，回到「OAuth 同意畫面」頁，會看到發布狀態是**「測試中」**。

- **請按「發布應用程式」把狀態改成「正式（In production）」。**
- 為什麼？因為在「測試中」狀態，Google 給的 refresh token **7 天就會失效**，
  你會每週被踢出來重新登入一次。發布到正式後，token 不會過期。
- 發布時可能要你確認，照著按即可。**你不需要送 Google 驗證**（見下方說明）。

#### 關於「未驗證應用程式」警告

第一次授權時，瀏覽器會跳出 **「Google 尚未驗證這個應用程式」** 的警告畫面。

- 這是**正常的**，因為這個 app 是你自架自用、且沒有花錢送 Google 做安全驗證（CASA）。
- 安全通過方式：點畫面左下的 **「進階」→「前往 yt-mp3-tool（不安全）」**。
- 這個警告只是因為本工具請求了 YouTube 的受限 scope；由於 client_secret 是你自己的、
  授權只發生在你本機，實際上是安全的。**不需要、也不建議**去送 Google 驗證（很貴又很慢）。

### B-4. 建立 OAuth 用戶端 ID（憑證）

1. 「API 和服務」→「憑證」→「建立憑證」→「OAuth 用戶端 ID」。
2. 應用程式類型選 **桌面應用程式（Desktop app）**。⭐（一定要選這個）
3. 取個名字 → 建立。
4. 建立後的對話框點 **「下載 JSON」**。

### B-5. 重新命名並放好

1. 把剛下載的 JSON 檔**改名為** `client_secret.json`。
2. 放到 **`yt-mp3-tool.exe` 的同一個資料夾**（例如 `C:\Tools\YT-MP3\client_secret.json`）。

---

## C. 啟動與授權

1. 雙擊 `yt-mp3-tool.exe`。
   - Windows Defender 可能跳「未識別的應用程式」→「其他資訊」→「仍要執行」。
     （這支 exe 沒有買 code-signing 憑證，屬正常。可把資料夾加進 Defender 排除清單一勞永逸。）
   - 會跳出一個 console 視窗（保持開著），瀏覽器自動開到 `http://localhost:8000/`。
2. 頁面點「登入 Google」→ 選你的帳號 → 遇到「未驗證」警告就照 B-3 的方式「進階 → 繼續」→ 同意授權。
3. 授權成功後 token 存到 `%USERPROFILE%\.yt-mp3-tool\token.json`，下次啟動免再登入。

> 如果啟動後登入時看到「找不到 client_secret.json」的訊息 → 回到 B-5 確認檔名與位置正確（必須跟 exe 同目錄、檔名一字不差）。

---

## D. 本工具請求的權限（scope）說明

登入時本工具會請求以下 Google 權限，用途如下：

| Scope | 用途 |
|-------|------|
| `youtube` | 讀取你的訂閱頻道、頻道影片清單，供你挑選下載 |
| `drive.file`（選用） | 僅在你使用「上傳到 Drive」時，建立 / 寫入本工具自己建立的檔案；無法存取你其他 Drive 檔案 |
| `userinfo.email` / `openid` | 取得你的 email 以區分多帳號 |

授權後這些權限只在你本機使用，token 不離開你的電腦。

---

## E. 日後更新

在安裝資料夾執行 `update.bat` 即可。它會：

1. 查最新 release 版本（走公開網址，**不需登入 GitHub、不需 gh**）。
2. 與本機版本比對，已是最新就直接結束。
3. 否則下載新版 → 關掉執行中的程式 → 解壓覆蓋 → 重啟。

`%USERPROFILE%\.yt-mp3-tool\` 內的設定、token 與你的 MP3 下載目錄**永遠不會被動到**。

> 若你把工具裝在非預設位置，或 fork 了自己的 repo，可用環境變數覆寫：
> ```powershell
> [Environment]::SetEnvironmentVariable("INSTALL_DIR", "D:\Apps\YT-MP3", "User")
> [Environment]::SetEnvironmentVariable("REPO", "youruser/yt-mp3-tool", "User")
> ```

---

## 常見問題

**Q：登入時「找不到 client_secret.json」？**
A：檔案必須跟 `yt-mp3-tool.exe` 同一個資料夾，且檔名正好是 `client_secret.json`（不是 `client_secret(1).json` 之類）。

**Q：每隔幾天就被登出？**
A：你的 OAuth 同意畫面還停在「測試中」。回 B-3 把它「發布到正式」。

**Q：一直跳「未驗證應用程式」？**
A：正常。點「進階 → 前往（不安全）」即可。這不是病毒，是因為沒送 Google 驗證。

**Q：出現配額（quota）用盡？**
A：YouTube Data API 每天每專案 10,000 units。「同類新頻道發現」一次約耗 800。等隔天重置，或到 GCP 申請提高配額。
