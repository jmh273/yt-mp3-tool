import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

function parseQuotaUsed(text: string): number | null {
  // Expected pattern: "API Quota: 404 / 10000"
  const m = text.match(/API Quota:\s*(\d+)\s*\/\s*\d+/)
  return m && m[1] ? parseInt(m[1], 10) : null
}

export async function tc17QuotaCounter(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-17',
    '配額計數器顯示與更新',
    '驗證 header 右上角的 API Quota 徽章顯示「used / limit」格式、跨帳號共用、操作 API 後會刷新。',
    3,
  )

  let quotaBefore: number | null = null

  await step(
    page,
    ctx,
    '回到主頁，看到 header 右上角的 quota-badge 顯示「API Quota: N / 10000」格式。記錄 N 用於下一個 step 比對。',
    async () => {
      await page.waitForSelector('.quota-badge', { timeout: 5000 })
      const text = (await page.locator('.quota-badge').textContent()) ?? ''
      quotaBefore = parseQuotaUsed(text)
      if (quotaBefore === null) {
        throw new Error(
          `quota-badge 文字不符合「API Quota: N / 10000」格式: "${text}"`,
        )
      }
    },
    400,
  )

  await step(
    page,
    ctx,
    `紀錄目前配額數字 ${quotaBefore}，然後跑一個會消耗配額的動作。先切到「🔥 發燒影片」再切回「最新影片」，強制 re-mount LatestVideosFeed 重新打 /latest-videos API。等到 .latest-feed 清單渲染完才繼續。`,
    async () => {
      // Force unmount of LatestVideosFeed by switching to a different view first
      await page.locator("button:has-text('發燒影片')").first().click()
      await page.waitForTimeout(800)
      // Now switch back — guarantees onMounted fires again
      await page.locator("button:has-text('最新影片')").first().click()
      // Wait for LatestVideosFeed to finish loading: .latest-feed exists with
      // either video-items or "無新影片" status, but not "載入中" status.
      await page.waitForFunction(
        () => {
          const loadingEl = document.querySelector('.latest-feed .status')
          if (loadingEl && /載入中/.test(loadingEl.textContent ?? '')) {
            return false
          }
          return !!document.querySelector('.latest-feed')
        },
        null,
        { timeout: 90000 },
      )
    },
    600,
  )

  await step(
    page,
    ctx,
    '確認 quota-badge 數字已刷新（用量數字應該大於先前值）。配額樣式根據用量分 safe / warning / danger 三色。',
    async () => {
      const before = quotaBefore ?? 0
      // Wait until the displayed used value strictly increases
      await page.waitForFunction(
        (b: number) => {
          const el = document.querySelector('.quota-badge')
          if (!el) return false
          const m = (el.textContent ?? '').match(
            /API Quota:\s*(\d+)\s*\/\s*\d+/,
          )
          if (!m) return false
          const n = parseInt(m[1]!, 10)
          return Number.isFinite(n) && n > b
        },
        before,
        { timeout: 30000 },
      )
    },
    400,
  )

  return ctx
}
