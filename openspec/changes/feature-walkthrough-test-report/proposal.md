## Why

目前 `ui-tests/ui_test.py` 是 13 個測試案例的 Playwright 腳本，但它只在每個案例**結尾**截一張圖、log 用混 ASCII/中文、文字偏 debug 而非操作說明。對「這個 release 要證明所有功能還能正常用」或「給沒看過程式的人理解工具能做什麼」這兩個情境都不夠。

更重要的是，新加的功能（`mp3-volume-normalization`、右欄分頁、版號顯示、檔名 sanitize、自動 rename、per-batch 目標 dB 等）完全沒有 UI 測試覆蓋。每次 release 前要靠手動驗，不可持續。

我們需要一份**操作層級**的端到端測試報告：每個案例**逐步驟**截圖、每張圖前面有一段**繁體中文敘述「現在要做什麼、預期看到什麼」**，跑完輸出 self-contained HTML 給人類閱讀（也是給未來的我自己對照「這個 release 是否退化」的 baseline）。

## What Changes

- 新增 `ui-tests/feature_walkthrough.py` — 取代並擴展 `ui_test.py` 的範圍，採「step()」式 API：每個 step 接收一段繁中操作敘述，執行互動，截圖。
- 涵蓋全部現有功能（10 個 test case，~50 個 step）：啟動 + 版號、訂閱清單與搜尋、頻道選取與影片清單、影片勾選/多選/清除、最新影片分頁、設定頁完整流程、右欄分頁切換 + KeepAlive、音量正規化基本流程、音量正規化進階（rename / skip / error）、登出。
- 輸出 `ui-tests/feature_walkthrough_report.html` — 每個 TC 是一個區塊，內含**操作敘述（繁中）+ 截圖陣列**，最上面有 PASS/FAIL 摘要與 timestamp。
- 不動既有 `ui_test.py`、`test_normalize_panel.py`、`skill_test.py` — 它們仍可獨立跑（regression 用）；新報告聚焦「示範＋驗證」雙用途。
- `docs/DEPLOY.md` 加一段「release 前手動驗收：在你 dev VM 跑 `python ui-tests/feature_walkthrough.py`，看 HTML 報告全綠才推 tag」。

## Capabilities

### New Capabilities
- `ui-feature-walkthrough-report`: 操作層級、繁中敘述、多截圖、self-contained HTML 報告，涵蓋從登入到登出的所有使用者可見功能。包含 `feature_walkthrough.py` 腳本、HTML 產生器、step API、Chinese narration convention。

### Modified Capabilities
<!-- 無：不改動現有 spec-level 行為。新測試只是「驗證」既有功能，不是「定義」新功能。 -->

## Impact

- **新檔**：
  - `ui-tests/feature_walkthrough.py` — 主腳本（Playwright headed 模式）
  - `ui-tests/walkthrough_helpers.py` — `step()` / `record_case()` / `make_html()` 共用函式（從 ui_test.py 重構出來、加強）
  - `ui-tests/screenshots_walkthrough/` — 截圖輸出目錄（gitignored）
  - `ui-tests/feature_walkthrough_report.html` — 跑完輸出的 HTML（gitignored）
  - `ui-tests/feature_walkthrough_results.json` — 機器可讀結果（gitignored）
  - `ui-tests/fixtures/` — 用來測 mp3 normalization 的兩個小 MP3（一大聲一小聲）
- **依賴**：沿用既有 `playwright>=1.59.1`（已在 `frontend/package.json` 跟使用 Python `playwright`）；新增 `python -m playwright install chromium` 一次性
- **前置條件**：腳本需要後端跟前端都已啟動（http://localhost:5173 + http://localhost:8000）、Google 帳號已登入（測試不重做 OAuth，只驗已登入後的所有畫面與互動）
- **不影響**：所有產品功能、現有測試、release 流程
- **CI 整合（暫不做）**：先給人手動執行；之後若想進 CI（Actions Windows runner 跑 headless），需處理 OAuth 跟 mp3 fixture 取得，那是另一個 change
- **文件**：[README.md](README.md) 新增「跑完整 UI walkthrough 測試」一節；[docs/DEPLOY.md](docs/DEPLOY.md) release-前 checklist 引用此測試
