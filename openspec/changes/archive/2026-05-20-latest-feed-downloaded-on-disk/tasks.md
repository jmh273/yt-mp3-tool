## 1. Backend – today's-folder scan helper

- [x] 1.1 In `backend/main.py`, add a helper `_today_download_dir() -> pathlib.Path` that returns `<settings.output_path>/<datetime.now().strftime("%Y%m%d")>/`.
- [x] 1.2 Add a helper `_today_downloaded_stems() -> set[str]` that enumerates regular files under `_today_download_dir()`, drops any with extension `.part`, strips the extension and any leading `^\d+_` sequence prefix from the filename, and returns the resulting set of stems. Missing directory → empty set.
- [x] 1.3 Confirm the helper short-circuits cleanly on `FileNotFoundError` / `NotADirectoryError` (no exception bubbling).

## 2. Backend – enrich `/latest-videos`

- [x] 2.1 In `get_latest_videos` (`backend/main.py`), after the existing duration filter, compute `stems = _today_downloaded_stems()` once.
- [x] 2.2 For each video in the response list, set `v["downloaded_today"] = _sanitize_filename(v.get("title", "")) in stems`.
- [x] 2.3 Verify other endpoints (`/subscriptions/{channel_id}/videos`, `/trending-videos`, `/search-videos`) do NOT call the new helper and do NOT add the field.

## 3. Frontend – type, template, and override toggle

- [x] 3.1 In `frontend/src/stores/download.ts`, extend the `VideoItem` interface with an optional `downloaded_today?: boolean` field.
- [x] 3.2 In `frontend/src/components/LatestVideosFeed.vue`, add a `const allowRedownload = ref(false)` and a small toggle (checkbox or button-style) in the filter-bar labelled "允許再次下載"; ensure it's reset to `false` on mount (it already is because it's a fresh `ref`).
- [x] 3.3 Compute a per-video `isAlreadyDownloaded` (template-local or `computed`): `download.isDownloaded(v.video_id) || v.downloaded_today === true`.
- [x] 3.4 Update the checkbox binding so `:disabled="isAlreadyDownloaded(v) && !allowRedownload"` and the "✅ 已下載" badge shows whenever `isAlreadyDownloaded(v)` (independent of the toggle).
- [x] 3.5 When `allowRedownload` flips from ON to OFF, drop any selected videos that are flagged `isAlreadyDownloaded` from the download selection store (avoid stale selections that would otherwise show as "selected" on disabled checkboxes).
- [x] 3.6 Sanity-check: passing `downloaded_today: undefined` (e.g. older backend) treats it as `false`, preserving prior behaviour.

## 4. Tests

- [x] 4.1 Add a backend test (`backend/tests/test_latest_videos.py` or new file) that mocks `output_path` to a `tmp_path`, creates `tmp_path/YYYYMMDD/03_<sanitized title>.mp3`, calls `enhance` path / `_today_downloaded_stems()` indirectly, and asserts `downloaded_today: true` for the matching video and `false` for a non-matching one.
- [x] 4.2 Add a backend test that places `01_X.mp3.part` in today's folder and confirms `downloaded_today` is `false`.
- [x] 4.3 Update `frontend/src/tests/LatestVideosFeed.test.ts` with a case where the mocked `/latest-videos` response includes one video with `downloaded_today: true`; assert its checkbox is `disabled` and the badge is visible.
- [x] 4.4 Add a frontend test that toggles the "允許再次下載" switch ON, then asserts the previously disabled checkbox becomes enabled while the badge remains visible; toggling OFF restores `disabled` and drops the entry from `download.selected`.

## 5. Spec & verification

- [x] 5.1 Run `openspec validate latest-feed-downloaded-on-disk --strict`.
- [x] 5.2 Run `cd frontend && npx vitest run src/tests/LatestVideosFeed.test.ts`.
- [x] 5.3 Run backend tests for `test_latest_videos.py`.
- [x] 5.4 Manual: download a video, then reload the latest-videos panel — confirm its checkbox is now disabled with the badge.
- [x] 5.5 Manual: clear `localStorage.yt_mp3_downloaded_ids`, reload — confirm the checkbox is still disabled (proves the backend flag is doing its job).
- [x] 5.6 Manual: flip "允許再次下載" ON, confirm previously-disabled checkboxes become clickable and the badge still shows; flip OFF and confirm the disabled state returns and any of those items are removed from the pending download selection.
