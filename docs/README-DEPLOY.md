# YT-MP3 Tool — 安裝在這台 PC 上的小抄

## 啟動
雙擊 `yt-mp3-tool.exe`，瀏覽器會自動開到 http://localhost:8000/

## 更新
跑這個資料夾裡的 `update.bat`（前提：本機已 `gh auth login`）。

## 完整文件
請看 GitHub repo 上的 `docs/DEPLOY.md`。

## 你的資料在哪裡
- 設定：`%USERPROFILE%\.yt-mp3-tool\settings.json`
- Token：`%USERPROFILE%\.yt-mp3-tool\token.json`
- MP3 下載目錄：見設定中的 `output_path`（預設 `C:\YT-MP3\`）

更新時這些路徑**永遠不會被動到**。
