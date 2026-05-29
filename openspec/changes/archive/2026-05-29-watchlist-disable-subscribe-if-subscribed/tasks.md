## 1. Pass subscribed ids into the panel

- [x] 1.1 In `frontend/src/views/HomeView.vue`, add a computed `subscribedIds = computed(() => new Set(channels.value.map((c) => c.channel_id)))`.
- [x] 1.2 Pass it to the panel: `<WatchlistPanel :subscribed-ids="subscribedIds" ... />`.

## 2. Disable the subscribe icon for already-subscribed channels

- [x] 2.1 In `frontend/src/components/WatchlistPanel.vue`, add prop `subscribedIds?: Set<string>` (default empty Set) and a helper `isSubscribed(id) => props.subscribedIds?.has(id) ?? false`.
- [x] 2.2 On the "➕ 訂閱" button, set `:disabled="pendingId === item.channel_id || isSubscribed(item.channel_id)"` and `:title="isSubscribed(item.channel_id) ? '已訂閱' : '訂閱'"`.
- [x] 2.3 In `promote()`, early-return when `isSubscribed(channelId)` so it never POSTs for an already-subscribed channel.
- [x] 2.4 Confirm the "✕ 移除" button is unaffected (still enabled for subscribed channels).

## 3. Tests

- [x] 3.1 In `frontend/src/tests/WatchlistPanel.test.ts`, add a test: with `subscribedIds` containing a row's channel, that row's "➕ 訂閱" button is `disabled` and has title「已訂閱」, while its "✕ 移除" button stays enabled.
- [x] 3.2 Add a test: a row whose channel is NOT in `subscribedIds` keeps an enabled "➕ 訂閱" button; and clicking a disabled (subscribed) row's subscribe button does not call `apiPost`.
- [x] 3.3 Run `npx vitest run WatchlistPanel` and confirm all pass.

## 4. Verify

- [x] 4.1 Write/extend `frontend/e2e/verify-watchlist-disable-subscribe-if-subscribed.ts`: mock `GET /subscriptions` to include a channel, add that channel to the watchlist from its subscription row, open the watchlist tab, and assert its "➕ 訂閱" icon is disabled while "✕ 移除" works.
- [x] 4.2 Run the verify script against the live app; only suggest verify/archive once it passes.
