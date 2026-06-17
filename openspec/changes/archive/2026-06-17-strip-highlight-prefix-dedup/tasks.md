## 1. 共用正規化 helper

- [x] 1.1 在 `backend/main.py` 新增 `_strip_highlight_prefix(stem: str) -> str`，以 `re.compile(r"^精華[ _]?")` + `count=1` 移除 sanitized stem 開頭由 `【精華】` 清洗而來的 `精華` 標記（含後隨分隔符），中間出現的 `精華` 不動。

## 2. 套用於已下載比對（兩側對稱）

- [x] 2.1 `_today_downloaded_stems()`（約 main.py:2249）：建立 stem set 時對每個 stem 套 `_strip_highlight_prefix`。
- [x] 2.2 `downloaded_today` 計算（約 main.py:2057）：候選 key 改為 `_strip_highlight_prefix(_sanitize_filename(v.get("title", "")))` 後再做 `in` 比對。
- [x] 2.3 `_downloaded_stems_all()`（約 main.py:1233）：建立 stem set 時對每個 stem 套 `_strip_highlight_prefix`。
- [x] 2.4 discovery 過濾（約 main.py:1687-1688）：候選 `title_stem` 改為 `_strip_highlight_prefix(_sanitize_filename(...))` 後再比對 `downloaded` set。

## 3. 測試

- [x] 3.1 在 `backend/tests/test_latest_videos.py` 補測：`【精華】My Talk` 對上磁碟 `My Talk.mp3` → `downloaded_today: true`；反向（標題 `My Talk` 對上磁碟 `精華_My Talk.mp3`）亦為 `true`。
- [x] 3.2 補測：標題中間含 `精華`（如 `年度精華回顧`）在無對應檔案時仍為 `downloaded_today: false`（不被誤判）。
- [x] 3.3 在 `backend/tests/test_discovery.py` 補測：`【精華】某某訪談` 候選在磁碟已有 `某某訪談` stem 時被過濾移除。
- [x] 3.4 執行 `backend` 測試（pytest）確認全綠。

## 4. 驗證

- [x] 4.1 撰寫並執行 `frontend/e2e/verify-strip-highlight-prefix-dedup.ts`：以含 `【精華】` 的影片驗證 latest-videos-feed 正確顯示「✅ 已下載」徽章。
