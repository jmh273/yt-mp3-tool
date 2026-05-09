# 影片串流播放預覽 (Stream Play Videos)

## Why

目前使用者要試聽 / 試看一支影片來判斷是否值得加入下載清單，必須離開應用程式跳到 YouTube。對「先預覽再下載」這個自然流程造成中斷，也容易讓使用者忘記回來打勾。

新增「點縮圖即可串流播放」可以讓使用者：
- 在不離開應用程式的情況下確認影片內容
- 預覽完直接打勾加入下載清單
- 維持單一視覺焦點（modal）不打散瀏覽動線

## What Changes

- **新增**：所有影片清單卡片的縮圖點擊後，彈出 modal 內嵌 YouTube 官方播放器（`<iframe>`）
- **新增**：modal 支援 ESC、點背景、點關閉鈕三種方式關閉
- **新增**：modal 開啟時鎖背景 scroll
- **新增**：縮圖加上 `cursor: pointer` 與 hover 效果，讓使用者知道可點
- **不變**：checkbox 行為完全不變（位於縮圖上方，獨立觸發），仍然用來加入下載清單
- **不變**：後端零改動（純前端功能，使用 YouTube iframe API）
- **範圍**：套用於 5 個既有 feed 的卡片：發燒影片、最新影片、頻道影片、搜尋結果、URL 下載解析結果

## Capabilities

### New Capabilities
- `video-stream-playback`: 涵蓋 modal 播放器元件、播放器 store（管理開啟狀態與目前影片）、各 feed 卡片整合的點擊觸發、關閉互動

### Modified Capabilities
- *(無)* — 此次不修改既有 spec 的 requirements

## Impact

**程式碼**（純前端）：
- 新增 `frontend/src/components/VideoPlayerModal.vue`：modal 元件，包含 iframe、關閉按鈕、背景點擊、ESC 處理
- 新增 `frontend/src/stores/player.ts`：Pinia store 管理 `currentVideoId` 與 `isOpen` 狀態
- 修改 `frontend/src/App.vue`：在最外層掛載一次 `<VideoPlayerModal />`（單例）
- 修改 5 個 feed 元件：在 `<img class="thumb">` 加 `@click="player.open(v.video_id)"`、加 `cursor: pointer` 樣式
  - `TrendingVideosFeed.vue`
  - `LatestVideosFeed.vue`
  - `ChannelVideos.vue`
  - `SearchVideosFeed.vue`
  - `UrlDownloadFeed.vue`

**API / 後端 / 配額**：無影響。

**外部相依**：使用 YouTube 既有的 `https://www.youtube.com/embed/<video_id>` 嵌入 URL，無需額外 SDK 或 API key。

**測試**：
- 新增 `frontend/src/tests/VideoPlayerModal.test.ts` 涵蓋元件行為
- 新增 `frontend/src/tests/playerStore.test.ts` 涵蓋 store 行為
- 在現有 feed 測試（如 `TrendingVideosFeed.test.ts`）新增點擊縮圖開啟 modal 的 case

**已知限制**：
- iframe 嵌入會帶 YouTube 廣告（無法移除，這是嵌入 API 的代價）
- 需要網路連線才能播放
- 部分頻道設定為「不允許嵌入」時，YouTube iframe 會顯示錯誤頁面（這是 YouTube 政策，不是本功能可控）
