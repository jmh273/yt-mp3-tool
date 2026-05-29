// Verify for watchlist-subscribe-duplicate-graceful.
// 觀察名單「➕ 訂閱」遇 subscriptionDuplicate（此帳號已訂閱，YouTube list 可能因同步延遲未反映）
// 時，應以中性提示「{title} 此帳號已訂閱」、保留名單項、不顯示紅色錯誤。
// Run: npx tsx e2e/verify-watchlist-subscribe-duplicate-graceful.ts  (from frontend/)

import type { Route } from 'playwright'
import { BASE_URL } from './helpers'
import {
  runVerifySuite,
  mockJson,
  type VerifyContext,
} from './verify-helpers'

const CH = { channel_id: 'UC_dup_test', title: '重複訂閱驗證頻道', thumbnail: '' }
const PROMOTE_LABEL = `訂閱 ${CH.title}`

const tasks = [
  {
    name: '4.1 duplicate 時中性提示 + 保留項目 + 無紅色錯誤',
    run: async (v: VerifyContext) => {
      // GET /subscriptions 不含目標頻道 → 訂閱 icon 不會被 disable
      await mockJson(v.browserCtx, '**/subscriptions', { channels: [] })
      // 預先把目標頻道放進共用觀察名單
      await v.page.evaluate((ch) => {
        localStorage.setItem(
          'watchlist:shared',
          JSON.stringify([{ ...ch, added_at: new Date().toISOString() }]),
        )
      }, CH)

      // POST /subscriptions/{id} → 回 409 subscriptionDuplicate
      await v.browserCtx.unroute('**/subscriptions/*').catch(() => {})
      await v.browserCtx.route('**/subscriptions/*', async (route: Route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              detail:
                '訂閱失敗：<HttpError 400 when requesting .../subscriptions?part=snippet&alt=json returned "The subscription that you are trying to create already exists.". reason: subscriptionDuplicate>',
            }),
          })
        } else {
          await route.continue()
        }
      })

      await v.page.reload()
      await v.page.waitForSelector('.left-tab-bar', { timeout: 10000 })
      await v.page.locator('.left-tab', { hasText: '觀察名單' }).first().click()
      await v.page.waitForSelector('.watchlist-row', { timeout: 5000 })

      const promoteBtn = v.page.locator(`[aria-label="${PROMOTE_LABEL}"]`)
      const wasEnabled = !(await promoteBtn.isDisabled())
      v.record('4.1 訂閱 icon 可點（未被 disable）', wasEnabled ? 'PASS' : 'FAIL', `enabled=${wasEnabled}`)

      await promoteBtn.click()
      await v.page.waitForSelector('.watchlist-toast', { timeout: 5000 })

      const toastText = await v.page.locator('.watchlist-toast').innerText()
      const toastClass = (await v.page.locator('.watchlist-toast').getAttribute('class')) ?? ''

      v.record(
        '4.1 中性提示「此帳號已訂閱」',
        toastText.includes('此帳號已訂閱') && toastText.includes(CH.title) ? 'PASS' : 'FAIL',
        `toast="${toastText.replace(/\n/g, ' ')}"`,
      )
      v.record(
        '4.1 非紅色錯誤（success 樣式、無「訂閱失敗」）',
        toastClass.includes('success') && !toastClass.includes('error') && !toastText.includes('訂閱失敗')
          ? 'PASS'
          : 'FAIL',
        `class="${toastClass}"`,
      )

      const remaining = await v.page.locator('.watchlist-row').count()
      v.record('4.1 名單項保留（未移除）', remaining === 1 ? 'PASS' : 'FAIL', `rows=${remaining}`)

      const shared = await v.page.evaluate(() => localStorage.getItem('watchlist:shared'))
      const arr = shared ? JSON.parse(shared) : []
      v.record(
        '4.1 watchlist:shared 仍含該頻道',
        arr.some((i: { channel_id: string }) => i.channel_id === CH.channel_id) ? 'PASS' : 'FAIL',
        `shared=${JSON.stringify(arr.map((i: { channel_id: string }) => i.channel_id))}`,
      )
    },
  },
]

runVerifySuite({
  title: 'Verify watchlist-subscribe-duplicate-graceful — 已訂閱中性提示保留',
  tasks,
  cleanup: async (v: VerifyContext) => {
    await v.browserCtx.unroute('**/subscriptions/*').catch(() => {})
    await v.page.goto(BASE_URL)
    await v.page.evaluate(() => localStorage.removeItem('watchlist:shared'))
  },
})
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e)
    process.stderr.write(`[FATAL] ${msg}\n`)
    process.exit(1)
  })
