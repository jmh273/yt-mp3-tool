## 1. Backend — Cache 與 Profile 建構

- [x] 1.1 在 `backend/main.py` 新增 in-memory `discovery_cache: dict[str, dict]`，key 為 email
- [x] 1.2 實作 `_extract_channel_keywords(channel_resource)` 從 brandingSettings.keywords + snippet.title tokenize 並去除中英 stopwords
- [x] 1.3 實作 `_build_user_profile(creds, email)`：呼叫 subscriptions.list → channels.list batch → 計算 category 直方圖與 keyword top 8，存入 cache
- [x] 1.4 加入「沒有訂閱頻道」的 early return + 對應 HTTP 回應結構

## 2. Backend — 候選池建構（兩階段）

- [x] 2.1 實作 `_fast_phase_candidates(profile)`：依 top 6 categories 打 mostPopular，回 video list
- [x] 2.2 實作 `_full_phase_candidates(profile)`：依 top 8 keyword 組打 search.list?type=channel，取得候選 channel ids
- [x] 2.3 對候選 channel 批次抓 uploads playlist (channels.list contentDetails) → playlistItems.list 抓近期影片
- [x] 2.4 實作 `_filter_candidates(videos, profile)`：排除已訂閱頻道、排除已下載影片（複用/擴展 `_today_downloaded_stems` 變成全 output_path 掃描）
- [x] 2.5 實作 `_score_and_rank(videos, profile)`：套用排序公式，每頻道最多 2 部
- [x] 2.6 每個 API 呼叫使用對應 quota cost 呼叫 `consume_quota()`

## 3. Backend — Endpoints

- [x] 3.1 新增 `GET /discovery/similar-channels?phase=fast|full&cursor=<int>`，回傳 `{videos, cursor, profile_summary}`
- [x] 3.2 phase=fast 路徑：build profile (若 cache 沒有) + fast 候選池，回前 20 部
- [x] 3.3 phase=full 路徑：build profile (若 cache 沒有) + fast + full 候選池合併，回完整排序結果
- [x] 3.4 cursor 分頁：在 cache 內推進游標，未耗盡時不打 API
- [x] 3.5 cursor 耗盡時觸發 rebuild 並重置 cursor
- [x] 3.6 新增 `POST /discovery/subscribe` body `{channel_id}`，呼叫 `subscriptions.insert`，成功後更新 cache 訂閱集合 + 候選池過濾，回傳成功狀態
- [x] 3.7 失敗（403/404 等）回傳明確錯誤訊息給前端

## 4. Backend — 測試

- [x] 4.1 在 `backend/tests/test_discovery.py` 撰寫 `_extract_channel_keywords` unit test（中英混合、空 keywords fallback、stopwords 過濾）
- [x] 4.2 撰寫 `_score_and_rank` 排序公式 unit test
- [x] 4.3 撰寫 `_filter_candidates` test（已訂閱、已下載過濾）
- [x] 4.4 撰寫 endpoint integration test：mock youtube build，驗證 fast/full phase 行為、cursor 分頁、cache 命中
- [x] 4.5 撰寫多帳號 cache 隔離 test
- [x] 4.6 撰寫訂閱成功與失敗 test

## 5. Frontend — API client 與 store

- [x] 5.1 在 `frontend/src/api.ts` 新增 `fetchSimilarChannelDiscovery(phase, cursor?)` 與 `subscribeToChannel(channelId)`
- [x] 5.2 新增 `frontend/src/stores/discovery.ts` pinia store：state 含 videos[]、cursor、loadingPhase、profileSummary
- [x] 5.3 store 提供 `loadInitial()` (fast + full background)、`loadMore()` (cursor +20)、`subscribe(channelId)` actions

## 6. Frontend — UI

- [x] 6.1 新增 `frontend/src/views/SimilarChannelDiscoveryView.vue`
- [x] 6.2 在主 layout / 路由新增「🔍 同類新頻道」tab，與既有 tab 並列
- [x] 6.3 實作載入進度文案（"分析訂閱中…" → "找出興趣關鍵字…" → "挖掘相似頻道…"）
- [x] 6.4 卡片元件複用既有 video card，新增「★新頻道」badge 與「➕訂閱」按鈕
- [x] 6.5 訂閱動作觸發後：badge 變「已訂閱」、disable 按鈕、1.5 秒後 fade-out 卡片
- [x] 6.6 訂閱失敗時顯示 toast 並保留卡片
- [x] 6.7 「🔄 換一批」按鈕呼叫 `loadMore()`
- [x] 6.8 空狀態：使用者無訂閱頻道時顯示引導文字 + 連結到訂閱 tab
- [x] 6.9 既有勾選下載機制接入此 tab 的卡片

## 7. Frontend — 測試

- [x] 7.1 新增 `frontend/src/tests/SimilarChannelDiscoveryView.test.ts` component test（render、空狀態、訂閱互動、loadMore）
- [x] 7.2 mock api.ts 模擬 fast/full 兩階段回應，驗證 progressive render
- [x] 7.3 截圖 baseline 加入新 view

## 8. E2E walkthrough

- [x] 8.1 在 `frontend/e2e/` 新增 walkthrough 案例 `discovery-similar-channels.spec.ts`
- [x] 8.2 步驟覆蓋：切到 tab、等載入、檢視卡片、勾選下載、按訂閱、看 fade-out、換一批
- [x] 8.3 每步繁中操作敘述 + 截圖
- [x] 8.4 整合進 `npm run e2e` 主流程

## 9. 文件更新

- [x] 9.1 更新 `README.md` 使用流程章節，加入「同類新頻道」段落
- [x] 9.2 在 README 配額注意事項提到「同類新頻道首次切換成本約 800 units」

## 10. 收尾

- [x] 10.1 跑全測試 (`pytest backend/tests`、`npm test --prefix frontend`、`npm run e2e --prefix frontend`)
- [x] 10.2 跑 `frontend/e2e/verify-similar-channel-discovery.ts` (per memory feedback rule)
- [ ] 10.3 手動 smoke test：登入真實帳號，跑完整流程一次
- [x] 10.4 `openspec verify --change add-similar-channel-discovery`
- [x] 10.5 bump 版本到 v0.12.0，更新 `_version.txt`
