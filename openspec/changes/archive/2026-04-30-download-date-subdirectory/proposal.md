## Why
目前所有的 MP3 檔案都會直接下載到使用者設定的同一個資料夾中。若長時間使用，根目錄會積累過多檔案，變得難以整理。因此希望能在根目錄底下，自動依照「下載當天的日期」建立子資料夾（例如：20260430）來自動分類存檔。

## What Changes
- 修改後端下載 API 路由 (`/download`)。
- 在取得設定的 `output_path` 之後，自動獲取當下系統時間，並格式化為 `YYYYMMDD` 的字串。
- 將最終的儲存路徑修改為 `output_path / YYYYMMDD`，並在下載前確保該子資料夾已被建立。

## Capabilities
- `download-path-formatter`: 自動建立日期子資料夾功能
