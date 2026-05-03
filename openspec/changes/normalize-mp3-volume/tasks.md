## 1. Backend: settings field

- [x] 1.1 ~~Add `normalize_target_db: -14.0` to `DEFAULT_SETTINGS`~~ — superseded by 1.4 (default + units changed)
- [x] 1.2 ~~Add `normalize_target_db: float | None = None` to `SettingsUpdate` and validate `-30.0 <= value <= 0.0`~~ — superseded by 1.5 (range changed)
- [x] 1.3 Settings tests for default / update / out-of-range — written under old range; **REWRITE** in 1.6

## 1.x. Backend: settings rework for mp3gain (engine pivot)

- [x] 1.4 Change `DEFAULT_SETTINGS["normalize_target_db"]` from `-14.0` to `89.0`
- [x] 1.5 Update `SettingsUpdate` validation in `update_settings`: range `80.0 <= value <= 100.0` (else 422 with new message)
- [x] 1.6 Update `tests/test_settings.py` `normalize_target_db` cases: default = `89.0`, valid update = `92.0`, boundaries `80.0` / `100.0`, rejections `75.0` / `105.0`

## 2. Backend: filename sanitization at download

- [x] 2.7 Add `_sanitize_filename(name: str) -> str` in `backend/main.py` (regex: keep `\w\s一-鿿㐀-䶿().\-`, replace others with `_`, collapse `_+`, strip trailing `. _`, truncate 120; fallback `"untitled"` for empty)
- [x] 2.8 In `run_download`, before building `ydl_opts`, compute `safe_title = _sanitize_filename(v["title"])` and use it in `outtmpl` as a literal filename (`f"{safe_title}.%(ext)s"`)
- [x] 2.9 Backend tests for `_sanitize_filename`: full-width punct (`｜「」？！，`) replaced; emojis replaced; CJK preserved; `/`, `\`, `:` replaced; collapses `___`; truncates >120; never returns empty string

## 2.y. Backend: replace loudnorm helpers with mp3gain (engine pivot)

- [x] 2.1 Add `normalize_progress` + `_active_normalize_dirs` (kept)
- [x] 2.2 Implement `_list_mp3s` — extend in 3.6 to add `needs_rename` / `suggested_name`
- [x] 2.3 ~~`_run_loudnorm_measure`~~ — superseded by 2.10 (mp3gain analyze)
- [x] 2.4 ~~`_run_loudnorm_apply`~~ — superseded by 2.11 (mp3gain apply)
- [x] 2.5 ~~`NORMALIZE_TOLERANCE_DB = 0.5`~~ — superseded by 2.10 (`MP3GAIN_TOLERANCE_DB = 0.75`)
- [x] 2.6 ~~`run_normalize_batch` (loudnorm version)~~ — superseded by 2.12

- [x] 2.10 Implement `_run_mp3gain_analyze(input_path: pathlib.Path, target_db: float) -> dict` that runs `mp3gain -q -d <target_db-89> <path>` (analyze, no modify), parses stdout for `Recommended "Track" dB change: <float>`, returns `{measured_db: <inferred>, recommended_db_change: <parsed>}`. Define `MP3GAIN_TOLERANCE_DB = 0.75`.
- [x] 2.11 Implement `_run_mp3gain_apply(input_path: pathlib.Path, target_db: float)` that runs `mp3gain -r -k -q -d <target_db-89> <path>` (modifies frame headers in place); raise `RuntimeError(stderr_tail)` on non-zero exit
- [x] 2.12 Rewrite `run_normalize_batch(task_id, directory, filenames, target_db)`: per file `pending → measuring`, call analyze, populate `measured_db` + `recommended_db_change`; if `abs(recommended_db_change) < MP3GAIN_TOLERANCE_DB` → `skipped`; else `measuring → normalizing`, call apply, on success `done`, on RuntimeError `error` with message; final `status: "done"`, discard from `_active_normalize_dirs`. SSE state shape uses `measured_db` / `target_db` / `recommended_db_change` (NO `measured_lufs` / `target_lufs` / `percent`)

## 3. Backend: routes

- [x] 3.1 `GET /normalize/list` — extend in 3.6
- [x] 3.2 `POST /normalize/start` — extend in 3.7 (mp3gain check + target_db override)
- [x] 3.3 `GET /normalize/progress/{task_id}` SSE (kept; payload shape changes via 2.12)
- [x] 3.4 ~~Backend tests around list/path-traversal/409~~ — kept; extend in 3.9
- [x] 3.5 ~~Skip-logic tests (loudnorm version)~~ — superseded by 3.9

- [x] 3.6 Extend `GET /normalize/list`: each file entry adds `needs_rename: bool` and `suggested_name: str` computed by applying `_sanitize_filename` to the stem; if `suggested_name == filename` → `needs_rename: false`. Disambiguate collisions within the response with `-2`, `-3`, ... suffix.
- [x] 3.7 Extend `POST /normalize/start`:
  - Body adds optional `target_db: float | None = None`; if provided validate `80..100` (else 422)
  - Replace `shutil.which("ffmpeg")` check with `shutil.which("mp3gain")` (503 message: install mp3gain)
  - Pass effective `target_db` (body override or settings) to `run_normalize_batch`
- [x] 3.8 Add `POST /normalize/rename` accepting `{directory, renames: [{from, to}]}`:
  - 400 if any `from`/`to` has separator or resolves outside directory
  - For each pair: if `to` exists and `to != from`, append to `skipped`; else `os.replace(dir/from, dir/to)` and append to `renamed`
  - Append a JSON line `{ts, mappings: [...renamed...]}` to `<dir>/_rename_log.json` (create if missing, JSON-array file)
  - Return `{renamed: [...], skipped: [...]}`
- [x] 3.9 Backend tests (`tests/test_normalize.py`):
  - `_sanitize_filename` (full-width / emoji / CJK preserved / collisions) — also covers 2.9
  - `_list_mp3s` returns `needs_rename: true` for unsafe names, `false` for safe names; `suggested_name` collisions get `-2` suffix
  - `POST /normalize/start` 503 → check `shutil.which("mp3gain")` instead of ffmpeg; 422 when `target_db` out of range
  - `POST /normalize/rename` happy path, collision skipped, path-traversal 400, log file created/appended
  - `run_normalize_batch` skip logic with stubbed `_run_mp3gain_analyze`: recommended `0.30` → skipped; `4.50` → done; `-0.74` → skipped (boundary inclusive on the under-side)
  - On `_run_mp3gain_apply` raising → item `error`, original file unchanged, batch continues

## 4. Frontend: settings field (engine pivot)

- [x] 4.1 ~~`normalizeTargetDb` ref default `-14`, label "目標響度（LUFS）", range `-30..0`~~ — superseded by 4.3
- [x] 4.2 ~~`validateNormalizeTargetDb()` -30..0~~ — superseded by 4.3

- [x] 4.3 Update `views/SettingsView.vue`: change input bounds to `min="80" max="100" step="0.5"`, default ref to `89`, label to "目標響度（dB SPL）", helper text "89 = mp3gain 預設；接近 YouTube 響度建議 92–93", `validateNormalizeTargetDb` range `80..100`

## 5. Frontend: normalize store + API

- [x] 5.1 Create `stores/normalize.ts` (kept)
- [x] 5.2 SSE pattern reused inline (kept)

- [x] 5.3 Update `stores/normalize.ts` types: `NormalizeFile` adds `needs_rename: bool`, `suggested_name: string`; `NormalizeProgressItem` replaces `measured_lufs/target_lufs` with `measured_db/target_db` and adds `recommended_db_change: number | null`; remove `percent` field
- [x] 5.4 Add `targetDb` ref to store (per-batch override) and `renameUnsafe()` action that posts `/normalize/rename` with the suggested mapping then re-`loadDirectory(directory)`. `startBatch()` sends `target_db` in the body.

## 6. Frontend: normalizer panel

- [x] 6.1 Create `VolumeNormalizer.vue` (kept; will be heavily updated below)
- [x] 6.2 Tabbed right pane (kept)
- [x] 6.3 Running-dot indicator (kept)

- [x] 6.4 Update `VolumeNormalizer.vue`:
  - Add "本次目標 (dB)" numeric input (`80..100`, step 0.5) bound to `store.targetDb`, prefilled from `/settings` `normalize_target_db` on mount
  - Show "⚠ 重新命名 N 個檔案" button when any file has `needs_rename: true`; click → `store.renameUnsafe()` → list reloads
  - File list row shows `measured_db → target_db` and `recommended_db_change` (e.g. "+4.5 dB"); remove progress bar (mp3gain too fast for it)
  - Update overwrite warning text: "將直接修改原檔的 mp3gain frame header（無損可還原，無重編碼）"

## 7. UI tests + manual verification

- [x] 7.1 UI test scaffolded for tabs/load/empty/keepalive (kept; may need a small selector update for new dB column)
- [ ] 7.2 Manual run: install mp3gain (`scoop install mp3gain` or download from mp3gain.sourceforge.net) and confirm `where mp3gain` finds it; create a folder with 2 MP3s of obviously different loudness; run normalization with default target 89; confirm both end up similarly loud
- [ ] 7.3 Manual failure path: include a fake `.mp3` (e.g. `echo not-mp3 > fake.mp3`); confirm it shows `error`; other files still finish
- [ ] 7.4 Manual skip path: re-run the same folder; confirm all files now show `已符合` and mtimes did NOT change
- [ ] 7.5 Manual sanitize path: download a video whose YouTube title contains `｜`, `「」`, `？` — confirm the saved filename has those replaced with `_`
- [ ] 7.6 Manual rename path: load `C:\YT-MP3\20260501` (the existing folder with full-width punctuation); confirm `重新命名 N 個檔案` button appears; click it; confirm files renamed and `_rename_log.json` exists with the mapping
