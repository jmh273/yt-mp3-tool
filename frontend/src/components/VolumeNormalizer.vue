<template>
  <div class="normalizer">
    <div class="dir-row">
      <input
        v-model="dirInput"
        type="text"
        class="dir-input"
        placeholder="MP3 目錄路徑"
        :disabled="store.status === 'running'"
      />
      <button
        class="load-btn"
        @click="onLoad"
        :disabled="!dirInput || store.status === 'loading' || store.status === 'running'"
      >
        {{ store.status === 'loading' ? '載入中...' : '載入' }}
      </button>
    </div>

    <div class="target-row">
      <label class="target-label">
        本次目標 (dB)
        <input
          v-model.number="store.targetDb"
          type="number"
          step="0.5"
          min="80"
          max="100"
          class="target-input"
          :disabled="store.status === 'running'"
        />
      </label>
      <span class="target-hint">89 預設；YouTube 響度 92–93</span>
    </div>

    <p v-if="store.error" class="error">{{ store.error }}</p>

    <div v-if="store.directory && store.files.length === 0 && store.status !== 'loading'" class="empty">
      此目錄沒有 MP3 檔案
    </div>

    <div v-if="renameNeededCount > 0" class="rename-row">
      <button
        class="rename-btn"
        @click="store.renameUnsafe"
        :disabled="store.status === 'running'"
      >
        ⚠ 重新命名 {{ renameNeededCount }} 個含特殊字元的檔案
      </button>
      <small class="rename-hint">mp3gain 對全形標點/emoji 會失敗，先 rename 才能正規化（會記錄到 _rename_log.json）</small>
    </div>

    <div v-if="store.files.length > 0" class="action-row">
      <p class="warning">⚠ 將直接修改原檔的 mp3gain frame header（無損可還原，無重編碼）</p>
      <button
        class="start-btn"
        @click="store.startBatch"
        :disabled="store.status === 'running'"
      >
        {{ store.status === 'running' ? '正規化中...' : '開始正規化' }}
      </button>
    </div>

    <div v-if="store.files.length > 0" class="file-list">
      <div v-for="f in store.files" :key="f.filename" class="file-item">
        <div class="row1">
          <span class="fname" :class="{ unsafe: f.needs_rename }">
            <span v-if="f.needs_rename" class="warn-icon" title="檔名含 mp3gain 不支援字元">⚠</span>
            {{ f.filename }}
          </span>
          <span class="badge" :class="badgeClass(itemStatus(f.filename))">
            {{ statusLabel(itemStatus(f.filename)) }}
          </span>
        </div>
        <div v-if="store.progress[f.filename]" class="row2">
          <span class="lufs" v-if="store.progress[f.filename]!.measured_db != null">
            {{ store.progress[f.filename]!.measured_db!.toFixed(1) }}
            →
            {{ store.progress[f.filename]!.target_db.toFixed(1) }}
            dB
            <span v-if="store.progress[f.filename]!.recommended_db_change != null" class="delta">
              ({{ formatDelta(store.progress[f.filename]!.recommended_db_change!) }})
            </span>
          </span>
        </div>
        <p v-if="store.progress[f.filename]?.error" class="item-error">
          {{ store.progress[f.filename]!.error }}
        </p>
      </div>
    </div>

    <div v-if="store.status === 'done' && store.files.length > 0" class="summary">
      完成 {{ counts.done }} · 已符合 {{ counts.skipped }} · 失敗 {{ counts.error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiGet } from '@/api'
import { useNormalizeStore, type NormalizeProgressItem } from '@/stores/normalize'

const store = useNormalizeStore()
const dirInput = ref('')

function todayYyyymmdd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function joinPath(base: string, sub: string): string {
  if (!base) return sub
  const sep = base.includes('\\') ? '\\' : '/'
  const trimmed = base.replace(/[\\/]+$/, '')
  return `${trimmed}${sep}${sub}`
}

onMounted(async () => {
  if (store.directory) {
    dirInput.value = store.directory
    return
  }
  try {
    const s = await apiGet<{ output_path: string; normalize_target_db: number }>('/settings')
    dirInput.value = joinPath(s.output_path, todayYyyymmdd())
    if (s.normalize_target_db != null) {
      store.targetDb = s.normalize_target_db
    }
  } catch {
    // 略過 — 使用者仍可手動輸入
  }
})

async function onLoad() {
  await store.loadDirectory(dirInput.value)
}

function itemStatus(filename: string): NormalizeProgressItem['status'] {
  return store.progress[filename]?.status ?? 'pending'
}

function statusLabel(s: NormalizeProgressItem['status']): string {
  return ({
    pending: '等待中',
    measuring: '量測中',
    normalizing: '套用中',
    skipped: '已符合',
    done: '完成',
    error: '失敗',
  } as const)[s]
}

function badgeClass(s: NormalizeProgressItem['status']): string {
  return `badge-${s}`
}

function formatDelta(d: number): string {
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(1)} dB`
}

const renameNeededCount = computed(() =>
  store.files.filter((f) => f.needs_rename).length,
)

const counts = computed(() => {
  const result = { done: 0, skipped: 0, error: 0 }
  for (const item of Object.values(store.progress)) {
    if (item.status === 'done') result.done++
    else if (item.status === 'skipped') result.skipped++
    else if (item.status === 'error') result.error++
  }
  return result
})
</script>

<style scoped>
.normalizer {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
}
.dir-row { display: flex; gap: 0.4rem; }
.dir-input {
  flex: 1; padding: 0.4rem 0.6rem; font-size: 0.85rem;
  border: 1px solid #ccc; border-radius: 4px; min-width: 0;
}
.load-btn {
  background: #fff; border: 1px solid #888; border-radius: 4px;
  padding: 0.4rem 0.8rem; cursor: pointer; font-size: 0.85rem;
}
.load-btn:disabled, .start-btn:disabled, .rename-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.target-row { display: flex; flex-direction: column; gap: 0.2rem; }
.target-label {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.82rem; color: #444;
}
.target-input {
  width: 80px; padding: 0.3rem 0.5rem; font-size: 0.85rem;
  border: 1px solid #ccc; border-radius: 4px;
}
.target-hint { font-size: 0.7rem; color: #888; }

.error { color: #c00; font-size: 0.85rem; margin: 0; }
.empty { color: #888; font-size: 0.9rem; text-align: center; padding: 1rem; }

.rename-row {
  display: flex; flex-direction: column; gap: 0.3rem;
  background: #fff8e1; border: 1px solid #ffd54f; border-radius: 4px;
  padding: 0.6rem;
}
.rename-btn {
  background: #ffa726; color: white; border: none; border-radius: 4px;
  padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.83rem; font-weight: 500;
}
.rename-hint { color: #6d4c41; font-size: 0.72rem; }

.action-row {
  display: flex; flex-direction: column; gap: 0.4rem;
  border-bottom: 1px solid #ddd; padding-bottom: 0.6rem;
}
.warning { color: #b35900; font-size: 0.78rem; margin: 0; }
.start-btn {
  background: #ff0000; color: white; border: none; border-radius: 4px;
  padding: 0.5rem; cursor: pointer; font-size: 0.9rem; font-weight: bold;
}

.file-list { display: flex; flex-direction: column; gap: 0.6rem; }
.file-item { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.82rem; }
.row1 { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
.fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-weight: 500; }
.fname.unsafe { color: #b35900; }
.warn-icon { font-size: 0.85em; }
.badge {
  font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 10px;
  flex-shrink: 0; white-space: nowrap;
}
.badge-pending { background: #eee; color: #666; }
.badge-measuring { background: #e3f2fd; color: #1565c0; }
.badge-normalizing { background: #fff3e0; color: #e65100; }
.badge-skipped { background: #e1f5fe; color: #0277bd; border: 1px solid #4fc3f7; }
.badge-done { background: #e8f5e9; color: #2e7d32; }
.badge-error { background: #ffebee; color: #c62828; }

.row2 { font-size: 0.75rem; color: #666; }
.lufs { white-space: nowrap; }
.delta { color: #444; font-weight: 500; }
.item-error { color: #c00; font-size: 0.74rem; margin: 0; }

.summary {
  margin-top: 0.5rem; padding-top: 0.5rem;
  border-top: 1px solid #ddd; font-size: 0.85rem; font-weight: bold;
  color: #2e7d32;
}
</style>
