import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc14UrlDownload(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-14',
    'URL 下載：單一影片 + 播放清單',
    '驗證「🔗 網址下載」分頁能解析貼上的 YouTube 影片或播放清單網址，單一影片自動勾選，播放清單顯示「全選 / 全不選」。',
    5,
  )

  await step(
    page,
    ctx,
    '點擊左欄的「🔗 網址下載」按鈕。預期右欄切換到 url-download-feed，顯示輸入框與「解析網址」按鈕。',
    () => page.locator("button:has-text('網址下載')").first().click(),
    800,
  )

  // 用一支可靠存在的單一影片網址做示範
  const singleVideoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

  await step(
    page,
    ctx,
    `在輸入框貼上單一影片網址 (${singleVideoUrl})，按「解析網址」。`,
    async () => {
      await page.locator('.url-feed input.search-input').fill(singleVideoUrl)
      await page.locator(".url-feed button:has-text('解析')").click()
    },
    1500,
  )

  await step(
    page,
    ctx,
    '等待 yt-dlp 回傳影片資訊。預期清單出現一張影片卡片，且 checkbox 預設已勾選 (單一影片自動加入下載)。',
    async () => {
      await page.waitForSelector('.url-feed .video-item', { timeout: 30000 })
      const checked = await page
        .locator(".url-feed .video-item input[type='checkbox']")
        .first()
        .isChecked()
      if (!checked) {
        throw new Error('單一影片解析後 checkbox 應該預設勾選，但未勾')
      }
    },
    500,
  )

  // 用一個 YouTube playlist 網址（範例）；若解析失敗，至少結果區塊會顯示錯誤訊息
  const playlistUrl =
    'https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMHjMZOz59Oq8B9nUj'

  await step(
    page,
    ctx,
    '清掉輸入框並貼上一個播放清單網址，再次「解析」。',
    async () => {
      await page.locator('.url-feed input.search-input').fill(playlistUrl)
      await page.locator(".url-feed button:has-text('解析')").click()
    },
    2500,
  )

  await step(
    page,
    ctx,
    '等待解析完成。預期看到多張影片卡片 + 上方「✅ 全選」「🟩 全不選」按鈕，或 .status.error 錯誤訊息（playlist 可能已下架）。其中之一必須出現。',
    async () => {
      // Either successful playlist (select-all visible) OR error status
      await page.waitForFunction(
        () => {
          const selectAll = Array.from(
            document.querySelectorAll('.url-feed button'),
          ).some((b) => b.textContent?.includes('全選'))
          const errStatus = !!document.querySelector('.url-feed .status.error')
          return selectAll || errStatus
        },
        null,
        { timeout: 30000 },
      )
    },
    500,
  )

  return ctx
}
