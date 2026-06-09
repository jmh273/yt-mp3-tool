## Context

搜尋頻道卡的訂閱動作 [SearchVideosFeed.vue:197-218](frontend/src/components/SearchVideosFeed.vue#L197-L218) 目前以 `catch {}` 靜默處理所有失敗，註解標明「v1：訂閱失敗或 duplicate 先靜默忽略」。配合 `subscriptions.list(mine=true)` 的同步延遲（[[project_youtube_subscriptions_list_lag]]），已訂閱頻道可能不在 `subscribedIds`（由 [HomeView.vue:263](frontend/src/views/HomeView.vue#L263) 從 `GET /subscriptions` 即時 computed），導致「訂閱鈕仍可按 → 點了打 insert → 回 409 → 被吞掉 → 使用者毫無回饋」。

後端 [main.py:662-698](backend/main.py#L662) 已能把 `subscriptionDuplicate` 對應成 409，並在 `detail` 內含一次「訂閱失敗：」前綴；本變更**不動後端**。先前 `watchlist-subscribe-duplicate-graceful` 已對觀察名單路徑建立「duplicate 視為成功」的範式，本變更把同範式套到搜尋頻道路徑，並補上目前全站缺少的 toast 通知基礎。

`subscribedIds` 無任何持久化（不存 localStorage），每次開頁都從 `GET /subscriptions` 重抓，事實來源永遠是 YouTube。樂觀標記僅為當下 session 的即時回饋；正確性靠 server 重抓 + 409 冪等化在任何機器補滿，因此不需要、也不採用 unsubscribe+resubscribe。

## Goals / Non-Goals

**Goals:**
- 訂閱動作對使用者**永遠有可見回饋**（成功 / 已訂閱 / 錯誤），不再靜默。
- 409 duplicate 視為冪等成功：中性提示 + 樂觀標記已訂閱。
- 建立可全站複用的 toast 機制，作為後續改動 B 的通知基礎。

**Non-Goals:**
- 不改後端訂閱相關邏輯。
- 不做 unsubscribe+resubscribe 強迫刷新（風險>收益，且拿不到 sub_id）。
- 不解決 list 同步延遲本身（屬改動 B 的對帳範疇）。
- 不做 toast 的進階特性（佇列上限策略、動畫編排、可操作按鈕）超出本案所需。

## Decisions

### D1：toast 用 Pinia store + 單一 host 元件

沿用專案既有 Pinia 範式（如 `frontend/src/stores/watchlist.ts`）。`stores/toast.ts` 管理 `notifications: Notification[]`，提供 `success/error/info/dismiss`；`ToastHost.vue` 掛在 [App.vue](frontend/src/App.vue) 根，`v-for` 渲染佇列、各則自動 setTimeout 移除。

- **為何不用第三方 toast 套件**：專案目前無此依賴，需求極簡（三類型 + 自動消失），自製可控且零新增依賴，與既有 store 風格一致。
- **為何 store 而非 provide/inject 或事件匯流排**：任意元件可直接 import，無需 props 串接（正是 `SearchVideosFeed` 目前缺的）；與 watchlist store 同心智模型。

### D2：409 偵測依後端語意，前端不重複前綴

已確認 [api.ts](frontend/src/api.ts) 的 `apiPost` 失敗時 `throw new Error(detail)`——**不帶 HTTP status**，只有訊息字串（即後端 `detail`）。因此 409 的判定只能**比對訊息是否含 `subscriptionDuplicate`**：含之 → `toast.info`/`success`「『{title}』此帳號已訂閱」+ `emit('subscribed')`；否則 → `toast.error(err.message)`。後端 `detail` 形如 `訂閱失敗：<HttpError ...>`，已含一次「訂閱失敗：」前綴，前端**直接顯示 `err.message`、不再加前綴**（修正先前重複前綴問題）。

### D3：duplicate 樂觀標記沿用 `emit('subscribed')`

成功與 409 duplicate 都呼叫既有 `emit('subscribed', channel)` → [HomeView.appendSubscribedChannel](frontend/src/views/HomeView.vue#L291) 去重後 push 進 `channels.value`，按鈕經 `subscribedIds` computed 立即變已訂閱並 disable。duplicate 情境下 `channel` 物件可由頻道卡自身資料（`c.channel_id/title/thumbnail`）組出（後端 409 不回 channel body）。

## Risks / Trade-offs

- **樂觀標記不持久** → 換機器或重整、且 YouTube 仍延遲時，按鈕可能又可按。**Mitigation**：再點即冪等 409 → 中性提示，不產生重複訂閱、不報錯；正確性由 server 重抓補滿。此為可接受行為，非 bug。
- **409 判定依賴錯誤形態** → 若 `apiPost` 未暴露 status，需 fallback 比對 detail 字串 `subscriptionDuplicate`。**Mitigation**：實作前先讀 api.ts 確認；以 `subscriptionDuplicate` 子字串為穩定信號（後端確定帶此字串）。
- **toast 與既有錯誤呈現（HomeView `error.value`）並存** → 短期兩種錯誤呈現方式並用。**Mitigation**：本案僅就訂閱路徑導入 toast，不強制遷移既有 error 顯示，避免擴大範圍。
