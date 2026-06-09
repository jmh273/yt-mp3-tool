<template>
  <div class="reconcile-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <section class="reconcile-modal">
      <header class="reconcile-head">
        <h2>訂閱對帳</h2>
        <button type="button" class="reconcile-close" @click="$emit('close')">✕</button>
      </header>

      <div v-if="!result" class="reconcile-body">
        <ol class="reconcile-steps">
          <li>開啟 Google Takeout，先按「取消全選」，再只勾選「YouTube 和 YouTube Music」。</li>
          <li>點該項的「包含所有 YouTube 資料」按鈕，在跳出的清單先按「取消全選」，再只勾選「訂閱內容」並確定。</li>
          <li>格式選 CSV、建立匯出；收到 Google email 後下載 zip，解壓縮取出 subscriptions.csv。</li>
          <li>回到下方選擇 subscriptions.csv 後開始比對。</li>
        </ol>

        <a href="https://takeout.google.com/" target="_blank" rel="noopener">開啟 Google Takeout</a>

        <input type="file" accept=".csv,text/csv" @change="handleFile" />

        <div v-if="channels.length" class="reconcile-ready">
          <span>已解析 {{ channels.length }} 個頻道</span>
          <button type="button" class="reconcile-run" :disabled="loading" @click="runReconcile">
            {{ loading ? '比對中...' : '開始比對' }}
          </button>
        </div>
      </div>

      <div v-else class="reconcile-body">
        <div class="reconcile-summary">
          <span>Takeout：{{ result.takeout_count }}</span>
          <span>API：{{ result.api_count }}</span>
          <span>死頻道：{{ result.dead.length }}</span>
        </div>

        <section>
          <h3>不同步（實際存在但 API 看不到）</h3>
          <p v-if="desyncedChannels.length === 0">沒有不同步的頻道，API 與 Takeout 一致。</p>
          <template v-else>
            <div class="resync-note">
              <p>這是 YouTube 端的不同步，API 無法自動修復。請到各頻道在 YouTube 手動再同步：點頻道的「已訂閱」→「取消訂閱」，再點一次「訂閱」。</p>
              <p class="resync-warn">⚠️ 退訂後務必再次訂閱，否則你會真的少掉這個訂閱。</p>
              <p>下方勾選只記錄你的手動處理進度（存在本機、依帳號保留），不會呼叫 API 或修改 YouTube 訂閱。</p>
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

        <section>
          <h3>死頻道（已終止／刪除，API 移除正確）</h3>
          <p v-if="result.dead.length === 0">沒有死頻道。</p>
          <ul v-else>
            <li v-for="channelId in result.dead" :key="channelId">{{ channelId }}</li>
          </ul>
        </section>

        <div class="reconcile-rerun-row">
          <button type="button" class="reconcile-run reconcile-rerun" :disabled="loading" @click="runReconcile">
            {{ loading ? '比對中...' : '重新對帳' }}
          </button>
          <span class="rerun-hint">在 YouTube 退訂再訂後可按此重新比對（YouTube 同步有延遲，數字未立即下降屬正常）</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { apiPost } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { parseTakeoutCsv, type TakeoutChannel } from '@/utils/parseTakeoutCsv'

interface ReconcileResult {
  takeout_count: number
  api_count: number
  missing_count: number
  dead: string[]
  desynced: string[]
}

defineEmits<{ (e: 'close'): void }>()

const toast = useToastStore()
const auth = useAuthStore()
const channels = ref<TakeoutChannel[]>([])
const result = ref<ReconcileResult | null>(null)
const loading = ref(false)
const doneIds = ref<Set<string>>(new Set())

const byId = computed(() => new Map(channels.value.map((channel) => [channel.channel_id, channel])))
const desyncedChannels = computed(() => result.value?.desynced.map((channelId) => {
  return byId.value.get(channelId) ?? { channel_id: channelId, title: channelId, url: youtubeUrl(channelId) }
}) ?? [])
const doneCount = computed(
  () => result.value?.desynced.filter((id) => doneIds.value.has(id)).length ?? 0,
)

function youtubeUrl(channelId: string) {
  return `https://www.youtube.com/channel/${channelId}`
}

function doneKey(channelId: string) {
  return `reconcile-done:${auth.currentAccount}:${channelId}`
}

function loadDone(ids: string[]) {
  const next = new Set<string>()
  for (const id of ids) {
    if (localStorage.getItem(doneKey(id)) === '1') {
      next.add(id)
    }
  }
  doneIds.value = next
}

function isDone(id: string) {
  return doneIds.value.has(id)
}

function toggleDone(id: string) {
  const next = new Set(doneIds.value)
  if (next.has(id)) {
    next.delete(id)
    localStorage.removeItem(doneKey(id))
  } else {
    next.add(id)
    localStorage.setItem(doneKey(id), '1')
  }
  doneIds.value = next
}

function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : ''
    channels.value = parseTakeoutCsv(text)
    result.value = null
    doneIds.value = new Set()
    if (channels.value.length === 0) {
      toast.error('無法從檔案解析出頻道，請確認是 Takeout 的 subscriptions.csv。')
    }
  }
  reader.onerror = () => {
    toast.error('無法讀取所選的 CSV 檔案。')
  }
  reader.readAsText(file)
}

async function runReconcile() {
  if (channels.value.length === 0 || loading.value) return
  loading.value = true
  try {
    result.value = await apiPost<ReconcileResult>('/subscriptions/reconcile', {
      channel_ids: channels.value.map((channel) => channel.channel_id),
    })
    loadDone(result.value.desynced)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.reconcile-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.28);
}

.reconcile-modal {
  width: min(620px, calc(100vw - 2rem));
  max-height: min(760px, calc(100vh - 2rem));
  overflow-y: auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
}

.reconcile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid #eee;
}

.reconcile-head h2 {
  margin: 0;
  font-size: 1rem;
}

.reconcile-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
}

.reconcile-body {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
}

.reconcile-steps {
  margin: 0;
  padding-left: 1.25rem;
  color: #444;
  font-size: 0.9rem;
  line-height: 1.5;
}

.reconcile-ready,
.reconcile-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.reconcile-run {
  padding: 0.4rem 0.75rem;
  border: 1px solid #2ea043;
  border-radius: 4px;
  background: #2ea043;
  color: #fff;
  cursor: pointer;
}

.reconcile-run:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reconcile-summary span {
  padding: 0.25rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.85rem;
}

.resync-note {
  background: #fff8e1;
  border: 1px solid #ffe2a8;
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #5b4a1f;
}

.resync-note p {
  margin: 0.2rem 0;
}

.resync-warn {
  color: #b54708;
  font-weight: 600;
}

.resync-progress {
  color: #444;
}

.resync-done {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-right: 0.6rem;
  font-size: 0.8rem;
  color: #555;
  cursor: pointer;
}

.reconcile-rerun-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  border-top: 1px solid #eee;
  padding-top: 0.8rem;
}

.rerun-hint {
  font-size: 0.78rem;
  color: #888;
}
</style>
