## Context

目前 `HomeView.vue` 採垂直堆疊佈局，頻道清單與影片列表為手風琴（accordion）模式。使用者訂閱頻道多時（測試環境有 125 個）需大量捲動，且無法同時看到頻道清單與影片內容。後端 RSS 解析目前不擷取影片長度（duration）。

## Goals / Non-Goals

**Goals:**
- 重構主頁為持久性左右分欄，頻道切換不需捲動
- 點選頻道後右欄即時更新，無頁面跳轉
- 新增後端 `/latest-videos` 端點，並發擷取所有頻道 RSS
- 前端新增跨頻道最新影片視圖，帶時間篩選與影片長度顯示

**Non-Goals:**
- 不實作虛擬捲動（左欄頻道數量可接受原生捲動）
- 不支援多個頻道同時選取顯示（右欄同一時間只顯示一個來源）
- 不修改下載流程與 `SelectedVideos` 元件

## Decisions

### 1. 佈局：CSS Grid 兩欄

選擇 CSS Grid（`grid-template-columns: 260px 1fr`）而非 Flexbox，原因是左欄寬度固定、右欄自適應，Grid 表達更直接。左欄可捲動（`overflow-y: auto`），右欄獨立捲動。

**替代方案考慮**：Flexbox — 可行，但需額外處理右欄高度與捲動，Grid 語意更清楚。

### 2. 選中頻道狀態：元件本地 ref（非路由參數）

`selectedChannelId` 存於 `HomeView` 的 `ref`，不寫入 URL。

**理由**：此為純 UI 選擇狀態，不需要書籤或分享。引入路由參數會使 guard 邏輯複雜化，且與下載狀態（`SelectedVideos`）的全域 store 衝突。

**替代方案考慮**：query param `?ch=xxx` — 支援書籤，但增加 router guard 複雜度，目前需求不需要。

### 3. 右欄內容模式：`activeView` 字串控制

右欄使用 `activeView: 'channel' | 'latest' | 'none'` 搭配 `v-if` 切換，而非巢狀路由：

- `'none'`：顯示佔位提示「請選擇頻道」
- `'channel'`：顯示 `ChannelVideos`（傳入 `channelId`）
- `'latest'`：顯示新的 `LatestVideosFeed`

**理由**：三種視圖共享右欄容器，不需要獨立路由。巢狀路由需改動 router/index.ts 與 guard，風險較高。

### 4. 後端最新影片 API：並發 aiohttp + asyncio.gather

`GET /latest-videos?hours=24` 使用 `asyncio.gather` 並發擷取所有頻道 RSS，再過濾 `published` 在 `hours` 小時內的影片，依 `published` 降序排序後回傳。

```
每頻道 timeout = 6s，整體 gather 不設總 timeout（前端自行控制）
回傳欄位：video_id, title, published, thumbnail, url, duration, channel_title, channel_id
```

**替代方案考慮**：前端逐頻道呼叫 `/subscriptions/{id}/videos` — 串行太慢（125 頻道 × 平均 3s = 375s），不可行。

### 5. 影片長度解析：RSS `media:content duration` 秒數轉 MM:SS

YouTube RSS 的 `<media:content duration="XXX"/>` 提供秒數整數。後端解析後回傳秒數（`duration_seconds: int`），前端格式化為 `MM:SS`（超過 60 分鐘顯示 `H:MM:SS`）。

**理由**：原始秒數方便前端排序與比較；格式化邏輯屬 UI 責任。

### 6. 設定欄位：`latest_hours`（整數，預設 24）

新增至 `DEFAULT_SETTINGS` 與 `SettingsUpdate` model，前端設定頁以數字輸入框呈現，最小值 1、最大值 168（7 天）。

## Risks / Trade-offs

- **[風險] 125 頻道並發 RSS 請求** → 緩解：`aiohttp` 並發 + 每個 6s timeout，預期 10-15s 完成；前端顯示 loading 狀態，超時頻道靜默略過
- **[風險] `ChannelVideos` 被多處使用** → 緩解：元件本身無狀態改動，只移除父層的折疊邏輯，props 介面不變
- **[風險] BREAKING 佈局改動破壞現有 UI 測試** → 緩解：更新 `ui_test.py` 與 `skill_test.py` 中依賴 `.channel-header` 點擊折疊的選擇器

## Migration Plan

1. 後端先新增 `/latest-videos` 與 duration 解析（不破壞現有 API）
2. 前端重構 `HomeView.vue` 佈局（BREAKING：移除 accordion，改為分欄）
3. 新增 `LatestVideosFeed.vue`
4. 設定頁新增 `latest_hours` 欄位
5. 更新 UI 測試選擇器

**Rollback**：Git revert `HomeView.vue`；後端新端點為純加法，不影響回滾。

## Open Questions

- 左欄頻道清單是否需要顯示「未讀/有新影片」標記？（暫定不做，保持 MVP）
- 最新影片超過 100 筆時是否分頁？（暫定前端只顯示前 100 筆）
