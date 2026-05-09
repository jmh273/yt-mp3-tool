# Playwright 完整功能視覺化測試 Walkthrough

## Why

目前 `ui-tests/feature_walkthrough.py` 是一支 Python + playwright 的 release-gate 視覺化驗收腳本（11 個 case、HTML 報告），優點是有完整的步驟敘述與截圖。但它有兩個痛點：

1. **與前端程式碼分家**：用 Python 寫，與 Vue/TS 主程式碼是兩個技術棧，新功能加進去要切換 context、語法、helpers
2. **覆蓋率落後現況**：原本 11 個 case 沒涵蓋近期上線的 4 大功能 — 發燒影片（含 view counts、載入更多）、搜尋、URL 下載、影片串流播放 modal

這次同時解這兩個問題：用 Playwright TS 重寫，整合到 `frontend/e2e/`、加進 `npm` scripts，並補滿到 17 個 case。

## What Changes

- **新增**：`frontend/e2e/` 資料夾，採 TypeScript + `playwright` SDK 撰寫的 walkthrough，等同舊版 step-based API（`step(narration, action?, waitMs?)`）
- **新增**：`npm run e2e:auth` —— 一次性手動登入工具，把 storage state（cookies / localStorage）存到 `frontend/e2e/.auth/storageState.json`，讓後續測試免登入
- **新增**：`npm run e2e` —— 跑全部 17 個 case，產出 `frontend/e2e/report/walkthrough.html` + 截圖
- **新增**：6 個新 case 涵蓋近期功能
  - TC-12 發燒影片：播放數顯示 + 載入更多
  - TC-13 搜尋影片
  - TC-14 URL 下載：單一影片 + 播放清單
  - TC-15 影片串流播放：縮圖點擊 → modal → 切影片 → 三種關閉
  - TC-16 下載 MP3/MP4 完整流程（含 format/quality picker、SSE 進度）
  - TC-17 配額計數器顯示與更新
- **保留**：原本 11 個 case (TC-01 ~ TC-11) 全部移植到 TS 版
- **移除**：`ui-tests/feature_walkthrough.py`、`ui-tests/walkthrough_helpers.py`、`ui-tests/screenshots_walkthrough/`、`ui-tests/feature_walkthrough_report.html`、`ui-tests/feature_walkthrough_results.json`
- **保留**：`ui-tests/fixtures/loud.mp3` 與 `quiet.mp3`（搬到 `frontend/e2e/fixtures/`），用於 TC-10 / TC-11
- **文件更新**：[README.md](README.md) 與 [docs/DEPLOY.md](docs/DEPLOY.md) 改指向新指令

## Capabilities

### New Capabilities
- `playwright-feature-walkthrough`: TypeScript Playwright walkthrough — step API、17 個 test case、自製敘事 HTML 報告、storageState 認證、登入前置檢查、MP3 fixtures

### Modified Capabilities
- `ui-feature-walkthrough-report`: **整個 capability 標記為 REMOVED**，所有 6 個 requirements 都遷移到 `playwright-feature-walkthrough`。Reason / Migration 在 spec delta 中說明

## Impact

**新增程式碼**（純前端）：
- `frontend/e2e/walkthrough.ts`：主入口，呼叫各 case 函式
- `frontend/e2e/helpers.ts`：`step()`、`startCase()`、`makeHtml()`、`preconditionCheck()`
- `frontend/e2e/cases/tc01..tc17.ts`：17 個 case 各一檔
- `frontend/e2e/auth-setup.ts`：手動登入 + 存 storageState
- `frontend/e2e/fixtures/loud.mp3`、`quiet.mp3`：從 `ui-tests/fixtures/` 搬過來

**修改**：
- `frontend/package.json`：新增 `e2e` / `e2e:auth` npm scripts；`playwright` 已在 devDependencies，不需新加
- [README.md](README.md)：更新 walkthrough 章節指向新指令
- [docs/DEPLOY.md](docs/DEPLOY.md)：release 步驟更新為新指令

**移除**：
- `ui-tests/feature_walkthrough.py`、`walkthrough_helpers.py`、`verify_walkthrough.py`
- `ui-tests/feature_walkthrough_report.html`、`feature_walkthrough_results.json`
- `ui-tests/screenshots_walkthrough/`（整個目錄）
- 保留 `ui-tests/` 其他舊腳本（`ui_test.py`、`skill_test.py`、`test_normalize_panel.py`）— 與本 change 範圍無關

**配額 / 後端**：無影響。測試會打到真 backend / 真 YouTube API，但只跑 release gate，不影響日常配額消耗（每次 run 大約 5–10 個 quota units）。

**外部相依**：無新加。`playwright` 已裝。Browsers 第一次跑可能要 `npx playwright install chromium`，task 中會列出。

**跑測試的前置條件**（不變）：
1. 後端 (uvicorn :8000) 在跑
2. 前端 (vite :5173) 在跑
3. 至少跑過一次 `npm run e2e:auth` 完成 Google 登入並存 storage state

**已知限制**：
- 同樣需要 headed mode（非 CI 友善）— 因為 Google 登入流程一次性、storage state 重用
- 如果 storage state 過期（Google token revoke），需要重跑 `e2e:auth`
- 本地網路 / YouTube quota 滿時某些 case 可能 FAIL（這是測試的價值，不是 bug）
