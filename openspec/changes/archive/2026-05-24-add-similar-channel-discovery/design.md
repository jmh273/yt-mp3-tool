## Context

YT-MP3 Tool 目前提供三條找影片的路徑：訂閱頻道最新影片、地區 trending、URL 貼網址。使用者反映想要「打破訂閱泡泡 _但留在同溫層內_」——亦即發現「跟我訂閱的同類但我還沒訂閱」的頻道。YouTube 官方 ML 推薦 feed (home page) 沒有公開 API，是已知限制。

可用訊號：
- `subscriptions.list?mine=true` → 訂閱頻道集合（authoritative interest signal）
- `channels.list?part=snippet,brandingSettings` → title / description / **keywords**（branding 欄位是 space-separated string）
- `videos.list?id=...&part=snippet` → categoryId（30 種固定 category，解析度粗）
- `videos.list?chart=mostPopular&videoCategoryId=...` → 該 category 熱門（1 unit/call，便宜）
- `search.list?type=channel&q=<keywords>` → 候選頻道（100 units/call，貴）
- `playlistItems.list` of channel's uploads playlist → 該頻道近期影片
- `subscriptions.insert` → 一鍵訂閱（50 units/call，含在現有 `youtube` scope）

每日配額 10000 units。多帳號（每個 email 一份 OAuth token）已實作於 [backend/main.py](backend/main.py)。

## Goals / Non-Goals

**Goals:**
- 提供「同類但未訂閱」頻道的近期影片發現體驗
- Tab 切換、卡片瀏覽、勾選下載與既有 trending/subscriptions 視覺一致
- 一鍵訂閱（呼叫 YouTube API）並即時反映於 UI
- Cache profile + 候選池於 backend process 記憶體中（per email），重啟即清空
- 首次切換 tab 雖慢（~10–30 秒）但 UI 不卡死（progressive loading）
- 配額消耗計入既有 daily counter，不獨立計算

**Non-Goals:**
- 不複製 YouTube 官方首頁 ML 推薦 feed（API 不開放）
- 不做跨 session 持久化 cache（重啟一定重算）
- 不做「不想再看到這個頻道」blacklist（v1 範圍外）
- 不分析觀看歷史（API 不開放，且這是音樂工具不是社群 app）
- 不走 yt-dlp + cookie 撈未公開資料

## Decisions

### 演算法分兩階段：「寬」mostPopular + 「精」search.list

- **寬 (mostPopular by category)**：每次 1 unit，可快速回填 UI，解析度只到 30 個 category
- **精 (search.list?type=channel&q=keywords)**：每次 100 units，可從訂閱頻道 brandingSettings.keywords + title 抽出的 keyword 組挖出相似頻道，解析度高
- **Why 兩階段而非單一？** 單純 mostPopular 不夠精準（lo-fi vs K-pop 都歸 Music），單純 search 配額太重且首次切 tab 太慢。兩階段允許 progressive UI：先用 mostPopular 在 1–2 秒內回卡片，search 結果在後續秒數陸續 merge。
- **Alternative considered**: 用 `topicDetails` (Freebase IDs)。否決——Freebase 2017 後棄用，覆蓋率不穩定，匹配邏輯也更脆弱。

### Cache 設計（修訂版）

兩層 cache：

```python
# 記憶體層（candidates + cursor，process lifetime）
discovery_cache: dict[str, DiscoveryCacheEntry] = {}
# email → {
#   profile: {...},
#   fast_candidates, full_candidates, merged: [...],
#   cursor, phase_done, built_at
# }

# 磁碟層（profile only，跨 process 持久化）
~/.yt-mp3-tool/discovery_profiles/{email}.json
# {subscribed_channel_ids, keywords, categories, lang, analyzed_at}
```

**讀取順序**: memory cache → disk cache → 重新 build（打 API）

