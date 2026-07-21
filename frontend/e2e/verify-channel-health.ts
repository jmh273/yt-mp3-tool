// One-shot verification for subscription-health-check.
// Run: npm run verify -- channel-health  (from frontend/)

import { join } from 'node:path'
import { runVerifySuite, mockJson, type VerifyContext } from './verify-helpers'
import { BASE_URL, SCREENSHOTS_DIR } from './helpers'

const HEALTH_RESULT = {
  checked: 3,
  problems: [
    {
      channel_id: 'UC_a',
      subscription_id: 's_a',
      title: '理財不能等',
      thumbnail: 'https://i.ytimg.com/vi/x/default.jpg',
      reason: 'no_uploads',
      detail: 'playlist_not_found',
    },
    {
      channel_id: 'UC_b',
      subscription_id: 's_b',
      title: '四口人',
      thumbnail: '',
      reason: 'deleted',
      detail: 'error',
    },
  ],
}

async function installMocks({ browserCtx, page }: VerifyContext) {
  await mockJson(browserCtx, '**/subscriptions/health-check', HEALTH_RESULT)
  // 退訂：DELETE /subscriptions/s_a → 成功
  await browserCtx.unroute('**/subscriptions/s_a').catch(() => {})
  await browserCtx.route('**/subscriptions/s_a', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    } else {
      await route.continue()
    }
  })
  // window.confirm → 自動接受
  page.on('dialog', (d) => d.accept().catch(() => {}))
}

async function runCheck(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.goto(`${BASE_URL}/settings`)
  await page.locator('[data-testid="tab-health"]').click()
  await page.locator('[data-testid="run-health-check"]').click()
  await page.waitForSelector('[data-testid="problem-row"]', { timeout: 10000 })
  const rows = await page.locator('[data-testid="problem-row"]').count()
  record('健檢列出問題頻道', rows === 2 ? 'PASS' : 'FAIL', `${rows} rows`)

  const firstText = await page.locator('[data-testid="problem-row"]').first().innerText()
  const ok = firstText.includes('理財不能等') && firstText.includes('無上傳影片')
  record('顯示頻道名與原因徽章', ok ? 'PASS' : 'FAIL', firstText.replace(/\s+/g, ' ').trim())

  await page.screenshot({ path: join(SCREENSHOTS_DIR, 'channel-health-list.png') })
}

async function runUnsubscribe(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator('[data-testid="unsub-btn"]').first().click()
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="problem-row"]').length === 1,
    null,
    { timeout: 5000 },
  )
  const remaining = await page.locator('[data-testid="problem-row"]').innerText()
  const ok = remaining.includes('四口人')
  record('退訂後該列移除、其餘保留', ok ? 'PASS' : 'FAIL', remaining.replace(/\s+/g, ' ').trim())
  await page.screenshot({ path: join(SCREENSHOTS_DIR, 'channel-health-after-unsub.png') })
}

runVerifySuite({
  title: 'Verify subscription-health-check',
  tasks: [
    { name: 'install mocks', run: installMocks },
    { name: 'run health check', run: runCheck },
    { name: 'unsubscribe a problem channel', run: runUnsubscribe },
  ],
}).then((code) => process.exit(code))
