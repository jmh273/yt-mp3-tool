## Context

動機與完整證據見 `proposal.md` — Why。此處只記錄影響技術取捨的事實。

實測確立的因果鏈：

```
yt-dlp 需要 JS runtime 解 nsig（n 參數）challenge
        │ 缺 runtime 或缺 EJS solver
        ▼
n challenge solving failed  →  產出的媒體 URL 被 YouTube 拒絕  →  403
```

補齊 runtime 與 solver 後，仍受 player client 選擇左右（乾淨 IP、官方 yt-dlp.exe + deno 實測）：

| player client | 取得格式 | 下載 |
|---|---|---|
| `tv` `android` `mweb` `tv_simply` | 僅 progressive（format 18） | ✅ 成功 |
| `web` `ios` `web_safari` | `Only images are available` | ❌ 需 PO Token |
| 預設（落到 `android_vr`） | 有 URL | ❌ 403 |

可用 client 皆無 audio-only 格式：`-f bestaudio` 回 `Requested format is not available`。

既有打包現況：`ffmpeg.exe`、`mp3gain.exe` 已是 sidecar 二進位檔，由 CI 取得並 stage 進 bundle；`yt_dlp` 則是被 PyInstaller 凍進 exe 的 Python 套件。兩種模式並存。

## Goals / Non-Goals

**Goals:**

- 讓下載恢復可用，且不要求使用者安裝任何額外元件。
- 建立一次 JS runtime 基礎建設，同時服務 nsig 解算與 PO Token 兩個需求。
- 讓下一次同類故障能在數分鐘內定位，而非數小時。

**Non-Goals:**

- 不追求「永久」修好。YouTube 反制手段會持續演進，本設計的目標是讓元件可更新、故障可診斷。
- 不支援 cookies（實測 `cookiesfrombrowser` 在 Windows + Chromium 因 App-Bound Encryption 不可用，yt-dlp #10927；`cookiefile` 的隱私成本另案評估）。
- 不改 `download_concurrency` 預設值（實測與本問題無關）。

## Decisions

### D1：打包 deno 進 release，接受體積代價

release zip 由 95.5MB 增至約 137MB。

這是產品性質的取捨，已明確定案：本工具的賣點是「下載一包、解壓即用」，自架者不需要 Python、Node 或任何開發環境。要求使用者自行安裝 runtime 會破壞這個性質，並且把一個必然會出錯的步驟推給非技術使用者。

選 deno 而非 node 的理由：deno 是 yt-dlp 的預設 runtime、`yt-dlp-ejs` 主要針對它測試、且為單一 exe 無需附帶生態系目錄。node 實測也能解 challenge（`[jsc:node] Solving JS challenges using node`），體積相近，可作為替代但無明顯優勢。

考慮過的替代方案：
- **要求使用者自行安裝** — 破壞產品性質，否決。
- **執行期下載 runtime** — 首次使用需連網且可能失敗，且與離線可用的期待衝突。
- **`--remote-components ejs:github`** — 執行期抓 solver script，同樣引入網路相依，且官方 exe 已內建 solver，不需要走這條。

### D2：明確指定 player client，不沿用預設

`ydl_opts` 必須帶 `extractor_args.youtube.player_client`。yt-dlp 的預設選擇實測落在 `android_vr` 並產生 403，這不是可以忽略的邊緣情況。

採**優先序清單**而非單一 client（例如 `tv` → `android` → `mweb`），使單一 client 被 YouTube 封鎖時仍有退路。

風險：實測以清單形式指定（`android_vr,tv,web`）曾出現失敗，yt-dlp 會合併各 client 的格式後再套用 format selector，可能選到不可下載的格式。因此清單中 SHALL NOT 包含已知失效的 client（`android_vr`、`web`、`ios`、`web_safari`），且實作 SHALL 以實測驗證清單行為，而非假設。

### D3：PO Token 納入範圍，但排在最後

沒有 PO Token 就沒有 audio-only 格式，等於為了取音訊而下載整支 360p 影片——對一個 mp3 工具是實質降級。因此它不是「加分項」，是音質還原的必要條件。

