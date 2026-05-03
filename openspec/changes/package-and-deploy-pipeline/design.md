## Context

工具現在的執行模型：開發者 / 使用者要同時跑兩個 process — `uvicorn` (port 8000) 跑 FastAPI 後端、`npm run dev` (port 5173) 跑 Vite dev server。這個模型對「在 VMware 內開發」很 OK，但對「想把它丟到另一台 Windows 雙擊就能用」完全不行。

加上前面 `mp3gain` 引擎的引入，runtime 依賴增加了：Python ≥ 3.10 + Node ≥ 18 + ffmpeg (PATH) + mp3gain (PATH) + 7 個 pip 套件 + 數百個 npm 套件。在裸機上重現這個環境的失敗率不低（Python 版本、ffmpeg build、mp3gain 是否在 PATH 等等）。

使用情境縮窄成「3 台自己的 Windows、私有 GitHub repo、CI 自動 build、手動觸發 update」之後，技術選擇就明確了：PyInstaller + Actions + 私有 release。剩下都是把細節做對。

## Goals / Non-Goals

**Goals:**
- 一個 zip 解壓後不需要安裝 Python / Node / ffmpeg / mp3gain，雙擊 exe 就跑
- 開發流程完全不退化（`npm run dev` + `uvicorn --reload` 仍然能用，會繼續是日常 iteration 路徑）
- Update 流程：在目標 PC 上「跑一個 .bat」就拉到最新穩定版，不會弄丟使用者設定 / token / 下載歷史
- CI build 在乾淨 Windows runner 上跑，避免「我的 VM 能 build、別台不能」這種隱性依賴
- 版號可見性：使用者看 UI 角落就知道「我這台是 v0.5.2、最新是 v0.5.3」

**Non-Goals:**
- 跨平台（macOS / Linux）— 只 Windows
- 自動更新 / in-app 更新提示 — 手動觸發夠了
- 公開分發 — 私有 repo，不對外
- Code-signing 憑證 — 自己用，Defender 報錯就 dismiss
- 多使用者 / multi-tenant — 單一使用者
- Docker 化 — 不適合這個 use case

## Decisions

### Decision 1: PyInstaller（不選 Nuitka / py2exe / Tauri sidecar）

**選擇**：PyInstaller，`onedir` 模式（不是 `onefile`）。

**為什麼 PyInstaller**：成熟、文件多、跟 FastAPI / yt-dlp / google-api-python-client 都有現成的相容性。Nuitka 編譯較快但對動態 import 的處理常出 bug；py2exe 已經半棄；Tauri sidecar 需要學 Rust + Tauri，目標只是包個 exe 不值得。

**為什麼 onedir 不選 onefile**：onefile 啟動時要把 80MB+ 解壓到 temp 目錄，第一次啟動明顯卡 5–10 秒；onedir 啟動快、debug 容易（exe 旁邊就是 `_internal/`），缺點只是「資料夾裡檔案多、看起來不漂亮」— 我們是 zip 分發，使用者只看到一個資料夾，無感。

### Decision 2: 前端 build 產物由 FastAPI 直接 serve（不另開 nginx / Vite preview）

**選擇**：build 時把 `frontend/dist/` 的內容拷貝到 backend 打包目錄下的 `static/`，後端啟動時：

```python
static_dir = _resource_path("static")
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="spa")
```

`html=True` 讓 SPA 路由 fallback 到 `index.html`。

**為什麼不另起 nginx**：多一個 process、多一份設定，使用者得多裝 nginx — 違背「解壓即用」目標。

**為什麼條件 mount**：dev 環境沒有 `static/` 資料夾，不 mount 就讓 Vite dev server 繼續用 (port 5173 → 5173 連 8000 透過 proxy)。同一份程式碼跑兩種模式。

### Decision 3: ffmpeg / mp3gain 隔壁放，啟動時注入 PATH（不依賴系統 PATH）

**選擇**：

