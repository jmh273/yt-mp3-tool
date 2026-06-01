<template>
  <div class="upload-panel">
    <label class="field">
      <span class="field-label">本地端目錄</span>
      <input
        data-testid="drive-upload-dir"
        class="dir-input"
        type="text"
        v-model="dirInput"
        :disabled="drive.status === 'running'"
      />
    </label>

    <div class="drive-upload">
      <button data-testid="drive-upload-button" class="upload-btn" @click="onUpload" :disabled="drive.status === 'running'">
        {{ drive.status === 'running' ? '上傳中...' : '上傳雲端硬碟' }}
      </button>
      <button class="choose-btn" @click="openFolderPicker">選擇資料夾</button>
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

    <div v-if="showFolderPicker" class="modal-backdrop">
      <div class="folder-modal">
        <div class="modal-head">
          <strong>選擇要上傳的資料夾</strong>
          <button @click="showFolderPicker = false">✕</button>
        </div>
        <button v-for="folder in drive.folders" :key="folder.directory" class="folder-choice" @click="chooseFolder(folder)">
          <span>{{ folder.name }}</span>
          <span v-if="folder.uploaded" class="uploaded-mark">已上傳</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore } from '@/stores/download'
import { useDriveUploadStore, type DriveUploadFolder } from '@/stores/driveUpload'
import { useAuthStore } from '@/stores/auth'

const download = useDownloadStore()
const drive = useDriveUploadStore()
const auth = useAuthStore()
const reauthInProgress = ref(false)

const outputPath = ref('')
const dirInput = ref('')
const dirEdited = ref(false)
const showFolderPicker = ref(false)

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
  return `${base.replace(/[\\/]+$/, '')}${sep}${sub}`
}

function defaultDir(): string {
  return joinPath(outputPath.value, download.lastWorkDirName || todayYyyymmdd())
}

async function loadSettings() {
  try {
    const s = await apiGet<{ output_path: string }>('/settings')
    outputPath.value = s.output_path
  } catch {
    // ignore — 使用者仍可手動輸入
  }
  if (!dirEdited.value) dirInput.value = defaultDir()
}

onMounted(loadSettings)

// 下載完成後 store 會更新 lastWorkDirName，若使用者尚未手動修改則同步本地端目錄
watch(
  () => download.lastWorkDirName,
  () => {
    if (!dirEdited.value) dirInput.value = defaultDir()
  },
)

watch(dirInput, (v) => {
  if (v !== defaultDir()) dirEdited.value = true
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

async function openFolderPicker() {
  await drive.loadFolders()
  showFolderPicker.value = true
}

function chooseFolder(folder: DriveUploadFolder) {
  dirInput.value = folder.directory
  dirEdited.value = true
  showFolderPicker.value = false
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
.dir-input {
  padding: 0.4rem 0.6rem; font-size: 0.85rem;
  border: 1px solid #ccc; border-radius: 4px; min-width: 0;
}
.dir-input:disabled { opacity: 0.5; cursor: not-allowed; background: #f5f5f5; }
.drive-upload { display: flex; flex-wrap: wrap; gap: 0.5rem; width: 100%; }
.upload-btn { flex: 2; background: #ff0000; border: none; color: white; padding: 0.4rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; }
.choose-btn { flex: 1; background: white; border: 1px solid #888; color: #555; padding: 0.4rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.drive-error { width: 100%; color: #c00; margin: 0; font-size: 0.82rem; }
.reauth-btn { width: 100%; background: #1565c0; border: none; color: white; padding: 0.4rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; }
.upload-progress { width: 100%; display: flex; flex-direction: column; gap: 1rem; }
.upload-item { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.badge { font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 10px; background: #eee; color: #555; align-self: flex-start; }
.badge-done { background: #e8f5e9; color: #2e7d32; }
.badge-skipped { background: #e1f5fe; color: #0277bd; }
.badge-error { background: #ffebee; color: #c62828; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center; z-index: 20; }
.folder-modal { width: min(360px, calc(100vw - 2rem)); max-height: 70vh; overflow-y: auto; background: white; border-radius: 6px; border: 1px solid #ddd; box-shadow: 0 8px 30px rgba(0,0,0,.18); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.folder-choice { display: flex; justify-content: space-between; gap: 0.5rem; background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem; cursor: pointer; }
.uploaded-mark { color: #2e7d32; font-size: 0.75rem; }
</style>
