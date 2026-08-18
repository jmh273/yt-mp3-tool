## Why

下載大量失敗，錯誤為 `unable to download video data: HTTP Error 403: Forbidden`。實測定位到**確定的根因**：yt-dlp 現在需要一個 JavaScript runtime 與 EJS challenge solver 才能正確解開 YouTube 的 nsig（`n` 參數）challenge，而本專案兩者皆無。

用 app 目前的 `yt-dlp==2026.3.17` 與相同的 `ydl_opts` 實測，逐步補齊元件的結果：

| 環境 | yt-dlp 的輸出 |
|---|---|
| app 現況（無 runtime、無 solver） | `WARNING: No supported JavaScript runtime could be found. YouTube extraction without a JS runtime has been deprecated` |
| 補上 node | `WARNING: n challenge solving failed: Some formats may be missing` |
| 補上 node + `yt-dlp-ejs` | `[jsc:node] Solving JS challenges using node` — 無警告，nsig 正常解開 |

nsig 解不開時產出的媒體 URL 本來就會被 YouTube 拒絕。**這是確定要修的缺陷，與下述第二層問題是否存在無關。**

三個放大傷害的現況：

1. **`_build_ydl_opts()` 設了 `"no_warnings": True`**，把上述所有診斷訊息全部丟掉。定位這個問題花掉數小時，唯一的原因就是這行讓答案不可見。
2. **`download_one()` 沒有任何重試**，`except` 一次定生死。既有重試路徑是手動的（失敗項留在 `selected` 讓使用者再按一次），對暫時性錯誤把成本轉嫁給使用者。
3. **失敗原因在 UI 上看不到**。錯誤字串從後端經 SSE 傳到 `progress[vid].error`，但 `SelectedVideos.vue` 只渲染紅色進度條與「N 支失敗」計數。隔壁 `VolumeNormalizer.vue` 有逐項錯誤顯示，下載面板漏了。

上述診斷在**未受先前測試影響的乾淨網路**（切換到行動網路，另一個對外 IP）上重新驗證：app 現有 stack 仍以 `n challenge solving failed` 失敗，確認根因與 IP 信譽無關。

同一組乾淨環境下，以官方 `yt-dlp.exe` + deno 逐一測試 player client：

| player client | 結果 |
|---|---|
| `tv` / `android` / `mweb` / `tv_simply` | ✅ 下載成功 |
| `web` / `ios` / `web_safari` | ❌ `Only images are available`（被要求 PO Token） |
| **預設選擇**（落到 `android_vr`） | ❌ **403 Forbidden** |

因此修復需要三個條件同時成立：JS runtime、EJS solver、**明確指定可用的 player client**。yt-dlp 的預設 client 選擇正好落在失敗的那一個，僅補齊前兩者仍會失敗。

**音質與流量的代價**：在可用的 client（`tv` / `android`）下，`-f bestaudio` 回報 `Requested format is not available`——**沒有 audio-only 格式可用**，`bestaudio/best` 一路 fallback 到 `format 18`（360p 合併 mp4、AAC 約 96kbps）。等同下載整支 360p 影片再抽音軌，音質低於原本的 opus 128k，流量為數倍。解鎖 audio-only 格式正是 PO Token（BotGuard）的用途，因此 PO Token 由「第二層的候選解」升級為「維持原有音質的必要條件」。

**已排除的假設**（實測）：yt-dlp 版本（新舊版皆曾成功也皆曾失敗）、player client 選擇、下載並發數（設為 1 仍失敗）、IPv6（測試機無 IPv6 對外）、ffmpeg（錯誤發生在 download 階段，未進入 postprocess）。

`yt-dlp==2026.3.17` 自 Initial commit（2026-05-03）起從未更動，而它被 PyInstaller 凍進 exe，v0.5.0～v0.23.0 全部 27 個 release 內含同一份；`update.bat` 只換 release zip，救不了這件事。對一個依賴 YouTube 內部實作、上游高頻發版的元件，這是必然會爆的結構性隱患。

## What Changes

**核心修復：JS runtime 與 challenge solver**

- 打包一個 JavaScript runtime（deno 或 node）進 release，沿用既有 `ffmpeg.exe` / `mp3gain.exe` 的 sidecar 模式。
- 新增 `yt-dlp-ejs` 為執行期相依，使 challenge solver 隨程式一起安裝，SHALL NOT 依賴執行期從網路抓 remote component。
- `ydl_opts` 明確指定 `js_runtimes` 指向打包的 runtime，SHALL NOT 依賴使用者機器上剛好有 node/deno。
- 啟動時偵測 runtime 是否可用；不可用時 SHALL 明確告警而非無聲降級。
- `ydl_opts` SHALL 明確指定可用的 YouTube player client，SHALL NOT 沿用 yt-dlp 的預設選擇（實測預設會落到 `android_vr` 並失敗）。

**音質還原：PO Token**

- 支援在設定中供給 GVS PO Token，使 audio-only 格式重新可用，避免為了取音訊而下載整支 360p 影片。
- PO Token 未供給時 SHALL 優雅降級為 progressive 格式（可下載但音質較低），SHALL NOT 直接失敗；略過格式的原因 SHALL 出現在保留的警告與 log 中。
- **自動取得 PO Token 不在範圍內**（實作時評估後確立）：唯一主流方案需 clone repo 並安裝含原生模組的相依，或另行運行一個服務，皆牴觸「下載一包即用」的產品性質。詳見 design.md D3a。

