## Context

下載落地路徑：`output_path/YYYYMMDD/` 是當下執行 download 時用本機時間建立的子目錄（`backend/main.py:1240` 的 `datetime.now().strftime("%Y%m%d")`）。檔名格式為 `{seq_prefix}{sanitized_title}.{ext}`，其中 `seq_prefix` 是「`{n:02d}_`」式序號（`_format_seq`），而 `sanitized_title` 由 `_sanitize_filename(title)` 產生（含 Windows ANSI codepage 過濾，會丟掉系統碼頁無法表示的 CJK 字元，邏輯非平凡）。

關鍵限制：**檔名不含 `video_id`**，要比對「這支影片是否已下載」，只能用「sanitized title」當鍵。Sanitizer 帶 codepage 依賴，把它複製到 JS 不切實際；因此**比對應由後端完成**。

前端目前用 `download.isDownloaded(video_id)` 控制 checkbox disabled，這個來源是 `localStorage.yt_mp3_downloaded_ids` 的 in-memory `Set`。它在「同 session 剛下載完」很可靠，但清快取或換瀏覽器 profile 後會失憶。**單機 app 不考慮跨裝置同步**——同一台機器上的「今日資料夾實際內容」才是 ground truth。

此外，使用者仍會有「故意要重新下載」的需求（例如音檔損壞、改變格式重抓），所以單純全面 disable 不可行，需要一個明確的覆寫機制。

## Goals / Non-Goals

**Goals:**
- 「最新影片」面板能根據今日下載資料夾的實際檔案，正確顯示影片為已下載（checkbox disabled + 徽章）。
- 提供「允許再次下載」開關，讓使用者在明確意圖下能覆寫 disabled。
- 比對邏輯集中在後端、重用既有 `_sanitize_filename`，不增加 JS 端的邏輯重複。
- 對 `/latest-videos` 既有呼叫端（包含此前 inline-filter 變更）零破壞：新欄位是可選的擴充。

**Non-Goals:**
- 不處理跨裝置同步（單機 app）。
- 不修改下載流程、檔名規則、日期子目錄規則。
- 不掃描歷史日期資料夾；只看今日（與使用者用語「當日預設下載目錄」一致）。
- 不對 `/subscriptions/{channel_id}/videos`、`/trending-videos`、`/search-videos` 套用此檢查。
- 不嘗試以模糊比對解決使用者把影片標題改動的邊角情境；命中率以「sanitized title 完全相等」為準。
- 「允許再次下載」開關不持久化到 settings；每次重新進入 latest-feed 都回到 OFF。

## Decisions

### Decision 1：在 `/latest-videos` 回應中內嵌 `downloaded_today` 欄位
- 選擇：每筆 video 物件多一個 boolean `downloaded_today`。後端在組裝回應前，計算一次今日資料夾的 stem 集合，逐筆查表。
- 替代方案：(a) 新增獨立端點 `GET /downloads/today`，前端再做比對；(b) `POST /downloads/check` 接受影片清單回傳已下載 id。
- 理由：(a) 把 sanitizer 推到前端、會雙寫；(b) 多一輪 round trip 與 race（前端要先有影片清單才能 query）。內嵌一欄最簡單、最一致。

### Decision 2：以「`_sanitize_filename(title)` 完全相等」為命中規則
- 選擇：把今日資料夾下每個檔案的 `stem`（去掉 ext 與 `^\d+_` 序號前綴）放進 set；對每個影片計算 `_sanitize_filename(video.title)`，集合查詢。
- 替代方案：以 `video_id` 為鍵（需要改下載端的檔名規則）；或把標題寫進檔案 metadata（需要 ffmpeg post-process）。
- 理由：零侵入、不改下載落地；title 重碼造成的假陽性是低機率邊角，可接受。新規則（v0.9.0 起）的序號前綴用 `^\d+_` 精確匹配後切掉，不會誤吃 title 開頭的數字。

