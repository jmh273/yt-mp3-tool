<template>
  <div class="watchlist-panel">
    <input
      v-model="query"
      type="search"
      class="watchlist-search"
      placeholder="搜尋觀察名單..."
      aria-label="搜尋觀察名單"
    />

    <div v-if="watchlist.items.length === 0" class="watchlist-empty">
      還沒加入任何頻道，從訂閱清單或「🔍 同類新頻道」把頻道加進來
    </div>
    <div v-else-if="filteredItems.length === 0" class="watchlist-empty">找不到符合的頻道</div>

    <div
      v-for="item in filteredItems"
      :key="item.channel_id"
      class="watchlist-row"
      @click="$emit('select-channel', item.channel_id)"
    >
      <img :src="item.thumbnail" :alt="item.title" width="32" height="32" />
      <div class="watchlist-info">
        <span class="watchlist-title">{{ item.title }}</span>
      </div>
      <div class="watchlist-actions">
        <button
          class="icon-btn remove-watchlist-btn"
          :disabled="pendingId === item.channel_id"
          :aria-label="`移除 ${item.title}`"
          title="移除"
          @click.stop="watchlist.remove(item.channel_id)"
        >
          ✕
        </button>
        <button
          class="icon-btn promote-watchlist-btn"
          :disabled="pendingId === item.channel_id || isSubscribed(item.channel_id)"
          :aria-label="`訂閱 ${item.title}`"
          :title="isSubscribed(item.channel_id) ? '已訂閱' : '訂閱'"
          @click.stop="promote(item.channel_id)"
        >
          ➕
        </button>
      </div>
    </div>

    <div v-if="toast" class="watchlist-toast" :class="toast.type">{{ toast.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWatchlistStore, type PromotedChannel } from '@/stores/watchlist'

const props = defineProps<{
  subscribedIds?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'select-channel', channelId: string): void
  (e: 'subscribed', channel: PromotedChannel): void
}>()

const watchlist = useWatchlistStore()

function isSubscribed(channelId: string): boolean {
  return props.subscribedIds?.has(channelId) ?? false
}
const query = ref('')
const pendingId = ref('')
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return watchlist.items
  return watchlist.items.filter((item) => item.title.toLowerCase().includes(q))
})

function showToast(text: string, type: 'success' | 'error') {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 3000)
}

async function promote(channelId: string) {
  if (pendingId.value || isSubscribed(channelId)) return
  const title = watchlist.items.find((i) => i.channel_id === channelId)?.title ?? channelId
  pendingId.value = channelId
  try {
    const result = await watchlist.promote(channelId)
    if (result.success) {
      showToast(`已訂閱：${result.channel.title}`, 'success')
      emit('subscribed', result.channel)
    } else if ('duplicate' in result) {
      // 已訂閱（YouTube 回報 subscriptionDuplicate）：中性提示、保留名單項、不重複加入訂閱清單。
      showToast(`「${title}」此帳號已訂閱`, 'success')
    } else {
      // result.error 已含後端「訂閱失敗：」前綴，不再二次前綴。
      showToast(result.error, 'error')
    }
  } finally {
    pendingId.value = ''
  }
}
</script>

<style scoped>
.watchlist-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-height: 0;
}

.watchlist-search {
  padding: 0.4rem 0.7rem;
  font-size: 0.88rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
}

.watchlist-search:focus { border-color: #c00; }

.watchlist-empty {
  padding: 0.8rem 0.5rem;
  color: #777;
  font-size: 0.85rem;
  line-height: 1.5;
}

.watchlist-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}

.watchlist-row:hover { background: #f0f0f0; }
.watchlist-row img { border-radius: 50%; flex-shrink: 0; }

.watchlist-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.watchlist-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watchlist-actions {
  display: inline-flex;
  gap: 0.2rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.watchlist-row:hover .watchlist-actions,
.watchlist-row:focus-within .watchlist-actions {
  opacity: 1;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.65;
  padding: 0.2rem;
  line-height: 1;
}

.icon-btn:hover:not(:disabled) { opacity: 1; }
.icon-btn:disabled { cursor: not-allowed; opacity: 0.3; }
.remove-watchlist-btn:hover:not(:disabled) { color: #d1242f; }
.promote-watchlist-btn:hover:not(:disabled) { color: #2ea043; }

.watchlist-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  font-size: 0.9rem;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.watchlist-toast.success { background: #e6f4ea; color: #2ea043; border: 1px solid #b5e0c2; }
.watchlist-toast.error { background: #fce8e9; color: #d1242f; border: 1px solid #f5b3b6; }
</style>
