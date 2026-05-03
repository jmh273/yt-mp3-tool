## 1. Backend: bundle-aware runtime

- [ ] 1.1 Add `_setup_bundled_path()` in `backend/main.py` (called at module load, before `app = FastAPI(...)`): if `getattr(sys, "frozen", False)`, prepend `pathlib.Path(sys.executable).parent` to `os.environ["PATH"]`
- [ ] 1.2 Add `_resource_path(name: str) -> pathlib.Path` helper: returns `pathlib.Path(sys.executable).parent / name` when frozen, else `pathlib.Path(__file__).parent / name`
- [ ] 1.3 Refactor `CLIENT_SECRET_FILE` to use a function `_find_client_secret() -> pathlib.Path | None` that checks `_resource_path("client_secret.json")` first, then `pathlib.Path(__file__).parent / "client_secret.json"`; returns first existing or `None`. Update `auth_login` to handle the `None` case with a clearer 500 message
- [ ] 1.4 Add `static/` SPA mount: in `lifespan`/post-app-creation, do `static_dir = _resource_path("static")` then `if static_dir.exists(): app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="spa")` — must be after all `@app.get/post` route registrations so it's last-resort

## 2. Backend: version + tolerant settings

- [ ] 2.1 Add `__version__` loaded from `_resource_path("_version.txt")` (strip whitespace); fallback `"0.0.0-dev"` if missing
- [ ] 2.2 Add route `GET /version` returning `{"version": __version__}`
- [ ] 2.3 Refactor `load_settings()` into a tolerant version that, after the existing default-merge, validates each range-bounded key (`videos_per_channel` 1–20, `latest_hours` 1–168, `min_duration_minutes` ≥ 0, `max_duration_minutes` ≥ 1, `normalize_target_db` 80–100); on out-of-range or wrong-type, reset that single key to `DEFAULT_SETTINGS[key]`. Preserve unknown keys in the returned dict.
- [ ] 2.4 Tests in `tests/test_settings.py`: legacy `normalize_target_db: -14.0` → reset to `89.0` on load (no raise); string in numeric field → reset; unknown key preserved; in-range value passed through

## 3. Frontend: version display

- [ ] 3.1 In `views/HomeView.vue` header, add `<span class="version">v{{ version }}</span>` next to the app title
- [ ] 3.2 Fetch version from `GET /version` on mount; default to empty string until loaded so UI doesn't flash `vundefined`
- [ ] 3.3 Add minimal CSS — small, muted, doesn't crowd the title
- [ ] 3.4 (Optional) Settings page also shows version near the back button — same source

## 4. Build pipeline (local)

- [ ] 4.1 Add `pyinstaller` to a new `backend/requirements-dev.txt` (NOT `requirements.txt`)
- [ ] 4.2 Create `yt-mp3-tool.spec` (PyInstaller spec file): `onedir` mode, entry = `backend/main.py` wrapper or a small `backend/__main__.py` that calls `uvicorn.run(app, host="127.0.0.1", port=8000)`; hidden imports as needed (`yt_dlp`, `googleapiclient.discovery`, etc.); add `datas` for `static/` and `_version.txt`
- [ ] 4.3 Create `backend/__main__.py` (or `entry.py`): when run frozen, calls `uvicorn.run("main:app", host="127.0.0.1", port=8000)` and optionally opens browser to `http://localhost:8000/`
- [ ] 4.4 Create `scripts/build.bat`:
  - Read version from `git describe --tags --abbrev=0` (strip leading `v`); write to `backend/_version.txt`
  - `cd frontend && npm ci && npm run build`
  - Copy `frontend/dist/*` → `backend/static/`
  - `cd backend && pyinstaller ../yt-mp3-tool.spec --noconfirm --clean`
  - Copy `ffmpeg.exe`, `mp3gain.exe`, `client_secret.json`, `scripts/update.bat`, `docs/README-DEPLOY.md`, `backend/_version.txt` to `backend/dist/yt-mp3-tool/`
  - Zip → `dist/yt-mp3-tool-v<version>-windows-x64.zip`
- [ ] 4.5 Add `tools/` directory (gitignored) with a placeholder README explaining where to drop `ffmpeg.exe` / `mp3gain.exe` for local builds; build.bat reads from there

## 5. Build pipeline (CI)

