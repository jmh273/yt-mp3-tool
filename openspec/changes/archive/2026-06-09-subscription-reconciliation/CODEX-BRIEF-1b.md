# CODEX-BRIEF（追加 1b）— subscription-reconciliation 手動再同步輔助 + 重新對帳 + 指引文案

> 接續 B 已完成的初版（`ReconcileWizard.vue`、`parseTakeoutCsv.ts`、後端 `/subscriptions/reconcile` 都已存在且綠燈）。**本檔只加 1b 範圍**，規格見同目錄 `proposal.md` / `design.md`（D5、D6）/ `specs/subscription-reconciliation/spec.md`（新增「不同步頻道的手動再同步輔助」「重新對帳」要求 + 改寫的「引導式對帳精靈」Step1）。
> 前端 Vue 3 `<script setup>` + TS + Pinia。**後端不動**。

---

## ⚠️ 中文編碼（務必遵守）

UTF-8 無 BOM；不要用終端機 echo/管線/here-string 寫中文；全形標點與 emoji 原樣保留；寫完回讀驗證無 `?`/`�`/半字。**所有 UI 文案一律繁體中文**（上一輪你誤用英文，本輪務必避免，照抄本檔字串）。

---

## 範圍：只改 `frontend/src/components/ReconcileWizard.vue`（+ 其測試）

### Part 1 — 改寫 Step 1 匯出指引文案（修正：沒有「進階」）

把目前 `<ol class="reconcile-steps">` 內三個 `<li>`（目前仍寫「→ 進階 →」是錯的）整段換成：

```html
        <ol class="reconcile-steps">
          <li>開啟 Google Takeout，先按「取消全選」，再只勾選「YouTube 和 YouTube Music」。</li>
          <li>點該項的「包含所有 YouTube 資料」按鈕，在跳出的清單先按「取消全選」，再只勾選「訂閱內容」並確定。</li>
          <li>格式選 CSV、建立匯出；收到 Google email 後下載 zip，解壓縮取出 subscriptions.csv。</li>
          <li>回到下方選擇 subscriptions.csv 開始比對。</li>
        </ol>
```

### Part 2 — 不同步區：手勢說明 + 漏訂警告 + 每列「已處理」+ 進度

在結果頁（`<div v-else class="reconcile-body">`）的「不同步」`<section>` 內，標題下方先加說明框，並改寫每個 `<li>` 加 checkbox 與進度。

替換現有「不同步」section 為：

```html
        <section>
          <h3>不同步（實際存在但 API 看不到）</h3>
          <p v-if="desyncedChannels.length === 0">沒有不同步的頻道，API 與 Takeout 一致。</p>
          <template v-else>
            <div class="resync-note">
              <p>這是 YouTube 端的不同步，API 無法自動修復。請到各頻道在 YouTube 手動再同步：</p>
              <p>點頻道的「已訂閱」→「取消訂閱」，再點一次「訂閱」。</p>
              <p class="resync-warn">⚠️ 退訂後務必再次訂閱，否則你會真的少掉這個訂閱。</p>
              <p class="resync-progress">已處理 {{ doneCount }} / {{ desyncedChannels.length }}</p>
            </div>
            <ul>
              <li v-for="channel in desyncedChannels" :key="channel.channel_id">
                <label class="resync-done">
                  <input type="checkbox" :checked="isDone(channel.channel_id)" @change="toggleDone(channel.channel_id)" />
                  已處理
                </label>
                <a :href="youtubeUrl(channel.channel_id)" target="_blank" rel="noopener">
                  {{ channel.title || channel.channel_id }}
                </a>
              </li>
            </ul>
          </template>
        </section>
```

### Part 3 — 結果頁加「重新對帳」按鈕（重用已解析 ids）

在 summary 區（`<div class="reconcile-summary">`）後面加一顆按鈕，呼叫既有 `runReconcile`（它已用 `channels.value.map(...)`，不需重新上傳）：

```html
        <button type="button" class="reconcile-run" :disabled="loading" @click="runReconcile">
          {{ loading ? '比對中...' : '重新對帳' }}
        </button>
```

### Part 4 — script 邏輯（持久化 + 進度）

新增 import 與狀態（localStorage 以**目前帳號**命名空間，避免跨帳號污染）：

```ts
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const doneIds = ref<Set<string>>(new Set())

function doneKey(channelId: string) {
  return `reconcile-done:${auth.currentAccount}:${channelId}`
}
function loadDone(ids: string[]) {
  const s = new Set<string>()
  for (const id of ids) {
    if (localStorage.getItem(doneKey(id)) === '1') s.add(id)
  }
  doneIds.value = s
}
function isDone(id: string) {
  return doneIds.value.has(id)
}
function toggleDone(id: string) {
  const s = new Set(doneIds.value)
  if (s.has(id)) {
    s.delete(id)
    localStorage.removeItem(doneKey(id))
  } else {
    s.add(id)
    localStorage.setItem(doneKey(id), '1')
  }
  doneIds.value = s
}
const doneCount = computed(
  () => result.value?.desynced.filter((id) => doneIds.value.has(id)).length ?? 0,
)
```

在 `runReconcile` 成功設定 `result.value` 之後，補一行載入已處理狀態：

```ts
    result.value = await apiPost<ReconcileResult>('/subscriptions/reconcile', {
      channel_ids: channels.value.map((channel) => channel.channel_id),
    })
    loadDone(result.value.desynced)   // ← 新增：依目前 desynced 還原勾選
```

### Part 5 — CSS（`<style scoped>` 末尾加）

```css
.resync-note { background: #fff8e1; border: 1px solid #ffe2a8; border-radius: 6px; padding: 0.6rem 0.8rem; font-size: 0.85rem; line-height: 1.5; color: #5b4a1f; }
.resync-note p { margin: 0.2rem 0; }
.resync-warn { color: #b54708; font-weight: 600; }
.resync-progress { color: #444; }
.resync-done { display: inline-flex; align-items: center; gap: 0.25rem; margin-right: 0.6rem; font-size: 0.8rem; color: #555; cursor: pointer; }
```

---

## 禁區

- 不動後端、不改 `parseTakeoutCsv.ts`、不改 `/subscriptions/reconcile` 契約。
- **不做 API 自動退訂再訂**（取不到 sub_id，spec 明訂 MUST NOT）。
- 不抓 cookie / innertube。
- 重新對帳沿用既有 `runReconcile`，不要重寫上傳流程。

## 驗收分工

- **你（Codex）做**：Part 1–5 + 更新 `frontend/src/tests/ReconcileWizard.test.ts`：
  - 勾「已處理」→ `doneCount` +1、寫入 localStorage；重新 mount（同 account）→ 仍為已處理（持久化）。
  - 「重新對帳」按鈕呼叫 `apiPost('/subscriptions/reconcile', { channel_ids })`、**不需重新上傳**（沿用已解析 channels）。
  - 既有測試（解析、結果渲染、解析失敗 toast）維持綠燈；summary 斷言若因新增按鈕受影響再順手修。
- **不要做**：e2e / Playwright、archive、改 CHANGELOG / 版本 / tag。e2e（更新 `frontend/e2e/verify-subscription-reconciliation.ts`）與 archive 由 Claude 負責。
- 自我檢查：`npx vitest run`、`npx vue-tsc --noEmit`。

## 完成後回報

- 改了哪些檔、各檔重點；vitest / type-check 結果摘要。
- 確認新增/修改檔中文無亂碼（已回讀）。
- 任何偏離本 brief 的決定請標出。
