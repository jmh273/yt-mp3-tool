# 部署指南（DEPLOY）

這份是**維護者**視角：如何發布新版，以及自架者安裝/更新/備份的對應說明。

> 只是想把工具裝起來用？請直接看 **[SELF-HOST-SETUP.md](SELF-HOST-SETUP.md)**（含 Google 憑證申請）。

---

## Release 前 checklist（維護者，在 dev 機跑）

1. 確認後端 + 前端在跑、已執行 `npm run e2e:auth --prefix frontend` 完成 Google 登入並存下 storage state
2. **跑完整 walkthrough 測試**：`npm run e2e --prefix frontend`
3. 開 `frontend/e2e/report/walkthrough.html`，確認**全部案例都綠燈** (PASS)
4. 任何案例失敗 → 修 → 再跑直到全綠 → 才能進到下一步
5. 推 tag：`git tag v0.X.Y && git push --tags`
6. 等 GitHub Actions build → release 出來（CI 自動下載 ffmpeg/mp3gain 並打包；**不含** client_secret.json）
7. 通知自架者更新（他們各自跑 `update.bat`）

> 注意：公開 release zip **刻意不含** `client_secret.json`。每個自架者用自己的 Google 憑證
> （見 SELF-HOST-SETUP.md）。`build.bat` 會在 zip 內若混入 client_secret.json 時直接失敗。

---

## 自架者：第一次安裝

完整步驟見 **[SELF-HOST-SETUP.md](SELF-HOST-SETUP.md)**。摘要：

1. 到 GitHub releases 下載最新 `yt-mp3-tool-vX.Y.Z-windows-x64.zip`，解壓到（例如）`C:\Tools\YT-MP3`。
2. 到 Google Cloud Console 申請自己的 OAuth 憑證，下載命名為 `client_secret.json` 放到 exe 同目錄。
3. 雙擊 `yt-mp3-tool.exe`，完成 Google 授權。

> **不需要** Python / Node / ffmpeg / `gh` / GitHub 帳號。

---

## 日常更新

```powershell
C:\Tools\YT-MP3\update.bat
```

這個 script 會：
1. 查最新 release tag（公開 GitHub API，**不需登入、不需 gh**）
2. 比對 `_internal\_version.txt`，已是最新就 exit
3. 否則：下載新版 → 殺掉執行中的 yt-mp3-tool.exe → 解壓覆蓋 → 重啟

`%USERPROFILE%\.yt-mp3-tool\` 內的設定檔、token、與 `client_secret.json`（在安裝目錄）
與下載目錄**永遠不會被動到**（robocopy 只覆蓋安裝目錄內的程式檔）。

可以在 PC 上做個排程每週跑一次。

---

## 使用者資料位置 / 備份

| 路徑 | 內容 | 備份建議 |
|-----|-----|---------|
| `<安裝目錄>\client_secret.json` | 你的 Google OAuth 憑證 | 可重新從 GCP 下載；備份省事 |
| `%USERPROFILE%\.yt-mp3-tool\settings.json` | 你的偏好設定 | 偶爾備份；可重建 |
| `%USERPROFILE%\.yt-mp3-tool\token.json` | Google OAuth token | 不必備份（過期自動刷新；最差重新授權） |
| 設定中的 `output_path`（預設 `C:\YT-MP3\`） | 下載的 MP3 | 想保留的話自己備份 |

備份指令（複製到 D:\backup\）：
```powershell
Copy-Item "$env:USERPROFILE\.yt-mp3-tool" -Destination "D:\backup\yt-mp3-tool-config" -Recurse -Force
```

---

## Rollback：退回舊版本

新版有 bug 想退回時，到 releases 頁下載特定版本的 zip 覆蓋安裝：

```powershell
cd C:\Tools\YT-MP3
taskkill /F /IM yt-mp3-tool.exe
# 把下載的舊版 zip 解壓覆蓋
Expand-Archive -Path "yt-mp3-tool-vX.Y.Z-windows-x64.zip" -DestinationPath . -Force
.\yt-mp3-tool.exe
```

---

## 常見問題

### Q: `update.bat` 抓不到最新版 / 顯示查詢失敗
A: 檢查網路；確認 repo 已公開且該 release 有 `*windows-x64.zip` asset。
   在瀏覽器開 `https://github.com/<REPO>/releases/latest` 應該看得到。

### Q: Defender 警告
A: 沒有 code-signing 憑證（自用工具不值得每年的費用），第一次跑會被警告。
   把安裝資料夾加進 Defender 排除清單最省事。

### Q: 我把 install 目錄改到別處 / fork 到自己帳號
A: 設使用者環境變數：
```powershell
[Environment]::SetEnvironmentVariable("INSTALL_DIR", "D:\Apps\YT-MP3", "User")
[Environment]::SetEnvironmentVariable("REPO", "youruser/yt-mp3-tool", "User")
```
新 terminal 視窗的 `update.bat` 就會用新位置 / 新 repo。

### Q: 登入時「找不到 client_secret.json」
A: 憑證必須跟 `yt-mp3-tool.exe` 同目錄、檔名正好 `client_secret.json`。見 SELF-HOST-SETUP.md。
