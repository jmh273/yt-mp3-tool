## 1. Store：全域開關狀態

- [x] 1.1 在 `frontend/src/stores/download.ts` 新增 `const allowRedownload = ref(false)`，置於 `downloadedIds` 附近以維持語意群聚；**不**註冊 localStorage `watch`、**不**加入任何清理 `selected` 的邏輯（design D2 / D3）
- [x] 1.2 將 `allowRedownload` 加入 store 的 `return`，使各元件可經 `download.allowRedownload` 讀寫
- [x] 1.3 在 `frontend/src/tests/stores.test.ts` 補測試：預設為 `false`、切換後不寫入 `localStorage`、切回 `false` 時 `selected` 內容不變

## 2. Header 開關控制項

- [x] 2.1 在 `frontend/src/views/HomeView.vue` 的 `<header>` `.header-actions` 內、quota 徽章旁新增「允許再次下載」checkbox，`v-model="download.allowRedownload"`
- [x] 2.2 於 `HomeView.vue` 引入 `useDownloadStore`（確認尚未引入則新增）— 既有 `downloadStore` 已引入，無需改動
- [x] 2.3 加上 scoped 樣式：沿用 `LatestVideosFeed.vue` `.redownload-toggle` 的小字灰階基調；ON 狀態給予輕微視覺強調，讓使用者在任一頁都能察覺目前已解鎖（design D5）
- [x] 2.4 新增 `frontend/src/tests/HomeView.redownload.test.ts`：header 渲染出開關、預設未勾選、點擊後 store 的 `allowRedownload` 變為 `true`

## 3. 最新影片頁遷移

- [x] 3.1 `LatestVideosFeed.vue` 移除區域 `const allowRedownload = ref(false)`，改讀 `download.allowRedownload`
- [x] 3.2 移除 `watch(allowRedownload, ...)` 整段 ON→OFF 清理選取的邏輯（design D3）— 連帶移除已無用的 `watch` import
- [x] 3.3 更新 template 的 `:checked` / `:disabled` 綁定改用 `download.allowRedownload`，`isAlreadyDownloaded()` 判定式維持不變（仍需涵蓋 `downloaded_on_disk`）— 抽出 `isBlocked()` 讓兩個綁定共用同一判定
- [x] 3.4 從 filter-bar 移除 `<label class="redownload-toggle">` 及其 scoped 樣式
- [x] 3.5 `const PAGE_SIZE = 50` 改為 `200`（design D6）

## 4. 其餘五個清單頁套用覆寫規則

各頁一律改為 `:disabled="download.isDownloaded(v.video_id) && !download.allowRedownload"` 與 `:checked="download.isSelected(v.video_id) || (download.isDownloaded(v.video_id) && !download.allowRedownload)"`（design D4；`:checked` 為必要修改，漏改則開關在該頁無效）

- [x] 4.1 `frontend/src/components/ChannelVideos.vue`
- [x] 4.2 `frontend/src/components/TrendingVideosFeed.vue`
- [x] 4.3 `frontend/src/components/SearchVideosFeed.vue`
- [x] 4.4 `frontend/src/components/SimilarChannelDiscoveryFeed.vue`
- [x] 4.5 `frontend/src/components/UrlDownloadFeed.vue` 的 checkbox 綁定
- [x] 4.6 `UrlDownloadFeed.vue` 的 `selectAllOnPage()`：已下載守門改為 `(!download.isDownloaded(v.video_id) || download.allowRedownload) && !download.isSelected(v.video_id)`
- [x] 4.7 `UrlDownloadFeed.vue` 的 `deselectAllOnPage()`：移除 `!download.isDownloaded(...)` 條件，改為只依 `download.isSelected(...)` 判斷，使開關 ON 時加入的已下載影片也能被「取消本頁」移除
- [x] 4.8 （實作時補）`SimilarChannelDiscoveryFeed.vue` 補上缺漏的「✅ 已下載」徽章與 `.dl-badge` 樣式——該頁原本完全沒有徽章，開關 ON 時使用者將無從辨識哪些影片已下載，與 `redownload-override` spec「徽章 SHALL 持續顯示」牴觸

註：4.1–4.5 的判定式以各元件內的 `isBlocked(videoId)` 小函式承載（與 `LatestVideosFeed` 的 `isBlocked(v)` 一致），避免同一長運算式在 template 重複兩次；語意與 design D4 相同。

## 5. 單元測試

- [x] 5.1 `frontend/src/tests/LatestVideosFeed.test.ts` **刪除**「關閉『允許再次下載』時，已下載的影片會從 download.selected 移除」一案（對應 spec 中刻意廢除的需求）— 改寫為驗證相反行為（項目保留）
- [x] 5.2 `LatestVideosFeed.test.ts` 既有兩案改為透過 store 設定 `allowRedownload`（元件內已無 `.redownload-toggle`），並新增一案驗證關閉開關後 `selected` 內容不變；另補「開關 ON 時點擊有勾選狀態變化」與「元件不再提供開關」兩案
- [x] 5.3 `LatestVideosFeed.test.ts` 新增分頁測試：結果 180 部時全部渲染且不顯示「載入更多」；結果超過 200 部時只渲染前 200 部並顯示「載入更多」— 另需**更新**三個原本寫死 50/120 的既有分頁測試為 200/480
- [x] 5.4 `ChannelVideos.test.ts`、`TrendingVideosFeed.test.ts`、`SearchVideosFeed.test.ts`、`SimilarChannelDiscoveryFeed.test.ts` 各補一組：開關 OFF 時已下載影片 `disabled` 且呈現已勾選；開關 ON 時可操作且呈現**未**勾選；ON 時點擊可加入 `selected` 並轉為已勾選（各 4 案，含關閉開關後 `selected` 不變）
- [x] 5.5 `UrlDownloadFeed.test.ts` 補測試：開關 ON 時「全選本頁」納入已下載影片；「取消本頁」可移除開關 ON 時加入的已下載影片（共 6 案）
- [x] 5.6 執行單元測試，確認全部通過 — `npx vitest run`：26 檔 / 261 案全數通過；`npx vue-tsc --noEmit` 無錯誤

## 6. e2e 驗證

- [x] 6.1 撰寫 `frontend/e2e/verify-redownload-override.ts`：header 開關存在且預設 OFF、於非最新影片頁（例如發燒影片或搜尋影片）開啟後已下載影片可勾選且徽章仍在、點擊有勾選狀態變化、關閉開關後選取項目仍保留在待下載清單（另含跨頁保持、重新整理回 OFF、localStorage 無殘留）
- [x] 6.2 更新 `frontend/e2e/verify-downloaded-on-disk-rootwide.ts`：`.redownload-toggle` 選擇器由最新影片頁 filter-bar 改為 header 位置 — 選擇器全頁唯一故不需更動，補上位置變更註解；重跑 4/4 PASS
- [x] 6.3 檢查 `frontend/e2e/verify-latest-videos-pagination.ts` 是否依賴頁面大小 50，若是則對齊 200 — 確有依賴（`TOTAL=120` / `PAGE_SIZE=50`），已改為 480 / 200；重跑 9/9 PASS
- [x] 6.4 執行 `verify-redownload-override.ts` 並確認全數 PASS — 11/11 PASS
