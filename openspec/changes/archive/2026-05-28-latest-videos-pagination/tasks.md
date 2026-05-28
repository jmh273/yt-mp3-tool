## 1. Backend: remove the 100-video cap

- [x] 1.1 In `backend/main.py` `get_latest_videos`, delete the `videos = videos[:100]` line ([backend/main.py:1799](backend/main.py#L1799)) so the full sorted list is returned. Confirm the `downloaded_today` enrichment loop below it still runs over the full `videos` list.

## 2. Backend tests

- [x] 2.1 In `backend/tests/test_latest_videos.py`, replace `test_latest_videos_capped_at_100` (asserts `len <= 100`) with a test that seeds >100 matching videos (e.g. 150) and asserts the response returns all of them, sorted by `published` descending.
- [x] 2.2 Update `test_latest_videos_duration_filter_runs_before_100_cap`: keep the assertion that the duration filter is applied (shorts excluded, normal-length videos returned), but remove cap-dependent framing/assertions now that there is no truncation. Rename if the "before 100-cap" name no longer fits.
- [x] 2.3 Run `cd backend; python -m pytest tests/test_latest_videos.py -q` and confirm all pass.

## 3. Frontend: client-side load-more pagination

- [x] 3.1 In `frontend/src/components/LatestVideosFeed.vue`, add `const PAGE_SIZE = 50` and a reactive `displayCount = ref(PAGE_SIZE)`, plus a `displayedVideos` computed = `videos.value.slice(0, displayCount.value)`.
- [x] 3.2 Change the `v-for` grid to iterate `displayedVideos` instead of `videos`.
- [x] 3.3 Reset `displayCount.value = PAGE_SIZE` at the start of `fetchVideos` so each fetch/apply returns to page 1.
- [x] 3.4 Add a "載入更多" button below the grid, shown only when `displayCount < videos.length`, that increments `displayCount` by `PAGE_SIZE` on click.

## 4. Frontend: count badge rework

- [x] 4.1 Remove the `videos.length >= 100` cap warning template and the `count-cap` orange styling.
- [x] 4.2 Show the total count in the badge, plus a "顯示 {displayedVideos.length} / {videos.length} 部" indication while `displayCount < videos.length`.

## 5. Frontend tests

- [x] 5.1 In `frontend/src/tests/LatestVideosFeed.test.ts`, add a test: mounting with >50 videos renders only 50 cards and shows the "載入更多" button.
- [x] 5.2 Add a test: clicking "載入更多" appends the next page (e.g. 50 → 100 rendered cards) and hides the button once all videos are shown.
- [x] 5.3 Add a test: re-applying filters resets the displayed list back to the first page.
- [x] 5.4 Run `cd frontend; npm run test:unit -- LatestVideosFeed` and confirm all pass.

## 6. Verify

- [x] 6.1 Write/extend `frontend/e2e/verify-latest-videos-pagination.ts` to load the feed with a large result set, assert first page renders, click "載入更多", assert more cards appear and the count indicator updates.
- [x] 6.2 Run the verify script; only suggest verify/archive once it passes.
