# playwright-feature-walkthrough Specification

## Purpose
Defines the TypeScript Playwright-based end-to-end UI walkthrough that drives every user-visible feature of the YT_to_MP3 app, captures narrated screenshots, and emits a self-contained HTML report used as a manual release gate. Supersedes the prior Python `ui-feature-walkthrough-report` capability.

## Requirements

### Requirement: Step-based test API in TypeScript with Traditional Chinese narration
The walkthrough framework SHALL expose a `step(page, ctx, narration, action?, waitMs?)` async helper that records each operation as a discrete entry. `narration` SHALL be a one-to-three-sentence Traditional Chinese description of what is about to happen and what the screen should show. After the optional `action` is awaited and `waitMs` (default 500) elapses, the helper SHALL capture a full-page PNG and append `{n, narration, screenshot, status, error?}` to the case context.

#### Scenario: Step records narration and screenshot
- **WHEN** `step(page, ctx, "點擊「最新影片」按鈕後，右欄應該切換為最新影片清單", () => clickLatestBtn())` is called
- **THEN** the action SHALL be invoked, a screenshot file SHALL be saved under `frontend/e2e/report/screenshots/`, and the case context's step list SHALL grow by one entry whose `narration` matches and `status === "PASS"`

#### Scenario: Step captures failure without aborting the case
- **WHEN** the action throws
- **THEN** the helper SHALL still take a screenshot, set `status: "FAIL"` with `error: <message>`, and return so subsequent `step()` calls in the same case can run

#### Scenario: Pure observation step (no action)
- **WHEN** `step(page, ctx, "頁面載入完成，可以看到頻道清單")` is called without an action argument
- **THEN** no interaction SHALL be attempted but a screenshot SHALL be captured and the entry recorded

### Requirement: Seventeen test cases covering all user-visible features
The walkthrough script SHALL include exactly the following test cases, each composed of multiple `step()` calls. Each case SHALL produce at least the listed `min_steps` screenshots; the total across all cases SHALL be at least 80.

| # | Case name | Min steps | Coverage |
|---|-----------|-----------|----------|
| TC-01 | 啟動與版號 | 3 | header version display, channels load |
| TC-02 | 訂閱頻道：搜尋 | 4 | search input filters, clear restores |
| TC-03 | 訂閱頻道：日期更新檢查 | 3 | check-dates button, per-channel date label |
| TC-04 | 頻道選取與影片清單 | 5 | click channel, right pane switches, card content |
| TC-05 | 影片勾選與選取面板 | 6 | single/multi check, count, clear all |
| TC-06 | 最新影片分頁 | 5 | switch to latest, loading, list, cross-view selection |
| TC-07 | 設定頁完整流程 | 7 | edit each field, save success, return |
| TC-08 | 設定頁驗證錯誤 | 4 | out-of-range 422, error message visible, fix |
| TC-09 | 右欄分頁切換 + KeepAlive | 5 | default tab, switch, switch back preserves state |
| TC-10 | 音量正規化基本流程 | 6 | load fixture dir, target dB input, run, summary |
| TC-11 | 音量正規化進階 | 5 | needs_rename UI, rename action, rerun all skipped |
| TC-12 | 發燒影片清單與分頁 | 5 | trending feed, view counts displayed, load-more button, quota hint |
| TC-13 | 搜尋影片 | 4 | search input, results render, empty/no-result state |
| TC-14 | URL 下載：單一 + 播放清單 | 5 | parse single video auto-select, parse playlist shows select-all |
| TC-15 | 影片串流播放 modal | 5 | thumbnail click opens, iframe src correct, close via ESC / backdrop / × |
| TC-16 | 下載 MP3/MP4 流程 | 6 | format/quality picker, submit selection, SSE progress, completion badge |
| TC-17 | 配額計數器顯示 | 3 | header quota visible, refreshed after action, level styling |

#### Scenario: All seventeen cases execute even when some steps fail
- **WHEN** the script is invoked
- **THEN** all 17 cases SHALL be attempted in order; a step or case failure SHALL NOT prevent subsequent cases from running

#### Scenario: Per-case minimum step count enforced
- **WHEN** any case completes with fewer steps than the table specifies
- **THEN** the report SHALL flag that case with a "MISSING STEPS" warning (failure to meet the spec, not silently ignored)

### Requirement: Self-contained HTML report
The script SHALL emit `frontend/e2e/report/walkthrough.html` containing a header (timestamp, environment summary, PASS/FAIL counts), a per-case section with each step's narration and inline `<img>` referencing the screenshot file, and basic CSS for readability. The report SHALL be openable as a single page locally without internet access (CSS inlined; screenshots referenced by relative path under `screenshots/`).

#### Scenario: Report renders all steps and screenshots
- **WHEN** the script finishes
- **THEN** opening `frontend/e2e/report/walkthrough.html` in a browser SHALL show every TC with its steps; clicking a screenshot SHALL open it full-size

#### Scenario: Failed cases highlighted
- **WHEN** any case has at least one FAIL step
- **THEN** that case's section SHALL render with a red status badge and SHALL be expanded by default; PASS cases SHALL be collapsed by default

#### Scenario: Summary header reflects results
- **WHEN** 15 of 17 cases pass and 2 fail
- **THEN** the header SHALL display `15 / 17 通過 (88%)` and the two failing case names SHALL be listed at the top