- [ ] 5.1 Create `.github/workflows/release.yml`:
  - Trigger: `on: push: tags: ['v*']`
  - Job: `runs-on: windows-latest`
  - Steps: checkout, `actions/setup-python@v5` (3.12), `actions/setup-node@v4` (20), download ffmpeg full Windows build (cached), download mp3gain (cached), copy `client_secret.json` from a GH Actions secret to `tools/`, run `scripts/build.bat`, `gh release create ${{ github.ref_name }} dist/*.zip --notes "Auto-generated"`
- [ ] 5.2 Add GitHub Actions secret `CLIENT_SECRET_JSON` (the contents of the local `client_secret.json`) — done via repo settings, not in code
- [ ] 5.3 Pin ffmpeg download URL/hash in workflow (avoid silent upstream changes); use BtbN's static Windows build (`ffmpeg-master-latest-win64-gpl.zip`) extracting only `bin/ffmpeg.exe`
- [ ] 5.4 Pin mp3gain download URL — winget package version 1.4.6 (sourceforge `mp3gain-win-full-1_2_5.exe` extracts to `mp3gain.exe`)
- [ ] 5.5 Smoke-test in workflow: after build, run a tiny `tests/smoke_bundle.py` that invokes the bundled exe with `--health-check` (a flag that returns version and exits 0) and asserts the response

## 6. Update script for target PCs

- [ ] 6.1 Create `scripts/update.bat`:
  - Check `GH_TOKEN` env var present, else error with link to DEPLOY.md
  - PowerShell call to GitHub API `releases/latest` for repo `<owner>/<repo>` (configurable via `REPO` env var with sensible default)
  - Read local `_version.txt` (in install dir, default `C:\Tools\YT-MP3\`); compare with release tag
  - If equal: print "already up to date" + exit 0
  - If newer: download asset to temp, `taskkill /F /IM yt-mp3-tool.exe 2>nul`, `Expand-Archive -Force` over install dir, restart exe
- [ ] 6.2 Make install dir configurable via `INSTALL_DIR` env var (default `C:\Tools\YT-MP3\`)
- [ ] 6.3 Handle network-failure path: catch PowerShell exception, print friendly message, leave install untouched

## 7. Documentation

- [ ] 7.1 Create `docs/DEPLOY.md` with sections:
  - 「第一次安裝」: download initial release zip manually (link to releases page), extract to `C:\Tools\YT-MP3\`, create fine-grained PAT (screenshot or step list), set user env var `GH_TOKEN`, double-click `yt-mp3-tool.exe`, browser opens
  - 「日常更新」: just run `update.bat`
  - 「使用者資料位置」: `~/.yt-mp3-tool/` (settings, token), download dir from settings; how to back up
  - 「Rollback」: how to grab an older release zip and extract over install dir
  - 「常見問題」: Defender 警告（加 exclusion）、GH_TOKEN 過期、`update.bat` 的 exit codes
- [ ] 7.2 Add `docs/README-DEPLOY.md` (shipped inside zip): minimal install + update reference for the target-PC user (you on another machine)
- [ ] 7.3 Update top-level [README.md](README.md) to mention「正式分發」走 release zip + `update.bat`，dev iteration 仍是 `start.bat`

## 8. Verification

- [ ] 8.1 Run full backend test suite — must still pass; no regression from version / tolerant-settings refactor
- [ ] 8.2 Run `vue-tsc --noEmit` — must pass with version display addition
- [ ] 8.3 Local: run `scripts/build.bat` end-to-end on the dev VM; assert produced zip exists, has expected files, and weighs < 200 MB
- [ ] 8.4 Local: extract the produced zip to a different folder (NOT the dev checkout), double-click `yt-mp3-tool.exe`, verify (a) `localhost:8000` opens (b) version shows in UI (c) `/normalize/start` doesn't 503 (mp3gain found via bundled PATH)
- [ ] 8.5 Push a test tag `v0.0.1-test` to a feature branch; confirm Actions runs and produces a release; delete the test release after
- [ ] 8.6 On a second PC (different from dev VM): set `GH_TOKEN`, download initial zip from the test release, extract, run; then push a `v0.0.2-test` tag and run `update.bat` on that PC — verify it picks up the new version, restarts, settings preserved
- [ ] 8.7 Tag the actual first real release `v0.5.0` (or whatever the current code base warrants) and roll out to all 3 target PCs
