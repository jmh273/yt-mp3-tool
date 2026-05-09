## 1. 後端：`/trending-videos` 端點修改

- [x] 1.1 在 [main.py:836-841](../../../backend/main.py#L836-L841) 的 `youtube.videos().list(...)` 呼叫中，將 `part` 從 `"snippet,contentDetails"` 改為 `"snippet,contentDetails,statistics"`
- [x] 1.2 為端點函式 `get_trending_videos` 增加 `page_token: str | None = None` 查詢參數，並在呼叫 YouTube API 時加上 `pageToken=page_token`（僅當非 None 時）
- [x] 1.3 從 YouTube 回傳中讀取 `nextPageToken`，存為 `next_page_token` 變數（不存在時為 `None`）
- [x] 1.4 在迴圈中解析每個 item 的 `statistics.viewCount`，安全轉成 `int`：使用 `try/except (ValueError, TypeError)`，失敗或欄位缺失時回退為 `0`
- [x] 1.5 將 `view_count` 加入回傳的影片字典
- [x] 1.6 移除 [main.py:856](../../../backend/main.py#L856) 的時長過濾邏輯：`if not (min_sec <= dur_sec <= max_sec): continue`
- [x] 1.7 移除 [main.py:828-830](../../../backend/main.py#L828-L830) 不再使用的 `settings = load_settings()` / `min_sec` / `max_sec` 區域變數讀取
- [x] 1.8 將回傳形狀改為 `{"videos": videos, "next_page_token": next_page_token}`

## 2. 前端：型別與 store

- [x] 2.1 在 [download.ts](../../../frontend/src/stores/download.ts) 的 `VideoItem` interface 新增 `view_count?: number` 欄位

## 3. 前端：`TrendingVideosFeed.vue` 邏輯

- [x] 3.1 新增 `formatViewCount(n: number): string` 純函式，採 3 個有效數字格式（`< 1000` 不縮寫，否則用 `K` / `M` / `B`，依量級用 0 / 1 / 2 位小數）
- [x] 3.2 新增 `nextPageToken = ref<string | null>(null)` 狀態
- [x] 3.3 新增 `loadingMore = ref(false)` 狀態
- [x] 3.4 新增 `loadMoreError = ref('')` 狀態
- [x] 3.5 將 `onMounted` 邏輯抽成 `loadInitial()` 函式：呼叫 `apiGet<{videos, next_page_token}>('/trending-videos')`、覆寫 `videos.value`、更新 `nextPageToken.value`
- [x] 3.6 新增 `loadMore()` 函式：設 `loadingMore = true`、呼叫 `apiGet('/trending-videos?page_token=' + encodeURIComponent(nextPageToken.value!))`、用 `Set<video_id>` 去重後 `push` 到 `videos.value`、更新 `nextPageToken.value`、`finally` 內設 `loadingMore = false` 並 `quota.refresh()`、失敗時設 `loadMoreError.value`
- [x] 3.7 確認 `apiGet` 回傳型別已調整為 `{ videos: VideoItem[]; next_page_token: string | null }`

## 4. 前端：`TrendingVideosFeed.vue` UI

- [x] 4.1 在 `.meta` 區塊現有 `.date` 之後加入播放數 `<span class="views">`：顯示 `formatViewCount(v.view_count ?? 0)`，僅當 `v.view_count != null` 時渲染（避免後端尚未升級時顯示「0 views」）
- [x] 4.2 將 `.date` 與 `.views` 改為同一行（橫排 flex），中間以 `·` 分隔
- [x] 4.3 在 `<ul class="video-grid">` 之後加入 `v-if="nextPageToken"` 的「載入更多 (約消耗 1 配額)」按鈕
- [x] 4.4 按鈕點擊觸發 `loadMore()`、`:disabled="loadingMore"`、`loadingMore` 為 true 時改顯示「載入中...」
- [x] 4.5 在按鈕下方加 `v-if="loadMoreError"` 的錯誤訊息區塊
- [x] 4.6 為按鈕、views、錯誤訊息加上對應的 `<style scoped>` 樣式（按鈕置中、padding、border 等沿用本元件既有調性）

## 5. 前端：測試 (`TrendingVideosFeed.test.ts`)

- [x] 5.1 新增 case：`view_count` 1234567 應渲染「1.23M views」
- [x] 5.2 新增 case：`view_count` 12345 應渲染「12.3K views」
- [x] 5.3 新增 case：`view_count` 999 應渲染「999 views」
- [x] 5.4 新增 case：API 回傳 `next_page_token: null` 時，`button` 不應渲染
- [x] 5.5 新增 case：API 回傳 `next_page_token: "ABC"` 時按鈕渲染、點擊後第二次 API 呼叫帶 `?page_token=ABC` 並 append 新影片
- [x] 5.6 新增 case：載入更多失敗時，原本影片清單仍存在、錯誤訊息出現、按鈕回到可點狀態
- [x] 5.7 新增 case：mock 回傳一支 30 秒短片，應出現在清單（驗證沒被時長過濾刷掉）

## 6. 後端測試（若專案有後端測試框架，否則略過）

- [x] 6.1 確認專案是否有後端測試套件 (`backend/tests/` 或類似)
- [x] 6.2 若有，新增測試覆蓋：`/trending-videos` 不帶 `page_token` 回傳 `next_page_token`、帶 `page_token` 時 YouTube API 呼叫帶 `pageToken`、短片不被過濾、`view_count` 正確解析、`viewCount` 缺失時回退為 0

## 7. 驗證

- [ ] 7.1 在本機啟動前後端 (`start.bat` 或對應流程)，操作發燒影片頁面：確認播放數顯示、確認看得到短片、點擊「載入更多」確認影片增加（**待使用者手動驗證**）
- [ ] 7.2 觀察右上角配額計數器，確認每次點「載入更多」配額減少 1（**待使用者手動驗證**）
- [x] 7.3 跑前端測試 (`npm run test` 或對應指令) 確認全綠（本 change 新增的 11 個測試全部通過；7 個既有失敗在 `ChannelVideos.test.ts` 與 `authStore logout` 與本 change 無關）
- [x] 7.4 執行 `openspec validate enhance-trending-videos --strict` 確認 spec 通過
