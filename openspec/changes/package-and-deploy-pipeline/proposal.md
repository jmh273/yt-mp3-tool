## Why

目前要把這個工具裝到另一台電腦得：裝 Python 3.10+、裝 Node.js、裝 ffmpeg、裝 mp3gain、`pip install -r requirements.txt`、`npm install`、`npm run dev` + `uvicorn`、複製 `client_secret.json`。對「自己另外兩台 Windows」來說這個 onboarding 不合理 — 既不耐久（Python/Node 升級會壞東西）也耗時。改進後想做到「解壓一個 zip → 雙擊 → 開始用」。

更核心的是要把**「持續開發」與「部署到使用機」這兩件事的 workflow 切乾淨**：開發在 VMware 裡照舊用 `npm run dev` + `uvicorn --reload`；穩定後打 git tag → CI 自動產 release zip → 三台目標 PC 跑 `update.bat` 拉新版蓋程式檔。使用者資料（`~/.yt-mp3-tool/settings.json`、`token.json`、下載目錄）絕對不會被 update 動到。

## What Changes

- 把後端改成可以以 PyInstaller 打包的單一 exe，啟動時自動把同目錄的 `ffmpeg.exe` / `mp3gain.exe` 加進 `os.environ["PATH"]`，省掉「使用機要把 ffmpeg/mp3gain 加進系統 PATH」的步驟。
- FastAPI 加 `StaticFiles` mount，讓單一後端 process 同時 serve `/api/*` 和預先 build 的 SPA — 部署時不再需要 Vite dev server。
- 新增 `__version__`（從打包時寫入的 `_version.txt` 讀），並暴露 `GET /version`，前端在角落顯示，方便目視知道哪台 PC 是哪一版。
- `load_settings()` 加寬容讀法：超出新範圍 / 型別不符的舊欄位自動回退到預設值（避免 schema 演化把舊機器的啟動弄壞）。
- 加 `scripts/build.bat`：清乾淨 → `npm run build` → 拷貝 `dist/` 到 backend/static → PyInstaller → 把 ffmpeg.exe / mp3gain.exe / client_secret.json / `update.bat` / README 一起 zip 起來。
- 加 `.github/workflows/release.yml`：tag 推到 GitHub 時，Windows runner 跑 `build.bat` → 用 `gh release create` 把 zip upload 為 release asset。
- 加 `scripts/update.bat`（拷到目標 PC 用）：用 `gh` 或 `Invoke-WebRequest` 從**私有** release 拉 zip → 停止背景程式 → 解壓覆蓋 → 重啟。需要使用者環境變數 `GH_TOKEN`（每台 PC 一次性設定）。
- 加 `docs/DEPLOY.md`：第一次裝一台新 PC 的步驟（裝 GH PAT、解壓初始版、之後都用 update.bat）。
- 不動：所有現有功能（下載 / 正規化 / 重新命名）、開發流程（`npm run dev` + `uvicorn --reload` 仍 100% 可用）、user data 路徑。

## Capabilities

### New Capabilities
- `app-packaging-and-deployment`: 把 Python 後端 + Vue 前端 + native binaries 打包為 Windows zip release、透過 GitHub Actions 在 tag 推送時自動 build、目標 PC 用 update 腳本從私有 release 拉新版覆蓋程式檔且不影響使用者資料。

### Modified Capabilities
<!-- 無：mp3-volume-normalization 與 sidebar-layout / latest-videos-feed 的需求都不變；只是它們依賴的 process 從 dev mode (uvicorn + vite) 變成 bundled exe (uvicorn + StaticFiles)。 -->

## Impact

- **後端** ([backend/main.py](backend/main.py))：
  - 新增 `_setup_bundled_path()` 把 `sys.executable` 同目錄塞進 `os.environ["PATH"]`（PyInstaller 環境）或 fallback 到原本行為（dev 環境）
  - 新增 `__version__` / `GET /version`
  - `load_settings()` 寬容讀法（超範圍值 reset、未知 key 保留）
  - 新增 `app.mount("/", StaticFiles(directory=..., html=True))` serve 前端 SPA（exists 才掛，不存在就不掛 — dev 環境不影響）
  - `CLIENT_SECRET_FILE` 改用 `_resource_path("client_secret.json")` helper（PyInstaller 下找 exe 同目錄；dev 下找 backend/）
- **前端** ([frontend/src/](frontend/src/))：
  - 角落（HomeView header 旁）顯示 `v{__version__}`，從 `GET /version` 讀
  - build 產物 (`frontend/dist/`) 由 `build.bat` 拷貝到後端打包路徑
- **新檔案**：
  - `scripts/build.bat`、`yt-mp3-tool.spec`（PyInstaller 設定）
  - `scripts/update.bat`（目標 PC 用）
  - `.github/workflows/release.yml`
  - `docs/DEPLOY.md`
- **新依賴**：`pyinstaller`（dev only，不進 runtime requirements）
- **Repo 設定**：repo 必須改為私有（已決定）；release artifact 包含 `client_secret.json`（私有 repo 內容）
- **目標 PC 一次性設定**：環境變數 `GH_TOKEN` = fine-grained PAT（這個 repo 的 `contents: read`）
- **不影響**：開發流程不變、所有既有測試不變、API 形狀不變
