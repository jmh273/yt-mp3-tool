## 1. Backend – API & filter overrides

- [x] 1.1 Extend `enhance_and_filter_videos()` in `backend/main.py` to accept `min_duration_override: int | None = None` and `max_duration_override: int | None = None`; when provided, use these (× 60 → seconds) instead of `settings.min_duration_minutes` / `settings.max_duration_minutes` for the inclusive duration check.
- [x] 1.2 Update `GET /latest-videos` in `backend/main.py` to accept three optional query parameters: `hours: int | None = None`, `min_duration_minutes: int | None = None`, `max_duration_minutes: int | None = None`.
- [x] 1.3 In `get_latest_videos`, resolve `hours` (falls back to `settings.latest_hours`) and pass `min_duration_override` / `max_duration_override` through to `enhance_and_filter_videos(...)` without writing back to the settings file.
- [x] 1.4 Clamp negative values: treat `min_duration_minutes < 0` as 0 and `max_duration_minutes < 1` as 1 (defensive); leave other endpoints (`/subscriptions/{channel_id}/videos`, `/trending-videos`, `/search-videos`) untouched.

## 2. Frontend – LatestVideosFeed inline controls

- [x] 2.1 In `frontend/src/components/LatestVideosFeed.vue`, add local `ref`s for `hoursInput`, `minDurationInput`, `maxDurationInput` and their validation error messages.
- [x] 2.2 On mount, fetch `/settings` once and seed the three `ref`s with `latest_hours`, `min_duration_minutes`, `max_duration_minutes` defaults; keep the existing initial `/latest-videos` fetch using those seeded values.
- [x] 2.3 Render an inline filter control region in the feed header containing three labelled number inputs ("時間範圍（小時）", "最短長度（分鐘）", "最長長度（分鐘）") and an "套用" button.
- [x] 2.4 Add a small caption explaining that adjustments here only affect the current view (not the saved defaults).
- [x] 2.5 Implement client-side validation: hours integer 1–168, min ≥ 0, max ≥ 1, max ≥ min; show inline error text and disable the "套用" button when invalid.
- [x] 2.6 On click of "套用" (or when no in-flight request exists and inputs valid), call `GET /latest-videos?hours=<h>&min_duration_minutes=<min>&max_duration_minutes=<max>`, replace `videos` with the response, set a loading flag, and refresh `quota`.
- [x] 2.7 Disable the "套用" button and any reactive auto-trigger while a fetch is in flight; re-enable on success or failure.
- [x] 2.8 Replace the static `<hours>h 內` badge with a dynamic badge that reflects the currently applied filters (e.g. "24h · 3–60 分鐘"); update it only after a successful fetch.
- [x] 2.9 Ensure that re-opening the latest-videos-feed view re-seeds the inputs from `/settings` (do not persist user adjustments in component state across mounts).

## 3. Spec & docs

- [x] 3.1 Run `openspec validate latest-feed-inline-filters --strict` and resolve any reported issues.
- [x] 3.2 Smoke-check the docs: scenarios in `specs/latest-videos-feed/spec.md` cover (a) defaults pre-populated, (b) override applies without changing settings, (c) badge updates, (d) validation, (e) reopen resets.

## 4. Verification (manual)

- [x] 4.1 Start backend + frontend, open the latest-videos panel: confirm inputs match values shown on the Settings page.
- [x] 4.2 Change hours from 24 → 6, click 套用, verify only videos in the last 6h appear and the badge updates to "6h · …".
- [x] 4.3 Set min=0, max=120, 套用, verify Shorts (< 3 min) and longer videos appear; revisit Settings page and confirm `min_duration_minutes` / `max_duration_minutes` are unchanged.
- [x] 4.4 Enter invalid values (hours=200, max<min), verify the inline error appears and the 套用 button is disabled.
- [x] 4.5 Navigate away (e.g. to a channel) and back to the latest-videos panel: verify inputs reset to the saved settings values.
- [x] 4.6 Confirm `/subscriptions/{channel_id}/videos`, `/trending-videos`, `/search-videos` behaviour is unchanged (no duration filter applied / no new query params consumed).
