## Context

目前系統使用單一 `~/.yt-mp3-tool/token.json` 存放 Google OAuth credential。`load_credentials()` / `require_credentials()` 直接讀取這份檔案，所有 API 呼叫共享同一組授權。`/auth/login` 透過 `InstalledAppFlow.run_local_server()` 取得 credential 後直接覆寫該檔案，因此同時間只能保留一個帳號的授權狀態。

使用者想在不同的 YouTube 帳號之間快速切換，而不需要重複 login/logout 流程。所有帳號共用同一個 GCP project 的 API 配額（10,000/day）。

## Goals

- 支援同時保留多組 Google OAuth token，以 email 為識別 key。
- 提供即時切換當前帳號的機制，切換後所有 YouTube API 呼叫自動使用新帳號的 credential。
- 舊版單檔 `token.json` 使用者升級後自動無感遷移。
- 前端 Header 提供帳號 dropdown UI，支援切換、新增帳號、登出指定帳號。

## Technical Approach

### Backend (`backend/main.py`)

#### Token 儲存架構

```
~/.yt-mp3-tool/
├── tokens/                      # 新增目錄（取代 token.json）
│   ├── user1@gmail.com.json
│   └── user2@gmail.com.json
├── current_account.txt          # 純文字，紀錄當前帳號 email
├── settings.json                # 不變，全域共用
└── token.json                   # 舊版（遷移後刪除）
```

#### Startup 遷移邏輯

在 `lifespan()` 中執行一次性遷移：
1. 檢查 `TOKEN_FILE`（舊版 `token.json`）是否存在。
2. 若存在：載入 credential → 呼叫 Google `userinfo` API 取得 email → 存入 `tokens/<email>.json` → 寫入 `current_account.txt` → 刪除舊 `token.json`。
3. 若 `userinfo` 呼叫失敗（離線、token 過期無法 refresh），則保留舊檔不遷移，下次啟動再試。

#### 核心函式重構

- `TOKENS_DIR = CONFIG_DIR / "tokens"`（新增常數，`mkdir(exist_ok=True)`）。
- `CURRENT_ACCOUNT_FILE = CONFIG_DIR / "current_account.txt"`（新增常數）。
- `_get_current_email() -> str | None`：讀取 `current_account.txt`，回傳當前帳號 email。
- `_set_current_email(email: str)`：寫入 `current_account.txt`。
- `_token_path(email: str) -> Path`：回傳 `TOKENS_DIR / f"{email}.json"`。
- `_fetch_email(creds: Credentials) -> str`：呼叫 `https://www.googleapis.com/oauth2/v2/userinfo`（不消耗 YouTube quota），解析 `email` 欄位。
- `load_credentials()` 改為：讀取 `current_account.txt` → 載入對應 `tokens/<email>.json` → 必要時 refresh → 回傳。
- `require_credentials()` 不變（仍委託 `load_credentials()`）。

#### API 變更

| 路由 | 方法 | 行為 |
|------|------|------|
| `GET /auth/status` | 擴充回傳 | `{ logged_in, current_account, accounts: [email1, email2, ...] }` |
| `GET /auth/login` | 調整 | OAuth 完成後呼叫 `_fetch_email()` 取得 email，存入 `tokens/<email>.json`，設為 current account。強制 `prompt="select_account"` 讓使用者選帳號 |
| `POST /auth/logout` | 調整 | 刪除 **當前帳號** 的 token 檔，自動切換到剩餘帳號的第一個；若無剩餘則清除 `current_account.txt` |
| `GET /auth/accounts` | 新增 | 列出 `tokens/` 目錄下所有 `*.json` 檔名（去掉 `.json` 即 email），回傳 `{ accounts: [...], current: "..." }` |
| `POST /auth/switch` | 新增 | body: `{ email: "..." }`，驗證該 email 的 token 檔存在且有效後更新 `current_account.txt`，回傳 `{ current: email }` |

#### OAuth Scope 調整

新增 `https://www.googleapis.com/auth/userinfo.email` 到 `SCOPES`（取得使用者 email 用）。  
**注意**：修改 scope 後，已存在的 token 不會自動擁有新 scope。首次遷移的舊 token 若無此 scope，`_fetch_email()` 會失敗。處理方式：遷移時使用 token 內已有的資訊（若有），或將遷移帳號的 email 設為 `unknown@migrated`，待使用者手動重新登入該帳號時更新。

### Frontend

#### `stores/auth.ts` 擴充

```ts
// 新增 state
const currentAccount = ref<string>('')
const accounts = ref<string[]>([])

// 修改 checkStatus：改呼叫 /auth/accounts 同步取得帳號清單
async function checkStatus() {
  const data = await apiGet<{
    accounts: string[]
    current: string
    logged_in: boolean
  }>('/auth/accounts')
  loggedIn.value = data.logged_in
  currentAccount.value = data.current
  accounts.value = data.accounts
}

// 新增 switchAccount
async function switchAccount(email: string) {
  await apiPost('/auth/switch', { email })
  currentAccount.value = email
}

// 新增 addAccount（觸發新一輪 OAuth）
async function addAccount() {
  await apiGet('/auth/login')
}

// 修改 logout → logoutAccount（登出指定帳號）
async function logoutAccount(email?: string) {
  const target = email || currentAccount.value
  await apiPost('/auth/logout', { email: target })
  await checkStatus()
  if (!loggedIn.value) {
    await router.push('/login')
  }
}
```

#### `views/HomeView.vue` Header UI

在現有的 Header 區域（quota badge 旁）加入帳號 dropdown：

- 顯示當前帳號 email（截斷顯示 `user1@gm...`）。
- 下拉選單列出所有已授權帳號，點擊切換。
- 「+ 新增帳號」按鈕觸發 `addAccount()`。
- 各帳號旁有「登出」小按鈕，觸發 `logoutAccount(email)`。
- 切換帳號後：清空 `channels` 和 `videos` 列表 → 重新呼叫 `/subscriptions` 與 `/quota`。

#### `views/LoginView.vue`

- 首次進入（無任何帳號）：行為不變，登入後自動導向首頁。
- 若已有帳號但被登出最後一個：同上。

### 邊界情況

1. **切換帳號時正在下載**：下載使用 yt-dlp（不需 OAuth），不受影響。但 UI 需提醒使用者下載不會中斷。
2. **Token refresh 失敗**：與現行邏輯一致，回傳 401，前端導向登入頁。但多帳號時只影響當前帳號，使用者可切到其他帳號繼續使用。
3. **同一帳號重複登入**：以 email 為 key，覆寫即可，不會產生重複檔案。
4. **Email 含特殊字元**：Google email 只允許 `[a-z0-9.@]`，可安全用作檔名。但加上 sanitize 確保安全。
