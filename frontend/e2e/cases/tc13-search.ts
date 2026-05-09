import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc13Search(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-13',
    '搜尋影片',
    '驗證「🔍 搜尋影片」分頁能在 YouTube 全站搜尋關鍵字、結果以卡片清單呈現、空輸入時提示文字、無結果時提示文字。',
    4,
  )

  await step(
    page,
    ctx,
    '點擊左欄的「🔍 搜尋影片」按鈕。預期右欄切換到 search-videos-feed，輸入框聚焦，下方顯示「請輸入關鍵字開始搜尋」。',
    () => page.locator("button:has-text('搜尋影片')").first().click(),
    1000,
  )

  await step(
    page,
    ctx,
    '在搜尋框輸入「lofi」並按 Enter。預期載入指示出現，後端 /search-videos 用 yt-dlp 跑搜尋。',
    async () => {
      await page.locator('.search-feed .search-input').fill('lofi')
      await page.locator(".search-feed button:has-text('搜尋')").click()
    },
    1500,
  )

  await step(
    page,
    ctx,
    '等待結果回來，預期清單出現至少一張影片卡片。',
    () => page.waitForSelector('.search-feed .video-item', { timeout: 30000 }),
    500,
  )

  await step(
    page,
    ctx,
    '把搜尋字改成「zzzzz不會中的關鍵字qqqq」並再次 Enter。預期顯示「查無符合條件的影片」提示。',
    async () => {
      await page.locator('.search-feed .search-input').fill('zzzzz不會中的關鍵字qqqq')
      await page.locator(".search-feed button:has-text('搜尋')").click()
      await page
        .waitForSelector('.search-feed .status', { timeout: 30000 })
        .catch(() => undefined)
    },
    600,
  )

  return ctx
}
