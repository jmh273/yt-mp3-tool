## Context

這是一個一行 bug fix——把 `_sync_url_preview_yt_dlp` 給 yt-dlp 的 `extract_flat` 旗標從 `True` 改成 `"in_playlist"`。沒有跨模組、沒有新依賴、沒有 API 介面變更、沒有資料遷移。詳細問題分析與證據實測已寫在 [proposal.md](./proposal.md)。

## Goals / Non-Goals

**Goals:**
- watch+list 混合網址（`watch?v=X&list=Y`）能正確展開為整份 playlist。
- 純單一影片 URL 與純 playlist URL 行為不變。

**Non-Goals:**
- 不變更 `extract_flat` 之外的任何 yt-dlp opts；不改變回傳的 `VideoItem` 結構；不更動前端、API、或下載流程。

## Decisions

### D1：用 `extract_flat="in_playlist"` 而非完整 (`extract_flat=False`) 或 `False`
- **選擇**：`extract_flat="in_playlist"`。
- **替代方案 A**：拿掉 `extract_flat`，讓 yt-dlp 完整解析每支影片。能拿到更多 metadata，但每支影片要打一次 API，205 集的清單會慢到不可接受（數十秒以上）。
- **替代方案 B**：偵測 URL 含 `list=` 時手動把 `v=` 截掉再丟給 yt-dlp。能繞過 yt-dlp 的 stub 行為，但要自己維護 URL 解析；不如直接用 yt-dlp 內建的 `'in_playlist'` 模式乾淨。
- **理由**：`"in_playlist"` 是 yt-dlp 為了這個情境提供的正解——「在 playlist 邊界內 flat，但仍把 playlist 展開成 entries」。實測對三種 URL 形狀（單一影片、純清單、watch+list）都正確。

## Risks / Trade-offs

- **[Risk] `"in_playlist"` 在未來 yt-dlp 版本被改名或語意變化**：
  → **Mitigation**：補 unit test 鎖定 opts 內容；若日後 yt-dlp 行為變了，CI 會炸出來。

- **[Trade-off] 不做完整解析 → entries 仍是 lazy / shallow info**：每筆 entry 仍只有 `id`、`title`、`duration`、`uploader` 等 metadata，沒有可下載 format。但下載時是用 video URL 重新打 yt-dlp，所以沒影響。
