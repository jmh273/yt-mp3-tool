## Context

「同類新頻道」pipeline 現況（`backend/main.py`）：

- profile 依 email 持久化到 `~/.yt-mp3-tool/discovery_profiles/{email}.json`（含 `keywords`/`lang`/`categories`/`subscribed_channel_ids`），跨重啟保留。
- 單一常數 `_DISCOVERY_KEYWORD_TOP_N = 8` 同時驅動三處：① profile 保留幾個關鍵字（`keyword_counter.most_common(8)`）② full phase 每個關鍵字打一次 `search.list`（100 units/次）③ `_filter_candidates` 相關性（命中任一 keyword 即保留）與 `_score_and_rank` 加分。
- 排序 `recency × view_velocity × keyword_hit`，僅有「每頻道最多 2 部」(`_DISCOVERY_MAX_PER_CHANNEL`) 的多樣性約束，無 per-category 約束。
- 前端 `useDiscoveryStore` 是單一全域 Pinia store，`handleSwitch`（`HomeView.vue`）切帳號時不 reset 它。

兩個使用者帳號：A 專注理財/AI（單峰，category 直方圖集中）、B 興趣廣泛（多峰，直方圖攤平）。B 對此分頁的期望是 **b1 跨興趣 serendipity**（百花齊放），不是 drill-down。

關鍵觀察：top-N 用全域詞頻排，天生偏袒訂閱數最多的群；對 B 而言調大 N 只是「主群挖更深」而非「更廣」。問題是**選詞結構**，不是數量大小。

## Goals / Non-Goals

**Goals:**
- 切帳號後前端只顯示**當前帳號**的關鍵字與卡片；重用磁碟 profile，不重新分析。
- 關鍵字數量 N 可 per-account 設定，預設維持 8（不改既有行為）。
- 多峰帳號的選詞跨 category 均勻覆蓋，feed 呈現跨興趣 serendipity；單峰帳號零行為變化。
- 可見頁面不被單一熱門類別洗版。

**Non-Goals:**
- 不做 topic-lane 分區呈現 UI（C 方案）——使用者選 b1，feed 維持單一混合列表。
- 不讓使用者手動編輯關鍵字字串（只調數量）。
- 不持久化候選卡片池（卡片仍每次重撈最新；只還原 profile 層）。
- 不改「換一批」語意（仍不重新分析 profile）。

## Decisions

### 1. 切帳號：前端 reset + 後端磁碟 profile 負責「不重新分析」
切帳號 (`handleSwitch`) 呼叫 `discovery.reset()`，再進分頁 guard 觸發 `loadInitial(force_rebuild=false)`。後端 in-memory cache miss → 讀磁碟 profile → 不打 `subscriptions.list`/`channels.list`，只重撈候選。關鍵字 chips 由 `profile_summary` 還原。
- **替代方案**：前端 per-email 暫存整份 store（含卡片）。捨棄——使用者選「卡片重撈」，且候選會過時；reset 最小、最不會出錯。
- 可選體感優化（不納入本次必做）：前端 per-email 暫存 `profileSummary`，切回時 chips 先秒顯示、卡片背景補。

### 2. N 改 per-account 設定，預設 8
新增設定鍵 `discovery_keyword_top_n`（預設 8），由 `load_settings()` 讀取。`_DISCOVERY_KEYWORD_TOP_N` 改為「預設值常數」，實際取值在 build profile 時讀設定。三處（profile 截斷、search 次數、filter/rank）用同一個解析後的值。
- **生效時機**：N 只在 `force_rebuild=true`（🔁 重新分析）重建 profile 時套用——因為磁碟 profile.keywords 已被舊 N 截斷，調大必須重分析才補得回來。一般進頁/換一批讀既有 profile，不受新 N 影響。
- **替代方案**：拆成 `SEARCH_TOP_N` / `FILTER_TOP_N` 兩個常數。捨棄——使用者明確要「維持單一參數」。耦合（廣度 vs 精度）為刻意接受的取捨，於 UI 文案說明。

### 3. 選詞：category-spread 取代純全域詞頻
原本 `keyword_counter.most_common(N)`。改為：保留「每個關鍵字屬於哪個 category 群」的歸屬，再以 round-robin 跨 category 取詞，直到湊滿 N 個或詞用盡。
- 單峰帳號只有 1~2 個 category → round-robin 退化為扁平 top-N（行為等同現狀）。
- 多峰帳號 → 每個興趣群至少派代表，長尾興趣得以進榜。
- **歸屬來源**：keyword 由訂閱頻道 metadata 萃取，每個訂閱頻道有其主 category（取自該頻道近期影片 categoryId，已用於建直方圖）；keyword → 來源頻道 → category。實作時在 build profile 迴圈記錄 `keyword -> category` 對應（取該詞最常出現的 category）。
- **替代方案**：keyword 共現圖分群。捨棄——過重，category 直方圖已是現成且足夠的群訊號。

### 4. 組頁：per-category 多樣性閘門
在候選排序後、切頁前，加入每 category 的取樣／上限（例如同一 category 在一頁內最多 K 部，或跨 category round-robin 抽取），保留既有「每頻道最多 2 部」。
- 單峰帳號候選幾乎同一 category → 閘門幾乎 no-op（上限設得寬鬆即可，不致清空）。
- 多峰帳號 → 可見頁面跨類別輪替，避免高 velocity 的熱門類別（如 Gaming）洗版。
- 上限 K 取保守值（避免單峰帳號被誤砍）；候選不足時不強制補滿。

## Risks / Trade-offs

- **[N 調大 → 配額暴增]** 每多 1 個關鍵字 = 多一次 `search.list`（100 units），日上限 10000。→ 由 per-account 設定承擔，UI 文案明示「每多 1 個關鍵字約多 100 配額」；既有 `consume_quota` 超限保護不變。
- **[N 調大 → OR 過濾變鬆]** 關鍵字多 → filter 命中門檻鬆 → 離題卡片變多。→ b1 可接受較高多樣性；category-spread 讓多出來的詞分散在各興趣而非單群噪音。
- **[category-spread 誤傷單峰帳號]** 若 round-robin 實作不當可能改變單峰帳號結果。→ 1~2 個 category 時必須與 `most_common(N)` 等價；以測試鎖定。
- **[keyword→category 歸屬不準]** 一個詞可能跨多 category。→ 取該詞最高頻 category 作代表即可，非精確分類，誤差對 serendipity 影響小。
- **[per-category 閘門清空單峰 feed]** 上限設太嚴會砍掉單峰帳號大量同類候選。→ K 取寬鬆、候選不足不補；測試覆蓋單峰不被縮減。
- **[舊磁碟 profile 沒有 keyword→category 對應]** 既有磁碟 profile 只存截斷後 keywords。→ 新欄位缺失時 fallback 為扁平行為；下次 force_rebuild 後補齊。
