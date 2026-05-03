import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiGet, apiPost } from '@/api'

export interface NormalizeFile {
  filename: string
  size_bytes: number
  needs_rename: boolean
  suggested_name: string
}

export interface NormalizeProgressItem {
  filename: string
  status: 'pending' | 'measuring' | 'normalizing' | 'skipped' | 'done' | 'error'
  measured_db: number | null
  target_db: number
  recommended_db_change: number | null
  error: string | null
}

interface RenameResponse {
  renamed: { from: string; to: string }[]
  skipped: { from: string; to: string; reason: string }[]
}

type Status = 'idle' | 'loading' | 'running' | 'done'

export const useNormalizeStore = defineStore('normalize', () => {
  const directory = ref('')
  const files = ref<NormalizeFile[]>([])
  const targetDb = ref<number>(89)
  const taskId = ref<string | null>(null)
  const progress = ref<Record<string, NormalizeProgressItem>>({})
  const status = ref<Status>('idle')
  const error = ref('')

  async function loadDirectory(path: string) {
    status.value = 'loading'
    error.value = ''
    try {
      const data = await apiGet<{ directory: string; files: NormalizeFile[] }>(
        `/normalize/list?dir=${encodeURIComponent(path)}`,
      )
      directory.value = data.directory
      files.value = data.files
      progress.value = {}
      status.value = 'idle'
    } catch (e: any) {
      error.value = e.message
      files.value = []
      status.value = 'idle'
    }
  }

  async function renameUnsafe() {
    const renames = files.value
      .filter((f) => f.needs_rename)
      .map((f) => ({ from: f.filename, to: f.suggested_name }))
    if (renames.length === 0) return
    try {
      await apiPost<RenameResponse>('/normalize/rename', {
        directory: directory.value,
        renames,
      })
      await loadDirectory(directory.value)
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function startBatch() {
    if (!directory.value || files.value.length === 0) return
    status.value = 'running'
    progress.value = {}
    try {
      const { task_id } = await apiPost<{ task_id: string }>('/normalize/start', {
        directory: directory.value,
        filenames: files.value.map((f) => f.filename),
        target_db: targetDb.value,
      })
      taskId.value = task_id
      subscribeProgress(task_id)
    } catch (e: any) {
      error.value = e.message
      status.value = 'idle'
    }
  }

  function subscribeProgress(id: string) {
    const es = new EventSource(`/api/normalize/progress/${id}`)
    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.items) {
        progress.value = data.items
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

  function clear() {
    directory.value = ''
    files.value = []
    taskId.value = null
    progress.value = {}
    status.value = 'idle'
    error.value = ''
  }

  return {
    directory,
    files,
    targetDb,
    taskId,
    progress,
    status,
    error,
    loadDirectory,
    renameUnsafe,
    startBatch,
    subscribeProgress,
    clear,
  }
})
