# 設計：Playwright 完整功能視覺化測試 Walkthrough

## Context

`ui-tests/feature_walkthrough.py` 是現行的 release-gate 視覺化驗收：使用 Python `playwright.async_api` 開 headed Chromium，依序跑 11 個 case，每個 case 由多個 `step(narration, action, wait_ms)` 組成，每 step 截圖 + 紀錄 narration + status，最後產出自製 HTML 報告（標題、總計徽章、可摺疊 case section、step 縮圖）。

把 framework 的 step API、HTML 樣式、precondition 檢查、MP3 fixtures、報告呈現全部移植到 TypeScript Playwright，並補滿到 17 個 case。

舊版的痛點：
1. **語言切換成本**：前端 dev 寫 TS，但要改測試得切到 Python。
2. **與 frontend codebase 隔離**：node_modules 沒有 share、CI 工作流要拉雙語言。
3. **Coverage 落後**：發燒影片、搜尋、URL 下載、影片播放 modal、下載流程都未涵蓋。

`@playwright/test` (test runner) **不採用** —— 因為 walkthrough 的核心是「依序跑 + 自製敘事報告」，不需要 fixtures / parallelization / retries。改用直接呼叫 `playwright` 套件的 chromium API。

## Goals / Non-Goals

**Goals:**
- TypeScript Playwright 撰寫的 walkthrough，與 `frontend/` 共用 node_modules 與 npm scripts
- 17 個 case 涵蓋全部使用者可見功能
- 自製敘事 HTML 報告（與舊版視覺一致），自帶 CSS、screenshots 用相對路徑
- storageState-based 認證：一次手動登入，重用到過期
- precondition check 失敗時印 actionable 中文訊息

**Non-Goals:**
- 不採用 `@playwright/test` test runner
- 不做 CI 整合（headed mode + manual login + 真 YouTube API 都不適合 CI）
- 不做 parallelization / retries（walkthrough 本質上是 sequential demo）
- 不做 trace viewer / video recording（截圖已足夠）
- 不寫單元測試覆蓋 helpers — 整套腳本以「能跑出乾淨報告」為驗收標準
- 不重寫尚未涵蓋的舊 ui-tests 腳本（`ui_test.py`、`skill_test.py`、`test_normalize_panel.py`）

## Decisions

### Decision 1: 用 raw `playwright` 而非 `@playwright/test`

**選擇**：直接 `import { chromium, Page } from 'playwright'`，自己寫 entry script。

**理由**：
- Walkthrough 的核心價值是 narration 順序與 case 結構，由腳本人類可讀地控制比 test runner 配置更直觀
- 自製 HTML 報告需要完全掌控 step 資料結構與序列化 — `@playwright/test` reporter API 也能做但要寫 reporter plugin，wrapper 工程量比直接 collect array 高
- 不需要 retry：失敗 step 直接記錄 + 截圖 + 繼續（這已經是舊版的設計）
- `playwright` 已經在 devDependencies，不用新加 dependency

**替代方案**：
- `@playwright/test`：自動 fixture、retries、parallel、trace viewer。但和我們的需求都正交。寫 reporter plugin 就要 ~200 行 boilerplate。
- Cypress：網路 architecture 不同（受限於 same-origin），且要切換套件。

### Decision 2: 認證採 storageState 一次性

**選擇**：
- `npm run e2e:auth`：開 headed browser → 導到 `http://localhost:5173` → 等待使用者完成 Google OAuth → 截下 `context.storageState()` 寫到 `frontend/e2e/.auth/storageState.json`
- 後續 `npm run e2e`：載入該 file 作為 `storageState` 啟動 context，跳過登入

**理由**：
- Google OAuth 在 Playwright 內全自動跑很脆弱（reCAPTCHA、二步驗證、UI 變動）
- 一次手動登入、長期重用，與舊版相同經驗
- storage state 包含 OAuth token cookie，後端 `/auth/status` 會直接回 `logged_in: true`

**替代方案**：
- 完全 mock 後端：失去整合測試價值（route handler 改錯就抓不到）
- 每次跑 OAuth：UX 噩夢，且 Google 會限制機器化登入
- 用 service account：Google service account 不能授權給 YouTube user data API

**Storage state 過期處理**：
- 若測試一開始打 `/auth/status` 拿到 `logged_in: false`，列印「token 已過期，請跑 `npm run e2e:auth` 重新登入」並 exit

### Decision 3: 17 個 test case 的構成

**保留 TC-01 ~ TC-11**（與舊版 1:1 對應，narration 與 min_steps 沿用）：
| # | Case | min_steps |
|---|------|-----------|
| TC-01 | 啟動與版號 | 3 |
| TC-02 | 訂閱頻道：搜尋 | 4 |
| TC-03 | 訂閱頻道：日期更新檢查 | 3 |
| TC-04 | 頻道選取與影片清單 | 5 |
| TC-05 | 影片勾選與選取面板 | 6 |
| TC-06 | 最新影片分頁 | 5 |
| TC-07 | 設定頁完整流程 | 7 |
| TC-08 | 設定頁驗證錯誤 | 4 |
| TC-09 | 右欄分頁切換 + KeepAlive | 5 |
| TC-10 | 音量正規化基本流程 | 6 |
| TC-11 | 音量正規化進階 | 5 |

