## Context

現有 `ui-tests/ui_test.py` 用 Playwright 跑 13 個 TC、每個 TC 結尾截 1 張圖、用 `record()` 函式收結果、最後產 HTML 報告。我們想擴大兩個維度：
1. **每個 TC 的步數**：從 1 步驟＋1 圖，變 5–8 步驟＋5–8 圖，把使用者實際操作流程展開。
2. **敘述語言**：每張截圖前用一段繁中描述「操作的內容」與「預期看到什麼」。

同時涵蓋自上次寫測試以來新增的全部功能：mp3 正規化、檔名 sanitize、自動 rename、版號顯示、右欄分頁切換 + KeepAlive、設定頁的 normalize_target_db 欄位等。

## Goals / Non-Goals

**Goals:**
- 一個指令跑完，產出 self-contained HTML 報告，當作每次 release 前的人類可讀驗收
- 報告對「沒看過程式」的人也有價值（每張圖前的繁中敘述等於使用手冊）
- 涵蓋全部 user-visible 功能，至少 ~50 個 step / 30+ 截圖
- 任何 step 失敗 → 報告標記紅色 + 錯誤訊息，不中斷整個 run

**Non-Goals:**
- CI 自動化（這次先做手動執行版；要進 CI 是另一個 change）
- OAuth 流程本身的測試（假設 token 已存在；OAuth 互動不適合自動化）
- 真實下載驗證（會打 YouTube、跑分鐘級時間；模擬到「按下載按鈕後 task_id 回傳」即可）
- 真實 mp3gain 處理大量檔案（用 fixture 中兩個小 MP3 驗就好）
- 跨瀏覽器測試（只跑 Chromium）

## Decisions

### Decision 1: `step()` API 取代既有 `record()` 模式

**選擇**：定義一個 helper：

```python
async def step(case_ctx, narration: str, action: Callable[[], Awaitable[None]] | None = None,
               wait_ms: int = 500) -> dict:
    """執行一步操作、截圖、記錄敘述。

    case_ctx: 該 TC 的累積狀態（list of step dicts）
    narration: 繁中描述「現在要做什麼」
    action: async 函式，含 click/fill/等互動；可為 None（純截圖某個畫面）
    wait_ms: 互動後等待 UI 更新的時間
    """
```

**為什麼**：取代 `record(name, desc, passed, sc)` — 那個是「整個 case 一次評斷」的粒度。`step()` 是「每次互動就截一張」，更接近使用手冊的呈現方式，也讓失敗定位更精準（哪一步壞）。

### Decision 2: HTML 報告結構：每個 TC 一個 collapsible section，step 們是垂直 timeline

**選擇**：

```
┌─────────────────────────────────────────────┐
│ TC-04: 頻道選取與影片清單顯示    [PASS] ▾    │
├─────────────────────────────────────────────┤
│ Step 1 — 操作敘述（繁中一段）                 │
│ [screenshot 380x280]                        │
│ ──                                          │
│ Step 2 — 操作敘述                            │
│ [screenshot]                                │
│ ──                                          │
│ ...                                         │
└─────────────────────────────────────────────┘
```

點 TC 標題展開/收合；預設失敗的 TC 展開、通過的收合（避免一次看到 100+ 截圖）。

**為什麼**：階層清晰、可掃可深入、繁中敘述是主角而非邊欄註解。

### Decision 3: 案例組成 — 11 個 TC

| # | TC | Steps | 涵蓋功能 |
|---|----|-------|---------|
| 1 | 啟動與版號 | 3 | header v<version>、訂閱清單載入、loading 狀態 |
| 2 | 訂閱頻道：搜尋 | 4 | 搜尋輸入、結果即時過濾、清空恢復、無結果空狀態 |
| 3 | 訂閱頻道：日期更新檢查 | 3 | 「檢查更新日期」按鈕、loading、每個頻道顯示日期 |
| 4 | 頻道選取與影片清單 | 5 | 選頻道、右欄切換、影片卡片內容（標題/時長/縮圖/時間） |
| 5 | 影片勾選與選取面板 | 6 | 勾單支、勾多支、面板數字、清除全部、面板消失 |
| 6 | 最新影片分頁 | 5 | 切到「最新影片」、loading、清單、勾選 cross-view 累計 |
| 7 | 設定頁完整流程 | 7 | 進設定、改 output_path、改 videos_per_channel、改 latest_hours、改 normalize_target_db、儲存成功、回主頁 |
| 8 | 設定頁驗證 | 4 | latest_hours 0 → 422、99999 → 422、normalize_target_db 75 → 422、修正後可儲存 |
| 9 | 右欄分頁切換 | 5 | 預設「下載」分頁、切「音量正規化」、目錄預填當日、切回「下載」、再切回「音量正規化」清單仍在（KeepAlive） |
| 10 | 音量正規化基本流程 | 6 | 載入 fixture 目錄、清單顯示、本次目標 dB 預填、開始正規化、進度更新、批次摘要 |
| 11 | 音量正規化進階 | 5 | 含特殊字元檔名 → needs_rename 警告、按重新命名 → 自動 rename、_rename_log.json 產生、再跑全部已符合 |