- **Why 兩層？** 初版只有 memory cache，每次 backend 重啟就要重打 ~50–100 API 呼叫（per-channel playlistItems 是大頭），使用者實測「同類新頻道時間太久」。把昂貴的 profile 寫到磁碟，重啟只重撈候選（search.list ~800 units）而不重分析訂閱（subscriptions.list + 50× channels.list + 50× playlistItems）。
- **Why per-email keyed?** 多帳號切換 + 隱私
- **Why profile 永續但 candidates 不持久化？** profile 是「使用者是誰」的快照、變化慢；candidates 是「現在 trending / 搜尋結果」、時效性強，每次重啟重撈反而正確
- **重新分析觸發**: 使用者必須明確點「🔁 重新分析」按鈕（前端），對應 `?force_rebuild=true` query param。否則 profile sticky。
- **Cursor 耗盡的行為**: 不重新分析 profile，只重撈候選池（重打 fast + full phase），重置 cursor。比舊行為（每次耗盡都重新分析）節省 ~100 units。
- **Alternative considered**:
  - TTL → 否決，使用者無法精準掌控分析時機
  - 自動定期 rebuild → 否決，配額不可預測

### 訂閱動作：插入 cache 並立刻更新 UI badge

`POST /discovery/subscribe` 呼叫 `subscriptions.insert` 成功後：
1. 將該 channelId 加入 cache 的 `subscribed_channel_ids` set
2. 從 `candidate_videos` 移除該 channel 的所有影片（避免重複出現）
3. 前端 badge 顯示「已訂閱」1~2 秒淡出移除卡片
- **Why 不重新整個 build profile？** subscriptions.insert 成功後唯一變化是「集合多一個 element」，現有 candidates 已存在記憶體中，直接過濾即可，不需重打 API

### Progressive Loading：兩階段回應

`GET /discovery/similar-channels?phase=fast` → 只跑 mostPopular 分支，回前 N 部
`GET /discovery/similar-channels?phase=full` → 跑完整流程，回完整候選池

前端策略：
1. 切到 tab，呼叫 `phase=fast` → 1–2 秒內 render
2. 同時 fire `phase=full` 在背景，回來後 merge 進 list
3. cache 兩個 phase 結果

- **Alternative considered**: SSE streaming 一個 endpoint 串著回。否決——複雜度過高，且 SSE 已在 download progress 用了，再多一個 SSE 端點增加維護成本

### 已下載影片直接過濾

Backend 在 ranking 階段呼叫類似 `_today_downloaded_stems()` 的函式（擴展為全 output_path 掃描），把已存在磁碟的 video 過濾掉。
- **Why 過濾而非 badge？** 此 tab 目的是「發現新東西」，已下載 = 已知 = 違反目的
- **Edge case**: 使用者改了 output_path 導致誤判？v1 接受這個限制；長期可考慮把下載歷史寫入 sqlite

### Keyword 萃取策略

- 對每個訂閱頻道 `channels.list?part=snippet,brandingSettings` 取：
  - `snippet.title`（簡單 tokenize）
  - `brandingSettings.channel.keywords`（已是 space-separated）
- 合併、tokenize、去除 stopwords（中英）、按頻率排序
- 取 top 8 組，組合為 `search.list q=` 參數
- **Why top 8?** 8 × 100 units = 800，控制在每次 session 一次性消費的可接受範圍
- **Why 不用 description？** description 通常太雜（含 URL / hashtag / disclaimer），noise 高

### 排序公式（修訂版 — 修法 2）

```
score = (recency_weight × 1.0)
      + (view_velocity_weight × 0.3)
      + (keyword_hit_weight × 5.0)

recency_weight     = exp(-days_since_publish / 7)
view_velocity      = log10(views / max(hours_since_publish, 1) + 1) / 5
keyword_hit_weight = matched_keywords / total_query_keywords

matched_keywords 計算範圍：
  • video.title 子字串命中 keyword（lowercase）
  • video.channel_title 子字串命中 keyword（lowercase）
  • full-phase 影片的 `_matched_keyword` 欄位非空（額外 +1）
```

每頻道最多 2 部，保證 channel 多樣性。

**Why 修訂**: 初版權重 (velocity ×0.5、keyword ×1.5、title-only) 在實測中讓 mostPopular trending 影片
（百萬 view、velocity_norm 接近 1）把 keyword-match 的小眾候選擠到後面。例如使用者訂閱財經頻道
（關鍵字「投資 理財 股票 etf 台股 美股 財經 存股」），fast phase 從 category=25 News 拉 trending
是政治 / 八卦頭條，跟財經無關但 view 數爆表。修訂後：
- keyword 權重提升 1.5 → 5.0（一個 keyword hit 約等於 recency 全分）
- velocity 權重降 0.5 → 0.3（trending 不再主導）
- channel_title 進入比對範圍（垂直頻道常以主題命名，命中率比 title 高）

