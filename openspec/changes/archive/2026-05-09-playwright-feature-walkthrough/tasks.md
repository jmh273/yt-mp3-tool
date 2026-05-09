## 1. 前端：基礎建設

- [x] 1.1 在 `frontend/package.json` 新增 devDependency `tsx`（執行 TS 檔不需 tsc 步驟），確認 `playwright` 已存在
- [ ] 1.2 確認 chromium browser 已下載：跑一次 `npx playwright install chromium`，記錄到 task 7 的 setup 文件（**待使用者執行**）
- [x] 1.3 在 `frontend/.gitignore` 新增 `e2e/.auth/`、`e2e/report/`
- [x] 1.4 在 `frontend/package.json` 新增 npm scripts：
  - `"e2e:auth": "tsx e2e/auth-setup.ts"`
  - `"e2e": "tsx e2e/walkthrough.ts"`

## 2. 前端：共用 helpers (`frontend/e2e/helpers.ts`)

- [x] 2.1 定義 `CaseContext` interface：`{ id, name, description, minSteps, steps: StepEntry[], startedAt }`
- [x] 2.2 定義 `StepEntry` interface：`{ n, narration, screenshot, status: 'PASS'|'FAIL', error?: string }`
- [x] 2.3 實作 `startCase(id, name, description, minSteps): CaseContext`
- [x] 2.4 實作 `step(page, ctx, narration, action?, waitMs?): Promise<StepEntry>` —— 沿用 Python 版語意：never throws、失敗仍截圖、記錄、繼續
- [x] 2.5 實作 `caseStatus(ctx): 'PASS' | 'FAIL'` —— 任一 step FAIL 或 step 數 < minSteps 即 FAIL
- [x] 2.6 實作 `preconditionCheck(): Promise<void>` —— probe `/auth/status`、檢查 storage state file 存在；失敗印中文 actionable 訊息並 `process.exit(1)`
- [x] 2.7 實作 `makeHtml(cases, outputPath, screenshotsRelDir)` —— 自製 HTML 模板、inline CSS、與舊版視覺一致

## 3. 前端：認證 setup (`frontend/e2e/auth-setup.ts`)

- [x] 3.1 用 `chromium.launch({ headless: false })` 開瀏覽器
- [x] 3.2 創 context、`page.goto('http://localhost:5173')`
- [x] 3.3 印中文提示「請在瀏覽器中完成 Google 登入，登入完成後關閉視窗即可」
- [x] 3.4 等使用者關閉瀏覽器（`browser.on('disconnected')` 或 polling `/auth/status` 直到 logged_in=true）
- [x] 3.5 在關閉前呼叫 `context.storageState({ path: 'e2e/.auth/storageState.json' })` 寫檔
- [x] 3.6 印「登入狀態已存到 e2e/.auth/storageState.json，可以執行 npm run e2e」

## 4. 前端：主入口 (`frontend/e2e/walkthrough.ts`)

- [x] 4.1 呼叫 `preconditionCheck()`
- [x] 4.2 用 `chromium.launch({ headless: false })` + `newContext({ viewport: {1280,900}, storageState: 'e2e/.auth/storageState.json' })`
- [x] 4.3 開一個 `page`，依序 import + 呼叫 17 個 case 函式（each 收 `page`、回 `CaseContext`）
- [x] 4.4 整體用 try/catch 包，case 失敗繼續下一個
- [x] 4.5 跑完呼叫 `makeHtml(cases, 'e2e/report/walkthrough.html', 'screenshots/')`
- [x] 4.6 印 summary：通過 / 失敗 / 報告路徑
- [x] 4.7 退出 code：全 PASS 0、有 FAIL 1

## 5. 前端：移植舊 11 個 case 到 TS

- [x] 5.1 `frontend/e2e/cases/tc01-startup.ts` —— 啟動與版號（min 3）
- [x] 5.2 `frontend/e2e/cases/tc02-channel-search.ts` —— 訂閱頻道：搜尋（min 4）
- [x] 5.3 `frontend/e2e/cases/tc03-channel-dates.ts` —— 訂閱頻道：日期更新檢查（min 3）
- [x] 5.4 `frontend/e2e/cases/tc04-channel-pick.ts` —— 頻道選取與影片清單（min 5）
- [x] 5.5 `frontend/e2e/cases/tc05-video-select.ts` —— 影片勾選與選取面板（min 6）
- [x] 5.6 `frontend/e2e/cases/tc06-latest-feed.ts` —— 最新影片分頁（min 5）
- [x] 5.7 `frontend/e2e/cases/tc07-settings-flow.ts` —— 設定頁完整流程（min 7）
- [x] 5.8 `frontend/e2e/cases/tc08-settings-validation.ts` —— 設定頁驗證錯誤（min 4）
- [x] 5.9 `frontend/e2e/cases/tc09-tabs-keepalive.ts` —— 右欄分頁切換 + KeepAlive（min 5）
- [x] 5.10 `frontend/e2e/cases/tc10-normalize-basic.ts` —— 音量正規化基本流程（min 6）
- [x] 5.11 `frontend/e2e/cases/tc11-normalize-advanced.ts` —— 音量正規化進階（min 5）

## 6. 前端：新增 6 個 case

