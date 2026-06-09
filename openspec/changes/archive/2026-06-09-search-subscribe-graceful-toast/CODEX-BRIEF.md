# CODEX-BRIEF — search-subscribe-graceful-toast（改動 A）

> 自足實作指示。規格在同目錄 `proposal.md` / `design.md` / `specs/app-toast/spec.md` / `specs/channel-search/spec.md`，**本檔已含全部實作細節，照做即可**。
> 前端 Vue 3 `<script setup>` + TS + Pinia。後端**不動**。
> 這是「改動 A」，**先做 A 再做 B**（`subscription-reconciliation` 依賴此檔產出的 toast）。

---

## ⚠️ 中文編碼（務必遵守，避免亂碼）

本專案在 Windows，所有原始碼一律 **UTF-8（無 BOM）**。

1. 一律以 UTF-8 寫檔，跟現有檔一致；不要 UTF-16 / Big5 / 含 BOM。
2. **不要用終端機 echo / 管線 / here-string 寫含中文的檔**（PowerShell 預設編碼會轉壞）。用編輯／寫檔工具直接寫 UTF-8。
3. 全形標點 `，：「」（）…` 與 emoji（✓ ➕ ✕）原樣保留，不要轉半形 / `\uXXXX` / `?` / `�`。
4. 寫完含中文的檔自我回讀驗證，無 `?`、`�`、半字亂碼。
5. 照抄既有中文風格（如「✓ 已訂閱」「➕ 訂閱」），不自行改寫。

---

## Part A1 — toast store：`frontend/src/stores/toast.ts`（新檔）

照 `frontend/src/stores/watchlist.ts` 的 Pinia `defineStore` 風格。

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'
export interface Toast {
  id: number
  type: ToastType
  message: string
}

const DEFAULT_TIMEOUT = 4000

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let seq = 0

  function push(type: ToastType, message: string, timeout = DEFAULT_TIMEOUT): number {
    const id = ++seq
    toasts.value.push({ id, type, message })
    if (timeout > 0) {
      setTimeout(() => dismiss(id), timeout)
    }
    return id
  }

  function dismiss(id: number) {
    const i = toasts.value.findIndex((t) => t.id === id)
    if (i !== -1) toasts.value.splice(i, 1)
  }

  const success = (m: string, t?: number) => push('success', m, t)
  const error = (m: string, t?: number) => push('error', m, t)
  const info = (m: string, t?: number) => push('info', m, t)

  return { toasts, push, dismiss, success, error, info }
})
```

## Part A2 — host 元件：`frontend/src/components/ToastHost.vue`（新檔）

固定右下角堆疊；空佇列不渲染容器（`v-if="toasts.length"`）；點擊可關閉；type 套色。

```vue
<template>
  <div v-if="toast.toasts.length" class="toast-host">
    <div
      v-for="t in toast.toasts"
      :key="t.id"
      class="toast"
      :class="t.type"
      @click="toast.dismiss(t.id)"
    >
      {{ t.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/toast'
const toast = useToastStore()
</script>

<style scoped>
.toast-host { position: fixed; right: 1rem; bottom: 1rem; z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem; max-width: 360px; }
.toast { padding: 0.6rem 0.9rem; border-radius: 6px; color: #fff; font-size: 0.85rem; box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: pointer; word-break: break-word; }
.toast.success { background: #2ea043; }
.toast.error { background: #d32f2f; }
.toast.info { background: #555; }
</style>
```

## Part A3 — 掛載：`frontend/src/App.vue`

在根 template 末尾加 `<ToastHost />`（與既有版面同層、不影響排版）：
```vue
<ToastHost />
```
並在 `<script setup>` import：`import ToastHost from '@/components/ToastHost.vue'`。
> 先讀 App.vue 確認既有結構（router-view / 既有元件）再插入；不要破壞既有 layout。

## Part A4 — 改寫 `SearchVideosFeed.vue` 的 `subscribeChannel`

目前（約 197-218 行）的 `catch {}` 靜默版要換成下列分流。**關鍵事實**：`apiPost` 失敗時 `throw new Error(detail)`，**不帶 HTTP status**，只能用訊息字串判斷 409 duplicate；後端 `detail` 形如 `訂閱失敗：<HttpError ... subscriptionDuplicate ...>`，**已含一次「訂閱失敗：」前綴**，直接顯示 `err.message`、不要再加前綴。

```ts
import { useToastStore } from '@/stores/toast'   // 新增 import
const toast = useToastStore()                     // 與其他 store 同處宣告

async function subscribeChannel(c: ChannelResult) {
  if (subscribingId.value || isSubscribed(c.channel_id)) return
  subscribingId.value = c.channel_id
  try {
    const res = await apiPost<{
      subscription_id: string
      channel?: SubscribedChannel
    }>(`/subscriptions/${c.channel_id}`)
    const channel = res.channel ?? {
      subscription_id: res.subscription_id,
      channel_id: c.channel_id,
      title: c.title,
      thumbnail: c.thumbnail,
    }
    emit('subscribed', channel)
    toast.success(`已訂閱「${c.title}」`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('subscriptionDuplicate')) {
      // 409：此帳號其實已訂閱 → 視為冪等成功，樂觀標記
      emit('subscribed', {
        subscription_id: '',
        channel_id: c.channel_id,
        title: c.title,
        thumbnail: c.thumbnail,
      })
      toast.info(`「${c.title}」此帳號已訂閱`)
    } else {
      toast.error(msg)   // detail 已含一次「訂閱失敗：」，不再加前綴
    }
  } finally {
    subscribingId.value = ''
    quota.refresh()
  }
}
```
> `SubscribedChannel` interface 已存在於此檔（112 行附近）。duplicate 分支 `subscription_id` 給空字串即可（樂觀標記只為讓 `subscribedIds` 反映、按鈕 disable）。
> 移除舊的「v1：訂閱失敗或 duplicate 先靜默忽略」註解。

## 禁區（A）

- 不動 `backend/main.py`（`_subscription_error_status` / `post_subscription` 維持原樣）。
- 不改 `apiPost`（沿用 `throw new Error(detail)` 形態）。
- 不把既有 `HomeView` 的 `error.value` 顯示改成 toast（本案只導入訂閱路徑，避免擴大範圍）。
- 不做 unsubscribe+resubscribe。

## 驗收分工（A）

- **你（Codex）做**：A1–A4 + 前端 vitest：
  - `frontend/src/tests/toast.test.ts`：`success/error/info` 入列且 type 正確、`dismiss(id)` 移除、`push` 回傳遞增 id。（自動逾時可用 `vi.useFakeTimers()` 驗證 setTimeout 後移除。）
  - `frontend/src/tests/SearchVideosFeed.test.ts`（更新）：mock `apiPost`──(a) resolve → `emit('subscribed')` 且呼叫 `toast.success`；(b) reject `new Error('訂閱失敗：... subscriptionDuplicate ...')` → 仍 `emit('subscribed')` 且呼叫 `toast.info`、**未**呼叫 `toast.error`；(c) reject `new Error('訂閱失敗：配額不足')` → **未** emit、呼叫 `toast.error`。
- **不要做**：e2e / Playwright、archive、改 CHANGELOG / 版本 / tag。e2e（`frontend/e2e/verify-search-subscribe-graceful-toast.ts`）與 archive 由 Claude 負責。
- 自我檢查：`npx vitest run`、`npx vue-tsc --noEmit`。

## 完成後回報

- 改了哪些檔、各檔重點。
- vitest / type-check 結果摘要。
- 確認所有新增/修改檔中文無亂碼（已回讀）。
- 任何偏離本 brief 的決定請標出。
