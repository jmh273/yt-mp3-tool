## Context

「最新影片」面板目前的兩個瀏覽過濾條件（時間範圍 `latest_hours`、長度區間 `min_duration_minutes` / `max_duration_minutes`）只能透過設定頁修改。實務上，使用者經常想暫時放寬或收緊範圍以快速瀏覽不同時段或不同長度的內容（例如想看「過去 12 小時內的所有長度影片」），目前流程需要設定→儲存→返回→重整，體驗破碎。

現行架構：
- 後端 `GET /latest-videos?hours=<n>`：若 `hours` 未提供，使用 `settings.latest_hours`（預設 24）。Duration 過濾由 `enhance_and_filter_videos(apply_duration_filter=True)` 內部讀取 settings 完成。
- 前端 `LatestVideosFeed.vue`：`onMounted` 時讀取 settings → 以 `?hours=<latestHours>` 取得影片 → 顯示 `<hours>h 內` 徽章。

需在不改動現有 settings 預設值來源、不影響其他 feed 的前提下，讓使用者能在面板內就調整本次查詢。

## Goals / Non-Goals

**Goals:**
- 在「最新影片」面板提供時間範圍、最短/最長長度的內嵌輸入控制項，預設值來自使用者已儲存的 settings。
- 後端 `/latest-videos` 支援以查詢參數覆寫 duration 上下限，僅作用於該次請求。
- 控制項變更後使用者可以一次性套用所有三個參數重新載入。
- 既有設定頁仍是「預設值的唯一寫入入口」；面板上的調整不寫回設定。

**Non-Goals:**
- 對 `/subscriptions/{channel_id}/videos`、`/trending-videos`、`/search-videos` 增加任何 inline filter（duration filter scope 已明確只在最新影片套用）。
- 永久化使用者在面板上的暫時調整（不寫入 settings、不存 localStorage）。
- 增加超出目前 settings 範圍的驗證規則（例如不允許 hours > 168）。

## Decisions

### Decision 1：以查詢參數覆寫 duration，settings 仍為預設值來源
- 選擇：`GET /latest-videos` 接受 `hours`、`min_duration_minutes`、`max_duration_minutes` 三個可選查詢參數；當提供時，覆蓋 settings 用於本次篩選，不改動設定檔。
- 替代方案：(a) 改為 POST + body；(b) 在 settings 之外新增 session-level state。
- 理由：保持 GET 語意、向後相容（未傳新參數時行為不變）；無狀態最簡，前端只需把面板上的值塞進 query string；和現有 `?hours=` 一致。

### Decision 2：`enhance_and_filter_videos()` 接受 overrides 而非全域變數
- 選擇：`enhance_and_filter_videos(..., min_duration_override: int | None = None, max_duration_override: int | None = None)`；當 override 為 `None` 時讀 settings，否則使用 override。
- 替代方案：在 `/latest-videos` 處理器內取得 settings、複製成 dict、暫時改寫後傳入。
- 理由：明確 per-call 參數比 mutating settings 安全；其他端點（傳 `apply_duration_filter=False`）行為不變。

### Decision 3：前端控制項預設帶入 settings；變更不寫回
- 選擇：`LatestVideosFeed.vue` 載入時先 fetch `/settings` 取得三個欄位的初始值放入本地 `ref`，使用者調整這些 `ref` 後按「套用」觸發新一次 fetch。
- 替代方案：將控制項做成「即時去抖動 (debounce) 自動套用」；或新增獨立 Pinia store 緩存。
- 理由：明確按鈕語意避免每次按鍵都打 API；組件級 state 足以，無需新 store；後續可再加 debounce 但不必首版就做。

### Decision 4：徽章顯示動態目前條件
- 選擇：把原本固定的 `<latestHours>h 內` 徽章替換為兩段：時間範圍與長度區間，例「24h · 3–60 分鐘」。
- 替代方案：保留原徽章＋另外文字顯示。
- 理由：使用者既然可以即時調整，徽章應該反映「目前生效中的條件」而非「設定預設值」。

### Decision 5：驗證在前端完成、後端寬鬆 clamp
- 選擇：前端對 hours 套用 1–168 驗證（與設定頁一致）、min ≥ 0、max ≥ 1 且 max ≥ min；後端對 query 參數進行型別轉換與基本下限 clamp（負值視為 0），上限不額外限制（YouTube duration 自然有界）。
- 替代方案：後端嚴格驗證並回 422。
- 理由：簡化錯誤路徑；本應用是單機本地 UI，前端為唯一呼叫端。

## Risks / Trade-offs

- [使用者期望「面板上的調整自動寫回 settings」] → 在 UI 文案明確標示「目前瀏覽條件（不會修改預設）」；設定頁仍保留欄位。
- [Query string 變多容易誤呼] → 後端只在「最新影片」端點處理新參數；其他端點不接收，向後相容。
- [Settings 與面板 state 不同步] → 每次面板載入都重新從 settings 帶值；不嘗試在面板與 settings 之間同步暫時值。
- [前端 input 連續快速點擊「套用」造成 race] → 簡易做法：套用期間 disable 按鈕；不引入請求取消邏輯（首版不必要）。

## Migration Plan

- 後端：純擴充查詢參數，未傳新參數時行為與舊版一致 → 無需資料庫或設定檔遷移。
- 前端：UI 變更僅影響 `LatestVideosFeed.vue`；舊使用者打開即看到新控制項，預設值仍是其原本 settings。
- 設定頁：保留原有 `min_duration_minutes` / `max_duration_minutes` / `latest_hours` 欄位，無需移除。
- 回退：若面板控制項出現問題，可暫時隱藏 UI 區塊而保留 settings 路徑運作；後端新增的可選參數不需移除。
