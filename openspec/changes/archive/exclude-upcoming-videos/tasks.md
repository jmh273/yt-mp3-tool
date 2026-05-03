## 1. 後端 API 邏輯修改
- [ ] 1.1 `backend/main.py`: 建立一個輔助函式 `filter_upcoming_videos(youtube, videos)`，接收影片字典列表，利用 API 查詢並回傳過濾後的列表。
- [ ] 1.2 `backend/main.py`: 修改 `get_channel_videos` (`/subscriptions/{channel_id}/videos`)，在回傳前呼叫上述函式過濾影片。
- [ ] 1.3 `backend/main.py`: 修改 `get_latest_videos` (`/latest-videos`)，在進行時間過濾 (cutoff) 之後、數量裁切前，將剩下的影片 IDs 分批交給 API 過濾。

## 2. 測試
- [ ] 2.1 找一個確定有「即將首播」或「尚未開始之直播」的頻道，測試 `/subscriptions/{channel_id}/videos` 是否成功將其隱藏。
- [ ] 2.2 確認修改後的 API 配額消耗是否符合預期（批次查詢）。
