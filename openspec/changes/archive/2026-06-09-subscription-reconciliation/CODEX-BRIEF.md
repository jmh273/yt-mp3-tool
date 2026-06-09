# CODEX-BRIEF — subscription-reconciliation（改動 B）

> 自足實作指示。規格在同目錄 `proposal.md` / `design.md` / `specs/subscription-reconciliation/spec.md`，**本檔已含全部實作細節**。
> 後端 FastAPI（`backend/main.py`）+ 前端 Vue 3 `<script setup>` + TS + Pinia。
> **前提**：改動 A（`search-subscribe-graceful-toast`）已完成，`frontend/src/stores/toast.ts` 的 `useToastStore` 已存在；本檔會用它做錯誤/成功回饋。

---

## ⚠️ 中文編碼（務必遵守）

UTF-8 無 BOM；不要用終端機 echo/管線/here-string 寫中文；全形標點與 emoji 原樣保留；寫完回讀驗證無 `?`/`�`/半字；照抄既有中文風格。（同改動 A，完整規則見 A 的 CODEX-BRIEF。）

---

## Part B1 — 後端：`POST /subscriptions/reconcile`（`backend/main.py`）

放在既有 `@app.delete("/subscriptions/{subscription_id}")`（約 701 行）之後。慣例：`require_credentials()` + `build("youtube","v3",...)` + `consume_quota(n)`。

訂閱清單分頁邏輯照抄既有 `GET /subscriptions`（627-659 行）的 `subscriptions.list(mine=True, maxResults=50, pageToken=..., order="alphabetical")` 迴圈，但這裡只需 `channel_id` 集合。

```python
from pydantic import BaseModel   # 檔案若已 import 則不重複

class ReconcileBody(BaseModel):
    channel_ids: list[str] = []

@app.post("/subscriptions/reconcile")
def reconcile_subscriptions(body: ReconcileBody):
    ids = [c.strip() for c in (body.channel_ids or []) if c and c.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="缺少 channel_ids")
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    # 1) 目前 API 訂閱清單的 channel_id 集合（分頁抓完）
    api_ids: set[str] = set()
    page_token = None
    while True:
        resp = youtube.subscriptions().list(
            part="snippet", mine=True, maxResults=50,
            pageToken=page_token, order="alphabetical",
        ).execute()
        consume_quota(1)
        for item in resp.get("items", []):
            cid = item["snippet"]["resourceId"]["channelId"]
            api_ids.add(cid)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    unique_ids = list(dict.fromkeys(ids))            # 去重、保序
    missing = [c for c in unique_ids if c not in api_ids]

    # 2) 對 missing 批次 channels.list 分類死/活
    alive: set[str] = set()
    for i in range(0, len(missing), 50):
        batch = missing[i:i + 50]
        resp = youtube.channels().list(part="id", id=",".join(batch)).execute()
        consume_quota(1)
        for item in resp.get("items", []):
            alive.add(item["id"])

    dead = [c for c in missing if c not in alive]
    desynced = [c for c in missing if c in alive]

    return {
        "takeout_count": len(unique_ids),
        "api_count": len(api_ids),
        "missing_count": len(missing),
        "dead": dead,
        "desynced": desynced,
    }
```
> 空清單在打任何 API 前就 raise 400 → 不計 quota（spec 要求）。

**後端測試** `backend/tests/test_reconcile.py`（照 `backend/tests/test_subscriptions.py` 的 `patch("main.build")` 慣例）：
- 混合情境：給 5 個 id，mock `subscriptions().list` 回 3 個在清單、`channels().list` 對 missing 的 2 個只回 1 個 id → 斷言 `missing_count==2`、`dead` 與 `desynced` 各 1、且 quota 有計入（subscriptions 頁數 + channels 批次）。
- 全部一致：所有 id 都在訂閱清單 → `missing_count==0`、`dead==[]`、`desynced==[]`，且 **`channels().list` 未被呼叫**。
- 空 body：`channel_ids=[]` → 400，且 **`build` 未被呼叫**、quota 不變。

## Part B2 — 前端：CSV 解析工具

新增 `frontend/src/utils/parseTakeoutCsv.ts`（或放進 wizard 元件內亦可）。Takeout `subscriptions.csv` 標頭為 `Channel Id,Channel Url,Channel Title`，第一欄是 `UC...`。

