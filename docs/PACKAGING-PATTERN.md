# 封裝／佈署模式：單機 Windows 自帶執行檔（私有發佈、自己多台電腦可安裝）

> 這是一份可複用的「打包 + 佈署」模式說明，供其它專案的 AI 照著實作。
> 以 `yt-mp3-tool`（Python FastAPI 後端 + Vue SPA 前端）為具體範例，
> 各專案要換掉的部分在文末「要換掉的東西」列出。
>
> 情境：**不對外公開，但作者自己的多台電腦要能安裝／升級。**

---

## 1. 核心理念

- **單一版本事實來源 = git tag。**
  版本號不寫死在程式裡；打包時由 `git describe --tags` 取得、寫進一個 `_version.txt`，
  執行檔啟動時讀它。程式裡只有 `__version__ = read("_version.txt")`，其餘（前端顯示、
  `/version` API、健康檢查）全部引用它。→ 永遠不會「程式碼版本」與「發佈版本」不一致。

- **後端同時當 API 與靜態站台。**
  前端 build 成 SPA 後塞進後端的 `static/`，由後端框架的 StaticFiles 掛在最後一個 route
  （所有非 API 路徑回 `index.html`）。使用者只開一個埠（例：`127.0.0.1:8000`），
  不必分別跑前後端。

- **一鍵可執行（免安裝的可攜式 bundle）。**
  用 PyInstaller 把後端打成 **onedir** 執行檔（`app.exe` + `_internal/`）。進入點是一個小
  `__main__.py`：啟動 web server，並（可選）開瀏覽器指向本機埠。外部工具（如 `ffmpeg.exe`）
  以檔案並排在執行檔旁，程式用一個 `resource_path()` helper 同時支援「開發模式（原始碼旁）」
  與「凍結模式（bundle 內／exe 旁）」。解壓即用、不寫登錄檔。

---

## 2. 打包腳本（`scripts/build.bat`，六步）

1. **算版本**：優先讀環境變數 `VERSION`（CI 傳 tag），否則 `git describe --tags --abbrev=0`；
   去掉開頭的 `v`；寫入 `backend/_version.txt`。
2. **檢查必要外部工具**存在（例：`tools/ffmpeg.exe`）；缺就中止。
3. **build 前端**：`npm ci && npm run build-only`（**刻意跳過 type-check**，避免測試檔型別問題
   擋住產出；type-check 交給 CI 的測試步驟），再把 `frontend/dist` 複製到 `backend/static/`。
4. **PyInstaller**：用一份 `.spec` 打包。`datas` 內含 `_version.txt` 與整個 `static/`；
   `hiddenimports` 補上會被動態 import 的套件（如 yt_dlp 的 extractor、googleapiclient）。
5. **搬入附屬檔**到 bundle：外部工具、第三方授權聲明、更新腳本、離線設定說明文件。
6. **壓成 zip**：`dist/<app>-v<VERSION>-windows-x64.zip`。

`.spec` 重點（onedir）：進入點指向 `__main__.py`；`datas` 帶 `_version.txt` 與 `static/`；
`console=True` 保留主控台以顯示 server log；`COLLECT` 產出 `dist/<app>/`。

---

## 3. CI 觸發（`.github/workflows/release.yml`）

- **觸發**：push 一個符合 `v*` 的 tag。`checkout` 要 `fetch-depth: 0`（build 要讀 git tag）。
- **步驟**：setup Python/Node → 裝相依 → 快取／下載外部工具（例：ffmpeg 用「年-月」當 cache key
  抓最新、mp3gain 用 winget）→ 跑 `build.bat`（傳 `VERSION: ${{ github.ref_name }}`）→
  **煙霧測試**（`app.exe --health-check` 印出的版本必須等於 tag 去掉 v）→ 發佈。
- **開發者只需**：`git tag vX.Y.Z && git push origin vX.Y.Z`，其餘全自動。
  **不要**手動在本機跑 build，也不要手動建 release。

---

## 4. ★ 私有發佈，但自己多台電腦可安裝

**關鍵：把 repo 設為 private，就等於「不對外」——private repo 的 GitHub Release 只有你
（有 repo 權限的帳號）看得到、下得到，大眾看不到。所以不必拿掉 `gh release create`，
照樣用 tag 觸發 CI 自動 build + 建 release，只是這個 release 是私有的。**

為什麼用 Release 而不是 CI artifact：artifact 會**過期**、每次要進該次 workflow run 頁面翻找、
URL 不固定；Release **有固定 URL、不會過期、可用指令下載**，適合「隔陣子到另一台電腦重裝」。

### 一次性設定
1. GitHub repo → Settings → 改為 **Private**。
2. workflow 保留 `gh release create` 那步、保留 `permissions: contents: write`、
   保留 `on: push: tags: ['v*']`。
3.（可選更保守）第一次先發草稿自己確認：
   `gh release create <tag> dist/*.zip --draft`，看過再在 release 頁按 Publish。

### 在「另一台電腦」安裝
每台機器登入一次，之後每次升版只重抓 zip：
1. 裝 GitHub CLI 並登入：`winget install GitHub.cli` → `gh auth login`（用有 repo 權限的帳號）。
2. 抓指定版本：
   ```
   gh release download v0.21.0 --repo <你的帳號>/<專案> --pattern "*.zip" --dir .
   ```
   （或瀏覽器登入 → 進 repo Releases 頁下載。）
3. 解壓 → 執行 `app.exe`。免安裝、解壓即用。
4. **憑證／機密**（自己的私有工具，二擇一）：
   - **不 bundle**：把 `client_secret.json`／設定檔手動放到 `app.exe` 旁（`resource_path()`
     會在 exe 旁找到）；或
   - **一起打包**（**只在 private repo 才可以**，用 CI secret 於 build 時注入、
     **別 commit 進版控**）→ 真正解壓即用。

### 升版
開發機 `git tag vX.Y.Z && git push origin vX.Y.Z` → CI 自動 build 出新的私有 release →
各台電腦重跑「安裝」第 2–3 步。可另做 `update.bat` 就地抓最新 release 覆蓋（可選）。

---

## 5. 日後要轉公開時

模式其餘部分完全不動，只改：
- repo 轉 **Public**；
- 若原本有拿掉，補回 `permissions: contents: write`；
- 憑證務必改回「**不 bundle 機密**」（build 腳本可加一道保險：偵測到 `client_secret.json`
  在 bundle 內就讓 build 失敗）；
- （可先用 `gh release create --draft` 產草稿，檢查過再 Publish。）

---

## 6. 各專案要換掉的東西

| 項目 | 本範例 | 你的專案換成 |
|------|--------|--------------|
| app 名稱 / exe 名 | `yt-mp3-tool` | … |
| 埠號 | 8000 | … |
| 進入點 | `backend/__main__.py`（uvicorn） | 你的 server 啟動檔 |
| 前端 build 指令 | `npm run build-only` → `frontend/dist` | … |
| 靜態掛載 | FastAPI StaticFiles → `backend/static` | 你的框架的等價做法 |
| 外部工具 | `ffmpeg.exe`, `mp3gain.exe` | 你的外部相依（可無） |
| `hiddenimports` | yt_dlp / googleapiclient | 你會動態 import 的套件 |
| 機密檔 | `client_secret.json` | 你的憑證（或無） |

**照抄不動的骨架**：`git tag → _version.txt → runtime` 的版本流、後端服務 SPA、
PyInstaller onedir 打包、`v*` tag 觸發 CI、private repo + `gh release create` 發私有 release、
各機 `gh release download` 取回解壓即用。
