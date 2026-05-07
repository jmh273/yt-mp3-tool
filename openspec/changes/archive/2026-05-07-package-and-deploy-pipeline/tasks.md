## 1. Backend: bundle-aware runtime

- [x] 1.1 Add `_setup_bundled_path()` in `backend/main.py` (called at module load, before `app = FastAPI(...)`): if `getattr(sys, "frozen", False)`, prepend `pathlib.Path(sys.executable).parent` to `os.environ["PATH"]`
- [x] 1.2 Add `_resource_path(name: str) -> pathlib.Path` helper: returns `pathlib.Path(sys.executable).parent / name` when frozen, else `pathlib.Path(__file__).parent / name`
- [x] 1.3 Refactor `CLIENT_SECRET_FILE` to use a function `_find_client_secret() -> pathlib.Path | None` that checks `_resource_path("client_secret.json")` first, then `pathlib.Path(__file__).parent / "client_secret.json"`; returns first existing or `None`. Update `auth_login` to handle the `None` case with a clearer 500 message
- [x] 1.4 Add `static/` SPA mount: in `lifespan`/post-app-creation, do `static_dir = _resource_path("static")` then `if static_dir.exists(): app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="spa")` — must be after all `@app.get/post` route registrations so it's last-resort

## 2. Backend: version + tolerant settings

- [x] 2.1 Add `__version__` loaded from `_resource_path("_version.txt")` (strip whitespace); fallback `"0.0.0-dev"` if missing
- [x] 2.2 Add route `GET /version` returning `{"version": __version__}`
- [x] 2.3 Refactor `load_settings()` into a tolerant version that, after the existing default-merge, validates each range-bounded key (`videos_per_channel` 1–20, `latest_hours` 1–168, `min_duration_minutes` ≥ 0, `max_duration_minutes` ≥ 1, `normalize_target_db` 80–100); on out-of-range or wrong-type, reset that single key to `DEFAULT_SETTINGS[key]`. Preserve unknown keys in the returned dict.
- [x] 2.4 Tests in `tests/test_settings.py`: legacy `normalize_target_db: -14.0` → reset to `89.0` on load (no raise); string in numeric field → reset; unknown key preserved; in-range value passed through

## 3. Frontend: version display

- [x] 3.1 In `views/HomeView.vue` header, add `<span class="version">v{{ version }}</span>` next to the app title
- [x] 3.2 Fetch version from `GET /version` on mount; default to empty string until loaded so UI doesn't flash `vundefined`
- [x] 3.3 Add minimal CSS — small, muted, doesn't crowd the title
- [ ] 3.4 (Optional) Settings page also shows version near the back button — same source — **skipped**: header version on home page is enough; settings page entry already shows the version because users go through home first

## 4. Build pipeline (local)

- [x] 4.1 Add `pyinstaller` to a new `backend/requirements-dev.txt` (NOT `requirements.txt`)
- [x] 4.2 Create `yt-mp3-tool.spec` (PyInstaller spec file): `onedir` mode, entry = `backend/main.py` wrapper or a small `backend/__main__.py` that calls `uvicorn.run(app, host="127.0.0.1", port=8000)`; hidden imports as needed (`yt_dlp`, `googleapiclient.discovery`, etc.); add `datas` for `static/` and `_version.txt`
- [x] 4.3 Create `backend/__main__.py` (or `entry.py`): when run frozen, calls `uvicorn.run("main:app", host="127.0.0.1", port=8000)` and optionally opens browser to `http://localhost:8000/`
- [x] 4.4 Create `scripts/build.bat`:
  - Read version from `git describe --tags --abbrev=0` (strip leading `v`); write to `backend/_version.txt`
  - `cd frontend && npm ci && npm run build`
  - Copy `frontend/dist/*` → `backend/static/`
  - `cd backend && pyinstaller ../yt-mp3-tool.spec --noconfirm --clean`
  - Copy `ffmpeg.exe`, `mp3gain.exe`, `client_secret.json`, `scripts/update.bat`, `docs/README-DEPLOY.md`, `backend/_version.txt` to `backend/dist/yt-mp3-tool/`
  - Zip → `dist/yt-mp3-tool-v<version>-windows-x64.zip`
- [x] 4.5 Add `tools/` directory (gitignored) with a placeholder README explaining where to drop `ffmpeg.exe` / `mp3gain.exe` for local builds; build.bat reads from there

## 5. Build pipeline (CI)

- [x] 5.1 Create `.github/workflows/release.yml`:
  - Trigger: `on: push: tags: ['v*']`
  - Job: `runs-on: windows-latest`
  - Steps: checkout, `actions/setup-python@v5` (3.12), `actions/setup-node@v4` (20), download ffmpeg full Windows build (cached), download mp3gain (cached), copy `client_secret.json` from a GH Actions secret to `tools/`, run `scripts/build.bat`, `gh release create ${{ github.ref_name }} dist/*.zip --notes "Auto-generated"`