每個 step 的 narration 是 1–2 句繁中（「點擊 ... 後應該看到 ...」），長度可讀。

### Decision 4: OAuth 假設已登入，不測 OAuth

**選擇**：腳本啟動先打 `http://localhost:8000/auth/status`，如果 `logged_in: false` 就直接 abort 並提示使用者：「請先在 http://localhost:5173 完成 Google 登入後再跑測試」。

**為什麼**：OAuth 是 Google 控制的瀏覽器流程，自動化要嘛硬塞測試帳號（複雜）、要嘛 mock（測不到真東西）。先用 token 已存在當前置條件，等其餘流程穩定再評估是否做 OAuth 自動化。

### Decision 5: mp3 fixture — 兩個 ~50 KB 的 silent / loud sine wave

**選擇**：在 `ui-tests/fixtures/` 預先放兩個小 mp3（用 ffmpeg 預先產：`ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -filter:a "volume=-25dB" quiet.mp3` 跟 `... volume=0dB ... loud.mp3`）。每個約 30–50 KB。腳本在 TC-10 / TC-11 開始時把它們複製到 `%TEMP%\walkthrough-mp3-test\`，跑完清掉。

**為什麼用 fixture 不用使用者真實檔案**：(1) 測試結果可重現 — 每次跑都從同樣的初始狀態開始；(2) 不會破壞使用者的真實 MP3（mp3gain 會改原檔）；(3) 體積小、git track OK；(4) 兩個檔響度差大讓 `已符合` vs `正規化` 兩種狀態都能驗到。

### Decision 6: 不真的下載 YouTube 影片（不擴張到 backend mock）

**選擇**：TC-05/TC-06 只測 UI 行為到「按下載 → 面板出現進度條」為止。Click「下載選取影片」之後等 1–2 秒、確認 SSE 連線建立（progress dict 有 entry）、截圖、結束此 TC。**不**等實際下載完成。

**為什麼**：真下載要分鐘級、需要外網、會佔使用者下載目錄。對「驗 UI」沒幫助。回歸到「下載完成」這個狀態的測試由 backend pytest 蓋（已存在）。

### Decision 7: Step API 內建容錯

**選擇**：`step()` 內部 try/except — 任何 exception → step 標 FAIL、截圖一張錯誤畫面、繼續下一個 step。整個 TC 不中斷。任何 step FAIL → 整個 TC 標 FAIL。

**為什麼**：「一個 step 掛掉，後面就不跑」會讓報告少很多資訊。紅色標記 + 截圖 + 錯誤訊息保留下來讓人診斷比較有用。

## Risks / Trade-offs

- **Headed mode 在 VMware GUI 內跑可能慢/不穩** → 既有 `ui_test.py` 已驗證可行；保留 `slow_mo=300` 一致設定
- **截圖數量多（~50+）佔空間** → 每張 ~50 KB → 總共 ~3 MB，可接受。HTML 報告用 `<img>` 引用 file:// 路徑（不 inline base64，避免 HTML 太大）
- **預設動畫/transition 截到一半看起來髒** → `wait_ms` 預設 500、UI 動畫多的 step 個別調高
- **Playwright 版本飄移** → 釘 `playwright>=1.59`（既有版本），新版破壞性改 API 時 update.bat 無法救（這是 dev tool，不是 runtime 依賴）
- **fixture mp3 進 git 約 100 KB** → 可接受；放 `ui-tests/fixtures/` 並 commit
- **報告可能被當「文件」誤用，跟著程式碼變舊** → 在 README 寫明：「這是測試產物、隨程式碼演進、release 前重跑」，避免有人把它當定義
