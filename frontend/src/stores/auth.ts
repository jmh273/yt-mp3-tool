import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiGet, apiPost } from '@/api'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  const loggedIn = ref(false)
  const currentAccount = ref('')
  const accounts = ref<string[]>([])

  async function checkStatus() {
    const data = await apiGet<{
      logged_in: boolean
      current_account: string
      accounts: string[]
    }>('/auth/status')
    loggedIn.value = data.logged_in
    currentAccount.value = data.current_account ?? ''
    accounts.value = data.accounts ?? []
  }

  async function login() {
    await apiGet('/auth/login')
  }

  async function logout() {
    await apiPost('/auth/logout')
    await checkStatus()
    if (!loggedIn.value) {
      await router.push('/login')
    }
  }

  /** 登出指定帳號 */
  async function logoutAccount(email: string) {
    await apiPost('/auth/logout', { email })
    await checkStatus()
    if (!loggedIn.value) {
      await router.push('/login')
    }
  }

  /** 切換當前帳號 */
  async function switchAccount(email: string) {
    await apiPost('/auth/switch', { email })
    currentAccount.value = email
  }

  /** 新增帳號（觸發 OAuth） */
  async function addAccount() {
    await apiGet('/auth/login')
  }

  return {
    loggedIn,
    currentAccount,
    accounts,
    checkStatus,
    login,
    logout,
    logoutAccount,
    switchAccount,
    addAccount,
  }
})
