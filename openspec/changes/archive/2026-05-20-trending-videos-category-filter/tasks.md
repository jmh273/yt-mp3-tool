## 1. Backend: categories endpoint and category whitelist

- [x] 1.1 Define `TRENDING_CATEGORIES` in `backend/main.py`.
- [x] 1.2 Derive `TRENDING_CATEGORY_WHITELIST` from non-null category ids.
- [x] 1.3 Add `GET /trending-videos/categories` with auth and no quota consumption.

## 2. Backend: extend `/trending-videos` with category parameter

- [x] 2.1 Add optional `category: str | None = None` query parameter.
- [x] 2.2 Return 400 for non-whitelisted categories before any YouTube call.
- [x] 2.3 Pass `videoCategoryId=category` to YouTube when a valid category is selected.
- [x] 2.4 Confirm `pageToken` and `videoCategoryId` coexist in the YouTube request.

## 3. Backend tests

- [x] 3.1 Cover categories success, order, no YouTube call, no quota call, and auth failure.
- [x] 3.2 Cover category propagation, missing category omission, invalid category 400, and category plus page token.
- [x] 3.3 Run `pytest backend/tests -k "trending"` and confirm all pass.

## 4. Frontend: state wiring

- [x] 4.1 Add categories and active category state in `TrendingVideosFeed.vue`.
- [x] 4.2 Add `fetchTrendingCategories()` with all-category fallback.
- [x] 4.3 Build trending URLs with `category=<id>` when not null and preserve it for load more.

## 5. Frontend: chip row UI in `TrendingVideosFeed.vue`

- [x] 5.1 Load categories and initial trending data on mount.
- [x] 5.2 Render a horizontal chip row above the video grid with the active chip highlighted.
- [x] 5.3 Clicking a new chip clears videos, resets pagination, and fetches the category.
- [x] 5.4 Load-more uses the current active category.
- [x] 5.5 Empty state still renders for empty category results.
- [x] 5.6 Active chip resets to all when the component mounts again.

## 6. Frontend tests

- [x] 6.1 Cover chip order, default active chip, category refetch, active no-op, and load-more category propagation.
- [x] 6.2 Cover categories-fetch failure fallback.
- [x] 6.3 Run the focused frontend test and confirm it passes.

## 7. Manual verification

- [x] 7.1 Run backend + frontend dev servers, open trending view, confirm chip row renders with all 8 chips in the spec order.
- [x] 7.2 Click each non-all chip and observe a fresh list of videos plus a single quota tick per click.
- [x] 7.3 Click load more while a non-all chip is active; confirm appended videos still belong to that category.
- [x] 7.4 Empirically check whether comedy (23) returns content in TW and note the result in archive notes.

## 8. Spec sync

- [x] 8.1 After manual verification, run `/opsx:verify` to confirm specs and implementation coherence.
- [x] 8.2 Run `/opsx:sync` to fold the delta spec into `openspec/specs/trending-videos-feed/spec.md`.

## Notes

### 7.4 Comedy (23) verification — 2026-05-20
Tested in TW region. The 😄 喜劇 chip returned a populated list of comedy videos (no empty / no error). Confirms keeping `23` in `TRENDING_CATEGORY_WHITELIST` is correct as of this date.

