## Context

後端已有 `GET /subscriptions`（列訂閱，帶 `subscription_id` / `channel_id` / `title` / `thumbnail`）、`DELETE /subscriptions/{subscription_id}`（退訂）、以及 `GET /subscriptions/latest-dates`（用 semaphore fan-out 對每個頻道探測上傳影片）。抓影片的核心是 `fetch_channel_videos_api`：把 `UC...` 頻道 ID 前兩碼換成 `UU` 當成上傳播放清單 ID，打 `playlistItems.list`；目前它會吞掉錯誤只回空清單，並把整段 `playlistNotFound` JSON 印到 log。

本變更沿用既有 fan-out 模式，新增一支「回傳失敗原因」而非吞錯的探測函式，據此盤點問題頻道。

## Goals / Non-Goals

**Goals:**
- 一支 `GET /subscriptions/health-check` 端點，列出抓不到影片的頻道並標示原因。
- 設定頁一顆按鈕觸發健檢、逐列顯示、可直接退訂。
- 把 `playlistNotFound` 的 log 降噪成一行。

**Non-Goals:**
- 不做背景自動健檢或排程（僅手動觸發）。
- 不做批次「一鍵全部退訂」（逐列退訂即可，避免誤刪）。
- 不改動 `fetch_channel_videos_api` 對外的回傳型別（維持 `(channel_id, videos)`）。

## Decisions

### 1. 新增獨立探測函式，而非改 `fetch_channel_videos_api` 的回傳型別
新增 `_probe_channel_status(creds, channel_id) -> status` 專供健檢使用，回傳 `ok` / `empty` / `playlist_not_found` / `forbidden` / `error`。
- **為何**：`fetch_channel_videos_api` 被 `/latest-videos`、`/latest-dates`、單頻道影片等多處使用，改回傳型別牽動廣。獨立函式隔離風險、職責單一，也好測。
- **替代方案**：讓 `fetch_channel_videos_api` 多回一個 error 欄位 → 波及所有呼叫點，否決。

### 2. 兩階段分類：先探測、再對失敗頻道批次 `channels.list`
第一階段對所有頻道 fan-out 探測（semaphore，比照 `latest-dates`）。第二階段僅對「非 ok」頻道呼叫 `channels.list`（一次最多 50 個 id）判定存在與否，映射成 `reason`：
- `playlist_not_found` / `empty` + 頻道存在 → `no_uploads`
- 探測失敗 + `channels.list` 查無 → `deleted`
- `forbidden` → `forbidden`
- 其他 → `unknown`
- **為何**：`playlistNotFound` 無法單獨區分「已刪除」與「無上傳」（實測兩者都可能 404），需 `channels.list` 佐證。只對失敗頻道查，額外配額極小（每 50 個失敗頻道 1 單位）。

### 3. 配額成本比照 `latest-dates`，按鈕旁標註提示
每個頻道探測 1 單位 `playlistItems.list`，N 個訂閱約 N 單位，與既有 `/subscriptions/latest-dates` 同級。手動按鈕、按鈕旁標示成本，使用者自行決定何時檢查。

### 4. 退訂沿用既有端點與逐列確認
前端逐列呼叫既有 `DELETE /subscriptions/{subscription_id}`，退訂前以確認對話框防誤刪，成功後就地移除該列並 toast。

### 5. Log 降噪以錯誤類別分流
在 `fetch_channel_videos_api` 判斷回應為 `playlistNotFound` 時，只印一行含頻道識別的精簡訊息；其餘非預期錯誤維持完整輸出。

## Risks / Trade-offs

- **配額消耗**：健檢會對每個訂閱各花 1 單位 → 以手動觸發 + 按鈕旁成本提示緩解；與既有 `latest-dates` 同級，非新風險。
- **`channels.list` 仍無法 100% 區分「終止」與「私人化」** → `reason` 提供 `unknown` 作為兜底，`detail` 帶原始訊息供判讀；分類錯誤不影響退訂功能本身。
- **訂閱數多時健檢耗時**（數秒）→ 前端顯示進行中狀態,semaphore 控制並發避免打爆 API。
- **subscriptions.list 同步延遲**（既知問題）→ 剛退訂的頻道可能短暫仍出現在下次列表；不在本變更處理範圍，屬 YouTube API 行為。

## Migration Plan

純新增功能，無資料遷移。部署即生效；出問題移除設定頁區塊與端點即可回復，不影響既有流程。

## Open Questions

- 無。原因分類、觸發方式、退訂互動已於設計討論中確認。
