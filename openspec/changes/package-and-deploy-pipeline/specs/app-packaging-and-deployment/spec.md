## ADDED Requirements

### Requirement: Bundled exe locates ffmpeg/mp3gain alongside itself
When the application runs as a PyInstaller-frozen binary (`getattr(sys, "frozen", False) is True`), the directory containing `sys.executable` SHALL be prepended to `os.environ["PATH"]` at startup. `shutil.which("ffmpeg")` and `shutil.which("mp3gain")` SHALL resolve to the bundled binaries when present, even when the system PATH does not contain those tools.

#### Scenario: Bundled binaries take precedence
- **WHEN** the bundle ships with `ffmpeg.exe` and `mp3gain.exe` next to `yt-mp3-tool.exe` and the host has neither on the system PATH
- **THEN** `/normalize/start` SHALL find `mp3gain` (no 503) and `/download` SHALL find `ffmpeg`

#### Scenario: System install of same tool ignored when bundled present
- **WHEN** the host has a system-PATH `ffmpeg.exe` AND the bundle also contains `ffmpeg.exe`
- **THEN** `shutil.which("ffmpeg")` SHALL resolve to the bundle's copy (because the bundle dir is prepended)

#### Scenario: Dev mode unaffected
- **WHEN** the application runs as `python -m uvicorn main:app` (not frozen)
- **THEN** the PATH SHALL NOT be modified by the bundle path setup, and resolution SHALL fall back to the host's existing PATH

### Requirement: Single backend process serves both API and SPA
At startup, if a `static/` directory exists relative to the bundle (or backend) root, the FastAPI app SHALL mount it at `/` with HTML fallback enabled, so that the same uvicorn process serves both `/api/*`-style routes and the Vue SPA. When `static/` does not exist, the mount SHALL be skipped and behaviour SHALL match dev mode (front-end served by Vite at `:5173`).

#### Scenario: SPA routes load via the backend port
- **WHEN** the bundle contains `static/index.html` and the user navigates `http://localhost:8000/`
- **THEN** the response SHALL be the SPA `index.html` (HTTP 200) rendered as the application

#### Scenario: SPA route deep-link falls back to index.html
- **WHEN** the user navigates `http://localhost:8000/settings` (a client-side route)
- **THEN** the response SHALL be `index.html` (200), allowing the SPA router to handle `/settings`

#### Scenario: API routes are not shadowed by the SPA mount
- **WHEN** any existing API route (`/settings`, `/normalize/list`, `/auth/status`, ...) is requested
- **THEN** the API handler SHALL respond as before, NOT the SPA mount

#### Scenario: Dev mode without static/ directory
- **WHEN** the app starts in development with no `static/` directory
- **THEN** the SPA mount SHALL NOT be attempted and no startup error SHALL occur; the Vite dev server on `:5173` continues to serve the SPA as today

### Requirement: Version stamping and exposure
The application SHALL read a single version string from `_version.txt` shipped next to the executable (or under `backend/` in dev). It SHALL expose `GET /version` returning `{"version": "<string>"}`. The frontend SHALL display this version in a non-intrusive location (e.g., header corner) on every page.

#### Scenario: Version file present
- **WHEN** `_version.txt` contains `0.5.0`
- **THEN** `GET /version` SHALL return `{"version": "0.5.0"}` and the UI header SHALL display `v0.5.0`

#### Scenario: Version file missing
- **WHEN** `_version.txt` does not exist (developer running from a fresh checkout)
- **THEN** `GET /version` SHALL return `{"version": "0.0.0-dev"}` and the UI SHALL display `v0.0.0-dev`

### Requirement: Tolerant settings load
`load_settings()` SHALL never raise on a settings file containing values from older schema versions. For every range-bounded setting key, if the persisted value falls outside the current accepted range or has the wrong type, the system SHALL silently reset that single key to its default in the returned object (without writing back to disk). Unknown keys (from older versions) SHALL be preserved unchanged.

#### Scenario: Out-of-range numeric value reset to default
- **WHEN** `~/.yt-mp3-tool/settings.json` contains `{"normalize_target_db": -14.0}` (legacy LUFS value, outside the new dB SPL range 80–100)
- **THEN** `load_settings()` SHALL return `normalize_target_db: 89.0` (the default) and SHALL NOT raise

#### Scenario: Wrong-type value reset to default
- **WHEN** the persisted value for `videos_per_channel` is a string `"five"` instead of an integer
- **THEN** `load_settings()` SHALL return the default `5` for that key and SHALL NOT raise

#### Scenario: Unknown legacy key preserved
- **WHEN** the persisted file contains `{"removed_old_setting": "something"}` from an earlier version
- **THEN** `load_settings()` SHALL still include that key in the returned dict (no data loss; the field is simply ignored by current code)

#### Scenario: In-range value passed through
- **WHEN** the persisted file contains `{"normalize_target_db": 92.0}`
- **THEN** `load_settings()` SHALL return `normalize_target_db: 92.0` unchanged

### Requirement: client_secret.json resolution from bundle or dev path
The application SHALL look up `client_secret.json` in two locations, in priority order: (1) next to the executable in a bundled install, (2) under `backend/` in a dev checkout. The first existing file SHALL be used. If neither exists, `/auth/login` SHALL respond `500` with an actionable message.

