## Why

當頻道把同一支影片重新上架為「精華版」時，標題會多出 `【精華】` 前綴。目前「是否已下載」的比對是用 `_sanitize_filename(title)` 後的 stem 直接比對磁碟檔名 stem，`【精華】xxx` 會被清成 `精華_xxx`，無法與既有的 `xxx` 對上，導致同一支內容被誤判為「未下載」而重複出現／重複下載。

## What Changes

- 在「是否已下載」的比對中，先把標題（與磁碟 stem）開頭的 `【精華】` 標記正規化掉，再做 stem 比對。
- 比對為**對稱**處理：候選影片標題與磁碟既有檔名的 stem 兩側都套用同一個正規化，使 `【精華】xxx` 與 `xxx` 互相視為同一支。
- 只影響「比對 key」，**不影響**實際下載時的檔名（下載仍保留原始 `【精華】` 標題經 `_sanitize_filename` 的結果）。
- 涵蓋兩處既有比對：latest-videos-feed 的 `downloaded_today` 旗標、similar-channel-discovery 的已下載過濾。

## Capabilities

### New Capabilities
<!-- 無新增 capability -->

### Modified Capabilities
- `latest-videos-feed`: `downloaded_today` 比對在計算 stem 時 SHALL 先正規化掉開頭的 `【精華】` 標記（兩側皆套用）。
- `similar-channel-discovery`: 已下載過濾的 stem 比對 SHALL 套用同一個 `【精華】` 前綴正規化。

## Impact

- 後端 `backend/main.py`：
  - 新增共用 helper（例如 `_strip_highlight_prefix`），對 sanitized stem 去除開頭 `精華`（含括號清洗後殘留的分隔符）。
  - `_today_downloaded_stems()` / `_downloaded_stems_all()` 建立 set 時對每個 stem 套用正規化。
  - `downloaded_today` 計算（約 main.py:2057）與 discovery 過濾（約 main.py:1687-1688）對候選標題 stem 套用相同正規化後再比對。
- 不影響前端、API 形狀、下載命名、Drive 上傳比對（後者以原始檔名比對，維持不變）。
- 後端測試：新增針對 `【精華】` 正規化比對的單元測試。
