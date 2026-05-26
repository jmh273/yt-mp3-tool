## Context

「同類新頻道」是 v0.12.0 加入的 discovery feature，目前唯一的卡片動作是「➕ 訂閱」，呼叫 `POST /subscriptions/{channel_id}` 後卡片淡出移除。實務上發現使用者常想要「先看幾部影片再決定要不要訂閱」，但目前沒有中間態，按下去就直接寫進 YouTube 帳號訂閱（且 `subscriptions.insert` 一次吃 50 quota）。

引入「觀察名單」當作「訂閱前的暫存層」：純前端、localStorage、依帳號隔離；觀察名單頻道可以隨時查看其影片（複用既有泛用 endpoint `GET /channels/{id}/videos`），想要就一鍵升級成正式訂閱。

當前架構：
- 三欄佈局：左欄頻道清單 / 中欄內容 / 右欄下載&正規化（[HomeView.vue](frontend/src/views/HomeView.vue)）
- ChannelVideos.vue 已是泛用元件，吃 `channelId` prop、播放/下載/分頁都包好
- Pinia stores 模式（[stores/discovery.ts](frontend/src/stores/discovery.ts)、[stores/auth.ts](frontend/src/stores/auth.ts) 等）
- 多帳號切換已存在，`auth.currentAccount` 是反應式 ref

## Goals / Non-Goals

**Goals:**
- 把不可逆的「一鍵訂閱」拆成「加入觀察名單（輕、本地）→ 升級訂閱（重、寫 YouTube）」兩段
- 觀察名單與訂閱清單共用左欄版面（tab 切換），不擠出新的視覺區塊
- 觀察名單頻道的影片瀏覽完全沿用既有元件，零後端改動
- 跨帳號正確隔離（不會在 A 帳號看到 B 帳號的觀察名單）

**Non-Goals:**
- 觀察名單同步到雲端 / 後端持久化
- 觀察名單匯入匯出 / 跨裝置同步
- 從「最新影片」「發燒影片」「搜尋」等其他頁面加入觀察名單（先只開放從「同類新頻道」進）
- 觀察名單頻道的批次升級訂閱 / 批次移除

## Decisions

### Decision: 觀察名單存於 localStorage，不上後端

**選擇**: 用 `localStorage` + key `watchlist:<email>` 存 JSON。

**替代方案**:
- (a) 後端新增 `watchlist` table → 跨裝置同步好，但本次目標是「輕量暫存」，後端複雜度不值得
- (b) IndexedDB → overkill，觀察名單預期 < 100 項
- (c) 全域單一 localStorage key 不分帳號 → 多帳號使用者會撞名

**理由**: 與「先觀察一陣子再決定」的輕量定位相符；多帳號隔離只要把 email 嵌進 key 即可；之後若要升級成跨裝置同步，遷移路徑明確（讀 localStorage → 上傳一次性 migration）。

### Decision: 觀察名單影片清單複用 `GET /channels/{id}/videos`

**選擇**: 點觀察名單 row → `activeView = 'channel'` + `selectedChannelId = ch.channel_id` → 既有 [ChannelVideos.vue](frontend/src/components/ChannelVideos.vue) 自動接管。

**替代方案**:
- (a) 新增 `/watchlist/{id}/videos` endpoint → 完全沒必要，後端會做完全一樣的事
- (b) 為觀察名單做新元件 → 重複實作播放、下載、分頁邏輯

