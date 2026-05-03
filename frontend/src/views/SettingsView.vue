<template>
  <div class="settings-page">
    <header>
      <router-link to="/" class="back">← 返回</router-link>
      <h1>設定</h1>
    </header>

    <div class="form">
      <label>
        MP3 輸出資料夾
        <input v-model="outputPath" type="text" placeholder="例：C:\Users\你的名字\Music\YT-MP3" />
      </label>
      <label>
        每頻道顯示影片數
        <input v-model.number="videosPerChannel" type="number" min="1" max="20" />
      </label>
      <label>
        最新影片時間範圍（小時）
        <input
          v-model.number="latestHours"
          type="number"
          min="1"
          max="168"
          @input="validateLatestHours"
        />
        <span v-if="latestHoursError" class="field-error">{{ latestHoursError }}</span>
      </label>
      <label>
        最短影片長度 (分鐘)
        <input v-model.number="minDuration" type="number" min="0" />
      </label>
      <label>
        最長影片長度 (分鐘)
        <input v-model.number="maxDuration" type="number" min="1" />
      </label>
      <label>
        目標響度（dB SPL）
        <input
          v-model.number="normalizeTargetDb"
          type="number"
          step="0.5"
          min="80"
          max="100"
          @input="validateNormalizeTargetDb"
        />
        <small class="hint">89 = mp3gain 預設；接近 YouTube 響度建議 92–93</small>
        <span v-if="normalizeTargetDbError" class="field-error">{{ normalizeTargetDbError }}</span>
      </label>
      <button @click="save" :disabled="saving || !!latestHoursError || !!normalizeTargetDbError">
        {{ saving ? '儲存中...' : '儲存' }}
      </button>
      <p v-if="saved" class="ok">已儲存！</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiGet, apiPut } from '@/api'

const outputPath = ref('')
const videosPerChannel = ref(5)
const latestHours = ref(24)
const minDuration = ref(3)
const maxDuration = ref(60)
const normalizeTargetDb = ref(89)
const latestHoursError = ref('')
const normalizeTargetDbError = ref('')
const saving = ref(false)
const saved = ref(false)
const error = ref('')

onMounted(async () => {
  const data = await apiGet<{
    output_path: string
    videos_per_channel: number
    latest_hours: number
    min_duration_minutes: number
    max_duration_minutes: number
    normalize_target_db: number
  }>('/settings')
  outputPath.value = data.output_path
  videosPerChannel.value = data.videos_per_channel
  latestHours.value = data.latest_hours ?? 24
  minDuration.value = data.min_duration_minutes ?? 3
  maxDuration.value = data.max_duration_minutes ?? 60
  normalizeTargetDb.value = data.normalize_target_db ?? 89
})

function validateLatestHours() {
  const v = latestHours.value
  if (!Number.isInteger(v) || v < 1 || v > 168) {
    latestHoursError.value = '請輸入 1 到 168 之間的整數'
  } else {
    latestHoursError.value = ''
  }
}

function validateNormalizeTargetDb() {
  const v = normalizeTargetDb.value
  if (typeof v !== 'number' || Number.isNaN(v) || v < 80 || v > 100) {
    normalizeTargetDbError.value = '請輸入 80 到 100 之間的數值'
  } else {
    normalizeTargetDbError.value = ''
  }
}

async function save() {
  validateLatestHours()
  validateNormalizeTargetDb()
  if (latestHoursError.value || normalizeTargetDbError.value) return
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    await apiPut('/settings', {
      output_path: outputPath.value,
      videos_per_channel: videosPerChannel.value,
      latest_hours: latestHours.value,
      min_duration_minutes: minDuration.value,
      max_duration_minutes: maxDuration.value,
      normalize_target_db: normalizeTargetDb.value,
    })
    saved.value = true
  } catch (e: any) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.settings-page { max-width: 600px; margin: 0 auto; padding: 1.5rem; }
header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
h1 { margin: 0; }
.back { text-decoration: none; color: #555; }
.form { display: flex; flex-direction: column; gap: 1.2rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 500; }
input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
button { padding: 0.6rem 1.5rem; background: #ff0000; color: white; border: none; border-radius: 4px; cursor: pointer; align-self: flex-start; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.ok { color: green; }
.error { color: red; }
.field-error { color: red; font-size: 0.82rem; font-weight: normal; }
.hint { color: #888; font-size: 0.75rem; font-weight: normal; }
</style>