#### Scenario: Bundle ships client_secret.json
- **WHEN** the install directory contains `client_secret.json` next to `yt-mp3-tool.exe`
- **THEN** `/auth/login` SHALL use that file and start the OAuth flow normally

#### Scenario: Dev checkout has client_secret.json under backend/
- **WHEN** the dev checkout has `backend/client_secret.json` and the app is run via `python -m uvicorn`
- **THEN** that file SHALL be used

#### Scenario: Neither location has the file
- **WHEN** neither location contains `client_secret.json`
- **THEN** `/auth/login` SHALL respond `500` with a message telling the user to copy the file into the install directory

### Requirement: Build script produces a self-contained Windows zip
The repository SHALL include a `scripts/build.bat` that, when run on Windows with PyInstaller, Node, and npm available, produces a single zip at `dist/yt-mp3-tool-v<version>-windows-x64.zip` containing the executable, its `_internal/` dependencies, the built SPA under `static/`, `ffmpeg.exe`, `mp3gain.exe`, `client_secret.json`, `update.bat`, `README-DEPLOY.md`, and `_version.txt`.

#### Scenario: Local build produces a complete zip
- **WHEN** a developer runs `scripts/build.bat` after `git tag v0.5.0`
- **THEN** `dist/yt-mp3-tool-v0.5.0-windows-x64.zip` SHALL exist and contain at minimum: `yt-mp3-tool.exe`, `_internal/`, `static/index.html`, `ffmpeg.exe`, `mp3gain.exe`, `_version.txt` (containing `0.5.0`), and `update.bat`

#### Scenario: Build embeds the version from git tag
- **WHEN** the most recent git tag matching `v*` is `v0.5.0`
- **THEN** the produced `_version.txt` inside the zip SHALL contain `0.5.0` (without the leading `v`)

### Requirement: GitHub Actions release workflow on tag push
The repository SHALL include `.github/workflows/release.yml` that, on push of a tag matching `v*`, runs on a `windows-latest` runner, executes `scripts/build.bat`, and uses `gh release create` (or equivalent) to create a GitHub release with the produced zip attached as an asset.

#### Scenario: Tag push triggers a successful release build
- **WHEN** a developer pushes a tag `v0.5.1`
- **THEN** the workflow SHALL run on a Windows runner, build the zip, and create release `v0.5.1` with `yt-mp3-tool-v0.5.1-windows-x64.zip` attached

#### Scenario: Non-tag push does not trigger release
- **WHEN** a developer pushes a regular commit to any branch
- **THEN** the release workflow SHALL NOT run

#### Scenario: Failed build does not create a release
- **WHEN** `build.bat` returns non-zero (e.g., PyInstaller error)
- **THEN** the workflow SHALL fail and no release SHALL be created

### Requirement: Update script on target PC
The repository SHALL include `scripts/update.bat` (also shipped inside the release zip). It SHALL use the `gh` CLI (assumed installed and authenticated via `gh auth login` on each target PC during one-time setup) to: (1) query the latest release for the configured repo; (2) compare its tag with the local `_version.txt`; (3) if newer, download the windows-x64 zip via `gh release download`, stop any running `yt-mp3-tool.exe`, extract over the install directory, and start the new exe. The script SHALL leave `~/.yt-mp3-tool/` and the user's MP3 download directories untouched.

#### Scenario: Already on latest version
- **WHEN** the target PC has `_version.txt` matching the latest release tag
- **THEN** `update.bat` SHALL print "already up to date" and exit `0` without downloading

#### Scenario: Newer version available
- **WHEN** the latest release is `v0.5.2` and the target's `_version.txt` is `0.5.1`
- **THEN** `update.bat` SHALL download the `v0.5.2` asset, kill any running `yt-mp3-tool.exe`, extract over the install directory, restart the exe, and exit `0`

#### Scenario: gh not installed or not authenticated
- **WHEN** the user runs `update.bat` without `gh` on PATH, or with `gh` installed but `gh auth status` returning non-zero
- **THEN** the script SHALL print an error pointing to DEPLOY.md (how to install gh + run `gh auth login`) and exit non-zero

#### Scenario: Network unreachable
- **WHEN** the `gh` API call fails (no network / DNS failure)
- **THEN** the script SHALL print an error and exit non-zero, leaving the existing install unchanged

#### Scenario: User data preserved across update
- **WHEN** an update completes successfully
- **THEN** `~/.yt-mp3-tool/settings.json`, `~/.yt-mp3-tool/token.json`, and the user's configured download directory SHALL be byte-identical to before the update

### Requirement: Deployment documentation
The repository SHALL include `docs/DEPLOY.md` that documents (a) first-time setup of a fresh target PC (install `gh` CLI via `winget install GitHub.cli`, run `gh auth login`, download initial release zip via `gh release download`, extract to install dir), (b) how to run `update.bat`, (c) where user data lives and how to back it up, and (d) how to roll back to a previous release if needed.

#### Scenario: First-time deploy walkthrough exists
- **WHEN** a user opens `docs/DEPLOY.md`
- **THEN** the document SHALL include a numbered, step-by-step section titled (e.g.) "第一次安裝" / "First-time setup" covering PAT creation through first launch

#### Scenario: Rollback procedure documented
- **WHEN** a user needs to roll back from `v0.5.2` to `v0.5.1` (e.g., new version has a bug)
- **THEN** DEPLOY.md SHALL describe how to download the older release asset manually and extract it over the install directory
