## 1. 面板可見性

- [x] 1.1 移除 `.selected-panel` 最外層 `v-if`，使容器永遠 render
- [x] 1.2 將設定區 `.header` 改為常駐顯示（無門檻），進度區 `.progress-list` 維持 `v-if="download.downloading"`、摘要 `.summary` 維持既有條件
- [x] 1.3 「已選取 N 支影片」提示在 `selected.length === 0` 時改顯示「尚未選取影片」

## 2. 掛載即預填

- [x] 2.1 `onMounted` 內移除 `if (download.selected.length > 0)` guard，無條件呼叫 `fetchNextSeq()`（`loadSettings()` 維持無條件呼叫）
- [x] 2.2 保留 `watch(() => download.selected.length, 0→>0)` 與 `watch(() => download.downloading, true→false)` 的重新預填邏輯
- [x] 2.3 確認 `seqConflict` computed 在 `count <= 0` 時回傳 `[]`（不誤報），保留現有 guard

## 3. 動作按鈕安全

- [x] 3.1 確認「下載選取影片」`:disabled` 仍含 `download.selected.length === 0`
- [x] 3.2 「清除全部」`:disabled` 補上 `|| download.selected.length === 0`

## 4. 測試與驗證

- [x] 4.1 更新 `frontend/src/tests/SelectedVideos.test.ts`：斷言無選取時設定欄位（下載到、起始號、格式）即顯示且 `fetchNextSeq` 已於掛載觸發
- [x] 4.2 檢視 `SelectedVideosDateRollover.test.ts`、`SelectedVideosAutoPipeline.test.ts` 是否因可見性變更需調整斷言並修正（皆於掛載前已 toggle 影片，不受影響，無需改動）
- [x] 4.3 執行 `npm run test`（frontend）確認單元測試通過（197 passed）
- [x] 4.4 撰寫並執行 `frontend/e2e/verify-download-panel-prefill-fields.ts`：開啟下載分頁、未選取即看到目錄與起始號預填、選取後可正常下載（3 pass / 0 fail）