### Decision 3：今日資料夾每次請求掃描一次（不快取）
- 選擇：在 `/latest-videos` 處理流程中呼叫一個小函式 `_today_downloaded_stems()`，回傳 `set[str]`。
- 替代方案：用 mtime / 全域變數快取。
- 理由：典型今日資料夾不會超過數百檔，`os.scandir` < 10 ms；不快取避免下載完成後 stale 問題。

### Decision 4：日期使用 local time（與 `start_download` 一致）
- 選擇：`datetime.now().strftime("%Y%m%d")`，與下載端建立資料夾的方式相同。
- 替代方案：UTC 或 PT。
- 理由：必須與下載端用同一個「今天」否則必然錯位；下載端已是 local，沿用。

### Decision 5：前端 disabled 判斷採聯集
- 選擇：`:disabled="(download.isDownloaded(v.video_id) || v.downloaded_today) && !allowRedownload"`，徽章顯示條件為 `download.isDownloaded(v.video_id) || v.downloaded_today`（與開關無關，永遠提示）。
- 替代方案：完全捨棄 localStorage 改靠後端旗標。
- 理由：localStorage 在「剛下載完，畫面未重新 fetch」的瞬間更即時（SSE 結束就 mark）；保留可避免閃爍。後端旗標補強跨啟動。徽章與 disabled 解耦：開關打開時 disabled 解除但仍顯示徽章，避免使用者下載完才發現是重覆檔。

### Decision 6：以 filter-bar 上的 toggle 提供再下載逃生口
- 選擇：在 latest-feed 篩選列加入一個 `allowRedownload` 開關（checkbox 或小型 toggle），預設 OFF；ON 時所有 `downloaded_today` / `download.isDownloaded` 為真的 checkbox 解除 disabled，使用者可主動勾選；後端對 `/download` 流程不做任何擋下重覆下載的檢查（一直都沒有）。
- 替代方案：(a) 取消 disable 改用視覺淡化；(b) 點 disabled checkbox 跳 confirm 對話框。
- 理由：(a) 太被動易誤觸；(b) 操作多一步且 modal 在 SPA 嵌入面板不夠輕量。Toggle 把「我清楚知道要再抓」的意圖明確化、操作集中、視覺一致。

### Decision 7：開關狀態組件級且不持久化
- 選擇：`allowRedownload` 以 `ref<boolean>` 存在 `LatestVideosFeed.vue`，預設 `false`；切換面板（unmount）即重設。不寫入 settings、不寫入 localStorage。
- 替代方案：寫入 settings 或 localStorage。
- 理由：與既有 inline filter 的「per-view, non-persisted」哲學一致；持久化反而會讓「下次開啟卻發現所有重覆下載沒被擋下」變成意外。

## Risks / Trade-offs

- [Sanitizer 在不同 codepage 下對同一 title 產生不同結果] → 後端永遠用「本機 codepage」算兩邊（下載時、查詢時都在同個機器），所以下載端與檢測端必然一致；不會跨機器同步，這也符合「本機 app」的部署假設。
- [Title 中含獨特字元而檔名其實被改過] → 命中率<100%；不致命，使用者最多多按一次。可在 v2 增強，比方說在下載時同時寫入 sidecar 檔記錄 video_id。
- [今日資料夾不存在] → `_today_downloaded_stems()` 回傳空集合，所有 `downloaded_today=false`。
- [掃描資料夾的 I/O 阻塞 async handler] → 用 `os.scandir` 已是 C-level、毫秒級；若資料夾規模成長到萬量級可再放到 `run_in_executor`。
- [`.part` 半下載檔被誤判為「已下載」] → 過濾條件：忽略 `.part` 結尾、忽略副檔名為空者。

## Migration Plan

- 後端：純擴充欄位；既有呼叫端忽略未知欄位。無資料遷移。
- 前端：模板綁定條件擴充；舊回應（無 `downloaded_today`）會被當成 `undefined → false`，行為與舊版一致，因此可獨立部署。
- 回退：移除模板裡新增的 `|| v.downloaded_today`，後端可留下欄位無害。
