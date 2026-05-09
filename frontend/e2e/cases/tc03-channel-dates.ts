import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc03ChannelDates(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-03',
    '頻道日期更新檢查',
    '驗證「檢查更新日期」按鈕能觸發後端並列每個頻道的最新影片日期。',
    3,
  )

  await step(
    page,
    ctx,
    '看到左欄上方有「檢查更新日期」按鈕，準備點它。預期按下後按鈕變「檢查中...」。',
    undefined,
    200,
  )

  await step(
    page,
    ctx,
    '點擊「檢查更新日期」按鈕，後端會並發打所有頻道的 RSS。',
    () => page.locator("button:has-text('檢查更新日期')").click(),
    1500,
  )

  await step(
    page,
    ctx,
    '等待 API 完成（按鈕從「檢查中...」變回「檢查更新日期」）並至少一個 .channel-date 出現。如果頻道很多，API 處理時間較長。',
    async () => {
      // Wait for button to settle out of loading state. Use a long timeout
      // because /subscriptions/latest-dates fans out to every channel's RSS.
      await page.waitForFunction(
        () => {
          const btn = Array.from(document.querySelectorAll('button')).find(
            (b) => b.textContent?.includes('檢查更新日期'),
          )
          return !!btn && !btn.disabled
        },
        null,
        { timeout: 180000 },
      )
      // Strictly assert at least one .channel-date renders. If this fails,
      // the backend `/subscriptions/latest-dates` likely returned an empty
      // map (regression of the indentation bug fixed earlier).
      await page.waitForSelector('.channel-date', { timeout: 10000 })
    },
    800,
  )

  return ctx
}
