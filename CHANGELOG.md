# Changelog

## 0.13.1 - 2026-05-28

- Removed the 100-video cap on the latest-videos feed; `GET /latest-videos` now returns every video matching the time window and duration filter.
- Added client-side "載入更多" (load more) pagination to the latest-videos feed (50 per page); the count badge shows the true total and the shown/total progress, with the "已達上限" warning removed.
- Reload the subscription list immediately after account login.

## 0.13.0 - 2026-05-26

- Added a per-account local channel watchlist in the left pane.
- Changed similar-channel discovery cards to add channels to the watchlist instead of immediately subscribing.
- Added watchlist promotion to YouTube subscriptions through `POST /subscriptions/{channel_id}`.
- Added unit/component coverage and an `npm run verify -- add-channel-watchlist` Playwright smoke script.
