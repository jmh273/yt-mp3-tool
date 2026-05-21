## Context

「🔗 網址下載」目前由 `frontend/src/components/UrlDownloadFeed.vue` 與 `GET /url-preview` 兩端組成：

- 後端 `_sync_url_preview_yt_dlp` 用 `yt_dlp.YoutubeDL({"quiet": True, "extract_flat": True})` 解析網址，無論單一影片或播放清單都回傳一個 `videos: VideoItem[]` 陣列。
- 前端把整個陣列 `v-for` 在一個 grid 裡渲染，再透過 `useDownloadStore()` 的 `toggle / isSelected / isDownloaded` 做勾選與下載。
- 額外行為：解析後若 `videos.length === 1` 會自動把那部影片加入 `selected`。

實際使用上，YouTube 播放清單動輒有數十甚至上百部影片，全部塞進同一個 grid 既不易瀏覽，也容易誤勾「全選」把後端壓垮（每部影片各自 `yt-dlp` 下載 + ffmpeg 轉檔），與 `download-format-quality` / `local-quota-counter` 等規格的精神不符。

我們需要在不更動後端解析行為、也不引入新後端 API 的前提下，把 UI 改成分頁顯示，讓使用者能一次處理一批影片，把整份播放清單分梯次下載完成。

## Goals / Non-Goals

**Goals:**
- 在 `UrlDownloadFeed.vue` 內以純前端切片實作分頁，每頁預設 25 部，UI 提供 10 / 25 / 50 / 100 切換。
- 提供清楚的分頁列：上一頁 / 下一頁、目前頁碼 / 總頁碼、跳頁輸入框。
- 「全選 / 全不選」按鈕的語意改為「目前這一頁」，並且顯示整體進度（已選 X 部 / 共 Y 部）。
- 跨頁切換時保留勾選狀態（仰賴 `downloadStore.selected` 本身就是跨元件的 Pinia store）。
- 解析後一律不預設勾選任何影片，包含單一影片的情況。

**Non-Goals:**
- 不更動 `GET /url-preview` API 介面或 `_sync_url_preview_yt_dlp` 行為（仍一次回傳整份解析結果）。
- 不實作後端側的「分批排隊下載」——下載仍由現有 `POST /download` + SSE 進度機制處理；本次只負責 UI 層的批次選取。
- 不變更 `downloadStore` 的對外介面（`toggle / isSelected / isDownloaded / selected`）。
- 不處理 lazy / 漸進式載入（後端仍會在使用者解析時一次拉全部 metadata）。

## Decisions

### D1：分頁完全做在前端
- **選擇**：在 `UrlDownloadFeed.vue` 內用 `computed` 對 `videos` 做切片，狀態為 `pageSize` (`ref<number>`) 與 `currentPage` (`ref<number>`)。
- **替代方案**：在後端加 `?page=&page_size=` 參數讓 `_sync_url_preview_yt_dlp` 回傳分頁結果。
- **理由**：`yt-dlp` 的 `extract_flat=True` 解析整份清單的成本主要在第一次呼叫，後端分頁只能省下序列化成本，但會把分頁狀態硬塞進 API、讓快取與「跨頁勾選保留」變難。前端切片實作簡單、回應即時、不影響其他呼叫者。

### D2：每頁大小固定預選項，避免任意輸入
- **選擇**：下拉選單只提供 `10 / 25 / 50 / 100`，預設 25。改動 `pageSize` 時自動將 `currentPage` 重置為 1。
- **替代方案**：允許自由輸入任意正整數。
- **理由**：固定選項可避免極端值（例如 1、5000）造成的 UI 卡頓與重排成本，也符合此功能「幫使用者切批次」的核心目的。