### Requirement: Storage-state-based authentication
The framework SHALL provide an auth-setup script (`npm run e2e:auth`) that opens a headed Chromium pointing at `http://localhost:5173`, waits for the user to complete Google OAuth, then writes the browser context's storage state to `frontend/e2e/.auth/storageState.json`. The main walkthrough (`npm run e2e`) SHALL launch its context with `storageState` loaded from that file. The `.auth/` directory SHALL be excluded from git (`.gitignore`).

#### Scenario: Auth setup persists state
- **WHEN** the user runs `npm run e2e:auth`, completes Google login in the opened browser, and closes the window
- **THEN** the file `frontend/e2e/.auth/storageState.json` SHALL exist and contain cookies / localStorage entries proving login

#### Scenario: Walkthrough loads existing storage state
- **WHEN** `npm run e2e` is invoked and `frontend/e2e/.auth/storageState.json` exists
- **THEN** Playwright `chromium.launch().newContext({ storageState: <path> })` SHALL be used, and the first page navigation SHALL not redirect to a login page

#### Scenario: Auth file ignored by git
- **WHEN** `frontend/e2e/.auth/storageState.json` is created
- **THEN** `git status` SHALL NOT list it as an untracked or modified file

### Requirement: Login precondition check before running
At startup the walkthrough SHALL probe `GET http://localhost:8000/auth/status`. If `logged_in: false` or the backend is unreachable, the script SHALL print an actionable Traditional Chinese message and exit with non-zero status without running any cases.

#### Scenario: Backend unreachable
- **WHEN** the backend on port 8000 is not running
- **THEN** the script SHALL print `請先啟動後端 (uvicorn on :8000) 與前端 (vite on :5173)` and exit `1`

#### Scenario: Backend up but storage state expired
- **WHEN** `auth/status` returns `{"logged_in": false}` even after `storageState.json` is loaded
- **THEN** the script SHALL print `登入狀態已失效，請重跑 npm run e2e:auth 完成 Google 授權後再執行` and exit `1`

#### Scenario: storageState file missing
- **WHEN** `frontend/e2e/.auth/storageState.json` does not exist
- **THEN** the script SHALL print `找不到登入狀態，請先跑 npm run e2e:auth` and exit `1`

### Requirement: MP3 fixtures shipped in repo
The repo SHALL include `frontend/e2e/fixtures/loud.mp3` and `frontend/e2e/fixtures/quiet.mp3` — two short (≤ 5s) sine-wave MP3s with substantially different loudness (`loud.mp3` near 0 dBFS peak; `quiet.mp3` near −25 dBFS peak), so that volume normalization cases (TC-10, TC-11) can run reproducibly without depending on the user's real downloads. Each file SHALL be no larger than 100 KB.

#### Scenario: Fixtures used by normalization cases
- **WHEN** TC-10 starts
- **THEN** the script SHALL copy both fixture MP3s into a temporary directory (e.g. OS temp + `walkthrough-mp3-test/`), point the normalize panel at it, run, and assert one ends up `done` and the other `done` (or `已符合` if the loud fixture is already at target)

#### Scenario: Fixtures cleaned up
- **WHEN** TC-11 finishes (or the script aborts mid-way)
- **THEN** the temporary directory SHALL be removed; the source fixtures under `frontend/e2e/fixtures/` SHALL remain unmodified

### Requirement: npm scripts for running the walkthrough
`frontend/package.json` SHALL include the following npm scripts:
- `e2e:auth` — runs `tsx frontend/e2e/auth-setup.ts` (or equivalent) to perform interactive Google login and save storage state
- `e2e` — runs `tsx frontend/e2e/walkthrough.ts` (or equivalent) to execute all 17 cases and emit the HTML report

#### Scenario: Scripts present in package.json
- **WHEN** a developer reads `frontend/package.json`
- **THEN** the `scripts` object SHALL contain entries for `e2e:auth` and `e2e`

#### Scenario: Single-command invocation
- **WHEN** the developer runs `npm run e2e` from the `frontend/` directory after the prerequisites are satisfied
- **THEN** all 17 cases SHALL be attempted and the HTML report SHALL be written without further interaction

### Requirement: Documentation updates pointing at the walkthrough
- The top-level [README.md](README.md) SHALL include a section titled (e.g.) "完整 UI Walkthrough 測試" with the one-line invocation `npm run e2e --prefix frontend` (or equivalent) and a sentence explaining when to run it (before tagging a release).
- [docs/DEPLOY.md](docs/DEPLOY.md) SHALL include "release 前手動驗收 → 跑 walkthrough → HTML 全綠才推 tag" as a numbered step in the release procedure, citing the new npm-based command.

#### Scenario: README mentions the walkthrough invocation
- **WHEN** a developer reads README.md
- **THEN** there SHALL be a section explaining how to run the new Playwright walkthrough and where the HTML report appears (`frontend/e2e/report/walkthrough.html`)

#### Scenario: DEPLOY.md gates release on the walkthrough
- **WHEN** a developer follows DEPLOY.md to cut a release
- **THEN** there SHALL be an explicit step "Run feature walkthrough; verify all 17 cases PASS in the report" before the `git tag` step