- [x] 6.1 `frontend/e2e/cases/tc12-trending.ts` —— 發燒影片清單與分頁（min 5）：切到發燒、清單載入、確認 view counts 顯示、點「載入更多」、確認新影片 append
- [x] 6.2 `frontend/e2e/cases/tc13-search.ts` —— 搜尋影片（min 4）：切到搜尋、輸入關鍵字（如 "lofi"）、結果出現、清空輸入回到 empty state
- [x] 6.3 `frontend/e2e/cases/tc14-url-download.ts` —— URL 下載（min 5）：切到 URL 下載、貼單一影片網址 → 自動勾選、貼播放清單網址 → 全選按鈕出現
- [x] 6.4 `frontend/e2e/cases/tc15-player-modal.ts` —— 影片串流播放 modal（min 5）：點縮圖開啟、確認 iframe src 正確、按 ESC 關閉、再次開啟、點 × 關閉、再次開啟、點 backdrop 關閉
- [x] 6.5 `frontend/e2e/cases/tc16-download-flow.ts` —— 下載 MP3/MP4 流程（min 6）：勾選影片、確認 SelectedVideos 面板、切 format（MP4）/quality（720p）、按下載、SSE 進度條變化、完成標記
- [x] 6.6 `frontend/e2e/cases/tc17-quota-counter.ts` —— 配額計數器（min 3）：header 配額顯示、跑一個 API 後配額更新、模擬高用量檢查 warning / danger 樣式（如配額不夠就 skip）

## 7. 前端：MP3 fixtures 搬遷

- [x] 7.1 將 `ui-tests/fixtures/loud.mp3` 複製到 `frontend/e2e/fixtures/loud.mp3`
- [x] 7.2 將 `ui-tests/fixtures/quiet.mp3` 複製到 `frontend/e2e/fixtures/quiet.mp3`
- [x] 7.3 確認檔案大小 ≤ 100 KB、長度 ≤ 5s（用 ffprobe 或文件讀取）—— 兩個都 ~48 KB ✓
- [x] 7.4 TC-10 / TC-11 在 `os.tmpdir()` 下建立工作資料夾，把兩個 fixture copy 過去再操作；測試結束後 rm 整個資料夾

## 8. 文件更新

- [x] 8.1 修改 [README.md](../../../README.md)：把舊「完整 UI Walkthrough 測試」段落改成新指令 `npm run e2e --prefix frontend`，並說明 `npm run e2e:auth --prefix frontend` 一次性 setup
- [x] 8.2 修改 [docs/DEPLOY.md](../../../docs/DEPLOY.md)：release 步驟更新為新指令、報告路徑改 `frontend/e2e/report/walkthrough.html`、case 數從 11 改 17

## 9. 移除舊 Python 版

- [x] 9.1 確認新 TS 版本能完整跑出 17/17 PASS（round 5 達成 17/17）
- [x] 9.2 刪除 `ui-tests/feature_walkthrough.py`
- [x] 9.3 刪除 `ui-tests/walkthrough_helpers.py`
- [x] 9.4 刪除 `ui-tests/verify_walkthrough.py`
- [x] 9.5 刪除 `ui-tests/feature_walkthrough_report.html`
- [x] 9.6 刪除 `ui-tests/feature_walkthrough_results.json`
- [x] 9.7 刪除 `ui-tests/screenshots_walkthrough/` 整個目錄
- [x] 9.8 刪除 `ui-tests/fixtures/loud.mp3`、`ui-tests/fixtures/quiet.mp3`（已搬到 frontend/e2e/fixtures）
- [x] 9.9 若 `ui-tests/fixtures/` 變空資料夾就一起刪
- [x] 9.10 保留 `ui-tests/ui_test.py`、`ui-tests/skill_test.py`、`ui-tests/test_normalize_panel.py` 等與本 change 無關的舊腳本

## 10. 驗證

- [x] 10.1 跑 `npm run e2e:auth --prefix frontend` 完成 Google 登入 → 確認 `frontend/e2e/.auth/storageState.json` 產生（採用空 storageState 即可，因為後端是 token.json 檔案式 session）
- [x] 10.2 跑 `npm run e2e --prefix frontend` → 確認 17 個 case 全跑完、HTML 報告產出在 `frontend/e2e/report/walkthrough.html`
- [ ] 10.3 用瀏覽器開報告：確認所有 case 與 step 截圖正確顯示、PASS / FAIL 徽章呈現、failed 預設展開、screenshots 點擊放大（**待使用者目視確認**）
- [ ] 10.4 故意改一個 case 讓它失敗 → 確認報告 summary `X / 17` 與 failed list 正確（**round 3-4 已實際看到 11/17、16/17 等失敗報告，UI 正常**）
- [ ] 10.5 刪除 `frontend/e2e/.auth/storageState.json` → 跑 `npm run e2e` → 確認 precondition check 印出正確中文錯誤、exit code 1（**待選擇性驗證**）
- [ ] 10.6 後端 stop 後 → 跑 `npm run e2e` → 確認 precondition check 印出正確中文錯誤（**待選擇性驗證**）
- [x] 10.7 執行 `openspec validate playwright-feature-walkthrough --strict` 確認 spec 通過
- [x] 10.8 確認 `git status` 不會列出 `frontend/e2e/.auth/storageState.json` 或 `frontend/e2e/report/`
