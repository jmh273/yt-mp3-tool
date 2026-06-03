# YT-MP3 Tool — 安裝在這台 PC 上的小抄

## 第一次安裝？
請看完整自架步驟（含 Google 憑證申請）：
- repo 上的 `docs/SELF-HOST-SETUP.md`

重點：本工具需要**你自己的** `client_secret.json`（從 Google Cloud 申請），
放到本 exe 的同一個資料夾。ffmpeg / mp3gain 已內建，不用另外裝。

## 啟動
雙擊 `yt-mp3-tool.exe`，瀏覽器會自動開到 http://localhost:8000/

## 更新
跑這個資料夾裡的 `update.bat`。走公開下載網址，**不需要** GitHub 登入、不需要 gh。
（若你 fork 了自己的 repo，設環境變數 `REPO=youruser/yt-mp3-tool`。）

## 你的資料在哪裡
- 憑證：`client_secret.json`（你自己申請的，放在本 exe 同目錄）
- 設定：`%USERPROFILE%\.yt-mp3-tool\settings.json`
- Token：`%USERPROFILE%\.yt-mp3-tool\token.json`
- MP3 下載目錄：見設定中的 `output_path`（預設 `C:\YT-MP3\`）

更新時 `%USERPROFILE%\.yt-mp3-tool\` 與下載目錄**永遠不會被動到**。

## 授權條款
本工具原始碼為 MIT；隨附的 ffmpeg / mp3gain 為 GPL，詳見 `THIRD-PARTY-NOTICES.txt`。
僅供個人使用，下載 YouTube 內容的風險自負。
