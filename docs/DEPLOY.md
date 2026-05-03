# 部署指南（DEPLOY）

把 yt-mp3-tool 裝到一台新的 Windows PC、之後維持更新的完整步驟。

---

## 一次性：第一次安裝一台新 PC

### 1. 裝 GitHub CLI 並登入

```powershell
winget install GitHub.cli
```

安裝完後**開新的 PowerShell 視窗**（讓 PATH 更新），執行：

```powershell
gh auth login
```

依序選：
- `GitHub.com`
- `HTTPS`
- `Yes` (Authenticate Git)
- `Login with a web browser`

複製顯示的 8 位數 code，按 Enter，瀏覽器自動開啟，貼 code → Authorize → 視窗回到 PowerShell 看到 `✓ Logged in as <你的帳號>`。

### 2. 下載第一個 release

```powershell
mkdir C:\Tools\YT-MP3
cd C:\Tools\YT-MP3
gh release download --repo jmh273/yt-mp3-tool --pattern "*windows-x64.zip"
Expand-Archive -Path *.zip -DestinationPath . -Force
del *.zip
```

### 3. 啟動

雙擊 `C:\Tools\YT-MP3\yt-mp3-tool.exe`。第一次執行：
- Windows Defender 可能跳「未識別的應用程式」警告 → 點「其他資訊」→「仍要執行」
- 也可以一勞永逸：開 Defender → 病毒和威脅防護 → 管理設定 → 排除項目 → 加 `C:\Tools\YT-MP3\`
- 程式視窗保持開著（uvicorn console），瀏覽器自動跳到 `http://localhost:8000/`

### 4. 完成 Google OAuth 授權

頁面點「登入 Google」→ 完成授權流程。token 會存到 `%USERPROFILE%\.yt-mp3-tool\token.json`，下次啟動就不用再授權。

---

## 日常更新

```powershell
C:\Tools\YT-MP3\update.bat
```

這個 script 會：
1. 用你登入的 gh 查最新 release tag
2. 比對 `_version.txt`，已是最新就 exit
3. 否則：下載新版 → 殺掉執行中的 yt-mp3-tool.exe → 解壓覆蓋 → 重啟

`%USERPROFILE%\.yt-mp3-tool\` 內的設定檔、token、下載目錄**永遠不會被動到**。

可以在 PC 上做個排程或快捷鍵每週跑一次。

---

## 使用者資料位置 / 備份

| 路徑 | 內容 | 備份建議 |
|-----|-----|---------|
| `%USERPROFILE%\.yt-mp3-tool\settings.json` | 你的偏好設定 | 偶爾備份；可重建 |
| `%USERPROFILE%\.yt-mp3-tool\token.json` | Google OAuth token | 不必備份（過期會自動刷新；最差就重新授權） |
| 設定中的 `output_path`（預設 `C:\YT-MP3\`） | 下載的 MP3 | 想保留的話自己備份 |

備份指令（複製到 D:\backup\）：
```powershell
Copy-Item "$env:USERPROFILE\.yt-mp3-tool" -Destination "D:\backup\yt-mp3-tool-config" -Recurse -Force
```

---

## Rollback：退回舊版本

如果新版有 bug 想退回：

```powershell
# 列出所有 release
gh release list --repo jmh273/yt-mp3-tool

# 下載特定版本（例如 v0.5.1）
cd C:\Tools\YT-MP3
gh release download v0.5.1 --repo jmh273/yt-mp3-tool --pattern "*windows-x64.zip"

# 殺掉現在跑的、解壓覆蓋
taskkill /F /IM yt-mp3-tool.exe
Expand-Archive -Path "*.zip" -DestinationPath . -Force
del *.zip

# 重啟
.\yt-mp3-tool.exe
```

---

## 常見問題

### Q: `update.bat` 顯示「ERROR: not authenticated」
A: `gh auth login` 過期了或登錯帳號。執行 `gh auth status` 確認，必要時 `gh auth login` 重做。

### Q: `update.bat` 抓到「無法連線 GitHub」
A: 檢查網路、檢查 repo 名稱對不對（`gh repo view jmh273/yt-mp3-tool` 應該成功）。

### Q: Defender 警告
A: 我沒有 code-signing 憑證（自用工具不值得每年好幾千塊），第一次跑會被警告。把 `C:\Tools\YT-MP3\` 加進 Defender 排除清單最省事。

### Q: 我把 install 目錄改到別處
A: 設使用者環境變數：
```powershell
[Environment]::SetEnvironmentVariable("INSTALL_DIR", "D:\Apps\YT-MP3", "User")
```
新 terminal 視窗的 `update.bat` 就會用新位置。

### Q: 我想 fork 這個工具到自己的帳號
A: fork 後改 `update.bat` 頂部的 `set REPO=` 那行，或設環境變數 `set REPO=youruser/yt-mp3-tool`。