**新增 TC-12 ~ TC-17**：
| # | Case | min_steps | 涵蓋 |
|---|------|-----------|------|
| TC-12 | 發燒影片清單與分頁 | 5 | 切換到發燒影片、播放數欄位顯示、「載入更多」按鈕、配額提示 |
| TC-13 | 搜尋影片 | 4 | 輸入關鍵字、結果出現、空查詢 / 無結果 |
| TC-14 | URL 下載：單一 + 播放清單 | 5 | 貼網址、單一自動勾選、播放清單顯示全選 |
| TC-15 | 影片串流播放 modal | 5 | 點縮圖開啟、iframe src 正確、ESC / 背景 / × 關閉 |
| TC-16 | 下載 MP3/MP4 流程 | 6 | format / quality picker、勾選後送出、SSE 進度條、完成標記 |
| TC-17 | 配額計數器顯示 | 3 | header 配額顯示、操作後刷新、警示等級樣式 |

**Min steps 達不到的 case** SHALL be flagged in report（沿用舊版 MISSING STEPS warning）。

### Decision 4: 自製 HTML 報告，不用 Playwright reporter

**選擇**：tests 跑完後在記憶體裡有 `cases: CaseResult[]`，呼叫 `makeHtml(cases, outputPath)` 產出 self-contained HTML。CSS inline 在 `<style>` 內、screenshots 用相對路徑 `<img src="screenshots/TC-XX_stepNN.png">`。

**理由**：
- 與舊版 HTML 視覺一致（紅色 header、PASS/FAIL 徽章、可摺疊 case、failed cases 預設展開、screenshots 點擊放大）
- 自含、可寄信、可拍照給 PM 看
- TS 模板字串夠用，不需 templating engine

**替代方案**：
- Playwright HTML reporter：偏技術風（test results、trace），不像「使用者操作說明」
- React-based dashboard：overkill

### Decision 5: 截圖採 `fullPage: true` + 視窗統一 1280×900

**選擇**：所有截圖用 `page.screenshot({ fullPage: true })`，browser context 開時 `viewport: { width: 1280, height: 900 }`。

**理由**：
- 1280×900 是常見筆電視窗大小，截出來給使用者看的版面熟悉
- `fullPage: true` 對於有滾動的清單（最新影片、頻道影片）能完整截下
- 統一尺寸讓報告版面一致

### Decision 6: 失敗不中止，繼續跑剩餘 case

**選擇**：每個 case 用 `try/catch` 包起；step 內部錯誤已由 `step()` 自己 catch；case 層級的 setup 錯誤（如 `page.goto` 失敗）也 catch，記錄成「整個 case 失敗」並繼續下一個。

**理由**：使用者要看「全部 case 整體狀態」，不是看到第一個 fail 就停。與舊版行為一致。

### Decision 7: 與舊 Python 共存期 = 0（直接刪）

**選擇**：本 change 完成後直接刪 `ui-tests/feature_walkthrough.py` / `walkthrough_helpers.py` / `verify_walkthrough.py` / 舊 HTML 報告 / 舊截圖目錄。`ui-tests/fixtures/*.mp3` 移到 `frontend/e2e/fixtures/`。

**理由**：
- 兩套同時存在會讓 release flow 混淆（哪個才是 source of truth？）
- spec 也明確標記舊 capability 為 REMOVED + Migration
- 留 git history 已足夠（萬一要回頭看）

## Risks / Trade-offs

- **[Risk] 17 case 在 headed mode 跑大概要 3–5 分鐘** → 接受：是 release-gate 不是 unit test，速度不是優先
- **[Risk] Google storage state 會過期（refresh token 失效或被 revoke）** → 緩解：precondition check 會給明確錯誤訊息與重新登入指令
- **[Risk] 真實 YouTube API 回應不穩 → flaky 測試** → 接受：FAIL 報告是真實狀況，使用者再跑一次即可。把這設計成 release-gate 而非 CI gate
- **[Risk] 17 case 寫法分散在 17 個檔案，重構麻煩** → 緩解：每個 case 是獨立 function，共用 helpers。重構 helpers 不會影響 case logic
- **[Trade-off] 不用 `@playwright/test` 等於放棄 trace viewer** → 接受：截圖 + narration 已能讓使用者重現問題
- **[Trade-off] 同時刪舊 Python = 期間如果新 TS 版本還沒寫好，沒有 walkthrough 可用** → 緩解：先在新 TS 版本通過 17/17 之後才 archive change，刪舊版放在 task 後段
- **[Risk] Storage state 包含 access token，可能變 secret** → 緩解：`frontend/e2e/.auth/` 加進 `.gitignore`，不入版控

## Open Questions

無。所有設計選擇已在上面的 Decisions 中決定。
