<template>
  <div class="selected-panel">
    <div class="header">
      <span>{{ download.selected.length > 0 ? `已選取 ${download.selected.length} 支影片` : '尚未選取影片' }}</span>

      <div class="format-row">
        <label class="field">
          <span class="field-label">格式</span>
          <select class="format-select" v-model="format" :disabled="download.downloading">
            <option value="mp3">MP3</option>
            <option value="mp4">MP4</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">品質</span>
          <select class="quality-select" v-model.number="quality" :disabled="download.downloading">
            <option v-for="q in QUALITY_OPTIONS[format]" :key="q" :value="q">
              {{ q }}{{ format === 'mp3' ? ' kbps' : 'p' }}
            </option>
          </select>
        </label>
      </div>

      <div class="seq-row">
        <label class="seq-checkbox-label">
          <input type="checkbox" v-model="seqEnabled" :disabled="download.downloading" />
          <span>加流水號</span>
        </label>
        <label class="field" v-if="seqEnabled">
          <span class="field-label">起始號</span>
          <input
            class="start-seq-input"
            type="text"
            inputmode="numeric"
            pattern="\d*"
            maxlength="10"
            v-model="startSeqInput"
            :disabled="download.downloading"
          />
        </label>
      </div>
      <p class="seq-warn" v-if="seqEnabled && seqConflict.length > 0">
        ⚠️ 與既有 {{ seqConflict.map(formatPad).join('、') }} 重複
      </p>

      <label class="field">
        <span class="field-label">下載到</span>
        <input
          data-testid="download-target-dir"
          class="target-folder-input"
          type="text"
          v-model="download.targetDirPath"
          :disabled="download.downloading"
        />
      </label>

      <label class="auto-pipeline-label">
        <input data-testid="auto-pipeline" type="checkbox" v-model="download.autoPipeline" :disabled="download.downloading" />
        <span>下載完成後自動正規化並上傳</span>
      </label>
      <small v-if="format === 'mp4'" data-testid="auto-pipeline-mp4-hint" class="hint">
        MP4 會略過音量正規化，下載完成後直接上傳。
      </small>

      <div class="actions">
        <button class="clear" @click="download.clearAll" :disabled="download.downloading || download.selected.length === 0">清除全部</button>
        <button
          class="dl"
          @click="onDownload"
          :disabled="download.downloading || download.selected.length === 0 || startSeqInvalid"
        >
          {{ download.downloading ? '下載中...' : '下載選取影片' }}
        </button>
      </div>
    </div>

    <div v-if="download.downloading" class="progress-list">
      <div v-for="(item, vid) in download.progress" :key="vid" class="progress-item">
        <span class="ptitle" :title="item.title">{{ item.title }}</span>
        <div class="bar-wrap">
          <div class="bar" :style="{ width: item.percent + '%' }" :class="item.status" />
        </div>
        <span class="pstatus">
          {{ statusLabel(item.status) }}
          <span v-if="item.status === 'downloading'">
            {{ item.percent }}% <span v-if="item.speed">({{ item.speed }})</span>
          </span>
        </span>
      </div>
    </div>

    <div v-if="doneCount > 0 && !download.downloading" class="summary">
      下載完成！共 {{ doneCount }} 支<span v-if="errorCount > 0">，{{ errorCount }} 支失敗</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore } from '@/stores/download'
import { joinPath, rolloverDatePrefix, todayYyyymmdd } from '@/utils/dateFolder'

const download = useDownloadStore()

type DownloadFormat = 'mp3' | 'mp4'
const QUALITY_OPTIONS: Record<DownloadFormat, readonly number[]> = {
  mp3: [128, 192, 256, 320],
  mp4: [360, 480, 720, 1080],
} as const
const FORMAT_DEFAULTS: Record<DownloadFormat, number> = { mp3: 192, mp4: 720 }

const format = ref<DownloadFormat>('mp3')
const quality = ref<number>(FORMAT_DEFAULTS.mp3)
watch(format, (f) => {
  quality.value = FORMAT_DEFAULTS[f]
})

const SEQ_STORAGE_KEY = 'yt_mp3_seq_enabled'
const seqEnabled = ref<boolean>(localStorage.getItem(SEQ_STORAGE_KEY) !== 'false')
watch(seqEnabled, (v) => {
  localStorage.setItem(SEQ_STORAGE_KEY, String(v))
})

const startSeqInput = ref('')
const existingSeqs = ref<number[]>([])
const outputPath = ref('')
const START_SEQ_RE = /^\d{1,10}$/

