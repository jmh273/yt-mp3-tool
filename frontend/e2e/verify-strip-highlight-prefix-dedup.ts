import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson } from './verify-helpers'

// 對照 spec（latest-videos-feed）：
// 後端依「去掉開頭【精華】標記」後的 stem 比對已下載，並回傳 downloaded_today。
// 此 e2e 驗證前端 UI：當帶「【精華】」前綴的影片被後端標記 downloaded_today=true 時，
// latest-videos-feed SHALL 顯示「✅ 已下載」徽章且 checkbox 停用；未下載者不顯示徽章、可勾選。
// （真正的前綴正規化比對邏輯由 backend 單元測試涵蓋；此處 API 為 mock。）

const HIGHLIGHT_VIDEO = {
  video_id: 'hl0001',
  title: '【精華】My Talk',
  url: 'https://www.youtube.com/watch?v=hl0001',
  thumbnail: 'https://i.ytimg.com/vi/hl0001/mqdefault.jpg',
  published: new Date(Date.now() - 3600_000).toISOString(),
  duration_seconds: 600,
  channel_id: 'UC_hl',
  channel_title: 'Highlight Channel',
  downloaded_today: true, // 後端已比對：精華版對上既有原版 → 視為已下載
}

const PLAIN_VIDEO = {
  video_id: 'pl0001',
  title: 'Fresh Song',
  url: 'https://www.youtube.com/watch?v=pl0001',
  thumbnail: 'https://i.ytimg.com/vi/pl0001/mqdefault.jpg',
  published: new Date(Date.now() - 7200_000).toISOString(),
  duration_seconds: 300,
  channel_id: 'UC_pl',
  channel_title: 'Plain Channel',
  downloaded_today: false,
}

async function commonMocks(ctx: BrowserContext) {
  await mockJson(ctx, '**/subscriptions', { channels: [] })
  await mockJson(ctx, '**/quota', { used: 0, limit: 10000, date: '2026-06-17' })
  await mockJson(ctx, '**/version', { version: 'verify' })
  await mockJson(ctx, '**/settings', {
    output_path: 'C:/music/YT-MP3',
    videos_per_channel: 5,
    latest_hours: 24,
    min_duration_minutes: 3,
    max_duration_minutes: 60,
    normalize_target_db: 89,
    drive_root_folder: 'YT-MP3',
    download_concurrency: 3,
    drive_upload_concurrency: 3,
  })
  await mockJson(ctx, '**/latest-videos*', { videos: [HIGHLIGHT_VIDEO, PLAIN_VIDEO] })
}

function cardByTitle(page: Page, title: string) {
  return page.locator('.video-item', { has: page.locator('.title', { hasText: title }) })
}

runVerifySuite({
  title: 'verify strip-highlight-prefix-dedup',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: '開啟最新影片分頁',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.goto('http://localhost:5173')
        await page.evaluate(() => localStorage.removeItem('yt_mp3_downloaded_ids'))
        await page.reload()

        await page.locator("button:has-text('最新影片')").first().click()
        await page.waitForSelector('.video-item', { timeout: 20000 })
        const count = await page.locator('.video-item').count()
        record('最新影片清單載入', count >= 2 ? 'PASS' : 'FAIL', `video-item count=${count}`)
      },
    },
    {
      name: '【精華】影片顯示已下載徽章且停用',
      run: async ({ page, record }) => {
        const card = cardByTitle(page, '【精華】My Talk')
        const badgeVisible = await card.locator('.dl-badge').isVisible()
        const checkboxDisabled = await card.locator('input.video-checkbox').isDisabled()
        record(
          '精華版（downloaded_today=true）顯示徽章並停用 checkbox',
          badgeVisible && checkboxDisabled ? 'PASS' : 'FAIL',
          `badgeVisible=${badgeVisible} checkboxDisabled=${checkboxDisabled}`,
        )
      },
    },
    {
      name: '未下載影片無徽章且可勾選',
      run: async ({ page, record }) => {
        const card = cardByTitle(page, 'Fresh Song')
        const badgeCount = await card.locator('.dl-badge').count()
        const checkboxEnabled = await card.locator('input.video-checkbox').isEnabled()
        record(
          '未下載影片不顯示徽章且 checkbox 可勾選',
          badgeCount === 0 && checkboxEnabled ? 'PASS' : 'FAIL',
          `badgeCount=${badgeCount} checkboxEnabled=${checkboxEnabled}`,
        )
      },
    },
  ],
}).then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`)
    process.exit(1)
  })