### D3：「全選 / 全不選」改為作用在目前頁
- **選擇**：按鈕改名為「全選本頁 / 取消本頁」，迴圈只針對 `pagedVideos`（當前頁切片）的影片呼叫 `download.toggle`。
- **替代方案**：保留原本「全選整個解析結果」的語意。
- **理由**：分頁的目的就是避免一次處理太多影片，全選整個清單會直接違反這個前提；改成「每頁全選」則自然形成「逐批下載」的工作流。

### D4：跨頁勾選狀態仰賴 `downloadStore.selected`
- **選擇**：不在 `UrlDownloadFeed.vue` 內再維護一份「已勾選 ID」集合，所有 `:checked` 直接讀 `download.isSelected(video_id)`。
- **替代方案**：在元件內額外維護 `Set<string>` 緩存。
- **理由**：`downloadStore.selected` 已經是跨頁、跨元件共用的真實狀態；額外緩存只會引入不一致風險。下載完成後 store 會把該 ID 從 `selected` 移除並加入 `downloadedIds`，分頁列只要重新計算 `selectedCount` 就會反映。

### D5：解析後不自動勾選任何影片
- **選擇**：移除 `videos.length === 1` 時自動 `toggle` 的程式碼，所有勾選都由使用者主動完成。
- **替代方案**：保留單一影片自動勾選的行為。
- **理由**：與分頁/批次的整體精神保持一致，避免「貼一個單一網址結果就被偷偷加進佇列」的不可預期感；單一影片時使用者只要勾一下也並不費力。

### D6：分頁列 UX
- **選擇**：採「上一頁 ‹ ／ 第 X / Y 頁 ／ › 下一頁」加上「跳到第 [ ] 頁」輸入框。頁碼變化時自動把網格捲到頂端。
- **替代方案**：完整頁碼列（1 2 3 … 10）。
- **理由**：完整頁碼列在 100+ 頁的播放清單下會過於擁擠；上一頁/下一頁 + 跳頁框已能覆蓋 80% 用例。

## Risks / Trade-offs

- **[Risk] 解析超大型播放清單時瀏覽器渲染壓力**：即便只渲染當頁，`videos` 本身仍是完整陣列，會在 `apiGet` 回傳時一次反序列化。
  → **Mitigation**：保留現有後端行為（`extract_flat=True` 只取 metadata，回應體不會太大），不額外處理；若日後遇到 1000+ 影片的清單再考慮 lazy load。

- **[Risk] 使用者切到第 N 頁、按下「下載」後又回頭瀏覽其他頁面**：勾選來自其他頁面的影片可能在 `SelectedVideos` 元件中已被加入下載任務。
  → **Mitigation**：沿用 `downloadStore.startDownload()` 既有行為（只有顯式呼叫才會送下載），UI 只負責勾選；不在 `UrlDownloadFeed` 內觸發下載。

- **[Risk] 行為變更：移除單一影片自動勾選可能讓老用戶覺得「按了解析卻沒反應」**。
  → **Mitigation**：解析後在標題列補一行提示「請勾選要下載的影片」，並維持「✅ 已下載」徽章以保留視覺回饋。

- **[Trade-off] 不在後端做分頁**：API 仍會一次回傳完整清單，理論上比後端切片多耗一些頻寬，但換得「跨頁勾選自然保留」的單純實作。

## Migration Plan

1. 直接在 `UrlDownloadFeed.vue` 內升級 UI 與邏輯，無資料庫 / 持久化遷移需要。
2. 由於 `downloadStore` 介面不變，其他元件（`HomeView.vue`、`SelectedVideos.vue`）無需修改。
3. 若實作後發現體驗有問題，回滾只需還原 `UrlDownloadFeed.vue` 即可（屬於單檔變更）。

## Open Questions

- 是否需要把使用者最後選的 `pageSize` 記到 `localStorage`？預設先不做，待實際使用回饋。
- 是否需要在使用者把當頁全部勾選後，於分頁列上加一個「下載本頁」捷徑按鈕？預設先不做，沿用右側 `SelectedVideos` 的「開始下載」入口即可，避免下載入口分散。
