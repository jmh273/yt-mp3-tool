## Context

目前下載流程固定走 `bestaudio` + `FFmpegExtractAudio` → mp3 192kbps。前端 `SelectedVideos` 只有「下載選取影片」按鈕，後端 `DownloadRequest` 僅接受 `videos` 陣列。要加入「格式 + 品質」需貫穿 UI、API 模型、yt-dlp 設定三層，且必須保持向後相容（缺欄位回退為現有行為）。

## Goals

- UI 易用：下拉選單緊鄰下載按鈕，雙下拉聯動（格式變動觸發品質重置）
- 後端集中：`run_download()` 依格式分派一份完整的 `ydl_opts`，不靠多重 if 散落各處
- 相容：後端 fallback `mp3 / 192`，舊版前端或外部呼叫不會壞
- 不引入第三方相依：yt-dlp 已支援所需 format selector 與後處理器

## Technical Approach

### Frontend

#### `SelectedVideos.vue`
- 新增 `<select>` 兩個：`format`（`mp3` | `mp4`）與 `quality`（依 format 切換選項）
- `format` 預設 `'mp3'`，`quality` 預設 `192`
- `watch(format)`：切換時把 `quality` 重設為 `FORMAT_DEFAULTS[format]`
- 將 `format` 與 `quality` 透過 `download.startDownload(format, quality)` 傳入 store
- 「下載中」期間禁用兩個下拉

選項常數（component 內）：

```ts
const QUALITY_OPTIONS = {
  mp3: [128, 192, 256, 320],
  mp4: [360, 480, 720, 1080],
} as const
const FORMAT_DEFAULTS = { mp3: 192, mp4: 720 } as const
```

#### `stores/download.ts`
- `startDownload()` 簽章變為 `startDownload(format: 'mp3' | 'mp4' = 'mp3', quality: number = 192)`
- payload 改為 `{ videos, format, quality }`
- 既有測試會驗證 payload 攜帶這兩欄

### Backend

#### `DownloadRequest`
```python
class DownloadRequest(BaseModel):
    videos: list[dict]
    format: str = "mp3"      # "mp3" | "mp4"
    quality: int = 192        # mp3: kbps; mp4: p
```

#### `run_download()` 簽章
新增 `format` / `quality` 兩個參數（皆有預設值），由 `start_download` endpoint 從 `DownloadRequest` 傳入。

#### `ydl_opts` 組裝
抽出小函式，依格式分支：

```python
def _build_ydl_opts(output_path, safe_title, hook, fmt, quality):
    base = {
        "outtmpl": os.path.join(output_path, f"{safe_title}.%(ext)s"),
        "progress_hooks": [hook],
        "quiet": True,
        "no_warnings": True,
    }
    if fmt == "mp4":
        return {
            **base,
            "format": (
                f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/"
                f"best[height<={quality}][ext=mp4]/best"
            ),
            "merge_output_format": "mp4",
        }
    # mp3 fallback (預設)
    return {
        **base,
        "format": "bestaudio/best",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": str(quality),
        }],
    }
```

驗證：未知 `format` 一律走 mp3 分支（保險，不丟例外）；`quality` 不在白名單時仍傳給 yt-dlp，由 yt-dlp 自行處理（不過度防禦）。

### Validation

後端在 `start_download` 入口做輕度驗證：
- `format` ∈ {`mp3`, `mp4`}，否則 fallback `mp3`
- `quality` 為正整數，且：
  - mp3 容許 {128, 192, 256, 320}
  - mp4 容許 {360, 480, 720, 1080}
  - 不在白名單時 fallback 至該格式預設值

不丟 422 — 對使用者體驗來說，無聲修正比擋下載友善。

### 進度顯示

`progress_hooks` 行為不變（`downloading` / `finished` 兩種狀態）。`status: "converting"` 在 mp4 路徑沒有 audio extraction，但 yt-dlp 仍可能發 `finished` → 我們的 hook 設為 `converting` 再進入 `done`，雖然實際只是 mux 不是轉檔，UI 顯示「轉換中」短時間後 → 「完成」仍合理，不另外處理。

## Tradeoffs

- **格式狀態放 component vs store**：選擇放 component，因為這是「下載批次的一次性偏好」，不需跨頁面持久化；下次重開預設 mp3/192 即可
- **品質白名單 vs 自由輸入**：白名單，避免使用者選到 yt-dlp 取不到的奇怪解析度
- **mp4 解析度語意是「上限」而非「精確值」**：用 `height<=<quality>`，若該影片沒有對應解析度，yt-dlp 會自動降階到較低可用解析度。優點是不會下載失敗；缺點是使用者實際拿到的可能比選項低

## Out of Scope

- 將格式 / 品質持久化到 settings.json
- 影片格式（mkv / webm）
- 音訊格式（m4a / opus）
- 字幕下載
- 每支影片獨立指定格式 / 品質