```ts
export interface TakeoutChannel { channel_id: string; title: string; url: string }

export function parseTakeoutCsv(text: string): TakeoutChannel[] {
  // 去 BOM
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out: TakeoutChannel[] = []
  for (const line of lines) {
    const cols = line.split(',')
    const id = (cols[0] || '').trim()
    if (!id.startsWith('UC')) continue   // 跳過標頭與雜訊列
    out.push({
      channel_id: id,
      url: (cols[1] || '').trim(),
      title: (cols.slice(2).join(',') || '').trim(),  // 標題可能含逗號 → 合併剩餘欄
    })
  }
  return out
}
```
> 解析結果為空 → wizard 顯示錯誤 toast「無法解析此檔，請確認是 Takeout 的 subscriptions.csv」，不打後端。

## Part B3 — 前端：`frontend/src/components/ReconcileWizard.vue`（新檔）

Modal 三步精靈。用 `useToastStore` 回饋。重點行為：

- **Step 1 指引**：說明文字 + 可點連結 `https://takeout.google.com/`（文字標明「只勾選『YouTube 和 YouTube Music』→ 進階 → 只留『訂閱項目 subscriptions』、格式 CSV → 建立匯出 → 收 email 下載 zip → 解出 subscriptions.csv」）。
- **Step 2 上傳**：`<input type="file" accept=".csv">`（可加拖曳）。選檔後 `FileReader.readAsText` → `parseTakeoutCsv`；解析為空 → `toast.error(...)` 並留在 Step 2。
- **送出對帳**：`apiPost('/subscriptions/reconcile', { channel_ids: parsed.map(c => c.channel_id) })`，loading 狀態；失敗 → `toast.error(err.message)` 並可重試。
- **Step 3 結果**：顯示 `takeout_count` / `api_count` / `dead.length`；列出 `desynced`——用 Step2 解析的 map 還原 `title`，連結 `https://www.youtube.com/channel/<id>`（`target="_blank" rel="noopener"`）。`desynced` 為空時顯示「API 與 Takeout 一致，沒有漏看的頻道」。

emit `close` 給父層關閉。CSS 比照專案既有 modal/卡片風格（可參考其他元件的 overlay）。

## Part B4 — 前端：進入點（`HomeView.vue`）

在訂閱分頁區塊（`<div v-if="activeLeftTab === 'subscribed'" class="left-tab-content">`，約 99 行內）加一個「訂閱對帳」按鈕，點擊把新 ref `showReconcile` 設 true；在版面適當處渲染 `<ReconcileWizard v-if="showReconcile" @close="showReconcile = false" />`。

```ts
const showReconcile = ref(false)
import ReconcileWizard from '@/components/ReconcileWizard.vue'
```

## 禁區（B）

- 不改 `GET /subscriptions` / `POST /subscriptions/{channel_id}` 既有路由。
- 不做自動修復（退訂再訂）/ 排程對帳 / 結果持久化。
- 不後端收檔（不引入 `UploadFile` / multipart）；CSV 一律前端解析、只送 channel_id 清單。
- 不整合 Google Data Portability API。

## 驗收分工（B）

- **你（Codex）做**：B1–B4 + 後端 `pytest`（`test_reconcile.py`）+ 前端 vitest：
  - `frontend/src/tests/ReconcileWizard.test.ts`：`parseTakeoutCsv`（含 BOM、含逗號標題、跳過標頭）正確；結果渲染把 `desynced` / `dead` 分流顯示；解析空檔呼叫 `toast.error`、不打後端（mock `apiPost`）。
- **不要做**：e2e / Playwright、archive、改 CHANGELOG / 版本 / tag。e2e（`frontend/e2e/verify-subscription-reconciliation.ts`）與 archive 由 Claude 負責。
- 自我檢查：`pytest`、`npx vitest run`、`npx vue-tsc --noEmit`。
- **Takeout 深連結**：若你能確認可預選 scope 的更精準連結就用；不確定就用 `https://takeout.google.com/` + 文字指引（不要卡在這點）。

## 完成後回報

- 改了哪些檔、各檔重點；pytest / vitest / type-check 結果摘要。
- 確認新增/修改檔中文無亂碼（已回讀）。
- 任何偏離本 brief 的決定請標出。
