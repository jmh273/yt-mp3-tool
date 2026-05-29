## 1. Store: shared cross-account watchlist

- [x] 1.1 In `frontend/src/stores/watchlist.ts`, change `storageKey()` to return the fixed constant `'watchlist:shared'` (no longer depends on `auth.currentAccount`).
- [x] 1.2 Remove the `watch(() => auth.currentAccount, () => load(), { immediate: true })` reload-on-account-switch logic; call `load()` once at store init instead so the list is account-independent.
- [x] 1.3 In `add()`, drop the `!auth.currentAccount` early-return; only skip when `has(channel.channel_id)` is already true.
- [x] 1.4 Confirm `promote()` is unchanged (still removes the item on successful subscribe).

## 2. Store tests

- [x] 2.1 In `frontend/src/tests/watchlist.test.ts`, update key assertions from `watchlist:alice@example.com` to the fixed `watchlist:shared`.
- [x] 2.2 Replace the "reloads on currentAccount change / account isolated" test with one asserting the list is shared: items added under account A are still present after switching `auth.currentAccount` to B, and adding under B is visible after switching back to A.
- [x] 2.3 Add a test: `add()` works when `auth.currentAccount === ''` (no login gate) and persists to `watchlist:shared`.
- [x] 2.4 Run `npx vitest run watchlist` and confirm all pass.

## 3. UI: "加入觀察名單" on subscription rows

- [x] 3.1 In `frontend/src/views/HomeView.vue`, add an "加入觀察名單" icon button to each subscription `.channel-card` row (next to the 🗑️ delete button), with `@click.stop` calling a new `addToWatchlist(ch)` handler that invokes `watchlist.add({ channel_id, title, thumbnail })`.
- [x] 3.2 Import/use the watchlist store in HomeView; bind the icon's already-added state to `watchlist.has(ch.channel_id)` (e.g. checked style + disabled so a repeat click is a no-op).
- [x] 3.3 Confirm the handler does NOT call `DELETE /subscriptions/{id}` (subscription stays; copy semantics).

## 4. WatchlistPanel empty/not-logged-in state

- [x] 4.1 In `frontend/src/components/WatchlistPanel.vue`, remove any "請先登入"-style blocking of the shared list; always render the shared watchlist. Keep the existing empty-state text when the list is empty.

## 5. Component tests

- [x] 5.1 Add a HomeView (or focused component) test: clicking the subscription row's "加入觀察名單" icon adds the channel to the watchlist store and the icon shows already-added state.
- [x] 5.2 Add a test: the icon is a no-op / disabled for a channel already in the watchlist, and clicking it does not call the unsubscribe (`apiDelete`) path.
- [x] 5.3 Run the relevant unit tests (`npx vitest run watchlist WatchlistPanel HomeView`) and confirm all pass.

## 6. Verify

- [x] 6.1 Write `frontend/e2e/verify-shared-watchlist-channel-transfer.ts`: mock `GET /subscriptions` for account A, add a channel to the watchlist from a subscription row, simulate account switch (mock different `/subscriptions` + `auth.currentAccount`), and assert the watchlist panel still shows the channel under account B.
- [x] 6.2 Run the verify script against the live app; only suggest verify/archive once it passes.
