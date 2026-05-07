## 1. 後端實作配額計數
- [x] 1.1 `backend/main.py`: 修改 `DEFAULT_SETTINGS` 並新增 `consume_quota` 函式（處理 PT 時區日期重置與計數）。
- [x] 1.2 `backend/main.py`: 在 `subscriptions().list` 與 `videos().list` 執行的地方加入 `consume_quota(1)`。
- [x] 1.3 `backend/main.py`: 建立 GET `/quota` 路由供前端查詢。

## 2. 前端實作 UI 顯示
- [x] 2.1 `frontend/src/views/HomeView.vue`: 在元件掛載時 (`onMounted`)，呼叫 `/quota` 取得數據。
- [x] 2.2 `frontend/src/views/HomeView.vue`: 在 Header 區域設計小標籤或進度條顯示 `API Quota: X / 10000`。
- [x] 2.3 `frontend/src/views/HomeView.vue`: 每次點擊頻道或重新載入最新影片時，同步更新最新的 quota 數值。

## 3. 測試
- [ ] 3.1 點擊一次前端畫面，觀察終端機或 UI 上顯示的配額是否有 +1 或相應增加。
- [ ] 3.2 手動修改 `~/.yt-mp3-tool/settings.json` 將日期改為昨天，確認下一次操作時配額會自動歸零重置。