- [x] 5.2 Add GitHub Actions secret `CLIENT_SECRET_JSON` (the contents of the local `client_secret.json`) — done via repo settings, not in code (you already did this earlier via `gh secret set`)
- [x] 5.3 Pin ffmpeg download URL/hash in workflow (avoid silent upstream changes); use BtbN's static Windows build, pinned to autobuild-2024-12-15-12-49 — cached via actions/cache
- [x] 5.4 Pin mp3gain — install via `winget install GlenSawyer.MP3Gain` (=v1.4.6 currently), copy from Program Files; cached
- [x] 5.5 Smoke-test in workflow: after build, run `yt-mp3-tool.exe --health-check` and assert it prints the expected version (covered by `__main__.py` `_health_check()`)

## 6. Update script for target PCs (uses gh CLI, not PAT)

- [x] 6.1 Create `scripts/update.bat`:
  - Check `gh` exists on PATH; if not, error with install hint + link to DEPLOY.md
  - Check `gh auth status` returns 0; if not, prompt user to run `gh auth login`
  - `gh api repos/jmh273/yt-mp3-tool/releases/latest --jq .tag_name` to get latest tag
  - Read local `_version.txt` (in install dir, default `C:\Tools\YT-MP3\`); compare with tag (`v0.5.0` ↔ `0.5.0`)
  - If equal: print "已是最新版本 (v0.5.0)" + exit 0
  - If newer: `gh release download <tag> --repo jmh273/yt-mp3-tool --pattern "*windows-x64.zip" --dir %TEMP%\yt-mp3-update`, `taskkill /F /IM yt-mp3-tool.exe 2>nul`, `Expand-Archive -Force` over install dir, restart exe
- [x] 6.2 Make install dir configurable via `INSTALL_DIR` env var (default `C:\Tools\YT-MP3\`); repo owner/name as constants near top of script for easy editing if you fork
- [x] 6.3 Handle network-failure path: catch errorlevel from gh, print friendly message ("無法連線 GitHub，install 不變"), leave install untouched

## 7. Documentation

- [x] 7.1 Create `docs/DEPLOY.md` with sections (gh CLI flow, not PAT):
  - 「第一次安裝」: install gh CLI, gh auth login, download initial release via `gh release download`, extract
  - 「日常更新」: run `update.bat`
  - 「使用者資料位置」: `~/.yt-mp3-tool/` (settings, token), download dir; backup commands
  - 「Rollback」: `gh release list` + download specific tag
  - 「常見問題」: Defender 警告、gh auth 過期、INSTALL_DIR 自訂、fork 改 REPO
- [x] 7.2 Add `docs/README-DEPLOY.md` (shipped inside zip): minimal install + update reference
- [x] 7.3 Update top-level [README.md](README.md) to mention「正式分發」走 release zip + `update.bat`，dev iteration 仍是 `start.bat`

## 8. Verification

- [x] 8.1 Run full backend test suite — 80/88 pass (8 pre-existing failures in test_rss/test_subscriptions/test_latest_videos unrelated to this change; same as before)
- [x] 8.2 Run `vue-tsc --noEmit` — clean
- [x] 8.3 Local: run `scripts/build.bat` end-to-end on the dev VM — produced 124 MB zip at `dist/yt-mp3-tool-v0.0.1-test-windows-x64.zip`. Caught & fixed two issues during apply:
  - `.bat` files contained Unicode chars (`—`, `→`) → cmd CP950 decoder choked → rewrote ASCII-only
  - `_resource_path()` was looking next to `sys.executable` but PyInstaller onedir puts datas in `_internal/` → fixed to check `sys._MEIPASS` first, then exe.parent
  - `npm run build` runs vue-tsc on test files which have pre-existing TS errors → switched build.bat to `npm run build-only` (vite build alone)
- [x] 8.4 Local: bundled exe runs `--health-check` and reports correct version (`0.0.1-test`); ffmpeg/mp3gain PATH injection verified via `_setup_bundled_path`. NOTE: not yet booted full server in clean dir / verified browser opens — would need to extract zip elsewhere and run; recommend you do that as a quick manual smoke before tagging real release.
- [ ] 8.5 Push a test tag `v0.0.1-test` and confirm CI runs end-to-end; delete after — **needs user action** (push tag from your terminal)
- [ ] 8.6 On a second PC: gh auth login, download initial release, run; push v0.0.2-test, run update.bat — **needs second PC**
- [ ] 8.7 Tag first real release (e.g. `v0.5.0`) and roll out to all 3 target PCs — **needs user action after 8.5/8.6 pass**