**理由**: 既有 endpoint 已不限定要訂閱頻道（[backend/main.py:762](backend/main.py#L762)），既有元件吃任意 `channelId`。零後端改動 + 零元件重做。配額計入自然遵循現有規則。

**邊界注意**: ChannelVideos 元件的「← 回最新動態」back button 文案沿用即可（點下去回 `activeView='latest'`），雖然語意稍微不貼，但避免改元件 props。可接受。

### Decision: 升級訂閱後不重新打 `/subscriptions` 全量

**選擇**: `watchlist.promote(id)` 成功後，store 直接把該頻道 object push 進 HomeView 的 `channels` ref（傳 callback 或透過新的訂閱 store 集中管理）。

**替代方案**:
- (a) 升級後 `apiGet('/subscriptions')` 重新拉全清單 → 浪費 quota
- (b) 不更新左欄，要求使用者重整 → 體驗差

**理由**: 已知頻道 metadata（title、thumbnail、channel_id）都在觀察名單 item 裡，直接組出 Channel object append 即可；`subscription_id` 後端會在 POST response 回傳。

**前置需求**: 確認 `POST /subscriptions/{channel_id}` 回傳的 body 含 `subscription_id`，若沒有要補。讀 [backend/main.py](backend/main.py) 確認後在 tasks 內處理。

### Decision: 左欄 tab bar 放在 5 個導覽按鈕「下方」

**選擇**:
```
左欄：
  [最新][發燒][搜尋][URL][同類新頻道]   ← 不變
  ─────────────────────────────────
  [訂閱]  [觀察名單]                    ← 新 tab bar
  ─────────────────────────────────
  (tab 內容區)
    - 訂閱 tab:    搜尋框 + 頻道清單 + 「檢查更新日期」
    - 觀察名單 tab: 觀察名單搜尋框 + watchlist 清單
```

**替代方案**:
- (a) tab bar 放最上面 → 會擠掉「最新影片」這類全域導覽，混淆「全域導覽」與「頻道來源」兩個維度
- (b) 觀察名單獨立頂層按鈕（不做 tab） → 失去「共用版面」的目標

**理由**: 「最新／發燒／搜尋／URL／同類」是全域內容導覽（影響中欄），「訂閱／觀察名單」是頻道來源切換（影響左欄自身），維度不同應視覺分離。

### Decision: 觀察名單為空 / 未登入時的 fallback

**選擇**:
- 未登入（`auth.currentAccount === ''`）：tab bar 仍顯示，但「觀察名單」tab 內容為空狀態提示「請先登入」
- 已登入但 watchlist 為空：顯示空狀態「還沒加入任何頻道，從『🔍 同類新頻道』把感興趣的頻道加進來」

**替代方案**: 未登入時隱藏 tab bar → 但訂閱 tab 已存在於未登入時（雖然也是空），保持一致比較簡單。

### Decision: SimilarChannelDiscoveryFeed 卡片按鈕：移除整個訂閱 flow

**選擇**: 完全移除 `handleSubscribe`、`subscribing` ref、`fadingOut` ref、`discovery.subscribe()` 的呼叫點、淡出動畫。改用單一「加入觀察名單」CTA。

**注意**: store 的 `discovery.subscribe()` action **保留**（觀察名單 promote 還是會呼叫到它，或它呼叫的 API）。但若 promote 改成走獨立 `api.subscribe()` 也可，待 tasks 細節決定。

**替代方案**: 保留「➕ 訂閱」並加上「👁 加入觀察名單」變成兩顆按鈕 → 違反「移除訂閱功能」的明確要求。

## Risks / Trade-offs

- **localStorage 上限**：典型瀏覽器 5–10MB 共用，觀察名單每項 < 500B，1000 項 < 500KB，遠低於限制 → 不擔心。
- **跨裝置不同步**：使用者在 A 裝置加的觀察名單，B 裝置看不到 → 接受，符合「輕量暫存」定位。
- **手動清 localStorage 會遺失**：使用者清快取會丟掉觀察名單 → 接受，本來就是 ephemeral 概念。
- **ChannelVideos 的「← 回最新動態」文案在觀察名單情境下語意微歪**：點下去會跳到「最新影片」而非回觀察名單 tab → 緩解：可在 props 加 optional `backLabel`/`onBack` 客製，但本次先不做（接受微歪以換取零元件改動）。實作時若太醜可加 prop。
- **升級訂閱失敗**：YouTube 端拒絕（頻道關訂閱、配額耗盡） → toast 顯示原因，項目留在觀察名單。
- **快速連點「✕ 移除」/「➕ 訂閱」**：兩個 icon 在同 row → 用 disabled-while-pending 防呆。
- **`auth.currentAccount` 切換時若觀察名單 store 沒收到事件**：會看到上一個帳號的觀察名單 → 用 Pinia watch 對 `auth.currentAccount` 反應，切換時 reload localStorage。Vitest 測試覆蓋此 case。

## Migration Plan

無資料遷移（觀察名單是新概念）。發佈步驟：

1. Frontend 部署完即生效
2. 老使用者第一次進入「同類新頻道」會看不到「➕ 訂閱」按鈕 → README / changelog 提及行為變更
3. 若需要回滾：revert frontend；localStorage 殘留的 `watchlist:*` key 不影響任何後端邏輯，自然失效

## Open Questions

- `POST /subscriptions/{channel_id}` 回傳 body 是否含 `subscription_id`？需要在 tasks 階段確認 [backend/main.py](backend/main.py) 對應 handler，若沒有要補上。
- 觀察名單 row hover 才顯示 icon 或永遠顯示？跟訂閱頻道卡片現在的「🗑️ on hover」一致，建議 hover-only。tasks 階段確認 UX。
