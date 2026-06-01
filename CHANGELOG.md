# Changelog

## 0.15.0 - 2026-06-01

- Added batch upload of a day's downloads to Google Drive: creates `<drive_root_folder>/<date-folder>/` in the current account's Drive, skips files already present, and streams per-file progress over SSE. First use prompts a one-time `drive.file` reauthorization.
- Added a folder picker that lists local date folders under the output path and marks which are already fully uploaded on Drive.
- Reorganized the right pane into three tabs — 下載 / 音量正規化 / 上傳雲端硬碟 — moving the Drive upload UI out of the download panel into its own tab; renamed the upload button to「上傳雲端硬碟」.
- Changed the download「下載到」field and the upload local-directory field to show the full path (`<output_path>\YYYYMMDD`), consistent with the volume normalizer; downloads still resolve to the correct date folder by its last path segment.
- The volume-normalizer directory now defaults to, and follows, the download tab's full path until the user manually edits it or loads a directory.

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