但它同時是本 change 中**最不確定**的部分：provider 的具體形態、與打包 runtime 的整合方式、以及 YouTube 後續是否再變動，都還沒有實測基礎。

因此排在實作順序最後，並要求 PO Token 不可用時 SHALL 降級為 progressive 格式而非失敗。這讓本 change 即使在 PO Token 部分受阻，仍能交付「下載恢復可用」這個核心價值。

**實作時的修正（D3a）**：自動取得 PO Token 在現有生態下無法滿足 D1 的產品性質。唯一主流方案 `bgutil-ytdlp-pot-provider` 的兩種模式皆不可行——script 模式需 clone 其 repo 並安裝含原生模組（`npm:canvas`）的相依，server 模式需另行運行一個服務。yt-dlp 2026.7.4 雖內建 PO token 的 provider 框架（`extractor/youtube/pot/`），但只提供快取相關的 built-in，不含任何 token 產生器。

因此本 change 的 PO Token 範圍縮減為**手動供給 + 安全降級**：使用者可在設定中填入自行取得的 token 以還原 audio-only 音質；未供給時系統以 progressive 格式完成下載並保留說明原因的警告。自動取得留待生態成熟後另案評估。此修正已同步至 `specs/ytdlp-po-token/spec.md` 的 Purpose。

### D4：yt-dlp 採「內建保底 + 受管優先」的載入策略

內建版本（凍在 exe 中）永遠保留為 fallback；使用者資料夾中的受管版本若存在且可 import 則優先。受管版本載入失敗 SHALL 自動退回內建版本。

`yt_dlp` 為純 Python（實測 1129 個 `.py`、零編譯擴充，wheel 為 `py3-none-any`），因此執行期以下載的 wheel 覆蓋是可行的，且完全不需要改動下載邏輯（保留 Python API 與 `progress_hooks`）。

需要在 `import yt_dlp` 之前介入。PyInstaller 的 `FrozenImporter` 優先於 `sys.path`，因此需在 `sys.meta_path` 前端插入 finder（PyInstaller `runtime_hooks`），或在 `backend/__main__.py` 於載入 `main` 前完成路徑安排。

`yt-dlp-ejs` 與 yt-dlp 有版本相依，更新機制 SHALL 將兩者視為一組，不允許只更新其中一個。

考慮過的替代方案：
- **改用 sidecar `yt-dlp.exe` + subprocess** — 符合 ffmpeg 既有模式且完全隔離，但需把下載路徑從 Python API 改寫為 subprocess 並自行解析進度輸出。要重寫的正是目前唯一會壞的那條路，風險過高。

### D5：移除 `no_warnings`，警告視為第一級診斷資料

`_build_ydl_opts()` 目前的 `"no_warnings": True` 直接導致本次故障需要數小時定位——`No supported JavaScript runtime could be found` 與 `n challenge solving failed` 這兩行從第一次執行就存在，但被丟棄。

yt-dlp 的警告 SHALL 被保留並寫入檔案 log。這不是「順便加個 log」，是本次事件的直接對策。

## Risks / Trade-offs

- **release 體積增加 44%** → 已定案接受（D1）。若日後成為問題，可評估以壓縮率更高的封裝或按需下載 runtime。
- **player client 清單會過時** → YouTube 持續封鎖 client。緩解：清單可經設定覆寫，且 D4 的更新機制讓 yt-dlp 能跟上上游對 client 選擇的調整。
- **PO Token 部分可能無法完成** → 已於 D3 設計為可降級，核心價值不依賴它。
- **受管 yt-dlp 與內建版本行為不一致** → 版本資訊需在設定頁明確顯示「目前生效的是哪一份」，避免使用者誤判。
- **本次診斷在單一網路環境完成** → `tv`/`android` 可用、`web` 需 PO Token 的結論可能隨地區與時間變動。實作 SHALL 以可設定的清單而非硬編碼單一 client。

## Migration Plan

無資料遷移。`settings.json` 新增鍵沿用既有的 tolerant load（未知鍵保留、超範圍值重設為預設）。

回滾：還原 commit 即可。受管 yt-dlp 目錄若已建立，刪除該目錄即回到內建版本；不刪除也不影響回滾後的行為（載入策略會因 code 還原而不再讀取它）。
