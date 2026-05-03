## Context
目前的下載路徑邏輯位於 `backend/main.py` 的 `start_download` API 路由中，直接使用 `settings["output_path"]` 作為 `yt-dlp` 的輸出目標目錄。

## Goals
- 在設定的目標資料夾內，自動建立當天的日期資料夾，格式為 `YYYYMMDD`（例如 `20241025`）。
- 確保目錄不存在時會自動被建立，不會發生 Path Not Found 錯誤。

## Technical Approach

### Backend (`backend/main.py`)
- 修改 `@app.post("/download")` 對應的 `start_download` 函式。
- 使用 Python 內建的 `datetime` 模組取得當前時間：`date_str = datetime.now().strftime("%Y%m%d")`。
- 使用 `os.path.join(output_path, date_str)` 組合出 `final_output_path`。
- 修改 `pathlib.Path` 的呼叫，改用 `final_output_path` 來確保資料夾建立 (`mkdir(parents=True, exist_ok=True)`)。
- 將 `final_output_path` 作為參數傳遞給背景的 `run_download` 任務。
