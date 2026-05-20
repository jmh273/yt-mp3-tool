## Context

🔥 發燒影片頁目前以 `videos.list?chart=mostPopular&regionCode=TW&maxResults=50` 取得 TW 綜合熱門榜。內容偏娛樂/綜藝，垂直題材（音樂、遊戲、新聞、運動等）的好頻道難以浮現。

YouTube Data API 對 `chart=mostPopular` 支援 `videoCategoryId` 參數，且**只對部分分類**回傳結果——這些是 YouTube 自家「發燒影片」頁面背後預先算好的榜單（音樂/遊戲/娛樂/新聞/運動/電影/喜劇 等），quota 成本與不帶分類相同（1/頁）。其它分類（教育、科技、教學、Vlog 等）YouTube 並未預算榜單，要透過 `search.list` 自己即時排序，成本 100 quota/頁。

Explore 階段已決定先做**第一類（chart 支援的分類）**，第二類列為 follow-up。

## Goals / Non-Goals

**Goals:**
- 使用者能以單擊 chip 在 7 個垂直題材（外加「全部」）之間切換 TW 發燒榜
- 每次切換或翻頁仍維持 1 quota 的成本曲線
- 對既有 `/trending-videos` 呼叫者完全向後相容——不帶 `category` 就是今天的行為
- 後端集中持有分類清單（id + 中文 label），日後加分類不必改前端

**Non-Goals:**
- 長尾分類（教育/科技/教學/Vlog 等）的 `search.list` fallback
- 跨地區（regionCode）切換 UI
- 結果快取
- 分類選擇跨 view 持久化（切走再回來會回到「全部」）
- 從卡片直接訂閱頻道

## Decisions

### D1：分類由後端寫死於常數，並透過 endpoint 暴露
新增 `GET /trending-videos/categories`，回傳 `[{id, label}]`。`id` 為字串型態的 YouTube `videoCategoryId`（特殊值 `null` 代表「全部」、不傳 `videoCategoryId`），`label` 是面向使用者的中文標籤（含 emoji）。

**為什麼不直接寫在前端 constants？**
- 「哪個分類 chart 支援」是後端針對 YouTube 行為的判斷，不是前端決策
- 未來想加 region 切換或 follow-up 的長尾分類，後端是該知識的單一來源
- endpoint 沒有額外 quota（純常數）

**為什麼不呼叫 YouTube `videoCategories.list`？**
- 回的是英文 `title`，仍需自己做中文映射
- 它包含 `assignable=false` 與 chart 不支援的分類，得自己過濾
- 多一個外部 API call 沒有換來資訊增益

### D2：MVP 只走 chart 路線
僅當 `videoCategoryId` 落在「chart 已知支援」的白名單時才接受該 query 參數。其它 id 一律拒絕（HTTP 400）以免使用者意外打到空回應或誤導性結果。

**初始白名單（待上線後實測微調）：**
- `10` 音樂、`20` 遊戲、`24` 娛樂、`25` 新聞、`17` 運動、`1` 電影、`23` 喜劇

`23`（喜劇）在 TW region 偶有空回應的觀察記錄，先納入首發；若上線後普遍 empty 再另起 change 移除。

### D3：chip 切換 = 重置列表 + 重置 `next_page_token`
不採「append 新分類到既有列表」這種做法——使用者切 chip 的意圖明顯是「換成另一群影片」，混在一起反而干擾。每次切換等同於初始 fetch，視覺一致。

### D4：load-more 必須沿用當前分類
前端在發 `/trending-videos?page_token=...` 時必須附帶當前選中的 `category`（若有）。後端不在 `nextPageToken` 內保留 category 狀態——YouTube 的 `nextPageToken` 已是不透明字串，加自家 sidecar state 反而複雜。前端為 source of truth。

### D5：選擇不在前端跨 view 持久化
切走再回來重設為「全部」。理由：
- 發燒影片頁的語意是「現在 TW 最熱的」，跨 session 記住分類過度個人化
- 真的要記住，本來就該升級成設定項（屬於另一範圍的功能）
- 第一版盡量輕

如果上線後使用者反映想要記住，再開 follow-up change 加上 localStorage 持久化。

### D6：分類驗證錯誤回 400 而非靜默回退
無效 `category` → HTTP 400 + 錯誤 message，不靜默退回到「全部」。原因：靜默退回會讓前端不知道使用者實際看到的是哪份內容；明確 400 讓問題即時浮現。前端正常流程下不會打到這個錯誤（chip 是後端清單生成的）。

## Risks / Trade-offs

- **[Risk] 喜劇分類在 TW 可能多數時段 empty** → Mitigation：MVP 上線後實測一週，若大多 empty 開 follow-up 將其移出白名單；前端對 empty 已有「目前沒有發燒影片」訊息可重用。
- **[Risk] YouTube 未來變動 chart 支援的分類集合** → Mitigation：白名單在後端常數，調整門檻低；若使用者回報某分類長期 empty，可手動驗證並調整。
- **[Trade-off] 不快取 = 切 chip 來回會重複耗 quota**。MVP 一次切換 1 quota，假設使用者一輪切 7 個分類也只 7 quota，相對 10,000 daily 預算可忽略。若 telemetry 顯示頻繁切換，再加 TTL 快取。
- **[Trade-off] 前端不持久化分類選擇**。Reload 或切走再回來會回到「全部」。換來實作極簡與「發燒影片 = 當下最熱」的單純語意。
- **[Risk] backend 白名單與前端 chip 清單可能漂移**（例如後端加了新分類但前端沒重新 fetch）→ Mitigation：前端進入 trending view 時必拉 `/trending-videos/categories`，不寫死 chip 清單。
