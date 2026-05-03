# tools/

Local-build only. CI build downloads these from pinned URLs.

For local `scripts/build.bat` to work, drop these three files here:

- **`ffmpeg.exe`** — Windows static build, e.g. extracted from
  https://github.com/BtBN/FFmpeg-Builds/releases (`ffmpeg-master-latest-win64-gpl.zip`,
  take only `bin/ffmpeg.exe`).
- **`mp3gain.exe`** — from https://mp3gain.sourceforge.net/ or via `winget install GlenSawyer.MP3Gain`
  (then copy from `C:\Program Files (x86)\MP3Gain\mp3gain.exe`).
- **`client_secret.json`** — your Google Cloud OAuth client (the same file currently in `backend/`).

The whole `tools/` directory is gitignored except this README.
