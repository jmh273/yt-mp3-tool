## 1. Backend – broaden scan to whole root + rename field

- [x] 1.1 In `get_latest_videos` (`backend/main.py`, ~L2055), replace `downloaded_stems = _today_downloaded_stems()` with `downloaded_stems = _downloaded_stems_all()`.
- [x] 1.2 Rename the response field: set `v["downloaded_on_disk"] = _sanitize_filename(v.get("title", "")) in downloaded_stems` (was `downloaded_today`).
- [x] 1.3 Confirm `_downloaded_stems_all()` already: skips `.part`, skips non-files, strips `^\d+_`, returns empty set when `output_path` is missing/unreadable. No new helper needed.
- [x] 1.4 Verify `/subscriptions/{channel_id}/videos`, `/trending-videos`, `/search-videos` still do NOT add any downloaded flag.
- [x] 1.5 (Optional cleanup) If `_today_downloaded_stems()` / `_today_download_dir()` now have no other callers, leave a note or remove — non-blocking.

## 2. Frontend – field rename

- [x] 2.1 In `frontend/src/stores/download.ts`, rename the optional `VideoItem` field `downloaded_today?: boolean` → `downloaded_on_disk?: boolean`.
- [x] 2.2 In `frontend/src/components/LatestVideosFeed.vue`, update `isAlreadyDownloaded` (L114) to `download.isDownloaded(v.video_id) || v.downloaded_on_disk === true`.
- [x] 2.3 Confirm no other references to `downloaded_today` remain in the frontend (`grep`).
- [x] 2.4 Sanity: `downloaded_on_disk: undefined` (older/older-cached response) is treated as `false`, preserving prior behaviour; disabled/badge/override-toggle wiring is otherwise unchanged.

## 3. Tests

- [x] 3.1 Backend test: mock `output_path` to `tmp_path`, create a file under a NON-today subfolder (e.g. `tmp_path/20250101/03_<sanitized title>.mp3`), and assert the matching video gets `downloaded_on_disk: true` (proves whole-root scope, not just today).
- [x] 3.2 Backend test: a `.part` file under any subfolder yields `downloaded_on_disk: false`; a non-matching title yields `false`; missing `output_path` yields `false` for all.
- [x] 3.3 Update `frontend/src/tests/LatestVideosFeed.test.ts`: a mocked `/latest-videos` video with `downloaded_on_disk: true` → checkbox `disabled`, badge visible; "允許再次下載" ON re-enables it (badge stays), OFF restores disabled and drops it from `download.selected`.
- [x] 3.4 Grep both `backend/` and `frontend/src/` for any lingering `downloaded_today` and confirm none remain (except in archived openspec changes).

## 4. Spec & verification

- [x] 4.1 Run `openspec validate latest-feed-downloaded-on-disk-rootwide --strict`.
- [x] 4.2 Run `cd frontend && npx vitest run src/tests/LatestVideosFeed.test.ts`.
- [x] 4.3 Run backend tests for `test_latest_videos.py`.
- [x] 4.4 Write + run `frontend/e2e/verify-downloaded-on-disk-rootwide.ts` per the auto-Playwright-verify rule before suggesting verify/archive.
- [x] 4.5 Manual: place a matching file in an OLD date subfolder, reload the latest-videos panel — confirm that video's checkbox is disabled with the "✅ 已下載" badge.
