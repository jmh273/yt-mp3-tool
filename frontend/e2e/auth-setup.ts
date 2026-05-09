// One-time interactive Google OAuth → save storageState.json for subsequent runs.
// Usage: npm run e2e:auth (from frontend/)

import { chromium } from 'playwright'
import { BASE_URL, BACKEND_URL, STORAGE_STATE_PATH, log } from './helpers'

async function checkBackendUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const r = await fetch(`${BACKEND_URL}/auth/status`, { signal: ctrl.signal })
    clearTimeout(timer)
    return r.ok
  } catch {
    return false
  }
}

async function isLoggedIn(): Promise<boolean> {
  try {
    const r = await fetch(`${BACKEND_URL}/auth/status`)
    const data = (await r.json()) as { logged_in?: boolean }
    return data.logged_in === true
  } catch {
    return false
  }
}

async function main() {
  log('=== YT-MP3 walkthrough — auth setup ===')

  if (!(await checkBackendUp())) {
    process.stderr.write(
      '[ERROR] 連不到後端 http://localhost:8000\n' +
        '請先啟動後端 (uvicorn) 與前端 (vite) 後再執行。\n',
    )
    process.exit(1)
  }
  log('[OK] 後端可達')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  await page.goto(BASE_URL)

  log('')
  log('================================================================')
  log('請在開啟的瀏覽器視窗中完成 Google 登入。')
  log('登入完成後，本工具會自動偵測並儲存 storage state。')
  log('完成後請勿手動關閉瀏覽器，等本工具自己關閉。')
  log('================================================================')
  log('')

  // Poll backend /auth/status until logged_in
  const deadline = Date.now() + 5 * 60 * 1000 // 5 minutes
  let loggedIn = false
  while (Date.now() < deadline) {
    if (await isLoggedIn()) {
      loggedIn = true
      break
    }
    await page.waitForTimeout(2000)
  }

  if (!loggedIn) {
    process.stderr.write('[ERROR] 5 分鐘內未偵測到登入完成，請重試。\n')
    await browser.close()
    process.exit(1)
  }

  log('[OK] 偵測到登入完成')

  // Give the frontend a moment to persist any state, then save context
  await page.waitForTimeout(1500)
  await context.storageState({ path: STORAGE_STATE_PATH })
  log(`[OK] storage state 已儲存：${STORAGE_STATE_PATH}`)

  await browser.close()
  log('')
  log('完成！可以執行：npm run e2e')
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.stack ?? e.message : String(e)
  process.stderr.write(`[FATAL] ${msg}\n`)
  process.exit(1)
})
