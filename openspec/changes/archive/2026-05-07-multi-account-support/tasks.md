## 1. 後端 Token 儲存架構重構
- [x] 1.1 `backend/main.py`: 新增 `TOKENS_DIR`、`CURRENT_ACCOUNT_FILE` 常數，建立 `tokens/` 目錄。
- [x] 1.2 `backend/main.py`: 實作 `_get_current_email()`、`_set_current_email()`、`_token_path()` 工具函式。
- [x] 1.3 `backend/main.py`: 實作 `_fetch_email(creds)` 呼叫 Google `userinfo` API 取得 email。
- [x] 1.4 `backend/main.py`: 重構 `load_credentials()` 改為讀取 `current_account.txt` → 對應 `tokens/<email>.json`。
- [x] 1.5 `backend/main.py`: 在 `SCOPES` 加入 `userinfo.email` scope。

## 2. Startup 自動遷移
- [x] 2.1 `backend/main.py`: 在 `lifespan()` 實作舊版 `token.json` → `tokens/<email>.json` 一次性遷移邏輯。
- [x] 2.2 遷移失敗（離線 / refresh 失敗）時保留舊檔，不阻止啟動。

## 3. 後端 API 新增與調整
- [x] 3.1 `backend/main.py`: 新增 `GET /auth/accounts` 路由（列出已授權帳號 + 當前帳號）。
- [x] 3.2 `backend/main.py`: 新增 `POST /auth/switch` 路由（切換當前帳號，驗證 token 有效性）。
- [x] 3.3 `backend/main.py`: 調整 `GET /auth/login`：OAuth 完成後取得 email 並存入 `tokens/`，設為 current，強制 `prompt=select_account`。
- [x] 3.4 `backend/main.py`: 調整 `POST /auth/logout`：改為帳號級操作，刪除指定帳號 token，自動切到下一個帳號或清除 current。
- [x] 3.5 `backend/main.py`: 調整 `GET /auth/status` 回傳擴充 `current_account` 與 `accounts` 欄位。

## 4. 前端 Store 擴充
- [x] 4.1 `frontend/src/stores/auth.ts`: 新增 `currentAccount`、`accounts` state。
- [x] 4.2 `frontend/src/stores/auth.ts`: 修改 `checkStatus()` 同步取得帳號清單。
- [x] 4.3 `frontend/src/stores/auth.ts`: 新增 `switchAccount(email)`、`addAccount()`、`logoutAccount(email)` 方法。

## 5. 前端 UI 帳號切換
- [x] 5.1 `frontend/src/views/HomeView.vue`: Header 新增帳號 dropdown（當前 email + 切換 + 新增 + 登出）。
- [x] 5.2 `frontend/src/views/HomeView.vue`: 切換帳號後清空 channels/videos 並重新載入。
- [x] 5.3 CSS 樣式設計：帳號 dropdown 的視覺風格（與現有 quota badge 一致）。

## 6. 測試
- [ ] 6.1 新增帳號：登入第二個 Google 帳號，確認 `tokens/` 下產生兩個 json 檔。
- [ ] 6.2 切換帳號：在 dropdown 切換帳號，確認訂閱清單更新為該帳號的頻道。
- [ ] 6.3 登出單一帳號：登出其中一個帳號，確認自動切到剩餘帳號。
- [ ] 6.4 遷移測試：手動將 `tokens/` 改回舊版 `token.json`，重啟後確認自動遷移。
- [ ] 6.5 既有測試：更新 `/auth/*` 相關 mock，確保現有測試通過。
