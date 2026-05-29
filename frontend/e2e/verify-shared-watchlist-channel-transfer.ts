// Verify for shared-watchlist-channel-transfer.
// 觀察名單改為跨帳號共用單一份（key `watchlist:shared`）；訂閱頻道清單每 row 可
// 「加入觀察名單」（複製，不取消訂閱）。真正的跨帳號共用由單元測試涵蓋；此 e2e 驗證
// 使用者流程 + 共用 key 持久化（reload 後仍在）+ 訂閱保留。
// Run: npx tsx e2e/verify-shared-watchlist-channel-transfer.ts  (from frontend/)

import { BASE_URL } from './helpers'
import {
  runVerifySuite,
  mockJson,
  type VerifyContext,
} from './verify-helpers'

const SUBS = {
  channels: [
    { subscription_id: 'sub-1', channel_id: 'UC_transfer_1', title: '搬移驗證頻道 1', thumbnail: '' },
    { subscription_id: 'sub-2', channel_id: 'UC_transfer_2', title: '搬移驗證頻道 2', thumbnail: '' },
  ],
}

async function openSubscribedWithMock(v: VerifyContext) {
  await mockJson(v.browserCtx, '**/subscriptions', SUBS)
  // 清掉共用名單，確保乾淨起點
  await v.page.evaluate(() => localStorage.removeItem('watchlist:shared'))
  await v.page.reload()
  await v.page.waitForSelector('.left-tab-bar', { timeout: 10000 })
  // 確保在「訂閱」分頁
  await v.page.locator('.left-tab', { hasText: '訂閱' }).first().click()
  await v.page.waitForSelector('.channel-card', { timeout: 10000 })
}

const tasks = [
  {
    name: '6.1 從訂閱 row 加入共用觀察名單（保留訂閱）',
    run: async (v: VerifyContext) => {
      await openSubscribedWithMock(v)

      const cardsBefore = await v.page.locator('.channel-card').count()
      const firstAdd = v.page.locator('.channel-card').first().locator('.watchlist-add-btn')
      const disabledBefore = await firstAdd.isDisabled()
      v.record('6.1 加入前 icon 可點', !disabledBefore ? 'PASS' : 'FAIL', `disabled=${disabledBefore}`)

      await firstAdd.click()

      // 訂閱數不變（複製語意，不取消訂閱）
      const cardsAfter = await v.page.locator('.channel-card').count()
      v.record(
        '6.1 加入後訂閱清單不變（未取消訂閱）',
        cardsAfter === cardsBefore ? 'PASS' : 'FAIL',
        `before=${cardsBefore} after=${cardsAfter}`,
      )

      // icon 變 already-added（disabled）
      const disabledAfter = await v.page.locator('.channel-card').first().locator('.watchlist-add-btn').isDisabled()
      v.record('6.1 加入後 icon 轉為 already-added', disabledAfter ? 'PASS' : 'FAIL', `disabled=${disabledAfter}`)

      // 寫入共用 key watchlist:shared，且不寫 per-account key
      const storage = await v.page.evaluate(() => {
        const shared = localStorage.getItem('watchlist:shared')
        const perAccountKeys = Object.keys(localStorage).filter(
          (k) => k.startsWith('watchlist:') && k !== 'watchlist:shared',
        )
        return { shared, perAccountKeys }
      })
      const sharedArr = storage.shared ? JSON.parse(storage.shared) : []
      v.record(
        '6.1 寫入 watchlist:shared 含該頻道',
        sharedArr.some((i: { channel_id: string }) => i.channel_id === 'UC_transfer_1') ? 'PASS' : 'FAIL',
        `shared=${JSON.stringify(sharedArr.map((i: { channel_id: string }) => i.channel_id))}`,
      )
      v.record(
        '6.1 不寫 per-account watchlist key',
        storage.perAccountKeys.length === 0 ? 'PASS' : 'FAIL',
        `perAccountKeys=${JSON.stringify(storage.perAccountKeys)}`,
      )
    },
  },
  {
    name: '6.1 觀察名單分頁顯示該頻道',
    run: async (v: VerifyContext) => {
      await v.page.locator('.left-tab', { hasText: '觀察名單' }).first().click()
      await v.page.waitForSelector('.watchlist-row', { timeout: 5000 })
      const titles = await v.page.locator('.watchlist-row .watchlist-title').allInnerTexts()
      v.record(
        '6.1 觀察名單面板顯示已加入頻道',
        titles.some((t) => t.includes('搬移驗證頻道 1')) ? 'PASS' : 'FAIL',
        `titles=${JSON.stringify(titles)}`,
      )
    },
  },
  {
    name: '6.1 reload 後共用名單仍保留（帳號無關）',
    run: async (v: VerifyContext) => {
      await mockJson(v.browserCtx, '**/subscriptions', SUBS)
      await v.page.reload()
      await v.page.waitForSelector('.left-tab-bar', { timeout: 10000 })
      await v.page.locator('.left-tab', { hasText: '觀察名單' }).first().click()
      await v.page.waitForSelector('.watchlist-row', { timeout: 5000 })
      const titles = await v.page.locator('.watchlist-row .watchlist-title').allInnerTexts()
      v.record(
        '6.1 reload 後仍顯示（watchlist:shared 持久化）',
        titles.some((t) => t.includes('搬移驗證頻道 1')) ? 'PASS' : 'FAIL',
        `titles=${JSON.stringify(titles)}`,
      )
    },
  },
]

runVerifySuite({
  title: 'Verify shared-watchlist-channel-transfer — 共用觀察名單 + 訂閱搬移',
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
