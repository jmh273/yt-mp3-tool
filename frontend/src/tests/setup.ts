import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, vi } from 'vitest'

// 穩定的 router mock，每個測試取得同一個 push/replace 實例
export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
}

// 每個測試前重置 Pinia 與 mock 呼叫紀錄
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})

// 全域 RouterLink stub，避免元件掛載時出現 "Failed to resolve component" 警告
config.global.stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  RouterView: { template: '<div />' },
}

// 模擬 vue-router，避免在元件掛載時觸發實際路由邏輯
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: () => mockRouter,
    useRoute: () => ({ params: {}, query: {} }),
    RouterLink: { template: '<a><slot /></a>' },
    RouterView: { template: '<div />' },
  }
})