const startSeqInvalid = computed(
  () => seqEnabled.value && startSeqInput.value.length > 0 && !START_SEQ_RE.test(startSeqInput.value),
)

const seqConflict = computed<number[]>(() => {
  if (!seqEnabled.value || !START_SEQ_RE.test(startSeqInput.value)) return []
  const n0 = parseInt(startSeqInput.value, 10)
  const count = download.selected.length
  if (count <= 0) return []
  const range = new Set<number>()
  for (let i = 0; i < count; i++) range.add(n0 + i)
  return existingSeqs.value.filter((n) => range.has(n))
})

function formatPad(n: number): string {
  const width = Math.max(startSeqInput.value.length || 2, String(n).length)
  return String(n).padStart(width, '0')
}

async function fetchNextSeq() {
  try {
    const data = await apiGet<{ next_seq: string; existing: number[] }>('/download/next-seq')
    startSeqInput.value = data.next_seq
    existingSeqs.value = data.existing ?? []
  } catch {
    // 401 / network error: leave inputs untouched
  }
}

function basename(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
}

async function loadSettings() {
  try {
    const s = await apiGet<{ output_path: string }>('/settings')
    outputPath.value = s.output_path
  } catch {
    // ignore
  }
  if (!download.targetDirPath) {
    const base = download.lastWorkDirName
      ? rolloverDatePrefix(download.lastWorkDirName)
      : todayYyyymmdd()
    download.targetDirPath = joinPath(outputPath.value, base)
  }
}

onMounted(() => {
  loadSettings()
  fetchNextSeq()
})

watch(
  () => download.selected.length,
  (n, old) => {
    if (n > 0 && (old ?? 0) === 0) fetchNextSeq()
  },
)

watch(
  () => download.downloading,
  (v, old) => {
    if (old === true && v === false) fetchNextSeq()
  },
)

function onDownload() {
  download.startDownload(format.value, quality.value, {
    seqEnabled: seqEnabled.value,
    startSeq: seqEnabled.value ? startSeqInput.value : null,
    targetDir: basename(download.targetDirPath),
  })
}

const doneCount = computed(() => Object.values(download.progress).filter((i) => i.status === 'done').length)
const errorCount = computed(() => Object.values(download.progress).filter((i) => i.status === 'error').length)

function statusLabel(status: string) {
  return { pending: '等待中', downloading: '下載中', converting: '轉換中', done: '完成', error: '失敗' }[status] ?? status
}
</script>

<style scoped>
.selected-panel {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  box-sizing: border-box;
  min-height: 100%;
}
.header { display: flex; flex-direction: column; gap: 0.8rem; align-items: flex-start; margin-bottom: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.8rem; }
.header > span { font-weight: bold; font-size: 1.1rem; }
.format-row { display: flex; gap: 0.5rem; width: 100%; }
.field { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0; width: 100%; }
.field-label { font-size: 0.72rem; color: #888; font-weight: normal; }
.format-select, .quality-select, .target-folder-input {
  padding: 0.35rem 0.4rem;
  font-size: 0.85rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
}
.format-select:disabled, .quality-select:disabled, .target-folder-input:disabled { opacity: 0.5; cursor: not-allowed; background: #f5f5f5; }
.seq-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.6rem; width: 100%; }
.seq-checkbox-label { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; cursor: pointer; padding-bottom: 0.35rem; }
.auto-pipeline-label { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; cursor: pointer; }
.hint { color: #888; font-size: 0.75rem; font-weight: normal; }
.start-seq-input { width: 5rem; padding: 0.35rem 0.4rem; font-size: 0.85rem; border: 1px solid #ccc; border-radius: 4px; text-align: center; font-variant-numeric: tabular-nums; }
.seq-warn { margin: 0; font-size: 0.78rem; color: #d97706; align-self: stretch; }
.actions { display: flex; gap: 0.5rem; width: 100%; }
.clear { flex: 1; background: transparent; border: 1px solid #888; color: #555; padding: 0.4rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
.dl { flex: 2; background: #ff0000; border: none; color: white; padding: 0.4rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.progress-list { display: flex; flex-direction: column; gap: 1rem; }
.progress-item { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.ptitle { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.bar-wrap { width: 100%; background: #ddd; border-radius: 4px; height: 6px; }
.bar { height: 100%; border-radius: 4px; background: #4caf50; transition: width 0.3s; }
.bar.error { background: #f44336; }
.bar.converting { background: #ff9800; }
.pstatus { font-size: 0.75rem; color: #666; text-align: right; }
.summary { margin-top: 1rem; color: #4caf50; font-size: 0.9rem; font-weight: bold; }
</style>
