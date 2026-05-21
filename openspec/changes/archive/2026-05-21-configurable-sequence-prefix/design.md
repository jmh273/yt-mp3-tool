## Context

`download-filename-prefix` 規格目前由幾段程式構成：

- [backend/main.py:1192-1195](backend/main.py#L1192-L1195) `_format_seq(n)` ── `width = max(2, len(str(n)))`，這就是「至少 2 位、超過自動擴充」的來源。
- [backend/main.py:1198-1221](backend/main.py#L1198-L1221) `_scan_next_seq(directory)` ── 掃描 `^(\d+)_` 取 `max + 1`。
- [backend/main.py:1224-1249](backend/main.py#L1224-L1249) `_build_ydl_opts(..., seq_prefix="")` ── 把前綴塞進 `outtmpl`。
- [backend/main.py:1277-1282](backend/main.py#L1277-L1282) `run_download()` 內 `start_seq = _scan_next_seq(...)`、`seq_prefix = f"{_format_seq(start_seq + idx)}_"`。

整套流程「永遠開啟、永遠 auto-scan、永遠至少 2 位數」，沒有對外控制點。我們現在要把這三個假設都鬆綁為可由請求參數控制：是否加前綴、從哪一個號開始、以及該起始字串本身決定位數。

前端側目前的下載觸發點在 [frontend/src/components/SelectedVideos.vue](frontend/src/components/SelectedVideos.vue)，呼叫 `download.startDownload(format, quality)`（[frontend/src/stores/download.ts:72-104](frontend/src/stores/download.ts#L72-L104)），payload 結構為 `{ videos, format, quality }`。

新功能對應的搭配場景是 `paginate-playlist-preview`：使用者把一份大型播放清單分批勾選下載，並希望整批仍維持一致流水號（例 01~25、26~50、51~75）；現有 auto-scan 在同一個日期資料夾內已能做到「續編」，但無法做到「我這一批想從 100 開始」這種精細控制，這次就是把這個能力打開。

## Goals / Non-Goals

**Goals:**
- 後端 `POST /download` 接受 `seq_enabled: bool`、`start_seq: str | None` 兩個可選欄位，並維持向後相容（未帶 = 現行行為）。
- `start_seq` 為純數字字串，**字串長度決定位數**：`"01"` → 2 位、`"001"` → 3 位、`"100"` → 3 位，超出該位數能表示的最大值時，**改以實際位數呈現**（例：`start_seq="999"`，n=1000 → `1000_`；不重置回 `000_`）。
- 提供 `GET /download/next-seq` 端點，回傳當下日期資料夾的 `next_seq`（字串、最少 2 位）與 `existing`（已存在的數字陣列），供 UI 預填與衝突警告使用。
- UI 在 `SelectedVideos.vue` 新增：勾選盒「加流水號」（預設 ON，存 localStorage）+ 文字輸入框「起始號」（每次面板出現時 auto-fetch 預填，不持久化）+ 衝突警告文字。
- 衝突偵測在前端完成；後端不阻擋衝突送出，由 yt-dlp 既有的 `-2`、`-3` 去重後綴保底。

**Non-Goals:**
- 不變更 `_sanitize_filename` 行為；流水號前綴疊加位置仍在 sanitize 後、副檔名前。
- 不引入「跨日期共用流水號」概念；`next-seq` 與既有 `_scan_next_seq` 一樣只看當天資料夾。
- 不把使用者輸入的 `start_seq` 持久化到 `localStorage` / 後端 settings；只在當次面板生命週期內保留。
- 不變更 `paginate-playlist-preview` 的行為；這次修改只在「下載觸發」這一層動手。
- 不引入「跨格式（mp3 vs mp4）獨立序號」；繼續沿用「日期資料夾內所有副檔名共用同一序號空間」的既有規則。

## Decisions

### D1：`start_seq` 用字串型別、字串長度決定位數
- **選擇**：`start_seq: str | None`，例如 `"01"`、`"001"`、`"100"`。
- **替代方案**：把起始號與位數拆成兩個欄位（`start_seq: int`、`width: int`）。
- **理由**：使用者在 UI 看到並輸入的就是「`01`」或「`001`」這樣的字串，把它原樣傳給後端、用 `len(s)` 推位數最直觀，避免前後端各自管位數造成不同步。前端只需做「`^\d{1,10}$`」的正則驗證即可。

### D2：超過 `10^width - 1` 時自動擴充位數
- **選擇**：第 `idx` 支影片實際位數 `width = max(width0, len(str(n0 + idx)))`，套用到 `f"{n:0{width}d}"`。
- **替代方案**：硬性卡在使用者指定位數，遇到溢出時報錯或回繞。
- **理由**：使用者多半只填一個短前置字串（`01`），他們的本意是「兩位數零填充」，並非「絕對不能超過 99」。沿用既有 `_format_seq` 的精神（`max(2, len(str(n)))`）改成「以使用者輸入長度為底線」，可以自然支援「999 → 1000」這種跨位數情境且不引入新錯誤模式。

### D3：`seq_enabled=false` 時前綴完全不出現
- **選擇**：當 `seq_enabled` 為 `false`，`seq_prefix = ""`、`outtmpl = f"{safe_title}.%(ext)s"`，與功能未上線前的原始版本一致。
- **替代方案**：仍加前綴，但 width = 0；技術上等同 D3，但實作得繞 `_format_seq` 一圈，沒有意義。
- **理由**：保持「使用者明示關閉就完全乾淨」。後續若有舊檔名與新檔名重複，yt-dlp 既有 `-2`、`-3` 去重會接管。

### D4：UI 預填靠新端點 `/download/next-seq`，而非把資料夾內容塞進 `/download` response
- **選擇**：新增獨立 `GET /download/next-seq` 端點，回傳 `{ next_seq: "08", existing: [1, 2, 5, 7] }`。
- **替代方案 A**：在 `POST /download` 回應裡帶 `existing` / `applied_seq`，事後展示給 UI。
- **替代方案 B**：把 `/settings` 擴充為一次回完整 metadata。
- **理由**：UI 需要在「使用者**還沒按下載**」時就預填輸入框並做即時衝突警告，所以資訊必須在點下載之前抓得到。把它拆成獨立讀取端點，責任最單一；不污染 `POST /download` 的響應結構（與既有 `download-filename-prefix` Requirement 4「API Payload 不變」保持距離）。

### D5：衝突偵測純前端、後端不阻擋
- **選擇**：前端從 `/download/next-seq` 拿 `existing: number[]`，把使用者輸入轉成 `n0`，計算 `[n0..n0 + selected.length - 1]` 與 `existing` 的交集；有交集就顯示警告文字，但「下載」按鈕仍可按。
- **替代方案**：後端拒絕衝突請求 → 422。
- **理由**：使用者既然故意要分梯，可能就是想覆蓋或刻意延續一段；後端應信任使用者意圖。yt-dlp 的 `-2`/`-3` 去重已能避免實體覆蓋，前端警告只是「貼心提示」。

### D6：`seq_enabled` 的 localStorage key 命名與 boolean 解析
- **選擇**：key 用 `yt_mp3_seq_enabled`，值存字串 `"true"` / `"false"`，啟動時 `localStorage.getItem(...) !== 'false'`（即「不存在或不是 'false' 都當作 true」）。
- **理由**：與既有 `yt_mp3_downloaded_ids` 命名前綴一致；以「不是 false 都當 true」邏輯確保「首次使用」也是預設 ON。

### D7：每次面板出現時 fetch `/download/next-seq`
- **選擇**：在 `SelectedVideos.vue` 用 `watch(() => download.selected.length)`，從 0 變為 >0 時觸發 fetch；或在元件 onMounted 但只有當已有選取才 fetch。下載完成 (`download.downloading` 變 `false`) 後也重新 fetch（因為剛剛的下載已經改變了 `existing`）。
- **替代方案**：每次使用者點開輸入框時 fetch。
- **理由**：跟著「面板從不可見變可見」的時機 fetch 最自然；下載完成後 refetch 是為了支援「同一個面板連續分批下載」場景，避免第二批仍看到舊的 next_seq。

## Risks / Trade-offs

- **[Risk] 使用者把 `start_seq` 設得很大（例如 `99999`），位數膨脹後檔名變得難看**：
  → **Mitigation**：UI 對輸入框加 `maxlength=10` + `pattern="\d+"`，僅允許 1~10 位純數字；後端也加同樣驗證。多位數情境是使用者主動選擇的，我們僅約束「合理上限」。

- **[Risk] 衝突警告依賴的 `existing` 在 UI 預載後可能過時**（例如使用者另開檔案總管手動丟檔進去）：
  → **Mitigation**：在「按下載」前一刻、且 `download.downloading` 由 true → false 時都重新抓 `/download/next-seq`，把間隔縮到「面板顯示期間」。徹底防護需要 inotify 級別監聽，過度工程。

- **[Risk] 與 paginate-playlist-preview 的「下載完成後 selected 自動移除」交互**：當使用者按下載後 `download.selected.length` 會逐步降到 0，原本「>0 才顯示面板」可能讓設定列消失：
  → **Mitigation**：保持現行「`v-if="download.selected.length > 0 || download.downloading"`」，且面板只在 `!download.downloading` 時可改設定；流程上沒有閃動風險。

- **[Trade-off] 後端不檢查衝突**：可能會出現 yt-dlp 自動加 `-2` 的最終檔名，使檔名形如 `05_Title-2.mp3`，破壞「乾淨流水號」初衷。
  → **Mitigation**：UI 警告 + 不持久化 `start_seq` 兩者已合理地把責任放在使用者身上；若日後實際遇到再加後端拒絕模式。

## Migration Plan

1. 後端先新增欄位與端點，舊呼叫端（未帶新欄位）行為不變。
2. 前端切換到新 payload；同時把 `SelectedVideos.vue` 介面升級。
3. 一個 commit 即可同時上線（不需要分階段 feature flag）。
4. 回滾：還原 `backend/main.py`、`SelectedVideos.vue`、`download.ts` 三檔即可。

## Open Questions

- 是否在 `SelectedVideos.vue` 提供「重新 fetch」按鈕讓使用者主動更新 `existing`？暫時不做，靠 watch + 下載完成 refetch。
- 未來若加上「歷史日期資料夾下載」需求，是否要讓 `/download/next-seq` 接受 `?date=YYYYMMDD`？本次不做，沿用「當天」邏輯。
