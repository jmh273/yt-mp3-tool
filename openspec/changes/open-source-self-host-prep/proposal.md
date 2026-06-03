## Why

這個工具目前是「自用」散布模型：release zip 內含開發者個人的 `client_secret.json`，`update.bat` 依賴開發者自己 `gh auth login` 的 GitHub 帳號。這讓跨自己機器零設定，但**無法公開**——任何下載者都會共用開發者的 OAuth 配額池、撞上同意畫面 100 名測試者上限，且更新流程綁死開發者的 gh 登入。我們要把它開源讓別人自架，因此需要先把這些「綁在開發者身上」的部分拆掉，並補齊自架者自己設定 GCP 所需的中文文件與授權合規，才能安全地把 repo 與 release 轉為公開。

## What Changes

- **BREAKING**：公開 release zip 與 CI 流程**不再內含 `client_secret.json`**；改由自架者自行申請 GCP 憑證並放到 exe 同目錄。`ffmpeg.exe` / `mp3gain.exe` 維持內建打包不變。
- **BREAKING**：`update.bat` 從 `gh` CLI（需 `gh auth login`）改為直接以**公開 release 下載網址**抓最新 zip，自架者不需登入 GitHub、不需安裝 gh。
- 缺少 `client_secret.json` 時的啟動行為，從現有的純錯誤訊息，升級為**引導自架者去設定 GCP 的中文指引**（指向安裝文件）。
- 新增**繁體中文自架安裝文件**，涵蓋：建立 GCP 專案、啟用 YouTube Data API v3（與選用的 Drive API）、設定 OAuth 同意畫面（含發布到「正式」以避免測試模式 7 天 token 過期、「未驗證應用程式」警告為正常之說明）、建立 Desktop App 憑證、下載 `client_secret.json` 放到 exe 同目錄、所需 scope 與權限說明。
- 新增 **LICENSE**、第三方授權聲明（ffmpeg / mp3gain 為 GPL，附原始碼取得方式與授權條款）、以及 **YouTube ToS 免責聲明**（僅供個人使用、風險自負）。
- **開源衛生決策**：明確界定公開 repo 要保留 / 移除哪些內容（`.claude/`、`openspec/` 開發史、`docs/` 內部筆記），避免外洩工作流或造成混亂。

## Capabilities

### New Capabilities
- `self-host-packaging`: 公開可散布的 release 構成規則——排除個人 `client_secret.json`、內建 ffmpeg/mp3gain、隨附第三方授權聲明；以及缺憑證時的執行期中文引導行為。
- `self-host-updater`: 不依賴 gh、以公開 release 下載網址運作的 `update.bat` 更新流程，並保證使用者資料目錄不被覆蓋。
- `self-host-setup-docs`: 繁體中文自架安裝指南，完整涵蓋 GCP 申請、API 啟用、OAuth 同意畫面與憑證設定步驟。
- `open-source-repo-hygiene`: 公開 repo 的授權（LICENSE）、第三方聲明、ToS 免責，以及內部檔案的去留規則。

### Modified Capabilities
<!-- 既有主 specs 中沒有 packaging / oauth / updater 相關 capability（皆仍在 archive 未 sync），因此本 change 全部以新 capability 處理，無修改既有需求。 -->

## Impact

- **建置**：`scripts/build.bat`（第 5 步 stage extras 移除 client_secret 複製）、`.github/workflows/release.yml`（移除注入 client_secret 的步驟、新增第三方授權檔案）。
- **更新器**：`scripts/update.bat` 與 release 內附的 `update.bat`（改為 URL 下載，移除 gh 依賴）。
- **執行期**：`backend/main.py`（`_find_client_secret` 缺檔時的引導訊息）。
- **文件**：新增繁中安裝文件（`docs/`）、`LICENSE`、`THIRD-PARTY-NOTICES`；更新 `README.md`、`docs/DEPLOY.md`、`docs/README-DEPLOY.md` 以對齊自架模型。
- **Repo 內容**：依衛生決策決定 `.claude/`、`openspec/`、內部 `docs/` 在公開 repo 的去留。
- **外部依賴/合規**：YouTube Data API（自架者自帶專案配額）、ffmpeg/mp3gain GPL 合規、YouTube ToS 免責。
