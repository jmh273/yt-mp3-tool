import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiGet, apiPost } from '@/api'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  const loggedIn = ref(false)

  async function checkStatus() {
    const data = await apiGet<{ logged_in: boolean }>('/auth/status')
    loggedIn.value = data.logged_in
  }

  async function login() {
    await apiGet('/auth/login')
  }

  async function logout() {
    await apiPost('/auth/logout')
    loggedIn.value = false
    await router.push('/login')
  }

  return { loggedIn, checkStatus, login, logout }
})
