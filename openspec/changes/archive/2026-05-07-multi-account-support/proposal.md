## Why

使用者擁有多個 YouTube 帳號（個人 / 工作 / 副號），每個帳號訂閱不同頻道。目前工具只能存一份 token，要切換就得 logout 再 login，過程繁瑣且會中斷正在使用的內容（清單與快取）。需要支援同時保留多個帳號的授權，並在 UI 上能快速切換。

## What Changes

- 後端 token 儲存從單檔 `token.json` 改為 `tokens/<email>.json` 多檔架構
- 新增「當前帳號」概念：`current_account.txt` 紀錄目前作用中的帳號 email
- OAuth 流程結束後額外呼叫 Google `userinfo` API 取得 email，作為帳號識別 key（不消耗 YouTube quota）
- 新增 API：`/auth/accounts`（列出已授權帳號）、`/auth/switch`（切換當前帳號）；既有 `/auth/login` / `/auth/logout` 行為調整為帳號級操作
- 啟動時若偵測到舊版單檔 `token.json`，自動遷移到新格式（無感升級）
- 前端 Header 加入帳號 dropdown（顯示當前 email + 切換 + 新增帳號 + 登出此帳號）
- 設定（含 quota_used）保持全域共用，badge 加 tooltip 說明 quota 為跨帳號共用
- 「新增帳號」OAuth 強制 `prompt=select_account`，避免直接套用瀏覽器預設帳號

## Capabilities

### New Capabilities

- `multi-account-auth`: 後端多 token 儲存、當前帳號狀態、帳號級 OAuth / 切換 / 登出
- `account-switcher-ui`: 前端 Header 帳號 dropdown 與切換時的狀態同步

### Modified Capabilities

無（既有 `/auth/status` 回傳形狀微調，但屬於擴充而非破壞性變更）

## Impact

- `backend/main.py`：`TOKEN_FILE` 邏輯重構、新 endpoint、startup 遷移、`require_credentials()` 內部走 current
- `frontend/src/stores/auth.ts`：擴充 `currentAccount` 與 `accounts` state，新增 `switch()` / `addAccount()` / `logoutAccount()`
- `frontend/src/views/HomeView.vue`：Header dropdown UI、切換時清空 channels / 重抓 subscriptions + quota
- `frontend/src/views/LoginView.vue`：首次登入流程不變（會自動成為 current account）
- 既有測試需更新 `/auth/*` 相關 mock；新增帳號切換的 store 與 UI 測試
- 既有使用者升級時自動遷移，無需重新授權
- 不影響下載流程（yt-dlp 不需 OAuth credential）
- YouTube API quota 仍為 GCP project 級別（10000/day），多帳號共用同一額度
