## 1. 前端：Player store

- [x] 1.1 新增 [frontend/src/stores/player.ts](../../../frontend/src/stores/player.ts)：`usePlayerStore` 定義 `currentVideoId: Ref<string | null>`、`isOpen` computed、`open(videoId)`、`close()`
- [x] 1.2 在 store 內加入背景 scroll 鎖：watch `currentVideoId`，非 null 時設 `document.body.style.overflow = 'hidden'` 並暫存原值；變回 null 時還原

## 2. 前端：VideoPlayerModal 元件

- [x] 2.1 新增 [frontend/src/components/VideoPlayerModal.vue](../../../frontend/src/components/VideoPlayerModal.vue)，採 `<script setup lang="ts">`
- [x] 2.2 引入 `usePlayerStore`，模板用 `v-if="player.isOpen"` 包整個 modal
- [x] 2.3 結構：`.modal-backdrop`（全螢幕 fixed）→ `.modal-content`（16:9，aspect-ratio）→ `<iframe>` + 右上角 `.close-btn`
- [x] 2.4 `<iframe>` 動態 `src`：`https://www.youtube.com/embed/${player.currentVideoId}?autoplay=1&rel=0`，`allowfullscreen`，`allow="autoplay; encrypted-media; picture-in-picture"`
- [x] 2.5 `.modal-backdrop` 加 `@click.self="player.close"`（只在點到 backdrop 自身才關閉，點到子元素不會冒泡觸發）
- [x] 2.6 `.close-btn` 加 `@click="player.close"`
- [x] 2.7 ESC keydown listener：`onMounted` 加 document-level listener、`onUnmounted` 移除；按 ESC 時若 `player.isOpen` 則呼叫 `player.close()`
- [x] 2.8 樣式：`.modal-backdrop` 覆蓋全螢幕半透明黑、`.modal-content` `width: min(90vw, 1280px); aspect-ratio: 16 / 9; max-height: 90vh`、iframe `width: 100%; height: 100%; border: 0`、`.close-btn` 圓形 `×` 按鈕在右上角

## 3. 前端：掛載到 App

- [x] 3.1 修改 [frontend/src/App.vue](../../../frontend/src/App.vue)：在最外層（route view 之外）加入 `<VideoPlayerModal />`，確保任何 view 切換都不會 unmount

## 4. 前端：5 個 feed 整合

- [x] 4.1 [TrendingVideosFeed.vue](../../../frontend/src/components/TrendingVideosFeed.vue)：在 `<img class="thumb">` 加 `@click="player.open(v.video_id)"`、加 `cursor: pointer`；`<script setup>` 引入 `usePlayerStore`
- [x] 4.2 [LatestVideosFeed.vue](../../../frontend/src/components/LatestVideosFeed.vue)：同上
- [x] 4.3 [ChannelVideos.vue](../../../frontend/src/components/ChannelVideos.vue)：同上
- [x] 4.4 [SearchVideosFeed.vue](../../../frontend/src/components/SearchVideosFeed.vue)：同上
- [x] 4.5 [UrlDownloadFeed.vue](../../../frontend/src/components/UrlDownloadFeed.vue)：同上
- [x] 4.6 為 5 個元件的 `.thumb` 樣式加上 `cursor: pointer`、可選的 hover 效果（如 `opacity: 0.95`）

## 5. 測試：Player store

- [x] 5.1 新增 [frontend/src/tests/playerStore.test.ts](../../../frontend/src/tests/playerStore.test.ts)
- [x] 5.2 case：初始狀態 `currentVideoId = null`、`isOpen = false`
- [x] 5.3 case：`open("abc")` 後 `currentVideoId = "abc"`、`isOpen = true`
- [x] 5.4 case：`close()` 後 `currentVideoId = null`、`isOpen = false`
- [x] 5.5 case：開啟後再 `open("xyz")`，`currentVideoId` 應更新為 `"xyz"`
- [x] 5.6 case：開啟時 `document.body.style.overflow === 'hidden'`，關閉後還原

## 6. 測試：VideoPlayerModal 元件

- [x] 6.1 新增 [frontend/src/tests/VideoPlayerModal.test.ts](../../../frontend/src/tests/VideoPlayerModal.test.ts)
- [x] 6.2 case：store 關閉時不渲染 modal DOM
- [x] 6.3 case：store 開啟時渲染 iframe，`src` 包含正確 `video_id`
- [x] 6.4 case：點 `.close-btn` 觸發 `player.close()`
- [x] 6.5 case：點 `.modal-backdrop` 自身觸發 `player.close()`
- [x] 6.6 case：點 `.modal-content`（iframe 容器）不觸發 `player.close()`
- [x] 6.7 case：按 ESC 鍵觸發 `player.close()`
- [x] 6.8 case：切換 video_id 時 iframe `src` 更新

## 7. 測試：feed 整合

- [x] 7.1 在 [TrendingVideosFeed.test.ts](../../../frontend/src/tests/TrendingVideosFeed.test.ts) 新增 case：點縮圖呼叫 `player.open(video_id)`
- [x] 7.2 在 [TrendingVideosFeed.test.ts](../../../frontend/src/tests/TrendingVideosFeed.test.ts) 新增 case：點 checkbox 不觸發 player.open（仍走原本下載勾選）
- [x] 7.3 在 [LatestVideosFeed.test.ts](../../../frontend/src/tests/LatestVideosFeed.test.ts) 新增 case：點縮圖呼叫 `player.open(video_id)`
- [x] 7.4 在 [SearchVideosFeed.test.ts](../../../frontend/src/tests/SearchVideosFeed.test.ts) 新增 case：點縮圖呼叫 `player.open(video_id)`
- [x] 7.5 在 [UrlDownloadFeed.test.ts](../../../frontend/src/tests/UrlDownloadFeed.test.ts) 新增 case：點縮圖呼叫 `player.open(video_id)`

## 8. 驗證

- [ ] 8.1 在本機啟動前後端，操作每個 feed 點擊縮圖：modal 彈出、播放開始、ESC / 背景 / × 三種方式都能關閉（**待使用者手動驗證**）
- [ ] 8.2 確認 checkbox 仍可正常切換下載勾選（不被縮圖點擊干擾）（**待使用者手動驗證**）
- [ ] 8.3 modal 開啟時背景無法滾動，關閉後恢復（**待使用者手動驗證**）
- [ ] 8.4 連續點不同影片，modal 內 iframe 正確切換（**待使用者手動驗證**）
- [x] 8.5 跑前端測試確認本 change 新增測試全綠（17/17 通過；7 個既有失敗在 `ChannelVideos.test.ts` 與 `authStore logout`，與本 change 無關）
- [x] 8.6 執行 `openspec validate stream-play-videos --strict` 確認 spec 通過
