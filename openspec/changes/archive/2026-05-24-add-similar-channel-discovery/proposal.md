## Why

使用者目前只能透過「訂閱頻道最新影片」和「該地區熱門影片」兩條路找下載素材，缺少「跟我訂閱的同類但我還沒訂閱的頻道」這條探索路徑。YouTube 官方首頁 ML 推薦 feed 沒有公開 API，無法直接複製，但使用者真正想要的「在自己感興趣的圈子裡發現新頻道」這個目的，可以用 Data API 既有訊號（subscriptions、channel keywords、mostPopular、search）組合出來。實作這個 tab 可以擴大可下載素材的廣度，同時保留專案目前「正規 OAuth + 配額計數」的設計姿態。

## What Changes

- 新增獨立 tab「🔍 同類新頻道」，顯示與使用者訂閱風格相似、但尚未訂閱的頻道的近期影片
- 後端新增 `GET /discovery/similar-channels` endpoint：回傳推薦影片列表 + 分頁 token
- 後端新增 `POST /discovery/subscribe` endpoint：將指定頻道加入使用者 YouTube 訂閱（呼叫 `subscriptions.insert`）
- 後端新增 in-memory cache（key by email），生命週期 = backend process，重啟即清空
- 前端「換一批」按鈕優先消費 cache 分頁，用完才打 API
- 訂閱動作後 UI badge 變「已訂閱」並於 1~2 秒淡出移除卡片
- 已下載過的影片在此 tab 直接過濾不顯示
- 載入策略 progressive：mostPopular 結果先顯示，search.list 結果回來再 merge
- 配額計入現有 daily quota counter

## Capabilities

### New Capabilities
- `similar-channel-discovery`: 推斷使用者興趣 profile，從同類但未訂閱的頻道挖掘近期影片並支援一鍵訂閱

### Modified Capabilities
<!-- 不修改現有 spec 的需求；新分頁只是新增，現有 trending/subscriptions 行為不變 -->

## Impact

- **後端** (`backend/main.py`):
  - 新增 endpoints `/discovery/similar-channels`, `/discovery/subscribe`
  - 新增 in-memory discovery cache (per-email keyed)
  - 沿用既有 `SCOPES`（`https://www.googleapis.com/auth/youtube` 已涵蓋 `subscriptions.insert`）
  - 沿用既有 `consume_quota()` 計數
- **前端** (`frontend/src/`):
  - 新增 `SimilarChannelDiscoveryView.vue`（或 component）
  - 新增 tab/route 進入點
  - api.ts 新增 client 函式
  - 沿用既有 video card 樣式 + 下載勾選機制
- **配額**: 首次切 tab ~816 units（含 8 × search.list），後續換一批 0 units；一次訂閱 50 units
- **不影響**: 現有 trending、subscriptions、latest-videos、URL 下載功能均保持原樣
- **e2e**: 新增 walkthrough 案例覆蓋 tab 切換、卡片顯示、訂閱、換一批、下載
