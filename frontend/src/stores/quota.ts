import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiGet } from '@/api'

interface QuotaResponse {
  used: number
  limit: number
  date: string
}

export const useQuotaStore = defineStore('quota', () => {
  const used = ref<number | null>(null)
  const limit = ref(10000)
  const date = ref('')

  /** 警示等級：safe (<80%) / warning (80–95%) / danger (≥95%)。used 未取得時回傳 'unknown'。 */
  const level = computed<'unknown' | 'safe' | 'warning' | 'danger'>(() => {
    if (used.value === null) return 'unknown'
    const ratio = used.value / limit.value
    if (ratio >= 0.95) return 'danger'
    if (ratio >= 0.8) return 'warning'
    return 'safe'
  })

  async function refresh(): Promise<void> {
    try {
      const data = await apiGet<QuotaResponse>('/quota')
      // 防呆：若回應形狀不符（測試 mock 共用同一個 apiGet 時可能發生），略過更新
      if (!data || typeof data.used !== 'number') return
      used.value = data.used
      limit.value = data.limit
      date.value = data.date
    } catch {
      // 不阻擋頁面，保留先前數值
    }
  }

  return { used, limit, date, level, refresh }
})
