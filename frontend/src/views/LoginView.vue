<template>
  <div class="login">
    <h1>YT → MP3</h1>
    <p>請先登入 Google 帳號以存取您的 YouTube 訂閱清單</p>
    <button @click="handleLogin" :disabled="loading" autofocus>
      {{ statusMsg ? '等待中...' : loading ? '開啟授權中...' : '登入 Google' }}
    </button>
    <p v-if="statusMsg" class="status">{{ statusMsg }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const error = ref('')
const statusMsg = ref('')

async function handleLogin() {
  loading.value = true
  error.value = ''
  statusMsg.value = ''
  try {
    await auth.login()
  } catch (e: any) {
    error.value = e.message
    loading.value = false
    return
  }

  // Poll /auth/status until OAuth completes (up to 2 minutes)
  statusMsg.value = '等待授權完成...'
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      await auth.checkStatus()
    } catch {}
    if (auth.loggedIn) {
      router.push('/')
      return
    }
  }

  loading.value = false
  statusMsg.value = ''
  error.value = '授權逾時，請重試'
}
</script>

<style scoped>
.login {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 1rem;
}
button {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  background: #ff0000;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: not-allowed; }
button:focus-visible { outline: 3px solid #ff6666; outline-offset: 3px; }
.status { color: #555; font-size: 0.9rem; }
.error { color: red; }
</style>