```python
def _setup_bundled_path():
    if getattr(sys, "frozen", False):  # PyInstaller bundle
        bundle_dir = pathlib.Path(sys.executable).parent
        os.environ["PATH"] = f"{bundle_dir}{os.pathsep}{os.environ.get('PATH', '')}"
```

build.bat 把 `ffmpeg.exe` / `mp3gain.exe` 拷到 exe 同目錄。

**為什麼**：使用機不必動系統 PATH（需要 admin 或開新 terminal 重新讀 env）。`shutil.which("ffmpeg")` 會優先找 exe 同目錄那兩個，跟 dev 環境的「裝在系統 PATH」邏輯統一。

**邊界**：如果使用機本來就有裝（系統 PATH 上）會優先用 bundle 裡的（因為塞在 `os.environ["PATH"]` 開頭）— 這是想要的行為（避免版本不一致）。

### Decision 4: 私有 repo + GH Actions + `gh release create`

**選擇**：repo 私有；`.github/workflows/release.yml` 在 tag `v*` 推送時觸發；用 GitHub-hosted `windows-latest` runner；產物用 `gh release create` upload 為 release asset。

**為什麼私有**：（1）避免 OAuth client_secret 公開外流（Google quota 安全 + 不被 abuse detector 鎖）。（2）YT-DL 類工具本來就在 YouTube 的 watch list，私有降低 takedown 風險。（3）使用者只有自己 3 台 PC，不需要公開可見。

**為什麼 GH Actions 不 local build**：CI runner 是乾淨 Windows，會把「只在我的 dev VM 才有的隱性依賴」逼出來。發版頻率本來就低（手動觸發 update），多等 5 分鐘 build 無感。

**Release artifact 內容**：
```
yt-mp3-tool-v0.5.0-windows-x64.zip
├── yt-mp3-tool.exe                  ← PyInstaller onedir 主執行檔
├── _internal/                       ← PyInstaller 依賴
├── static/                          ← 前端 SPA build 產物
├── ffmpeg.exe                       ← 完整 build, ~80MB
├── mp3gain.exe                      ← ~600KB
├── client_secret.json               ← OAuth credentials（私有 repo 才能塞）
├── update.bat                       ← 目標 PC 的更新腳本
├── README-DEPLOY.md                 ← 第一次安裝指引
└── _version.txt                     ← v0.5.0
```

預估總大小 ~120 MB（80 MB ffmpeg + 30 MB Python+deps + 10 MB 其他）。

### Decision 5: Update 用 PowerShell `Invoke-WebRequest` + GitHub API（不要求 `gh` CLI）

**選擇**：`update.bat` 內呼 PowerShell：

```powershell
$headers = @{ Authorization = "token $env:GH_TOKEN"; Accept = "application/vnd.github+json" }
$rel = Invoke-RestMethod "https://api.github.com/repos/<owner>/<repo>/releases/latest" -Headers $headers
$asset = $rel.assets | Where-Object { $_.name -match 'windows-x64\.zip$' }
Invoke-WebRequest $asset.url -Headers ($headers + @{ Accept = "application/octet-stream" }) -OutFile $tmp
```

**為什麼不用 `gh` CLI**：Windows PowerShell 內建，目標 PC 不必額外裝任何工具。`gh` 雖然好用但又一個依賴。

**驗證**：`update.bat` 比對 `_version.txt` 跟 release tag，若一致直接退出（避免重複下載 120 MB）。

### Decision 6: User data 在 `~/.yt-mp3-tool/`，update 絕不碰

