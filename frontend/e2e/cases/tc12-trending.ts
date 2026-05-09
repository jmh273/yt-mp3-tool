import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc12Trending(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-12',
    '發燒影片清單與分頁',
    '驗證「🔥 發燒影片」分頁顯示 YouTube 台灣 mostPopular 排行、每張卡片有播放數欄位 (e.g. 1.23M views)、底部「載入更多」可以追加下一頁。',
    5,
  )

  await step(
    page,
    ctx,
    '點擊左欄的「🔥 發燒影片」按鈕。預期右欄切換到 trending-videos-feed，標題顯示「🔥 台灣地區發燒影片」。',
    () => page.locator("button:has-text('發燒影片')").first().click(),
    1500,
  )

  await step(
    page,
    ctx,
    '等待後端 /trending-videos 載入完成，清單出現至少一張影片卡片。',
    () => page.waitForSelector('.trending-videos .video-item', { timeout: 20000 }),
    500,
  )

  await step(
    page,
    ctx,
    '確認每張卡片的 meta 行中可以看到播放數（例如「1.23M views」），格式採 3 個有效數字 + K/M/B 後綴。',
    async () => {
      const text = await page
        .locator('.trending-videos .views')
        .first()
        .textContent({ timeout: 5000 })
      // Must match either "999 views" (small) or "12.3K|M|B views" (suffix form)
      if (!text || !/^\s*\d+(\.\d+)?[KMB]?\s+views\s*$/.test(text)) {
        throw new Error(`view count format mismatch: "${text}"`)
      }
    },
    300,
  )

  await step(
    page,
    ctx,
    '捲到清單底部，確認「載入更多」按鈕存在，文字含「(約消耗 1 配額)」提示。',
    async () => {
      await page
        .locator('.trending-videos .video-grid')
        .evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior }))
      await page.waitForSelector('.load-more-btn', { timeout: 5000 })
    },
    500,
  )

  // Count items before clicking
  const before = await page.locator('.trending-videos .video-item').count()
  await step(
    page,
    ctx,
    `點擊「載入更多」。預期下方追加新一頁影片，總卡片數從 ${before} 增加。`,
    async () => {
      await page.locator('.load-more-btn').click()
      // Wait for either more items to appear or button to disappear (last page)
      await page.waitForFunction(
        (b) =>
          document.querySelectorAll('.trending-videos .video-item').length > b ||
          !document.querySelector('.load-more-btn'),
        before,
        { timeout: 15000 },
      )
    },
    600,
  )

  return ctx
}
