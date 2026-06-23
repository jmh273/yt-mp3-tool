## 1. 選取清單持久化（download-resume）— `frontend/src/stores/download.ts`

- [x] 1.1 在 store 初始化時，從 localStorage 鍵 `yt_mp3_selected` 載入 `selected`（比照既有 `downloadedIds` 的 `try { JSON.parse } catch { /* ignore */ }` 模式）。損毀或缺漏 → 以 `[]` 啟動，不拋錯。
- [x] 1.2 新增持久化：`watch(selected, () => localStorage.setItem('yt_mp3_selected', JSON.stringify(selected.value)), { deep: true })`。需涵蓋 `toggle`（push/splice）、`clearAll`（賦值）、`markAsDownloaded`（splice）所有變動路徑。
- [x] 1.3 `clearAll()`：清空 `selected` 之外，一併清空 `progress`（`progress.value = {}`），避免下載結束後殘留的失敗紅字。
- [x] 1.4 確認 `markAsDownloaded` 仍只在 `status==='done'` 被呼叫、失敗項不被移除（既有行為，勿改）；成功移除後持久化由 1.2 的 watch 自動處理。

## 2. 下載結束後失敗項可見（download-resume）— `frontend/src/components/SelectedVideos.vue`

- [x] 2.1 進度清單顯示條件由 `v-if="download.downloading"` 改為「下載中 **或** 有進度資料」：`v-if="download.downloading || Object.keys(download.progress).length > 0"`。
- [x] 2.2 失敗項以 error 樣式標示（既有 `.bar.error` 紅色已存在；確認 `item.status === 'error'` 時 bar 套 error class，且 `statusLabel('error')` 顯示「失敗」）。結束後失敗項在清單中清楚可辨。
- [x] 2.3 確認結束後「下載選取影片」按鈕可再次點擊（`download.downloading` 為 false 時不 disabled），按下即以仍在 `selected` 的（失敗）影片重送批次。不新增「重試」按鈕、不改 `startDownload` 簽章。
- [x] 2.4 確認既有的成功摘要（「下載完成！共 N 支…失敗」）與保留可見的進度清單並存不衝突。

## 3. 測試（download-resume）

- [x] 3.1 `frontend/src/tests/`：store 持久化 round-trip 單元測試——選取 → 讀 localStorage `yt_mp3_selected` 內容相符；新建 store 實例能還原；損毀 JSON → 空清單不拋錯；`clearAll` 後 localStorage 與 `progress` 皆空。
- [x] 3.2 `frontend/src/tests/`：`SelectedVideos` 元件測試——模擬一批部分失敗（progress 含 done + error），`downloading` 轉 false 後進度清單仍渲染、失敗項有 error 樣式。
- [x] 3.3 跑既有相關測試確認無回歸：`SelectedVideos.test.ts`、`SelectedVideosDateRollover.test.ts`、`stores.test.ts`、`autoPipeline` 相關。

## 4. 還原選取可見性（download-resume）— `SelectedVideos.vue` / `HomeView.vue`

- [x] 4.1 `SelectedVideos.vue`：在「已選取 N 支」下方逐列列出 `selected` 每支影片標題，各帶 ✕ 移除鈕（呼叫 `download.toggle(v)`，`download.downloading` 時 disabled）。
- [x] 4.2 `HomeView.vue`：`activeView` 初始值一律設為 `latest`，進入即自動載入最新影片（讓還原選取的勾選狀態可見、使用者一進來就有內容）；僅作用於進入時初始畫面，之後切換分頁／頻道不受干擾。
- [x] 4.3 `frontend/src/tests/`：面板列出已選標題、✕ 逐筆移除；HomeView 進入即落在 `latest`（有/無還原選取皆然）。全套無回歸、`vue-tsc --noEmit` 乾淨。

## 5. 驗證（驗證者負責，非 codex）

- [x] 5.1 撰寫 `frontend/e2e/verify-resilient-download-resume.ts`（Playwright）：
      (a) 選取數支 → 重整 → 待下載清單仍在（含標題列）；
      (b) 觸發下載後模擬部分失敗 → 結束後失敗項可見且仍在 `selected`；
      (c) 再按下載 → 送出批次僅含失敗影片。
- [x] 5.2 跑通 verify 腳本（過了才建議 `/opsx:verify` → archive）。