### 語言過濾

從訂閱頻道的 channel title 集合偵測使用者主要語言：

```python
def _detect_text_lang(text):
    cjk_chars = count(CJK_chars)
    latin_chars = count([A-Za-z])
    if cjk * 3 >= latin: return "cjk"
    if latin >= cjk * 3: return "latin"
    return "mixed"
```

Profile 儲存 `lang ∈ {"cjk", "latin", "mixed"}`。`_filter_candidates` 在 `lang ≠ "mixed"` 時，
要求候選影片的 title 或 channel_title 任一處語言與 profile 一致（或為 mixed）。

**Why 加語言過濾？** 使用者實測：搜尋「投資」會撈到 American finance YouTuber 講英文的影片，
語言不符使用者習慣（台灣財經圈）。語言過濾在 keyword 命中之後再過一層，提高訊號純度。

**Why 簡單 char count 而不用真正的語言偵測（如 langdetect）？** 增加依賴 + ML 模型；
頻道標題通常很短（5–20 字），統計穩定度更可靠的是 char class。trade-off：英文混 emoji
的中文頻道可能誤判，但這屬於 edge case。

### 相關性過濾（修法 2：嚴格）

`_filter_candidates` 在 profile.keywords 非空時，**要求每部候選影片必須與 keyword 相關**：
- video.title 或 video.channel_title 子字串命中至少 1 個 keyword，或
- 該影片來自 full phase 且 `_matched_keyword` 已設定

無 keyword（萃取失敗或無訂閱）時不施加此過濾，僅依其他訊號排序。

**Why 嚴格過濾**: 重排序權重雖然能把 keyword-match 排前，但無關候選仍會出現在後段
（例如「換一批」按到第 2-3 頁就是 trending 噪音）。在 keyword 是垂直訊號的情境下
（財經 / 遊戲 / 美妝），直接排除無相關候選比依賴排序更可靠。代價：候選池可能變小，
極端情況使用者看到較少結果——但每張卡都相關，比看 20 張 trending 但都不對胃口好。

## Risks / Trade-offs

- **[首次載入慢 10–30 秒]** → progressive loading：fast phase 1–2 秒內回。同時前端顯示「分析訂閱中...找到 N 個興趣關鍵字...」的步驟提示
- **[search.list 配額重 (800 units/session)]** → cache 整個 session 攤平；後續換一批 0 units；一天可承受約 10 次完整 rebuild，正常使用足夠
- **[categoryId 解析度只有 30 種]** → 用 brandingSettings.keywords + title 補精度
- **[brandingSettings.keywords 可能為空]** → fallback 用 snippet.title tokenize；最差情況 degrade 成「只用 categoryId」也仍可用
- **[訂閱無訂閱頻道的使用者]** → 顯示空狀態提示「需先訂閱頻道才能使用」並引導到既有訂閱 UI
- **[YouTube API 拒絕 subscriptions.insert（例如該頻道關閉訂閱）]** → API 回 403，前端顯示錯誤 toast 不淡出卡片
- **[已下載過濾誤判]** → output_path 改變後可能誤判；接受此 v1 限制
- **[多帳號 cache 記憶體成長]** → 每個 email entry 數 KB；100 個帳號 ≈ 數百 KB，可接受
- **[search.list 結果可能含 NSFW]** → 沿用既有 trending 的處理方式（不額外過濾，使用者自負）

## Migration Plan

無遷移成本：
- 純新增功能，不修改既有 endpoint / spec
- 不需要重新 OAuth 授權（既有 scope 已涵蓋）
- 後端重啟即可
- 前端 hot-reload 即可

Rollback：移除新 tab + 新 endpoints + cache dict，無 schema 變更需要 revert。

## Open Questions

- 首次切 tab 顯示 step-by-step 進度文案（「分析訂閱…」「挖掘相似頻道…」），還是純 spinner？傾向 step-by-step（更有控制感），但實作時看狀況。
- 是否在 backend 設一個全域上限「每天最多 N 次 full rebuild」防誤觸爆 quota？傾向 v1 不設，依賴既有 quota counter，超過再說。
