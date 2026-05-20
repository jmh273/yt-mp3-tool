## Why

目前 🔥 發燒影片頁只顯示 TW region 的綜合 mostPopular 榜，結果被娛樂/綜藝主導，很難從中發現音樂、遊戲、新聞、運動等垂直題材的代表頻道。使用者想多參考不同類型的影片並挑選適合的頻道訂閱，需要一個能按題材篩選的入口。

## What Changes

- 在 🔥 發燒影片頁新增分類 chip row，使用者點 chip 即可切換到「該分類在 TW 的 mostPopular 榜」
- backend `GET /trending-videos` 新增可選 query 參數 `category=<id>`，內部對應 YouTube `videoCategoryId`；省略或 `null` 時行為與今日完全一致
- 新增 `GET /trending-videos/categories` endpoint，回傳前端用來生 chip 的清單（後端寫死）
- chip 順序：`[全部] [🎵 音樂] [🎮 遊戲] [🎬 娛樂] [📰 新聞] [⚽ 運動] [🎞 電影] [😄 喜劇]`
- 切換 chip 會清空目前列表並從第一頁重新抓取；切到別的 view 再回來不會持久化選擇（重置為「全部」）
- 載入更多沿用目前選中的分類
- 既有行為（mostPopular chart、`regionCode=TW`、排除 `liveBroadcastContent==upcoming`、`view_count`/`duration_seconds` 解析、分頁、quota 計費）全部不變

明確排除（follow-up）：
- 教育/科技/教學/Vlog 等長尾分類（YouTube 不為這些分類預算 mostPopular 榜，須走 100 quota 的 `search.list` fallback）
- 跨地區切換（regionCode）
- 結果快取
- 從卡片快速訂閱頻道的按鈕

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `trending-videos-feed`：新增「分類篩選」相關 requirements——`/trending-videos` 接受 `category` 參數、新增 `/trending-videos/categories` endpoint、發燒影片頁 chip row 行為、chip 切換重置分頁、load-more 沿用當前分類。

## Impact

- `backend/main.py`：`get_trending_videos` 加入 `category` 參數並組成 `videoCategoryId`；新增 `get_trending_categories` route 回傳寫死清單
- `backend/tests/`：新增 `/trending-videos?category=...` 與 `/trending-videos/categories` 的測試
- `frontend/src/components/TrendingVideosFeed.vue`：chip row UI、切換時清列表與分頁、load-more 帶分類、初始 fetch categories
- `frontend/src/stores/`：若 trending state 在 store 內，需新增當前選中 category 欄位
- `frontend/src/tests/`：補 chip row 測試
- `openspec/specs/trending-videos-feed/spec.md`：依本 change 的 delta 更新
- 不新增 npm / pip 套件，不影響 `/latest-videos` `/search-videos` `/subscriptions` 等其他 endpoint
- Quota 影響：每次 chip 切換或 load-more 仍是 1 quota，與既有行為一致
