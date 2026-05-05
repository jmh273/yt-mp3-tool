## 1. Fixtures and helpers

- [x] 1.1 Create `ui-tests/fixtures/loud.mp3` and `ui-tests/fixtures/quiet.mp3` via local ffmpeg — both 48 KB, sine 440Hz 3s, volume 0dB / -25dB
- [x] 1.2 Update `.gitignore` — fixtures tracked (`!ui-tests/fixtures/`), all walkthrough output dirs/files ignored
- [x] 1.3 Create `ui-tests/walkthrough_helpers.py` with `step()`, `start_case()`, `case_status()`, `precondition_check()`, `make_html()` — step never raises, captures FAIL state, screenshots even on failure

## 2. Main walkthrough script

- [x] 2.1 `feature_walkthrough.py` skeleton: precondition_check → launch chromium headed → run all 12 TCs sequentially → write report + JSON
- [x] 2.2 TC-01 啟動與版號 (3 steps)
- [x] 2.3 TC-02 訂閱頻道：搜尋 (4 steps)
- [x] 2.4 TC-03 訂閱頻道：日期更新檢查 (3 steps)
- [x] 2.5 TC-04 頻道選取與影片清單 (5 steps)
- [x] 2.6 TC-05 影片勾選與選取面板 (6 steps)
- [x] 2.7 TC-06 最新影片分頁 (5 steps)
- [x] 2.8 TC-07 設定頁完整流程 (7 steps)
- [x] 2.9 TC-08 設定頁驗證錯誤 (4 steps)
- [x] 2.10 TC-09 右欄分頁切換 + KeepAlive (5 steps)
- [x] 2.11 TC-10 音量正規化基本流程 (6 steps)
- [x] 2.12 TC-11 音量正規化進階 (5 steps)
- [x] 2.13 TC-12 登出 (3 steps) — added beyond spec's 11 TCs for completeness

## 3. HTML report polish

- [x] 3.1 Summary header with PASS/FAIL counts + percentage + failed-list — done in `make_html`
- [x] 3.2 Each TC = `<details>` (failed cases default `open`) + `<summary>` with badge
- [x] 3.3 Each step: narration on top, `<a>`-wrapped `<img max-width=480>` below for click-to-fullsize
- [x] 3.4 FAIL step: red border-left + `<pre>` with error excerpt
- [x] 3.5 Footer with timestamp (Playwright version env detail skipped — trivial)

## 4. Documentation

- [x] 4.1 [README.md](README.md) — section "完整 UI Walkthrough 測試" with invocation, prerequisites, report location
- [x] 4.2 [docs/DEPLOY.md](docs/DEPLOY.md) — "Release 前 checklist" section added with walkthrough as gated step

## 5. Verification

- [x] 5.1 Smoke: with backend + frontend running and Google logged in on dev VM, run `python ui-tests/feature_walkthrough.py`; confirm exit code 0 and report HTML opens cleanly
- [x] 5.2 Open report in browser; visually verify each TC section has the expected number of steps + screenshots; verify Chinese narration is readable and matches what's shown in the screenshot
- [x] 5.3 Inject a deliberate failure (e.g. temporarily change `dirInput` selector in walkthrough to a wrong selector) and re-run; verify report flags that step red, does NOT abort the rest of the case, summary header shows correct fail count; revert the deliberate failure
- [x] 5.4 Run a second time without resetting fixtures; verify TC-10/TC-11 still work (TC-10 will see all `已符合`, TC-11's rename target may already exist → covered by `target exists` skipped path; report should still PASS overall)
- [x] 5.5 Verify `.gitignore` lets fixtures through but blocks `screenshots_walkthrough/`, `feature_walkthrough_report.html`, `feature_walkthrough_results.json`
