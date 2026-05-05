<template>
  <div class="selected-panel" v-if="download.selected.length > 0 || download.downloading">
    <div class="header">
      <span>已選取 {{ download.selected.length }} 支影片</span>
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
      <div class="actions">
        <button class="clear" @click="download.clearAll" :disabled="download.downloading">清除全部</button>
        <button class="dl" @click="onDownload" :disabled="download.downloading || download.selected.length === 0">
          {{ download.downloading ? '下載中...' : '下載選取影片' }}
        </button>
      </div>
    </div>

    <div v-if="download.downloading" class="progress-list">
      <div v-for="(item, vid) in download.progress" :key="vid" class="progress-item">
        <span class="ptitle">{{ item.title }}</span>
        <div class="bar-wrap">
          <div
            class="bar"
            :style="{ width: item.percent + '%' }"
            :class="item.status"
          />
        </div>
        <span class="pstatus">
          {{ statusLabel(item.status) }}
          <span v-if="item.status === 'downloading'">{{ item.percent }}% <span v-if="item.speed">({{ item.speed }})</span></span>
        </span>
      </div>
    </div>

    <div v-if="doneCount > 0 && !download.downloading" class="summary">
      下載完成！共 {{ doneCount }} 支 <span v-if="errorCount > 0">，{{ errorCount }} 支失敗</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDownloadStore } from '@/stores/download'

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

function onDownload() {
  download.startDownload(format.value, quality.value)
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
.field { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0; }
.field-label { font-size: 0.72rem; color: #888; font-weight: normal; }
.format-select, .quality-select {
  padding: 0.35rem 0.4rem;
  font-size: 0.85rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.format-select:disabled, .quality-select:disabled { opacity: 0.5; cursor: not-allowed; background: #f5f5f5; }
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
