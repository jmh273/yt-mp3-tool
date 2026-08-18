> 分期依據 design.md D3：第 1–3 組交付「下載恢復可用」這個核心價值，第 6 組（PO Token）不確定性最高且已設計為可降級，因此排最後。任一時點停在組界都是可交付狀態。

## 1. 打包 JavaScript runtime 與 EJS solver

- [x] 1.1 `.github/workflows/release.yml` 新增取得 `deno.exe` 的步驟，stage 到 `tools/`。版本 SHALL 明確釘選，**不要**沿用 ffmpeg 目前抓 `master-latest` 的做法（design D1）
- [x] 1.2 `scripts/build.bat` 的「Verify required bundled tools」清單加入 `deno.exe`，並在 stage extras 階段複製進 bundle
- [x] 1.3 `backend/requirements.txt`：`yt-dlp` 由 `2026.3.17` 升至 `2026.7.4`，新增 `yt-dlp-ejs`（釘選相容版本）
- [x] 1.4 新增解析 runtime 路徑的輔助函式：凍結執行時指向 bundle 內的 `deno.exe`，開發執行時指向 `tools/deno.exe`；沿用既有 `_resource_path` 的模式
- [x] 1.5 啟動時偵測 runtime 存在且可執行，不可用時輸出明確告警（spec：啟動時偵測 runtime 可用性）

## 2. 下載選項改用 runtime 與明確 client

- [x] 2.1 `_build_ydl_opts()` 加入 `js_runtimes` 指向 1.4 解析出的 runtime 路徑
- [x] 2.2 `_build_ydl_opts()` 加入 `extractor_args.youtube.player_client` 優先序清單。實測可用：`tv` / `android` / `mweb` / `tv_simply`；**清單中不得含** `android_vr` / `web` / `ios` / `web_safari`
- [x] 2.3 （實測結果：Python API 需 `{"deno": {"path": ...}}` dict，非 CLI 的 `"deno:PATH"` 字串；修正後清單形式下載成功 28,523,658 bytes）以實測驗證清單形式的行為 —— design D2 記錄過清單指定曾出現失敗（yt-dlp 會合併各 client 格式後再套 format selector），**不可假設清單一定正確**，須實跑確認
- [x] 2.4 player client 清單改為可由設定覆寫，沿用 `_SETTINGS_RANGES` 的容錯模式
- [x] 2.5 `_build_ydl_opts()` 加入 `http_chunk_size`、`retries`、`fragment_retries`
- [x] 2.6 後端測試：驗證產出的 `ydl_opts` 含 `js_runtimes` 與 player client 指定，且清單不含已知失效 client

## 3. 診斷可觀測性

- [x] 3.1 移除 `_build_ydl_opts()` 的 `"no_warnings": True`（design D5）
- [x] 3.2 接上 yt-dlp 的 logger，把警告與錯誤導向應用程式的記錄路徑
- [x] 3.3 新增檔案 log：寫入 `~/.yt-mp3-tool/`，每筆含影片識別、時間、嘗試次數、訊息
- [x] 3.4 後端測試：失敗時 log 檔含該影片的錯誤訊息；多次嘗試時每次皆有紀錄

## 4. 自動重試

- [x] 4.1 `download_one()` 改為重試迴圈：每次重試**重新 extract**取得新串流 URL，不重用失敗的 URL
- [x] 4.2 指數退避；達上限後才寫入 `status: "error"`，錯誤內容為最後一次嘗試的錯誤
- [x] 4.3 重試中的項目在進度中以可辨識的狀態呈現並帶目前嘗試次數
- [x] 4.4 （已評估：退避在 semaphore 內等待，最壞約 14 秒；接受此代價換取序列/並行共用同一份重試邏輯，其他影片不會被中斷或誤標）確認重試在並行模式下不阻塞同批其他影片
- [x] 4.5 `DEFAULT_SETTINGS` / `_SETTINGS_RANGES` 新增重試次數與退避參數
- [x] 4.6 後端測試：暫時性失敗經重試後成功不呈現為失敗；重試有重新 extract；達上限才標記 error；單支重試不影響同批其他影片

## 5. 前端失敗呈現

- [x] 5.1 `SelectedVideos.vue` 逐項顯示 `progress[vid].error`，樣式與 `VolumeNormalizer.vue` 的 `.item-error` 一致
- [x] 5.2 重試中的項目以有別於「失敗」的樣式呈現，並顯示嘗試次數
- [x] 5.3 前端測試：失敗項顯示錯誤字串；重試中不以失敗樣式呈現
- [x] 5.4 `openspec/specs/download-resume` 的 delta 需求（失敗原因可見）由 5.1/5.3 覆蓋，確認情境對應

## 6. 設定頁版本更新機制

- [x] 6.1 yt-dlp 載入策略改為「受管優先、內建保底」：在 `import yt_dlp` 之前介入（`backend/__main__.py` 或 PyInstaller `runtime_hooks`）。注意 `main.py:12` 的 top-level import 與 `main.py:2224`／`2306` 的區域 re-import
- [x] 6.2 受管版本載入失敗時自動退回內建版本並記錄原因（design D4）
- [x] 6.3 新增端點：查詢目前生效版本與來源、查詢上游最新版、執行更新、執行回退
- [x] 6.4 更新 SHALL 將 yt-dlp 與 yt-dlp-ejs 視為一組共同套用
- [x] 6.5 `SettingsView.vue` 新增版本區塊，沿用 `subscription-health-check` 的「按鈕觸發 + 結果列表」模式
- [x] 6.6 離線時優雅降級為「無法查詢，維持目前版本」
- [x] 6.7 測試：無受管版本用內建；受管優先；受管損毀自動退回且下載仍可用

## 7. PO Token（音質還原）

- [x] 7.1 （評估結論：無可行的自動 provider——bgutil script 模式需原生 `npm:canvas`、server 模式需另跑服務；yt-dlp 內建框架不含產生器。範圍縮減為手動供給＋安全降級，見 design D3a）評估並選定 PO Token provider 的整合形態
- [x] 7.2 （改為：設定可供給 GVS PO Token 並帶入 `extractor_args.youtube.po_token`）整合 provider，使 audio-only 格式可用
- [x] 7.3 PO Token 不可用時降級為 progressive 格式並記錄，**不得**直接失敗
- [x] 7.4 驗證：有 PO Token 時選用 audio-only；不可用時整批仍以降級格式完成而非標記失敗

## 8. 驗證

- [x] 8.1 撰寫 `frontend/e2e/verify-download-403-resilience.ts`：失敗項顯示錯誤原因、重試中狀態呈現、設定頁版本區塊
- [x] 8.2 （實跑 run_download 全路徑：status=done，產出 E2E Probe.mp3 15,231,614 bytes，無 `n challenge solving failed`）實跑一次真實下載（非 mock）
- [ ] 8.3 確認發行 zip 內含 `deno.exe`，且在未安裝任何 JS runtime 的環境解壓即可下載
- [x] 8.4 （後端 274 passed、前端 270 passed、vue-tsc 乾淨；順帶修掉 OAuth 改動遺留的 `DriveUploadPanel.test.ts` 失效斷言 login→loginDrive）執行完整單元測試與 `vue-tsc`
- [x] 8.5 （6/6 PASS）執行 `verify-download-403-resilience.ts` 並確認全數 PASS
