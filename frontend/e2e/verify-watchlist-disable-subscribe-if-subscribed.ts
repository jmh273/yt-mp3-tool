// Verify for watchlist-disable-subscribe-if-subscribed.
// 共用觀察名單中，若頻道已在目前帳號訂閱清單，觀察名單 row 的「➕ 訂閱」icon 應 disabled
// （tooltip「已訂閱」），但「✕ 移除」仍可用。
// Run: npx tsx e2e/verify-watchlist-disable-subscribe-if-subscribed.ts  (from frontend/)

import { BASE_URL } from './helpers'
import {
  runVerifySuite,
  mockJson,
  type VerifyContext,
} from './verify-helpers'

const SUBS = {
  channels: [
    { subscription_id: 'sub-1', channel_id: 'UC_dis_1', title: '已訂閱驗證頻道', thumbnail: '' },
  ],
}

const PROMOTE_LABEL = '訂閱 已訂閱驗證頻道'
const REMOVE_LABEL = '移除 已訂閱驗證頻道'

const tasks = [
  {
    name: '4.1 已訂閱頻道在觀察名單的訂閱 icon 被停用',
    run: async (v: VerifyContext) => {
      await mockJson(v.browserCtx, '**/subscriptions', SUBS)
      await v.page.evaluate(() => localStorage.removeItem('watchlist:shared'))
      await v.page.reload()
      await v.page.waitForSelector('.left-tab-bar', { timeout: 10000 })

      // 訂閱分頁：把已訂閱頻道加入共用觀察名單
      await v.page.locator('.left-tab', { hasText: '訂閱' }).first().click()
      await v.page.waitForSelector('.channel-card', { timeout: 10000 })
      await v.page.locator('.channel-card').first().locator('.watchlist-add-btn').click()

      // 切到觀察名單分頁
      await v.page.locator('.left-tab', { hasText: '觀察名單' }).first().click()
      await v.page.waitForSelector('.watchlist-row', { timeout: 5000 })

      const promoteBtn = v.page.locator(`[aria-label="${PROMOTE_LABEL}"]`)
      const removeBtn = v.page.locator(`[aria-label="${REMOVE_LABEL}"]`)

      const promoteDisabled = await promoteBtn.isDisabled()
      v.record('4.1 「➕ 訂閱」icon 為 disabled', promoteDisabled ? 'PASS' : 'FAIL', `disabled=${promoteDisabled}`)

      const title = await promoteBtn.getAttribute('title')
      v.record('4.1 訂閱 icon tooltip 為「已訂閱」', title === '已訂閱' ? 'PASS' : 'FAIL', `title=${title}`)

      const removeEnabled = !(await removeBtn.isDisabled())
      v.record('4.1 「✕ 移除」icon 仍可用', removeEnabled ? 'PASS' : 'FAIL', `removeEnabled=${removeEnabled}`)
    },
  },
  {
    name: '4.1 「✕ 移除」對已訂閱頻道仍可運作',
    run: async (v: VerifyContext) => {
      await v.page.locator(`[aria-label="${REMOVE_LABEL}"]`).click()
      // 名單應清空（移除後 watchlist:shared 不再含該頻道）
      await v.page.waitForTimeout(300)
      const remaining = await v.page.locator('.watchlist-row').count()
      v.record('4.1 移除後 row 消失', remaining === 0 ? 'PASS' : 'FAIL', `remaining=${remaining}`)
      const shared = await v.page.evaluate(() => localStorage.getItem('watchlist:shared'))
      const arr = shared ? JSON.parse(shared) : []
      v.record(
        '4.1 watchlist:shared 不再含該頻道',
        !arr.some((i: { channel_id: string }) => i.channel_id === 'UC_dis_1') ? 'PASS' : 'FAIL',
        `shared=${JSON.stringify(arr.map((i: { channel_id: string }) => i.channel_id))}`,
      )
    },
  },
]

runVerifySuite({
  title: 'Verify watchlist-disable-subscribe-if-subscribed — 已訂閱停用升級',
  tasks,
  cleanup: async (v: VerifyContext) => {
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
