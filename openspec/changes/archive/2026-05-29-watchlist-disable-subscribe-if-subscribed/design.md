## Context

共用觀察名單上線後（[shared-watchlist-channel-transfer]），觀察名單面板 [WatchlistPanel.vue](frontend/src/components/WatchlistPanel.vue) 每個 row 都有「✕ 移除」與「➕ 訂閱」兩個 icon；「➕ 訂閱」呼叫 `watchlist.promote()` → `POST /subscriptions/{id}`，成功後從名單移除。目前 panel 並不知道目前帳號訂閱了哪些頻道。

目前帳號的訂閱清單在 [HomeView.vue](frontend/src/views/HomeView.vue) 的 `channels` ref（`Channel[]`，含 `channel_id`），WatchlistPanel 由 HomeView 以 `<WatchlistPanel @select-channel @subscribed />` 方式渲染。因此 HomeView 可直接把訂閱的 `channel_id` 集合下傳。

## Goals / Non-Goals

**Goals:**
- 觀察名單 row 的「➕ 訂閱」icon 在該頻道已訂閱時 disabled + tooltip「已訂閱」。
- 訂閱/取消訂閱後即時更新（reactive）。
- 不影響「✕ 移除」。

**Non-Goals:**
- 不改後端、不改 `promote()` 邏輯（仍成功即移除）。
- 不在訂閱頻道清單側做改動（那由 shared-watchlist 的「加入觀察名單」負責）。
- 不隱藏 row、不自動從名單移除已訂閱項目（使用者可能刻意保留以搬到別帳號）。

## Decisions

**1. 以 prop 下傳訂閱 id 集合。** HomeView 新增 computed `subscribedIds = computed(() => new Set(channels.value.map(c => c.channel_id)))`，傳給 `<WatchlistPanel :subscribed-ids="subscribedIds">`。用 `Set<string>` 讓 panel 內 `has` 判定為 O(1)。

**2. WatchlistPanel 新增 prop。** `defineProps<{ subscribedIds?: Set<string> }>()`，預設空 Set（panel 可獨立掛載/測試）。row 的「➕ 訂閱」按鈕：`:disabled="pendingId === item.channel_id || isSubscribed(item.channel_id)"`，其中 `isSubscribed(id) = props.subscribedIds?.has(id) ?? false`。tooltip：`:title="isSubscribed(item.channel_id) ? '已訂閱' : '訂閱'"`。

**3. Reactivity。** `channels` 變動（subscribe/unsubscribe）→ computed `subscribedIds` 重算 → prop 更新 → 按鈕 disabled 重算。無需額外 watch。

**4. promote 防呆。** 即便理論上不會被點到，`promote()` 進入點仍可在 `isSubscribed` 時提前 return，避免任何意外觸發 `POST`。屬低成本保險。

## Risks / Trade-offs

- **Set prop 的反應性。** 傳整個新 `Set` 物件（computed 每次重建）可確保 Vue 偵測到變動；若改傳同一 Set 並 mutate 則不會觸發更新——故 computed 必須回傳新 Set（如上）。
- **與 shared-watchlist 變更並存。** 兩個變更都改 `channel-watchlist` 的 spec，但本變更為 ADDED 新 requirement，與該變更的 MODIFIED/ADDED 作用於不同 requirement，封存 sync 時各自套用、不衝突。
