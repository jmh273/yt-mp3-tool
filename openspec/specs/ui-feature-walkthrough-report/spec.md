# ui-feature-walkthrough-report Specification

## Purpose
Defines the end-to-end UI walkthrough test framework that drives every user-visible feature of the YT_to_MP3 app, captures narrated screenshots, and emits a self-contained HTML report used as a manual release gate.

## Requirements

### Requirement: Step-based test API with Traditional Chinese narration
The test framework SHALL expose a `step(case_ctx, narration: str, action=None, wait_ms: int = 500)` helper that records each operation as a discrete entry. `narration` SHALL be a one-to-three-sentence Traditional Chinese description of "what is about to happen and what the screen should show". After the optional `action` is awaited and `wait_ms` elapses, the helper SHALL capture a full-page PNG and append `{narration, screenshot, status, error?}` to the case context.

#### Scenario: Step records narration and screenshot
- **WHEN** `step(ctx, "點擊「最新影片」按鈕後，右欄應該切換為最新影片清單", click_latest_btn)` is called
- **THEN** the action is invoked, a screenshot file is saved under `screenshots_walkthrough/`, and the case context's step list grows by one entry whose `narration` matches and `status == "PASS"`

#### Scenario: Step captures failure without aborting the case
- **WHEN** the action raises an exception
- **THEN** the helper SHALL still take a screenshot, set `status: "FAIL"` and `error: <traceback summary>`, and return so the next `step()` in the same case can run

#### Scenario: Pure observation step (no action)
- **WHEN** `step(ctx, "頁面載入完成，可以看到頻道清單", action=None)` is called
- **THEN** no interaction is attempted but a screenshot is captured and the entry is recorded

### Requirement: Eleven test cases covering all user-visible features
The walkthrough script SHALL include exactly the following test cases, each composed of multiple `step()` calls. Each case SHALL produce at least 3 screenshots; the total across all cases SHALL be at least 50.

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

#### Scenario: All eleven cases execute even when some steps fail
- **WHEN** the script is invoked
- **THEN** all 11 cases SHALL be attempted in order; a step or case failure SHALL NOT prevent subsequent cases from running

#### Scenario: Per-case minimum step count enforced
- **WHEN** any case completes with fewer steps than the table specifies
- **THEN** the report SHALL flag that case with a "MISSING STEPS" warning (failure to meet the spec, not an authoring detail to silently ignore)

### Requirement: Self-contained HTML report
The script SHALL emit `ui-tests/feature_walkthrough_report.html` containing a header (timestamp, environment summary, PASS/FAIL counts), a per-case section with each step's narration and inline `<img>` referencing the screenshot file, and basic CSS for readability. The report SHALL be openable as a single page locally without internet access (CSS inlined; screenshots referenced by relative path).

#### Scenario: Report renders all steps and screenshots
- **WHEN** the script finishes
- **THEN** opening `feature_walkthrough_report.html` in a browser SHALL show every TC with its steps; clicking a screenshot SHALL open it full-size

#### Scenario: Failed cases highlighted
- **WHEN** any case has at least one FAIL step
- **THEN** that case's section SHALL render with a red status badge and SHALL be expanded by default; PASS cases SHALL be collapsed by default

#### Scenario: Summary header reflects results
- **WHEN** 9 of 11 cases passed and 2 failed
- **THEN** the header SHALL display `9 / 11 通過 (82%)` and the two failing case names SHALL be listed at the top

### Requirement: Login precondition check before running
The script SHALL probe `GET http://localhost:8000/auth/status` at startup. If `logged_in: false` or the backend is unreachable, the script SHALL print an actionable message in Traditional Chinese telling the user to (1) start backend + frontend, (2) complete Google login at http://localhost:5173, and (3) re-run; then exit non-zero.

#### Scenario: Backend unreachable
- **WHEN** the backend on port 8000 is not running
- **THEN** the script SHALL print "請先啟動後端 (uvicorn on :8000) 與前端 (vite on :5173)，並完成 Google 登入" and exit `1`

#### Scenario: Backend up but not logged in
- **WHEN** `auth/status` returns `{"logged_in": false}`
- **THEN** the script SHALL print "後端已啟動但尚未登入，請到 http://localhost:5173 完成 Google 授權後再執行" and exit `1`

### Requirement: MP3 fixtures shipped in repo
The repo SHALL include `ui-tests/fixtures/loud.mp3` and `ui-tests/fixtures/quiet.mp3` — two short (≤ 5s) sine-wave MP3s with substantially different loudness (`loud.mp3` near 0 dBFS peak; `quiet.mp3` near −25 dBFS peak), so that mp3 normalization test cases (TC-10, TC-11) can run reproducibly without depending on the user's real downloads. Each file SHALL be no larger than 100 KB.

#### Scenario: Fixtures used by normalization cases
- **WHEN** TC-10 starts
- **THEN** the script SHALL copy both fixture MP3s into a temporary directory (e.g. `%TEMP%\walkthrough-mp3-test\`), point the normalize panel at it, run, and assert one ends up `done` and one `done` (or one `已符合` if the loud fixture is at target)

#### Scenario: Fixtures cleaned up
- **WHEN** TC-11 finishes (or the script aborts mid-way)
- **THEN** the temporary directory SHALL be removed; the source fixtures under `ui-tests/fixtures/` SHALL remain unmodified

### Requirement: Documentation updates pointing at the walkthrough
- The top-level [README.md](README.md) SHALL include a section titled (e.g.) "完整 UI Walkthrough 測試" with the one-line invocation `python ui-tests/feature_walkthrough.py` and a sentence explaining when to run it (before tagging a release).
- [docs/DEPLOY.md](docs/DEPLOY.md) SHALL include "release 前手動驗收 → 跑 walkthrough → HTML 全綠才推 tag" as a numbered step in the release procedure.

#### Scenario: README mentions the walkthrough invocation
- **WHEN** a developer reads README.md
- **THEN** there SHALL be a section explaining how to run the walkthrough and where the HTML report appears

#### Scenario: DEPLOY.md gates release on the walkthrough
- **WHEN** a developer follows DEPLOY.md to cut a release
- **THEN** there SHALL be an explicit step "Run feature walkthrough; verify all 11 cases PASS in the report" before the `git tag` step
