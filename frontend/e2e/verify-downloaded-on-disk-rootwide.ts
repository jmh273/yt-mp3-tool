import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson } from './verify-helpers'

// 對照 spec（latest-videos-feed）：
// /latest-videos 的已下載比對範圍由「今日資料夾」擴大為「整個 output_path 遞迴掃描」，
// 回應欄位由 downloaded_today 更名為 downloaded_on_disk。
// 此 e2e 驗證前端 UI：downloaded_on_disk=true 的影片 SHALL 顯示「✅ 已下載」徽章且 checkbox 停用；
// false 者不顯示徽章、可勾選。（whole-root 掃描的正確性由 backend 單元測試涵蓋；此處 API 為 mock。）

const ON_DISK_VIDEO = {
  video_id: 'od0001',
  title: '舊片重現',
  url: 'https://www.youtube.com/watch?v=od0001',
  thumbnail: 'https://i.ytimg.com/vi/od0001/mqdefault.jpg',
  published: new Date(Date.now() - 3600_000).toISOString(),
  duration_seconds: 600,
  channel_id: 'UC_od',
  channel_title: 'On Disk Channel',
  downloaded_on_disk: true, // 後端在任一日期子資料夾找到對應檔案
}

const FRESH_VIDEO = {
  video_id: 'fr0001',
  title: 'Brand New',
  url: 'https://www.youtube.com/watch?v=fr0001',
  thumbnail: 'https://i.ytimg.com/vi/fr0001/mqdefault.jpg',
  published: new Date(Date.now() - 7200_000).toISOString(),
  duration_seconds: 300,
  channel_id: 'UC_fr',
  channel_title: 'Fresh Channel',
  downloaded_on_disk: false,
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
  await mockJson(ctx, '**/latest-videos*', { videos: [ON_DISK_VIDEO, FRESH_VIDEO] })
}

function cardByTitle(page: Page, title: string) {
  return page.locator('.video-item', { has: page.locator('.title', { hasText: title }) })
}

runVerifySuite({
  title: 'verify downloaded-on-disk-rootwide',
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
      name: 'downloaded_on_disk 影片顯示徽章且停用',
      run: async ({ page, record }) => {
        const card = cardByTitle(page, '舊片重現')
        const badgeVisible = await card.locator('.dl-badge').isVisible()
        const checkboxDisabled = await card.locator('input.video-checkbox').isDisabled()
        record(
          'downloaded_on_disk=true 顯示徽章並停用 checkbox',
          badgeVisible && checkboxDisabled ? 'PASS' : 'FAIL',
          `badgeVisible=${badgeVisible} checkboxDisabled=${checkboxDisabled}`,
        )
      },
    },
    {
      name: '允許再次下載開啟後可勾選且徽章仍在',
      run: async ({ page, record }) => {
        await page.locator('.redownload-toggle input[type="checkbox"]').setChecked(true)
        const card = cardByTitle(page, '舊片重現')
        const badgeVisible = await card.locator('.dl-badge').isVisible()
        const checkboxEnabled = await card.locator('input.video-checkbox').isEnabled()
        record(
          '開啟覆寫後 checkbox 可勾選、徽章仍顯示',
          badgeVisible && checkboxEnabled ? 'PASS' : 'FAIL',
          `badgeVisible=${badgeVisible} checkboxEnabled=${checkboxEnabled}`,
        )
        // 還原
        await page.locator('.redownload-toggle input[type="checkbox"]').setChecked(false)
      },
    },
    {
      name: '未下載影片無徽章且可勾選',
      run: async ({ page, record }) => {
        const card = cardByTitle(page, 'Brand New')
        const badgeCount = await card.locator('.dl-badge').count()
        const checkboxEnabled = await card.locator('input.video-checkbox').isEnabled()
        record(
          '未下載影片不顯示徽章且可勾選',
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
