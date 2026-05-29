## Context

升級流程：[WatchlistPanel.vue](frontend/src/components/WatchlistPanel.vue) `promote()` → [watchlist.ts](frontend/src/stores/watchlist.ts) `promote()` → `apiPost('/subscriptions/{id}')`。

- 後端 [main.py:632-640](backend/main.py#L632-L640)：`POST /subscriptions/{id}` 失敗時 `raise HTTPException(detail=f"訂閱失敗：{msg}")`，duplicate 時 status 409；`msg` 內含原始 `HttpError ... subscriptionDuplicate`。
- 前端 [api.ts:20](frontend/src/api.ts#L20)：`apiPost` 非 2xx → `throw new Error(detail)`，故 `error.message` = 「訂閱失敗：<HttpError...subscriptionDuplicate>」。
- `watchlist.promote()` catch → 回傳 `{ success: false, error: e.message }`。
- `WatchlistPanel.promote()` 失敗分支 → `showToast(\`訂閱失敗：${result.error}\`, 'error')` → 雙重前綴。

## Goals / Non-Goals

**Goals:**
- duplicate 視為非錯誤：中性提示，不顯示紅錯。
- 保留觀察名單該項（不自動移除）；不在左欄清單追加。
- 修掉「訂閱失敗：訂閱失敗：」雙重前綴。

**Non-Goals:**
- 不改後端（duplicate 偵測沿用 detail 內 `subscriptionDuplicate` 字串）。
- 不改其他失敗（quota/forbidden/notFound）的錯誤行為（除了去掉雙重前綴）。
- duplicate 時不移除名單項：共用名單可能保留「在他帳號已訂閱、待搬移」的頻道，且該頻道不一定出現在目前帳號訂閱清單，移除會讓它從畫面消失。

## Decisions

**1. duplicate 偵測放在 store。** `watchlist.promote()` 的 catch 中以 `/subscriptionDuplicate|already exists/i` 判斷 `e.message`。命中時**不** `remove()`，回傳 duplicate 結果變體。

**2. PromoteResult 增加 duplicate 變體。**
```ts
export type PromoteResult =
  | { success: true; channel: PromotedChannel; subscription_id: string }
  | { success: false; duplicate: true }
  | { success: false; error: string }
```
duplicate 時回傳 `{ success: false, duplicate: true }`（不帶 channel；不移除項目）。

**3. Panel 分流。** `promote()`：
- `result.success` → 既有行為：toast「已訂閱：{title}」+ emit `subscribed` + （store 已移除項目）。
- `!result.success && 'duplicate' in result` → 以**中性樣式**顯示「「${item.title}」此帳號已訂閱」（title 取自當下點擊的 row item）；**不** emit `subscribed`；**不**移除項目。
- `!result.success`（一般錯誤）→ `showToast(result.error, 'error')`（去掉二次前綴；`result.error` 已含後端「訂閱失敗：」）。

**4. 中性樣式。** duplicate 提示用非紅色（例如 success/info 樣式）；可沿用既有 toast 的 `success` type 或新增 `info` type。實作時取現有可用樣式即可，重點是「不是紅色錯誤」。

## Risks / Trade-offs

- **字串偵測脆弱性。** 以 `subscriptionDuplicate` 子字串判斷；此 reason 來自 YouTube API 且穩定出現在 HttpError 內容中，可接受。若日後後端改回傳結構化錯誤，再改判斷來源即可。
- **取 title 的時機。** Panel 在呼叫前先存下該 row 的 `item.title`（duplicate 結果不帶 channel），用於提示文字。
- **與 disable 變更重疊功能。** 兩者都針對「已訂閱」；disable 防點擊但**依賴 `GET /subscriptions` 是否含該頻道**，而 YouTube `subscriptions.list` 有同步延遲（已訂閱頻道可能暫時不在清單中），故 disable 為 best-effort、無法保證。本變更以 `subscriptions.insert` 回報的 `subscriptionDuplicate` 兜底所有漏接情況（含 list 延遲、跨帳號）。互補，不衝突。
