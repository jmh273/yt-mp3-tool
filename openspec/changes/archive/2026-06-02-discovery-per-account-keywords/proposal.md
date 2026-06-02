## Why

「同類新頻道」目前用單一全域常數 `_DISCOVERY_KEYWORD_TOP_N = 8` 控制關鍵字，而前端 discovery store 是單一全域物件、切帳號時不會清空。這對兩種帳號形狀同時造成問題：

- **切帳號帶錯資料**：帳號 A 看過後切到帳號 B，再進分頁會沿用 A 的卡片與關鍵字（前端 store 沒依帳號隔離）。
- **多峰帳號得不到變化**：興趣廣泛（多峰）的帳號，top-8 用全域詞頻挑，會被訂閱數最多的那群洗版，小眾興趣擠不進 top-8，feed 缺乏「跨興趣驚喜」。單純調大 N 只會把主群挖更深，不會更廣。

後端其實已把 profile（含 keywords/lang）依 email 持久化到磁碟，所以「不重新分析、關鍵字還原」的能力已具備，缺的是前端正確重用，以及讓關鍵字數量可調 + 選詞策略對多峰帳號公平。

## What Changes

- 切帳號時前端 `discovery` store **MUST reset**，再進分頁重新走 `loadInitial`（`force_rebuild=false`）：重用後端磁碟 profile，**不重新分析訂閱**，關鍵字 chips 還原、候選卡片重撈最新。前端 store **MUST NOT** 沿用前一帳號的 videos/profileSummary/cursor。
- 關鍵字數量 `N` 從寫死常數改為 **per-account 可設定**（預設 8），存於該帳號設定。
- 選詞策略從「純全域詞頻 top-N」改為 **category-spread**：依 category 直方圖跨類別輪流取，確保多峰帳號每個興趣群都有關鍵字代表；單峰帳號（1~2 個 category）退化為等同現狀的扁平結果。
- 候選池組頁時新增 **per-category 多樣性閘門**（每類別取樣／上限），避免單一熱門類別在可見頁面洗版。現有「每頻道最多 2 部」維持不變。
- 上述 N、選詞與多樣性變更**只在「🔁 重新分析」(`force_rebuild=true`) 依新參數重建 profile + 重撈候選時生效**；「換一批」與一般進頁不重新分析。

## Capabilities

### New Capabilities
<!-- 無新增 capability，沿用既有 similar-channel-discovery -->

### Modified Capabilities
- `similar-channel-discovery`: 修改「使用者興趣 Profile 建構」（keyword 數量可設定 + category-spread 選詞）、「候選排序與頻道多樣性」（新增 per-category 多樣性閘門），並補強「切換帳號隔離」場景（前端 store 不得沿用前一帳號狀態、重用磁碟 profile 不重新分析）。

## Impact

- **後端** `backend/main.py`：`_DISCOVERY_KEYWORD_TOP_N` 改讀 per-account 設定；`_build_profile`/keyword 選取改 category-spread；`_full_phase_candidates`、`_filter_candidates`、`_score_and_rank` 使用設定值；候選組頁加 per-category 多樣性。
- **設定** `load_settings`/`save_settings`：新增 `discovery_keyword_top_n`（每帳號）。
- **前端** `frontend/src/views/HomeView.vue`（`handleSwitch` 切帳號時 reset discovery store）、`frontend/src/stores/discovery.ts`（reset 行為）、`frontend/src/components/SimilarChannelDiscoveryFeed.vue`（關鍵字數量設定入口、重新分析說明文案）。
- **配額**：N 變大會線性增加 `search.list`（每關鍵字 100 units），由 per-account 設定承擔。
- **測試** `backend/tests/test_discovery.py`：新增 category-spread 選詞、per-category 多樣性、設定值讀取與 force_rebuild 套用新 N 的測試。
