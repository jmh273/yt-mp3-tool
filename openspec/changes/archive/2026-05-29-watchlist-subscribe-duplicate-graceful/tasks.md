## 1. Store: treat subscriptionDuplicate as a non-error (keep item)

- [x] 1.1 In `frontend/src/stores/watchlist.ts`, extend `PromoteResult` with a `{ success: false; duplicate: true }` variant.
- [x] 1.2 In `promote()` catch, detect duplicate via `/subscriptionDuplicate|already exists/i.test(e?.message ?? '')`. On match: do NOT `remove()` and return `{ success: false, duplicate: true }`. Non-duplicate errors keep returning `{ success: false, error }`.

## 2. Panel: neutral message, keep item, no double prefix

- [x] 2.1 In `frontend/src/components/WatchlistPanel.vue` `promote()`, capture the row title before the call. When the result has `duplicate`, show a neutral (non-red) toast「「{title}」此帳號已訂閱」, do NOT emit `subscribed`, and leave the item in the list.
- [x] 2.2 Keep the normal success path (toast「已訂閱：{title}」+ emit `subscribed`; store already removed the item).
- [x] 2.3 In the generic-error branch, show `result.error` as-is (remove the extra「訂閱失敗：」prefix, since the backend detail already includes it).
- [x] 2.4 If the toast component only supports `success`/`error` types, reuse `success` (green) for the duplicate notice or add an `info` type — the key is it MUST NOT be the red error style.

## 3. Tests

- [x] 3.1 In `frontend/src/tests/watchlist.test.ts`, add a test: when `apiPost` rejects with a `subscriptionDuplicate` message, `promote()` returns `{ success: false, duplicate: true }` and the item REMAINS in the list.
- [x] 3.2 In `frontend/src/tests/WatchlistPanel.test.ts`, add a test: a duplicate rejection shows a non-red「此帳號已訂閱」toast, keeps the row, and does not emit `subscribed`.
- [x] 3.3 Update/confirm the existing promote-failure test: a non-duplicate error keeps the item and the toast text does not contain a doubled「訂閱失敗：訂閱失敗：」.
- [x] 3.4 Run `npx vitest run watchlist WatchlistPanel` and confirm all pass.

## 4. Verify

- [x] 4.1 Write `frontend/e2e/verify-watchlist-subscribe-duplicate-graceful.ts`: with a watchlist item present, mock `POST /subscriptions/{id}` to return 409 with a `subscriptionDuplicate` detail; click「➕ 訂閱」; assert a non-error「此帳號已訂閱」toast appears, the row REMAINS, and no red error toast is shown.
- [x] 4.2 Run the verify script against the live app; only suggest verify/archive once it passes.
