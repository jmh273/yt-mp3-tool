# 設計：強化發燒影片頁面

## Context

`/trending-videos` 端點目前 ([main.py:826-881](../../../backend/main.py#L826-L881)) 是同步路由，呼叫 YouTube Data API `videos.list?chart=mostPopular&regionCode=TW&maxResults=50`，把回傳的影片做時長過濾後一次回給前端。前端 [TrendingVideosFeed.vue](../../../frontend/src/components/TrendingVideosFeed.vue) 在 `onMounted` 時拿一次資料，往後不再分頁。

兩個既有限制：

1. `videos.list` 呼叫沒帶 `statistics` part，所以 `viewCount` 從未進入回傳資料。
2. 後端把全域 `min_duration_minutes` / `max_duration_minutes` 套用在發燒影片上，這個過濾邏輯只用在這一處的內聯版本（[main.py:856](../../../backend/main.py#L856)），其他 feed 走的是共享 `_apply_duration_filter` ([main.py:229-234](../../../backend/main.py#L229-L234))，**兩者互不相關**。

`VideoItem` 介面 ([download.ts:5-14](../../../frontend/src/stores/download.ts#L5-L14)) 是所有 feed 共用的；新增 `view_count?: number` 是 optional，不會破壞其他 feed 的型別。

## Goals / Non-Goals

**Goals:**
- 在發燒影片頁面顯示真實的 YouTube 播放數，採 3 個有效數字格式（`1.23M views` / `12.3K views` / `999 views`）
- 讓使用者看到的清單對齊 YouTube 真正的 mostPopular 排行（不再因時長過濾失真）
- 提供「載入更多」入口，使用者可以分頁瀏覽更深的排行
- 配額透明：載入更多按鈕顯示成本提示

**Non-Goals:**
- 不擴散到其他 feed（最新影片、頻道影片、搜尋）顯示播放數或分頁
- 不做 infinite scroll，採明確的按鈕點擊
- 不重新設計 trending 卡片版面（縮圖、標題、checkbox 都不動）
- 不引入新設定項目（沿用既有設定，僅停用其中一個過濾路徑）
- 不引入快取或記憶上一次 page_token 的行為（重新整理頁面即重新從第一頁開始）

## Decisions

### Decision 1: 新增 `view_count` 後端透過 `statistics` part 取得，不另起 API

**選擇**：在既有的 `videos.list` 呼叫 `part` 參數加上 `statistics`。

**理由**：
- YouTube `videos.list` 配額成本是 **每次呼叫 1 unit，與 part 數量無關**，所以加 `statistics` 完全免費。
- 不需要第二次 API 呼叫、不需要快取，回應一致性最強。
- `statistics.viewCount` 是 string 型別（YouTube 慣例），後端轉 `int` 後傳給前端，避免前端做字串解析。

**替代方案**：
- 另呼叫一次 `videos.list` 只拿 `statistics`：多一次呼叫、多 1 unit、響應慢，沒有理由。

### Decision 2: 移除發燒影片的時長過濾（不重構成可選參數）

**選擇**：直接刪除 [main.py:856](../../../backend/main.py#L856) 的 `if not (min_sec <= dur_sec <= max_sec): continue` 與不再需要的 `min_sec` / `max_sec` 區域變數讀取。

**理由**：
- 這段過濾邏輯在概念上與其他 feed 不同：其他 feed 過濾的是「我訂閱／搜尋的內容範圍」，發燒榜過濾排行是反直覺的（會讓使用者懷疑為何看到的不是 Top 50）。
- 這段邏輯目前是內聯的、只被 `/trending-videos` 使用，沒有共享呼叫端，刪掉是局部改動。
- 全域 `min_duration_minutes` / `max_duration_minutes` 設定保留，仍供其他 feed 使用，行為不變。

**替代方案**：
- 加一個 `apply_duration_filter` 查詢參數讓前端決定：增加 API 表面積，但實際上沒有「需要過濾的發燒影片」的使用情境，YAGNI。
- 加一個獨立設定 `trending_apply_duration_filter`：徒增設定面板複雜度。

### Decision 3: 分頁採 query 參數 `page_token`，前端累加到既有清單

**選擇**：
- 後端：`GET /trending-videos?page_token=ABC` (query 參數，opt-in)
- 後端：回應形狀變成 `{ "videos": [...], "next_page_token": "XYZ" | null }`
- 前端：videos ref 用 `push(...newItems)` 累加、用 `Set<video_id>` 去重保險、loading 狀態避免連點

**理由**：
- query 參數對前端 fetch 而言最簡單，與 YouTube API 的 `pageToken` 對應直觀。
- 累加而非取代符合「載入更多」的語意（使用者不會期待原本看的部分消失）。
- `next_page_token` 為 null 是最自然的「沒有下一頁」表達，前端用 `v-if="nextPageToken"` 控制按鈕顯示。
- 去重雖然 YouTube 通常不會給重複，但分頁過程若 chart 有變動可能出現邊界情況，前端做一道保險成本極低。

**替代方案**：
- 用 cursor pagination 介面 (`?after=video_id`)：YouTube API 本身就用 token，沒必要再包一層。
- POST + body：對純讀取的 GET 來說過度設計。

### Decision 4: 數字格式採「3 個有效數字」演算法，不引入第三方套件

**選擇**：在 `TrendingVideosFeed.vue` 的 `<script setup>` 中寫一個小型 `formatViewCount` 純函式：

```ts
function formatViewCount(n: number): string {
  if (n < 1000) return `${n} views`
  const units = [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
  ]
  for (const { v, s } of units) {
    if (n >= v) {
      const scaled = n / v
      // 3 個有效數字：根據量級決定小數位數
      let str: string
      if (scaled >= 100) str = scaled.toFixed(0)        // 123M
      else if (scaled >= 10) str = scaled.toFixed(1)    // 12.3M
      else str = scaled.toFixed(2)                       // 1.23M
      return `${str}${s} views`
    }
  }
  return `${n} views`
}
```

**理由**：
- 無依賴、純函式好測試。
- 採「3 個有效數字」（significant figures）能在所有量級看起來一致：`1.23M` / `12.3M` / `123M`。
- `Intl.NumberFormat` 的 `notation: 'compact'` 雖然原生支援，但在不同 locale 下行為不一致（zh-TW 會輸出「萬」），與本專案決定的 `M/K/B` 英文格式不符。

**替代方案**：
- `Intl.NumberFormat` with `compactDisplay: 'short'`：locale 不可控，棄用。
- 永遠 2 位小數（`12.34M`）：使用者已明確選 3 sig figs。

### Decision 5: 「載入更多」失敗保留既有清單，僅顯示錯誤

**選擇**：在「載入更多」失敗時：
- 不清空 `videos`
- 設一個 `loadMoreError` ref 顯示在按鈕下方
- 按鈕回到可點擊狀態，使用者可重試
- 主清單初次載入失敗仍走原本的 `error` ref 路徑

**理由**：
- 使用者已經看到的影片是有用資訊，因為一次失敗清空會破壞體驗。
- 與初次載入錯誤分開兩個 ref 比較清楚（不同情境用不同 UI 訊息）。

## Risks / Trade-offs

- **[Risk] YouTube `mostPopular` chart 的分頁深度未文件化** → 緩解：後端依賴 YouTube 回傳的 `nextPageToken`，當 token 為空就回 null，前端隱藏按鈕。對使用者透明、不需特別處理。

- **[Risk] 移除時長過濾後，使用者可能看到 Shorts (15-60 秒)** → 緩解：這就是 YouTube 真實排行，符合「發燒影片」定義。若後續使用者反饋強烈，可改用 `videoDuration=medium` 等 YouTube API 參數（屬於另一個 change）。

- **[Risk] `viewCount` 字串無法轉 int**（如 0 view 影片或欄位缺失）→ 緩解：後端用 `int(snippet.get("statistics", {}).get("viewCount", 0))` 並 try/except，失敗則設為 0。前端遇到 0 仍顯示「0 views」（`formatViewCount(0)` 會走 `< 1000` 分支）。

- **[Trade-off] 累加而非取代清單，會讓清單越拉越長** → 接受：使用者預期「載入更多」就是這個行為。若效能成為問題（影片 > 200 部）可再考慮 virtual scrolling。

- **[Trade-off] 重新整理頁面會丟失已載入的分頁進度** → 接受：發燒影片是即時排行，重整本來就應該回到第一頁的最新狀態。

- **[Risk] 前端 `Set<video_id>` 去重可能讓 YouTube 真實的位置變動失效**（如某影片從第 1 頁跌到第 2 頁時間差）→ 緩解：以「使用者已看到優先」為準則，不因為跨頁變動而移除已顯示項目。