**可觀測性（此問題的直接教訓）**

- 移除 `_build_ydl_opts()` 的 `"no_warnings": True`，並把 yt-dlp 的警告與錯誤寫入使用者資料夾下的 log 檔，console 關閉後仍可追查。
- 下載面板逐項顯示失敗原因，與 `VolumeNormalizer.vue` 的 `.item-error` 呈現拉平。

**韌性（緩解，非修復）**

- 每支影片失敗後自動重試：重新 extract 取得新的串流 URL，以指數退避重試至可設定上限後才標記為 `error`。重試狀態 SHALL 在進度中可見。
- `_build_ydl_opts()` 加入 `http_chunk_size`、`retries`、`fragment_retries`。

**版本維護**

- `requirements.txt` 的 yt-dlp pin 由 `2026.3.17` 升至 `2026.7.4`，並同步釘住相容的 `yt-dlp-ejs` 版本。
- 設定頁新增更新機制：顯示目前生效的 yt-dlp / yt-dlp-ejs 版本、查詢最新版、一鍵更新、可回退到內建版本。yt-dlp 改為「內建版本為保底、使用者資料夾中的受管版本優先」的載入策略，受管版本載入失敗時 SHALL 自動退回內建版本。

**不在本次範圍**

- cookies 支援。實測 `cookiesfrombrowser` 在 Windows + Chromium 上因 App-Bound Encryption 不可用（yt-dlp #10927），若要走 cookies 只能用手動匯出的 `cookiefile`，成本與隱私影響需另案評估。
- `download_concurrency` 預設值調整。已實測與本問題無關。

## Capabilities

### New Capabilities
- `ytdlp-js-runtime`: yt-dlp 的 JavaScript challenge 解算基礎建設——打包的 JS runtime、`yt-dlp-ejs` solver、`js_runtimes` 設定、啟動時的可用性偵測與告警。
- `ytdlp-runtime-update`: yt-dlp 與 yt-dlp-ejs 的執行期版本管理——內建保底版本與使用者受管版本的載入優先序、設定頁的版本查詢／更新／回退流程、更新失敗時自動退回保底版本。
- `ytdlp-po-token`: PO Token（BotGuard）取得與套用——使 audio-only 格式可用以維持音質，provider 執行於打包的 JS runtime 之上，不可用時降級為 progressive 格式而非失敗。
- `download-retry-backoff`: 單一批次內針對暫時性下載失敗的自動重試——重新 extract 取新串流 URL、指數退避、上限與參數由設定控制、重試狀態在進度中可見。
- `download-failure-diagnostics`: 下載失敗的診斷可觀測性——保留並記錄 yt-dlp 的警告與錯誤、失敗寫入檔案 log。

### Modified Capabilities
- `download-resume`: `下載結束後失敗項可見且可重試` 需求擴充——失敗項除了以 error 樣式標示「哪幾支」，SHALL 一併顯示「為什麼」（後端回報的錯誤字串）；並澄清自動重試已用盡才會呈現為失敗。

## Impact

- 打包 `scripts/build.bat` 與 `.github/workflows/release.yml`：新增取得並 stage JS runtime 二進位檔的步驟。需決定 runtime 選擇與版本釘選策略（BtbN ffmpeg 目前抓 `master-latest` 的做法不應複製到 runtime 上）。
- 相依 `backend/requirements.txt`：yt-dlp 升版 + 新增 `yt-dlp-ejs`。
- 後端 `backend/main.py`：`_build_ydl_opts()` 加入 `js_runtimes` 與韌性選項、移除 `no_warnings`；`download_one()` 加入重試迴圈與失敗 log；`_SETTINGS_RANGES` / `DEFAULT_SETTINGS` 新增重試相關鍵；新增版本查詢／更新／回退端點。
- 後端 yt-dlp 載入路徑：受管版本優先需在 `import yt_dlp` 之前介入（`backend/__main__.py` 或 PyInstaller runtime hook）。`main.py:12` 的 top-level import 與 `main.py:2224`／`2306` 的區域 re-import 皆受影響。
- 打包 `yt-mp3-tool.spec`：可能需要新增 `runtime_hooks`；內建 yt_dlp 保留作為保底。
- 前端 `SelectedVideos.vue`：逐項錯誤顯示、重試中狀態呈現。
- 前端 `SettingsView.vue`：版本更新區塊（沿用 `subscription-health-check` 已建立的「按鈕觸發 + 結果列表」設定頁模式）。
- 發行體積：實測 `deno.exe` 解壓後 97MB（zip 內約 42MB）。release zip 由目前 95.5MB 增至約 137MB。**已決定接受此代價以維持「下載一包即可使用」的產品性質**，SHALL NOT 要求使用者另行安裝 runtime。
- 使用者資料：受管 yt-dlp 存放於 `~/.yt-mp3-tool/`，回退等同刪除該目錄。
- 網路：新增對 PyPI 的版本查詢與下載；離線時 SHALL 優雅降級為「無法查詢，維持目前版本」。
