## Context

`GET /latest-videos` ([backend/main.py:1720](backend/main.py#L1720)) aggregates the latest videos across every subscribed channel in a single request: it fetches all subscriptions, then concurrently pulls up to 50 videos per channel (uploads playlist, 1 quota unit/call), filters by time window and duration, sorts by publish time descending, then truncates with `videos = videos[:100]` ([backend/main.py:1799](backend/main.py#L1799)).

The frontend `LatestVideosFeed.vue` renders the entire returned list at once and shows a count badge that turns orange with a "（已達上限，調短時窗看完整列表）" warning when `videos.length >= 100` ([frontend/src/components/LatestVideosFeed.vue:6-9](frontend/src/components/LatestVideosFeed.vue#L6-L9)).

Because the whole aggregation happens in one atomic request, the full matching set is already computed server-side. Server-side paging would force re-running that expensive multi-channel fetch (or building a cache) for no quota saving. So the chosen model is: backend returns everything; the frontend paginates the display.

## Goals / Non-Goals

**Goals:**
- Return all videos matching the time window + duration filter from `/latest-videos` (no 100 cap).
- Paginate the feed display client-side via a "載入更多" button: show 50 at a time, append the next 50 per click.
- Count badge reports the true total and drops the cap warning.

**Non-Goals:**
- No server-side pagination / cursor API. The single-request aggregation model is unchanged.
- No change to query parameters, response shape, or quota cost.
- No infinite scroll or numbered page navigation (explicitly chosen against "載入更多").
- No change to how many videos are fetched per channel (still 50).

## Decisions

**1. Remove the backend cap.** Delete `videos = videos[:100]` so the sorted full list is returned. The `downloaded_today` enrichment loop already runs over `videos`, so it naturally covers the full set after the cap is removed.

**2. Client-side pagination state.** Add a reactive `displayCount` (initialized to `PAGE_SIZE = 50`). The template iterates over a `displayedVideos` computed = `videos.slice(0, displayCount)`. "載入更多" increments `displayCount` by `PAGE_SIZE`. `displayCount` resets to `PAGE_SIZE` at the start of every fetch (inside `fetchVideos`), so re-applying filters returns to page 1.

**3. Load-more visibility.** Show the button only when `displayCount < videos.length`. Hide it once everything is displayed.

**4. Count badge rework.** Replace the `>= 100` cap styling/warning with a neutral badge: total count plus a "顯示 {shown} / {total} 部" indication while `displayCount < videos.length`. Remove `count-cap` class and the conditional warning template.

**5. Selection / download semantics unchanged.** The download store, `allowRedownload`, and `isAlreadyDownloaded` operate on individual `VideoItem`s and are unaffected by which slice is rendered. Videos not yet scrolled into view are simply not rendered; selecting them still requires loading their page first, which matches the "載入更多" UX.

## Risks / Trade-offs

- **Large DOM after many "載入更多" clicks.** A user could expand to hundreds of cards. Acceptable for this local desktop tool; the page size keeps the initial render light, and the user opts into more. No virtualization needed.
- **Selection across unloaded pages.** A "select all visible" style action (none exists today) would only cover rendered cards. Not a regression — no such control exists.
- **Test fixtures.** Existing backend test likely asserts the 100 cap; it must be updated to assert the full set is returned. Frontend test must cover initial page size, append-on-click, and reset-on-refetch.
