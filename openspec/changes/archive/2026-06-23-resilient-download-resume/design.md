## Context

下載流程的狀態分散在四處（前端記憶體 / localStorage / 後端記憶體 / 磁碟）。其中「使用者選了哪些、還沒下載完哪些」的唯一來源是前端記憶體的 `selected[]`，它不落地——這是中斷後無法續的根因。本設計只補最小一層使其可續，不重構狀態模型。

相關既有行為（不改）：
- `run_download()` 每支影片獨立 try/except，失敗標 `error` 不中斷其他支；全部結束才把任務 `status` 設 `done`（見 `concurrent-downloads` spec）。
- 前端 SSE `onmessage`：`item.status==='done'` → `markAsDownloaded(vid)` → 從 `selected[]` 移除；失敗項不移除，因此**自然留在 `selected[]`**。
- `downloadedIds` 已用 localStorage（鍵 `yt_mp3_downloaded_ids`）持久化，可直接比照。

## Goals / Non-Goals

**Goals**
- `selected[]` 跨頁面重整/重啟存活（解情境 A，並讓情境 B 的重試撐得過重整）。
- 下載結束後，失敗項清楚可見，使用者知道再按下載是在重試哪些。

**Non-Goals**
- 不持久化「下載進度（progress）」本身。
- 不做後端任務落地、SSE 重連、`.part` 續傳、序號續編（Level 2/3）。
- 不新增後端 API 或改 `POST /download` payload。

## Decisions

### D1：持久化放前端 localStorage，不放後端
- **選擇**：在 `useDownloadStore` 用 localStorage 持久化 `selected[]`，比照 `downloadedIds`。
- **理由**：「想下載哪些」是 client 的意圖清單；放前端改動最小，且**順帶**讓選取在後端重啟後也還在（情境 C 的一部分）。後端任務落地是 Level 2，刻意不在此處理。
- **取捨**：localStorage ~5MB 上限；`VideoItem` 含 thumbnail URL/title，單筆約數百 bytes，數十～數百支綽綽有餘，不另做壓縮。

### D2：用 deep watch 統一持久化，不在每個 mutator 各寫一次
- **選擇**：`watch(selected, persist, { deep: true })`，涵蓋 `toggle` 的 splice/push、`clearAll` 的賦值、`markAsDownloaded` 的 splice。初始化時 `JSON.parse` 載入，失敗 try/catch 忽略。
- **理由**：mutator 是原地變更陣列，集中一處 watch 比散落各 mutator 不易漏。
- **取捨**：deep watch 有序列化成本，但選取清單變動頻率低（人為點選），可忽略。

### D3：重試沿用既有「失敗留在 selected」路徑，不加新機制
- **選擇**：不新增「重試失敗」按鈕或後端端點；失敗項本就留在 `selected[]`，再按「下載選取影片」即重試。UI 只需把失敗項**顯示出來**。
- **理由**：既有路徑已正確，Level 1 的缺口只是「看不到 + 不持久」。加按鈕是多餘表面功夫。
- **備註**：若日後要更明確，可在 Level 2 加「重試失敗 (N)」按鈕；本層不做。

### D4：進度清單顯示條件改為「下載中 OR 有進度資料」
- **選擇**：`SelectedVideos.vue` 進度清單 `v-if` 由 `download.downloading` 改為 `download.downloading || Object.keys(download.progress).length > 0`；失敗項套 error 樣式。`clearAll()` 一併清空 `progress` 以移除殘留紅字。
- **理由**：結束後仍要看得到哪幾支失敗。`progress` 不持久化，故此可見性僅限同一 session；跨重整時以 `selected[]`（仍含失敗項）作為「還要下載什麼」的可靠來源，header「已選取 N 支」即重試信號。
- **取捨**：重整後失敗的紅字列表會消失（只剩 selected 計數），這是接受的——持久化 progress 屬 Level 2。

## Risks / Trade-offs

- **R1：持久化資料與真實磁碟狀態可能不一致**（例如使用者手動刪了已下載的檔，但 `downloadedIds`/`selected` 不知道）。本 change 不處理對帳；維持現狀。
- **R2：跨 session 的舊 `selected` 可能含已不存在/已下架的影片**。重試時該支會走既有 error 路徑標記失敗，不會 crash，可接受。
- **R3：`progress` 不持久化導致「結束後可見」只在同 session 成立**。已在 D4 說明並接受，避免滑入 Level 2。

## Migration / Verification

- 無資料遷移；localStorage 新增鍵 `yt_mp3_selected`，舊使用者初次載入為空陣列，行為等同現況。
- 驗證以 `frontend/e2e/verify-resilient-download-resume.ts`（Playwright）覆蓋：選取→重整→選取還在；模擬部分失敗→結束後失敗項可見且仍在 selected→重試只送失敗項。由驗證者撰寫並跑過才建議 archive。
