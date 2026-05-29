# Changelog

## 0.14.0 - 2026-05-29

- Changed the channel watchlist to a single list shared across all accounts (fixed `watchlist:shared` key); switching account no longer swaps the list. Previous per-account watchlists are discarded.
- Added a "加入觀察名單" action on each subscribed channel row to copy it into the shared watchlist (without unsubscribing) — enabling subscription transfer between accounts.
- Disabled the watchlist "➕ 訂閱" icon for channels already subscribed on the current account (tooltip「已訂閱」), with the "✕ 移除" action unaffected.
- Handled YouTube `subscriptionDuplicate` gracefully when subscribing from the watchlist: shows a neutral「此帳號已訂閱」notice and keeps the item, instead of a red error; fixed the doubled「訂閱失敗：」prefix on subscribe errors.

## 0.13.1 - 2026-05-28

- Removed the 100-video cap on the latest-videos feed; `GET /latest-videos` now returns every video matching the time window and duration filter.
- Added client-side "載入更多" (load more) pagination to the latest-videos feed (50 per page); the count badge shows the true total and the shown/total progress, with the "已達上限" warning removed.
- Reload the subscription list immediately after account login.

## 0.13.0 - 2026-05-26

- Added a per-account local channel watchlist in the left pane.
- Changed similar-channel discovery cards to add channels to the watchlist instead of immediately subscribing.
- Added watchlist promotion to YouTube subscriptions through `POST /subscriptions/{channel_id}`.
- Added unit/component coverage and an `npm run verify -- add-channel-watchlist` Playwright smoke script.
