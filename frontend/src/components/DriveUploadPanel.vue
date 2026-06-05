<template>
  <div class="upload-panel">
    <label class="field">
      <span class="field-label">本地端目錄</span>
      <DirectoryPicker
        v-model="dirInput"
        :folders="pickerFolders"
        :disabled="drive.status === 'running'"
        @open="loadFolders"
        @pick="(f) => setDir(f.directory)"
      />
    </label>

    <div class="drive-upload">
      <button data-testid="drive-upload-button" class="upload-btn" @click="onUpload" :disabled="drive.status === 'running'">
        {{ drive.status === 'running' ? '上傳中...' : '上傳雲端硬碟' }}
      </button>
    </div>

    <p v-if="drive.error" class="drive-error">{{ drive.error }}</p>
    <button
      v-if="drive.reauthRequired"
      data-testid="drive-reauth-button"
      class="reauth-btn"
      @click="reauthDrive"
      :disabled="reauthInProgress"
    >
      {{ reauthInProgress ? '已開啟瀏覽器，完成授權後再按上傳' : '重新登入以授權 Drive' }}
    </button>

    <div v-if="Object.keys(drive.progress).length > 0" class="upload-progress">
      <div v-for="item in drive.progress" :key="item.filename" class="upload-item">
        <span>{{ item.filename }}</span>
        <span class="badge" :class="`badge-${item.status}`">{{ uploadStatusLabel(item.status) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore } from '@/stores/download'
import { useDriveUploadStore } from '@/stores/driveUpload'
import { useAuthStore } from '@/stores/auth'
import { todayYyyymmdd, joinPath } from '@/utils/dateFolder'
import { useWorkDir } from '@/composables/useWorkDir'
import DirectoryPicker, { type PickerFolder } from '@/components/DirectoryPicker.vue'

const download = useDownloadStore()
const drive = useDriveUploadStore()
const auth = useAuthStore()
const reauthInProgress = ref(false)

const outputPath = ref('')

function defaultDir(): string {
  return joinPath(outputPath.value, download.lastWorkDirName || todayYyyymmdd())
}

const { dirInput, applyDefault, setDir } = useWorkDir({
  defaultDir,
  watchSource: () => download.lastWorkDirName,
})

// 將 store 的資料夾清單映成 picker 格式：已上傳 → badge
const pickerFolders = computed<PickerFolder[]>(() =>
  drive.folders.map((f) => ({
    name: f.name,
    directory: f.directory,
    badge: f.uploaded ? '已上傳' : undefined,
  })),
)

async function loadFolders() {
  await drive.loadFolders()
}

onMounted(async () => {
  try {
    const s = await apiGet<{ output_path: string }>('/settings')
    outputPath.value = s.output_path
  } catch {
    // ignore — 使用者仍可手動輸入
  }
  applyDefault()
})

async function onUpload() {
  if (!dirInput.value) dirInput.value = defaultDir()
  await drive.startUpload(dirInput.value)
}

// 缺 drive.file scope 時的引導：觸發既有 OAuth 流程重新授權（新 token 會含 drive.file），
// 完成後使用者再按一次上傳即可。
async function reauthDrive() {
  reauthInProgress.value = true
  try {
    await auth.login()
  } catch {
    // 開啟瀏覽器失敗：保留提示，使用者可重試
  }
}

function uploadStatusLabel(status: string) {
  return { pending: '等待中', uploading: '上傳中', skipped: '已存在', done: '完成', error: '失敗' }[status] ?? status
}
</script>

<style scoped>
.upload-panel {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1rem;
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
}
.field { display: flex; flex-direction: column; gap: 0.2rem; width: 100%; }
.field-label { font-size: 0.72rem; color: #888; font-weight: normal; }
.drive-upload { display: flex; flex-wrap: wrap; gap: 0.5rem; width: 100%; }
.upload-btn { flex: 2; background: #ff0000; border: none; color: white; padding: 0.4rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.drive-error { width: 100%; color: #c00; margin: 0; font-size: 0.82rem; }
.reauth-btn { width: 100%; background: #1565c0; border: none; color: white; padding: 0.4rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; }
.upload-progress { width: 100%; display: flex; flex-direction: column; gap: 1rem; }
.upload-item { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.badge { font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 10px; background: #eee; color: #555; align-self: flex-start; }
.badge-done { background: #e8f5e9; color: #2e7d32; }
.badge-skipped { background: #e1f5fe; color: #0277bd; }
.badge-error { background: #ffebee; color: #c62828; }
</style>
