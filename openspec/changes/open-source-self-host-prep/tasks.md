## 1. 移除個人憑證打包（self-host-packaging）

- [x] 1.1 `scripts/build.bat`：移除第 5 步複製 `tools/client_secret.json` 進 bundle 的那行
- [x] 1.2 `scripts/build.bat`：第 2 步必備檔檢查移除 `client_secret.json`（缺它不應使 build 失敗；ffmpeg/mp3gain 仍必備）
- [x] 1.3 `.github/workflows/release.yml`：移除從 secret 還原 / 寫入 `client_secret.json` 到 `tools/` 的步驟
- [x] 1.4 `build.bat` 末尾加一道防呆檢查：產出的 zip 內若含 `client_secret.json` 則 build 失敗（5b 段，檢查 bundle）
- [x] 1.5 靜態 dry-run 驗證：grep 確認 build/CI 無 client_secret 殘留（僅註解與防呆）；完整 pyinstaller build 留待 release tag 由 CI 跑

## 2. 缺憑證的執行期中文引導（self-host-packaging）

- [x] 2.1 `backend/main.py`：`_find_client_secret()` 回 None 時的登入錯誤訊息改為繁中、指向 docs/SELF-HOST-SETUP.md 與「放到 exe 同目錄」
- [ ] 2.2 手動驗證：移走 `client_secret.json` 啟動 → 嘗試登入 → 看到引導訊息（併入 Group 7）

## 3. update.bat 改 URL 下載（self-host-updater）

- [x] 3.1 `scripts/update.bat`：改用 releases API + `Invoke-WebRequest`。**混合認證**：有 token（GH_TOKEN 或 gh）→ 帶認證走 asset API endpoint（私有可更新）；無 token → 匿名 browser_download_url（公開免登入）。gh 為選用、非必要
- [x] 3.2 保留 `REPO` 環境變數覆寫、`_version.txt` 版本比對、「殺進程→解壓覆蓋→重啟」流程
- [x] 3.3 確認更新流程不覆蓋 `%USERPROFILE%\.yt-mp3-tool\` 與下載目錄（robocopy 僅覆蓋 INSTALL_DIR，未觸及使用者資料目錄）
- [x] 3.4 確認 release asset 命名（實測 `yt-mp3-tool-v0.17.0-windows-x64.zip` 符合 `*windows-x64.zip`）與下載 URL 樣式相容
- [x] 3.5 端到端驗證：token 路徑對私有 repo 查詢回正確 asset endpoint + 認證下載**實測抓下 111.9MB 合法 zip（PK）**；匿名路徑對私有回 404（預期，公開後通）。token 不經 batch 傳遞

## 4. 第三方授權與專案 LICENSE（open-source-repo-hygiene + self-host-packaging）

- [x] 4.1 新增 `THIRD-PARTY-NOTICES.txt`（ffmpeg/mp3gain GPL 條款 + 原始碼來源連結）
- [x] 4.2 `scripts/build.bat`：第 5 步改為複製 `THIRD-PARTY-NOTICES.txt` 進 bundle（缺檔則 build 失敗）
- [x] 4.3 新增根目錄 `LICENSE`（MIT，2026 Danny）
- [x] 4.4 `README.md` 加入 YouTube ToS 免責聲明（僅供個人使用 / 風險自負）

## 5. 繁中自架安裝文件（self-host-setup-docs）

- [x] 5.1 新增繁中自架安裝指南 `docs/SELF-HOST-SETUP.md`：下載 zip → 放 client_secret → 啟動 → 授權完整路徑（ffmpeg 已內建免裝）
- [x] 5.2 GCP 章節：建立專案、啟用 YouTube Data API v3、Drive API 為選用
- [x] 5.3 OAuth 同意畫面章節：發布到「正式」避免 7 天過期；「未驗證」警告為正常並教如何通過
- [x] 5.4 建立 Desktop App 憑證、下載命名為 `client_secret.json` 放 exe 同目錄
- [x] 5.5 scope/權限說明（youtube / drive.file / email 各自用途）
- [x] 5.6 更新 `README.md`、`docs/DEPLOY.md`、`docs/README-DEPLOY.md` 對齊「自架者自帶憑證 + URL 更新」，移除 gh auth 假設

## 6. 開源衛生決策與稽核（open-source-repo-hygiene）

- [x] 6.1 決定已定：`.claude/`、`openspec/` 開發史、內部 `docs/` 筆記**全部保留**；保留內容已稽核無密鑰。例外處理完成：`.claude/settings.local.json`（會洩漏使用者名稱/絕對路徑）已 `git rm --cached` 脫離追蹤並加入 `.gitignore`，本機檔案保留。
- [x] 6.2 密鑰稽核完成：整個 history 不含真實 secret（`GOCSPX-` 0 命中）、`client_secret.json`/`token.json` 從未被追蹤；`settings.local.json` 內無密鑰
- [x] 6.3 確認 `.gitignore` 持續涵蓋 `client_secret.json`（含 backend/）、`**/token.json`、`*.env`

## 7. 驗收

- [ ] 7.1 ⏳ 人工驗收（需真實 Google 帳號 + 乾淨機器）：依 SELF-HOST-SETUP.md 走全流程，成功授權並下載一首 MP3。留待 repo 公開、發第一個開源 release 後執行。
- [x] 7.2 邏輯驗證：build.bat 已不複製 client_secret + 5b 防呆（混入即 build 失敗）；ffmpeg/mp3gain/THIRD-PARTY-NOTICES 均 stage。實體 zip 內容由 CI build 最終確認。
- [x] 7.3 端到端驗證：update.bat 混合認證——token 路徑（私有過渡期）查詢+下載實測通過（111.9MB PK zip）；匿名路徑（公開後）查詢/解析機制已驗。無 gh 環境的匿名實跑留待公開後 7.1 一併驗。
- [x] 7.4 main.py py_compile 通過；LICENSE/THIRD-PARTY-NOTICES.txt/docs 檔案存在性確認。
