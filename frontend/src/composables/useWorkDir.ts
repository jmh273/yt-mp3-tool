import { ref, watch } from 'vue'

export interface UseWorkDirOptions {
  /** 計算當前的預設工作目錄路徑 */
  defaultDir: () => string
  /** 要監看以重新同步預設值的 reactive 來源；任一變動即嘗試同步 */
  watchSource: () => unknown
  /** 額外的同步前置條件；回傳 false 時不覆寫使用者路徑（預設永遠允許） */
  canSync?: () => boolean
}

/**
 * 集中「目錄輸入 + 是否手動編輯 + 跟隨預設值」的同步邏輯，供右側面板共用。
 * 規則：使用者尚未手動編輯（且 canSync 允許）時，預設值來源變動會同步填入；
 * 一旦使用者把路徑改成與預設不同，即視為手動編輯，不再被預設值覆寫。
 */
export function useWorkDir(opts: UseWorkDirOptions) {
  const dirInput = ref('')
  const dirEdited = ref(false)

  function applyDefault() {
    if (!dirEdited.value && (opts.canSync?.() ?? true)) {
      dirInput.value = opts.defaultDir()
    }
  }

  watch(opts.watchSource, applyDefault)
  watch(dirInput, (v) => {
    if (v !== opts.defaultDir()) dirEdited.value = true
  })

  /** picker 選定資料夾或外部設定路徑：直接填入並標記為已編輯 */
  function setDir(path: string) {
    dirInput.value = path
    dirEdited.value = true
  }

  return { dirInput, applyDefault, setDir }
}