**選擇**：維持現有路徑 `pathlib.Path.home() / ".yt-mp3-tool"`。`update.bat` 只解壓 / 覆蓋 install 目錄（預設 `C:\Tools\YT-MP3\`），不接近 home dir。

**`client_secret.json` 的雙位置處理**：
1. 第一順位：install dir 的 `client_secret.json`（從 release 帶來）
2. 第二順位：`backend/client_secret.json`（dev 環境）

兩個位置邏輯由 `CLIENT_SECRET_FILE` 那邊用 `_resource_path` 統一處理。

**為什麼不存到 user dir**：`client_secret.json` 是「程式設定」性質（綁 OAuth client），不是 per-user 資料，跟著 install 走比較合理。

### Decision 7: 寬容讀 settings — 超範圍 / 型別不符 → reset 預設值

**選擇**：

```python
def load_settings() -> dict:
    raw = json.loads(SETTINGS_FILE.read_text()) if SETTINGS_FILE.exists() else {}
    merged = {**DEFAULT_SETTINGS, **raw}
    # 對所有有範圍限制的欄位做寬容檢查
    if not (1 <= merged.get("latest_hours", 24) <= 168):
        merged["latest_hours"] = DEFAULT_SETTINGS["latest_hours"]
    if not (80.0 <= merged.get("normalize_target_db", 89.0) <= 100.0):
        merged["normalize_target_db"] = DEFAULT_SETTINGS["normalize_target_db"]
    # ... 其他欄位
    return merged
```

**為什麼**：先前我們把 `normalize_target_db` 從 `LUFS -14`（範圍 -30..0）改成 `dB SPL 89`（範圍 80..100）。如果直接 deploy 新版到舊機器，`load_settings()` 讀到 `-14` → 後端不會 422（這是讀檔，不是 PUT），但前端 UI 顯示 -14 → 使用者按儲存 → 422 失敗。寬容讀法讓 deploy 順利。

**為什麼不做完整 schema migration**：只 3 台自用機、schema 演化頻率不高、reset 到預設值的後果輕（使用者自己再調回去就好）。等遇到「reset 會弄丟重要資料」的欄位再升級成 versioned migration。

### Decision 8: 版號從單一來源 `_version.txt`

**選擇**：

- Build：`build.bat` 從 git tag 寫 `backend/_version.txt`（內容 e.g. `0.5.0`）
- Runtime：`__version__ = (resource_path("_version.txt")).read_text().strip()` — bundle 內以及 dev 環境（可選擇性留個 dev 版號 `0.0.0-dev`）
- 前端：`GET /version` 回 `{"version": __version__}`，UI header 顯示 `v0.5.0`
- update.bat：比對 install dir 的 `_version.txt` 跟 release tag

**為什麼單一來源**：避免「`pyproject.toml` 寫 0.5.0 / setup.py 寫 0.4.9 / git tag v0.5.1」這種版號漂移。`_version.txt` 是 build 時寫入、runtime 讀取，CI 是唯一寫入點。

## Risks / Trade-offs

- **Windows Defender 對 PyInstaller exe 誤報** → 第一次跑可能被 quarantine。Mitigation：DEPLOY.md 教使用者把 install dir 加 exclusion；不打算花錢買 code-signing 憑證（自用 3 台 PC 不值得）。
- **`client_secret.json` 在 release zip 裡** → 私有 repo + 私有 release 是底線；GH_TOKEN 流出等於 secret 流出。Mitigation：用 fine-grained PAT（只這個 repo、只 contents:read）；GH_TOKEN 文件要求設成 user 環境變數（不寫進 update.bat）。
- **Python runtime 升級導致 PyInstaller 行為改變** → CI runner 用固定 Python 版本（`actions/setup-python@v5` with `python-version: '3.12'`），鎖死避免飄。
- **release zip ~120 MB** → 私有 release 下載要 GH_TOKEN auth；使用者只在「真的有更新」才跑 update.bat（_version.txt 比對提早退出），實際傳輸頻率低。
- **目標 PC 沒網路 / GitHub 不可達** → update.bat 失敗、現有版本繼續用、不會壞掉。Mitigation：明確錯誤訊息 + 教學文件提到 fallback 是「USB 拷 zip 過去手動解壓」。
- **VMware build vs CI build 不一致** → 全面遷到 CI build；local build.bat 仍可跑（debugging 用）但「正式 release 一律 CI」寫進 DEPLOY.md。
- **`StaticFiles(html=True)` 跟 `/api/*` route 順序** → FastAPI 的 mount 是 last-resort，所有 `@app.get/post` 會優先匹配；理論安全，但要寫個 smoke test 驗 SPA fallback 不會吞掉 `/settings` 之類的路由。
