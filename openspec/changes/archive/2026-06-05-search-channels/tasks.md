## 1. 後端頻道搜尋路由

- [x] 1.1 在 `backend/main.py` 新增 `GET /search-channels?q=`，呼叫 `youtube.search().list(part="snippet", q=q, type="channel", maxResults=50)`，`require_credentials()` 後執行
- [x] 1.2 成功時 `consume_quota(_QUOTA_SEARCH_LIST)`（100）；`q` 為空白時直接回 `{channels: []}` 且不呼叫 API、不計 quota
- [x] 1.3 將每筆映射為 `{channel_id: item.id.channelId, title: snippet.title, thumbnail: snippet.thumbnails.(medium|default).url}`，回傳 `{channels: [...]}`
- [x] 1.4 後端測試：mock `search().list` 驗證 q→帶 type=channel 參數、quota 計 100、空白 q 不打 API；沿用既有 `patch("main.build")` 慣例

## 2. 前端搜尋範圍 checkbox

- [x] 2.1 在 `SearchVideosFeed.vue` 新增兩個 checkbox：`影片`（預設勾）、`頻道`（預設不勾，標籤後綴「(約耗 100 配額)」），以 reactive state 控制
- [x] 2.2 搜尋按鈕在兩者皆未勾時 `disabled`；`handleSearch` 依勾選分別觸發影片搜尋與 `GET /search-channels`
- [x] 2.3 影片搜尋維持既有 yt-dlp 路徑與結果狀態，行為不變

## 3. 前端頻道結果區與頻道卡

- [x] 3.1 在 `SearchVideosFeed.vue` 加入「頻道」結果區（排在「影片」區之前），各區獨立 loading / 空狀態；兩區不混排
- [x] 3.2 頻道卡版面（圓形小縮圖 + 頻道名，比照訂閱清單 channel-card），引入 `useWatchlistStore`
- [x] 3.3 頻道卡「👁 加入觀察名單」綁 `watchlist.add` / `watchlist.has`（already-added 時 disabled）
- [x] 3.4 新增 prop `subscribedIds?: Set<string>` 與 `subscribed` emit；頻道卡「➕ 訂閱」呼叫 `POST /subscriptions/{id}`，`subscribedIds` 含之時顯示已訂閱 disabled，成功後 emit 讓 HomeView 補進訂閱清單
- [x] 3.5 在 `HomeView.vue` 把 `subscribedIds` 傳入 `SearchVideosFeed` 並接 `subscribed` 事件（沿用 `appendSubscribedChannel` 慣例）
- [x] 3.6 搜尋完成後呼叫 `quota.refresh()`

## 4. 測試

- [x] 4.1 `SearchVideosFeed` 單元測試：預設只搜影片不打 /search-channels；勾頻道後渲染頻道區；兩者皆未勾搜尋鈕 disabled
- [x] 4.2 頻道卡單元測試：加入觀察名單後 `watchlist.has` 為 true 且按鈕 disabled；已訂閱頻道訂閱鈕 disabled
- [x] 4.3 撰寫並執行 `frontend/e2e/verify-search-channels.ts`（Playwright，mock /search-channels 與 /subscriptions），覆蓋勾頻道搜尋→頻道卡→加觀察名單→訂閱；註冊進 `e2e/verify.ts` dispatcher；通過後再建議 verify/archive

## 5. 驗收

- [x] 5.1 `npx vitest run`（frontend）全綠、後端 `pytest` 相關測試綠
- [x] 5.2 `vue-tsc --noEmit` type-check 無新增錯誤
