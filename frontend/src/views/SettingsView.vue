<template>
  <div class="settings-page">
    <header>
      <router-link to="/" class="back">← 返回</router-link>
      <h1>設定</h1>
    </header>

    <div class="tab-bar">
      <button
        class="tab"
        :class="{ active: activeTab === 'settings' }"
        data-testid="tab-settings"
        @click="activeTab = 'settings'"
      >
        設定
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'health' }"
        data-testid="tab-health"
        @click="activeTab = 'health'"
      >
        訂閱頻道健檢
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'ytdlp' }"
        data-testid="tab-ytdlp"
        @click="activeTab = 'ytdlp'"
      >
        下載元件
      </button>
    </div>

    <div v-if="activeTab === 'settings'" class="form">
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
        同類新頻道關鍵字數量
        <input v-model.number="discoveryKeywordTopN" type="number" min="1" max="100" />
        <small class="hint">僅在重新分析同類新頻道後生效；每多 1 個關鍵字，重新分析時約多一次 search.list（約 100 配額）。</small>
      </label>
      <label>
        最新影片最短長度 (分鐘)
        <input v-model.number="minDuration" type="number" min="0" />
      </label>
      <label>
        最新影片最長長度 (分鐘)
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
      <label>
        Drive 根目錄
        <input data-testid="drive-root-folder" v-model="driveRootFolder" type="text" placeholder="YT-MP3" />
        <small class="hint">上傳時各批資料夾會鏡像到此 Drive 資料夾下。舊檔不會自動清理；請勿在 Drive 手動先建此資料夾（交由程式建立）。</small>
      </label>
      <label>
        同時處理數量
        <input data-testid="download-concurrency" v-model.number="concurrency" type="number" min="1" max="8" />
        <small class="hint">套用於下載與音量正規化；建議 SSD 使用 3，較慢硬碟可調低。</small>
      </label>
      <label>
        Drive 上傳同時處理數量
        <input data-testid="drive-upload-concurrency" v-model.number="driveUploadConcurrency" type="number" min="1" max="8" />
        <small class="hint">Drive 上傳同時處理數量；建議 3，網路或 API 較不穩時可調低。</small>
      </label>
      <button data-testid="save-settings" @click="save" :disabled="saving || !!latestHoursError || !!normalizeTargetDbError">
        {{ saving ? '儲存中...' : '儲存' }}
      </button>
      <p v-if="saved" class="ok">已儲存！</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <section v-if="activeTab === 'health'" class="health-check">
      <p class="hint">
        檢查所有訂閱頻道是否還能抓到影片，列出「無上傳／已刪除／權限」等問題頻道供你直接退訂。
        每個頻道約消耗 1 單位配額（與「最新影片」相近），訂閱較多時請斟酌使用。
      </p>
      <button class="check-btn" data-testid="run-health-check" @click="runHealthCheck" :disabled="checking">
        {{ checking ? '檢查中…' : '檢查訂閱頻道' }}
      </button>
      <p v-if="healthError" class="error">{{ healthError }}</p>

      <template v-if="hasChecked && !checking">
        <p v-if="problems.length === 0" class="ok" data-testid="health-ok">
          ✓ 已檢查 {{ checked }} 個頻道，全部正常。
        </p>
        <template v-else>
          <p class="health-summary">
            已檢查 {{ checked }} 個頻道，發現 {{ problems.length }} 個無法播放的頻道：
          </p>
          <ul class="problem-list">
            <li v-for="p in problems" :key="p.subscription_id" class="problem-row" data-testid="problem-row">
              <img v-if="p.thumbnail" :src="p.thumbnail" alt="" class="thumb" />
              <div v-else class="thumb thumb-placeholder"></div>
              <div class="problem-info">
                <span class="problem-title">{{ p.title || p.channel_id }}</span>
                <span class="reason-badge" :class="'reason-' + p.reason">{{ reasonLabel(p.reason) }}</span>
              </div>
              <button
                class="unsub-btn"
                data-testid="unsub-btn"
                @click="unsubscribe(p)"
                :disabled="p.removing"
              >
                {{ p.removing ? '退訂中…' : '退訂' }}
              </button>
            </li>
          </ul>
        </template>
      </template>
    </section>

    <section v-if="activeTab === 'ytdlp'" class="ytdlp-panel">
      <p class="hint">
        yt-dlp 依賴 YouTube 的內部實作，YouTube 一改動就可能導致下載失敗。
        這裡可以在不等新版程式的情況下自行更新下載元件。
      </p>

      <dl class="ytdlp-versions" data-testid="ytdlp-versions">
        <div><dt>yt-dlp</dt><dd>{{ ytdlpInfo?.yt_dlp ?? '—' }}</dd></div>
        <div>
          <dt>EJS solver</dt>
          <dd :class="{ missing: ytdlpInfo && ytdlpInfo.yt_dlp_ejs_usable === false }">
            <template v-if="ytdlpInfo && ytdlpInfo.yt_dlp_ejs_usable === false">
              無法載入 — 下載很可能失敗
            </template>
            <template v-else>{{ ytdlpInfo?.yt_dlp_ejs ?? '—' }}</template>
          </dd>
        </div>
        <div>
          <dt>目前來源</dt>
          <dd>
            <span class="src" :class="ytdlpInfo?.source">
              {{ ytdlpInfo?.source === 'managed' ? '受管版本（可回退）' : '內建版本' }}
            </span>
          </dd>
        </div>
        <div>
          <dt>JS runtime</dt>
          <dd :class="{ missing: !ytdlpInfo?.js_runtime }">
            {{ ytdlpInfo?.js_runtime ?? '未偵測到 — 下載很可能失敗' }}
          </dd>
        </div>
      </dl>

      <div class="ytdlp-actions">
        <button class="check-btn" data-testid="ytdlp-check" @click="checkLatest" :disabled="ytdlpBusy">
          {{ ytdlpBusy ? '處理中…' : '查詢最新版' }}
        </button>
        <button
          v-if="ytdlpInfo?.source === 'managed'"
          class="revert-btn"
          data-testid="ytdlp-revert"
          @click="revertYtdlp"
          :disabled="ytdlpBusy"
        >
          回退為內建版本
        </button>
      </div>

      <p v-if="latestInfo && !latestInfo.available" class="error" data-testid="ytdlp-offline">
        {{ latestInfo.error }}
      </p>
      <template v-else-if="latestInfo?.available">
        <p class="latest-line" data-testid="ytdlp-latest">
          上游最新：yt-dlp {{ latestInfo.versions.yt_dlp }} · EJS {{ latestInfo.versions.yt_dlp_ejs }}
        </p>
        <button class="check-btn" data-testid="ytdlp-update" @click="updateYtdlp" :disabled="ytdlpBusy">
          {{ ytdlpBusy ? '更新中…' : '更新下載元件' }}
        </button>
      </template>

      <p v-if="ytdlpError" class="error" data-testid="ytdlp-error">{{ ytdlpError }}</p>
      <p v-if="ytdlpNotice" class="ok" data-testid="ytdlp-notice">{{ ytdlpNotice }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '@/api'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const activeTab = ref<'settings' | 'health' | 'ytdlp'>('settings')

interface ProblemChannel {
  channel_id: string
  subscription_id: string
  title: string
  thumbnail: string
  reason: string
  detail: string
  removing?: boolean
}

const checking = ref(false)
const hasChecked = ref(false)
const checked = ref(0)
const problems = ref<ProblemChannel[]>([])
const healthError = ref('')

// ── 下載元件（yt-dlp）版本管理 ────────────────────────────────────────────────
interface YtdlpInfo {
  yt_dlp: string
  yt_dlp_ejs: string | null
  yt_dlp_ejs_usable?: boolean
  source: 'managed' | 'bundled'
  js_runtime: string | null
}
interface LatestInfo {
  available: boolean
  error?: string
  versions?: { yt_dlp: string; yt_dlp_ejs: string }
}

const ytdlpInfo = ref<YtdlpInfo | null>(null)
const latestInfo = ref<LatestInfo | null>(null)
const ytdlpBusy = ref(false)
const ytdlpError = ref('')
const ytdlpNotice = ref('')

async function loadYtdlpInfo() {
  try {
    ytdlpInfo.value = await apiGet<YtdlpInfo>('/ytdlp/version')
  } catch {
    ytdlpInfo.value = null
  }
}

async function checkLatest() {
  ytdlpBusy.value = true
  ytdlpError.value = ''
  ytdlpNotice.value = ''
  try {
    latestInfo.value = await apiGet<LatestInfo>('/ytdlp/latest')
  } catch (e: any) {
    // 離線時降級為「無法查詢」，維持目前版本可用
    latestInfo.value = { available: false, error: '無法查詢上游版本，維持目前版本。' }
  } finally {
    ytdlpBusy.value = false
  }
}

async function updateYtdlp() {
  ytdlpBusy.value = true
  ytdlpError.value = ''
  ytdlpNotice.value = ''
  try {
    const r = await apiPost<{ installed: Record<string, string>; message: string }>(
      '/ytdlp/update', {},
    )
    ytdlpNotice.value = r.message
    await loadYtdlpInfo()
  } catch (e: any) {
    ytdlpError.value = e?.message || '更新失敗，維持目前版本。'
  } finally {
    ytdlpBusy.value = false
  }
}

async function revertYtdlp() {
  ytdlpBusy.value = true
  ytdlpError.value = ''
  ytdlpNotice.value = ''
  try {
    const r = await apiPost<{ message: string }>('/ytdlp/revert', {})
    ytdlpNotice.value = r.message
    await loadYtdlpInfo()
  } catch (e: any) {
    ytdlpError.value = e?.message || '回退失敗。'
  } finally {
    ytdlpBusy.value = false
  }
}

const REASON_LABELS: Record<string, string> = {
  no_uploads: '無上傳影片',
  deleted: '已刪除或終止',
  forbidden: '無法存取（權限）',
  unknown: '未知錯誤',
}

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

async function runHealthCheck() {
  checking.value = true
  healthError.value = ''
  try {
    const data = await apiGet<{ checked: number; problems: ProblemChannel[] }>(
      '/subscriptions/health-check',
    )
    checked.value = data.checked
    problems.value = data.problems.map((p) => ({ ...p, removing: false }))
    hasChecked.value = true
  } catch (e: any) {
    healthError.value = e.message
  } finally {
    checking.value = false
  }
}

async function unsubscribe(p: ProblemChannel) {
  if (!window.confirm(`確定要退訂「${p.title || p.channel_id}」嗎？`)) return
  p.removing = true
  try {
    await apiDelete(`/subscriptions/${p.subscription_id}`)
    problems.value = problems.value.filter((x) => x.subscription_id !== p.subscription_id)
    toast.success(`已退訂「${p.title || p.channel_id}」`)
  } catch (e: any) {
    p.removing = false
    toast.error(`退訂失敗：${e.message}`)
  }
}

const outputPath = ref('')
const videosPerChannel = ref(5)
const latestHours = ref(24)
const discoveryKeywordTopN = ref(8)
const minDuration = ref(3)
const maxDuration = ref(60)
const normalizeTargetDb = ref(89)
const driveRootFolder = ref('YT-MP3')
const concurrency = ref(3)
const driveUploadConcurrency = ref(3)
const latestHoursError = ref('')
const normalizeTargetDbError = ref('')
const saving = ref(false)
const saved = ref(false)
const error = ref('')

onMounted(async () => {
  loadYtdlpInfo()
  const data = await apiGet<{
    output_path: string
    videos_per_channel: number
    latest_hours: number
    discovery_keyword_top_n: number
    min_duration_minutes: number
    max_duration_minutes: number
    normalize_target_db: number
    drive_root_folder: string
    download_concurrency: number
    drive_upload_concurrency: number
  }>('/settings')
  outputPath.value = data.output_path
  videosPerChannel.value = data.videos_per_channel
  latestHours.value = data.latest_hours ?? 24
  discoveryKeywordTopN.value = data.discovery_keyword_top_n ?? 8
  minDuration.value = data.min_duration_minutes ?? 3
  maxDuration.value = data.max_duration_minutes ?? 60
  normalizeTargetDb.value = data.normalize_target_db ?? 89
  driveRootFolder.value = data.drive_root_folder ?? 'YT-MP3'
  concurrency.value = data.download_concurrency ?? 3
  driveUploadConcurrency.value = data.drive_upload_concurrency ?? 3
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
      discovery_keyword_top_n: discoveryKeywordTopN.value,
      min_duration_minutes: minDuration.value,
      max_duration_minutes: maxDuration.value,
      normalize_target_db: normalizeTargetDb.value,
      drive_root_folder: driveRootFolder.value,
      download_concurrency: concurrency.value,
      drive_upload_concurrency: driveUploadConcurrency.value,
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

.tab-bar { display: flex; border-bottom: 1px solid #ddd; margin-bottom: 1.5rem; }
.tab {
  flex: 1;
  padding: 0.6rem 0.4rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.95rem;
  color: #555;
  border-bottom: 2px solid transparent;
  align-self: stretch;
  border-radius: 0;
}
.tab:hover { background: #f5f5f5; }
.tab.active { color: #c00; border-bottom-color: #c00; font-weight: 600; }

.health-check { margin-top: 0; }
.ytdlp-panel { margin-top: 0; }
.ytdlp-versions { margin: 0.8rem 0; display: flex; flex-direction: column; gap: 0.35rem; }
.ytdlp-versions > div { display: flex; gap: 0.6rem; font-size: 0.85rem; }
.ytdlp-versions dt { color: #666; min-width: 7rem; margin: 0; }
.ytdlp-versions dd { margin: 0; font-variant-numeric: tabular-nums; word-break: break-all; }
.ytdlp-versions dd.missing { color: #c00; }
.src.managed { color: #1565c0; }
.src.bundled { color: #666; }
.ytdlp-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.revert-btn { padding: 0.4rem 1rem; background: #fff; color: #b25e00; border: 1px solid #ffd599; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
.latest-line { font-size: 0.85rem; color: #333; margin: 0.6rem 0 0.4rem; }
.check-btn { padding: 0.6rem 1.5rem; background: #ff0000; color: white; border: none; border-radius: 4px; cursor: pointer; }
.check-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.health-summary { margin: 1rem 0 0.5rem; font-weight: 500; }
.problem-list { list-style: none; padding: 0; margin: 0.5rem 0 0; display: flex; flex-direction: column; gap: 0.5rem; }
.problem-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; border: 1px solid #eee; border-radius: 6px; }
.thumb { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.thumb-placeholder { background: #ddd; }
.problem-info { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 0; }
.problem-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reason-badge { align-self: flex-start; font-size: 0.72rem; padding: 0.1rem 0.5rem; border-radius: 999px; color: #fff; }
.reason-no_uploads { background: #b8860b; }
.reason-deleted { background: #c0392b; }
.reason-forbidden { background: #8e44ad; }
.reason-unknown { background: #7f8c8d; }
.unsub-btn { padding: 0.4rem 1rem; background: #555; color: #fff; border: none; border-radius: 4px; cursor: pointer; flex-shrink: 0; }
.unsub-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
