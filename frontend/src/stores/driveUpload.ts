import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiGet, apiPost, API_BASE } from '@/api'

export interface DriveUploadFolder {
  name: string
  directory: string
  uploaded: boolean
}

export interface DriveUploadProgressItem {
  filename: string
  status: 'pending' | 'uploading' | 'skipped' | 'done' | 'error'
  error: string | null
}

type UploadStatus = 'idle' | 'loading' | 'running' | 'done'

export const useDriveUploadStore = defineStore('driveUpload', () => {
  const folders = ref<DriveUploadFolder[]>([])
  const taskId = ref<string | null>(null)
  const progress = ref<Record<string, DriveUploadProgressItem>>({})
  const status = ref<UploadStatus>('idle')
  const error = ref('')
  const reauthRequired = ref(false)

  async function loadFolders() {
    status.value = 'loading'
    error.value = ''
    reauthRequired.value = false
    try {
      const data = await apiGet<{ folders: DriveUploadFolder[] }>('/drive/upload/folders')
      folders.value = data.folders
      status.value = 'idle'
    } catch (e: any) {
      const message = String(e?.message ?? e)
      if (message.includes('401') || message.toLowerCase().includes('reauthorization')) {
        reauthRequired.value = true
        error.value = '需要重新授權 Google Drive，這是首次使用上傳功能的一次性流程。請重新登入後再試。'
      } else {
        error.value = message
      }
      folders.value = []
      status.value = 'idle'
    }
  }

  async function startUpload(directory: string) {
    if (!directory) return
    status.value = 'running'
    progress.value = {}
    error.value = ''
    reauthRequired.value = false
    try {
      const { task_id } = await apiPost<{ task_id: string }>('/drive/upload', { directory })
      taskId.value = task_id
      subscribeProgress(task_id)
    } catch (e: any) {
      const message = String(e?.message ?? e)
      if (message.includes('401') || message.toLowerCase().includes('reauthorization')) {
        reauthRequired.value = true
        error.value = '需要重新授權 Google Drive，這是首次使用上傳功能的一次性流程。請重新登入後再試。'
      } else {
        error.value = message
      }
      status.value = 'idle'
    }
  }

  function subscribeProgress(id: string) {
    const es = new EventSource(`${API_BASE}/drive/upload/progress/${id}`)
    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.items) {
        progress.value = data.items
      }
      if (data.error) {
        error.value = data.error
      }
      if (data.status === 'done') {
        es.close()
        status.value = 'done'
      }
    }
    es.onerror = () => {
      es.close()
      if (status.value === 'running') status.value = 'done'
    }
  }

  return { folders, taskId, progress, status, error, reauthRequired, loadFolders, startUpload, subscribeProgress }
})
