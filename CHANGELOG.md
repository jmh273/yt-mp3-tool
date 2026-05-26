# Changelog

## 0.13.0 - 2026-05-26

- Added a per-account local channel watchlist in the left pane.
- Changed similar-channel discovery cards to add channels to the watchlist instead of immediately subscribing.
- Added watchlist promotion to YouTube subscriptions through `POST /subscriptions/{channel_id}`.
- Added unit/component coverage and an `npm run verify -- add-channel-watchlist` Playwright smoke script.
