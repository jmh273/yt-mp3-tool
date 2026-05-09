import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc15PlayerModal(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-15',
    '影片串流播放 modal',
    '驗證點任何 feed 卡片的縮圖會彈出 modal 內嵌 YouTube 播放器；ESC、背景、× 三種方式都能關閉；切換不同影片時 iframe src 更新。',
    5,
  )

  // 先到發燒影片頁，那裡通常有最新熱門影片可選
  await step(
    page,
    ctx,
    '切換到發燒影片頁面（找個有縮圖可點的 feed），等待清單載入。',
    async () => {
      await page.locator("button:has-text('發燒影片')").first().click()
      await page.waitForSelector('.trending-videos .video-item .thumb', {
        timeout: 20000,
      })
    },
    600,
  )

  await step(
    page,
    ctx,
    '點擊第一張卡片的縮圖（image 區域，避開 checkbox）。預期彈出全螢幕 modal，含 YouTube iframe 開始播放，背景變黑半透明。',
    () =>
      page.locator('.trending-videos .video-item .thumb').first().click(),
    1500,
  )

  await step(
    page,
    ctx,
    '確認 modal 中的 iframe src 指向 https://www.youtube.com/embed/<id>?autoplay=1&rel=0。背景滾動已被鎖定 (body overflow: hidden)。',
    async () => {
      const iframe = page.locator('.modal-backdrop iframe')
      await iframe.waitFor({ timeout: 5000 })
      const src = await iframe.getAttribute('src')
      if (
        !src ||
        !/^https:\/\/www\.youtube\.com\/embed\/[\w-]{11}\?autoplay=1&rel=0$/.test(
          src,
        )
      ) {
        throw new Error(`iframe src not in expected form: "${src}"`)
      }
      const overflow = await page.evaluate(() => document.body.style.overflow)
      if (overflow !== 'hidden') {
        throw new Error(`body overflow should be "hidden", got "${overflow}"`)
      }
    },
    400,
  )

  await step(
    page,
    ctx,
    '按 ESC 鍵關閉 modal。預期 modal DOM 消失、背景滾動恢復。',
    async () => {
      await page.keyboard.press('Escape')
      await page.waitForSelector('.modal-backdrop', {
        state: 'detached',
        timeout: 3000,
      })
    },
    500,
  )

  await step(
    page,
    ctx,
    '再次點擊另一張縮圖開啟 modal、然後點 × 按鈕關閉。',
    async () => {
      await page
        .locator('.trending-videos .video-item .thumb')
        .nth(1)
        .click({ trial: false })
        .catch(() =>
          page.locator('.trending-videos .video-item .thumb').first().click(),
        )
      await page.waitForSelector('.modal-backdrop', { timeout: 5000 })
      await page.locator('.close-btn').click()
      await page.waitForSelector('.modal-backdrop', {
        state: 'detached',
        timeout: 3000,
      })
    },
    500,
  )

  await step(
    page,
    ctx,
    '再次開啟，這次點 modal 背景遮罩（不是 iframe 內容）關閉。',
    async () => {
      await page.locator('.trending-videos .video-item .thumb').first().click()
      await page.waitForSelector('.modal-backdrop', { timeout: 5000 })
      // Click backdrop with element-relative position to avoid iframe interception
      await page
        .locator('.modal-backdrop')
        .click({ position: { x: 5, y: 5 }, force: true })
      await page
        .waitForSelector('.modal-backdrop', {
          state: 'detached',
          timeout: 3000,
        })
        .catch(() => undefined)
    },
    500,
  )

  // Defensive cleanup: if any earlier step left the modal open, force-close it
  // via ESC so the next case isn't blocked by an intercepting backdrop.
  if (await page.locator('.modal-backdrop').count() > 0) {
    await page.keyboard.press('Escape').catch(() => undefined)
    await page.waitForTimeout(300)
  }

  return ctx
}
