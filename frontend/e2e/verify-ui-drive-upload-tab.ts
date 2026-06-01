import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson } from './verify-helpers'

const FAKE_VIDEO = {
  video_id: 'uitab01',
  title: 'UI Tab Song',
  url: 'https://www.youtube.com/watch?v=uitab01',
  thumbnail: 'https://i.ytimg.com/vi/uitab01/mqdefault.jpg',
  published: '',
  duration_seconds: 180,
  channel_id: 'UC_uitab',
  channel_title: 'UI Tab Channel',
}

async function commonMocks(ctx: BrowserContext) {
  await mockJson(ctx, '**/subscriptions', { channels: [] })
  await mockJson(ctx, '**/quota', { used: 0, limit: 10000, date: '2026-06-01' })
  await mockJson(ctx, '**/version', { version: 'verify' })
  await mockJson(ctx, '**/settings', {
    output_path: 'C:/music/YT-MP3',
    videos_per_channel: 5,
    latest_hours: 24,
    min_duration_minutes: 3,
    max_duration_minutes: 60,
    normalize_target_db: 89,
    drive_root_folder: 'YT-MP3',
  })
  await mockJson(ctx, '**/download/next-seq', { next_seq: '01', existing: [] })
  await mockJson(ctx, '**/url-preview*', { videos: [FAKE_VIDEO] })
}

async function openUrlFeed(page: Page) {
  await page.evaluate(() => localStorage.removeItem('yt_mp3_downloaded_ids'))
  await page.locator('button.url-btn').click()
  await page.waitForSelector('.url-feed input.search-input')
  await page.locator('.url-feed input.search-input').fill('https://www.youtube.com/watch?v=uitab01')
  await page.locator('.url-feed button').filter({ hasText: /解析|Parse|閫/ }).first().click()
  await page.waitForSelector('.url-feed .video-item')
  await page.locator('.url-feed .video-item input[type="checkbox"]').first().check()
  await page.waitForSelector('.selected-panel')
}

const FULL_PATH_RE = /^C:\/music\/YT-MP3\/\d{8}$/

runVerifySuite({
  title: 'verify ui-drive-upload-tab',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: 'three tabs present and switch correctly',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.goto('http://localhost:5173')
        await openUrlFeed(page)

        const tabTexts = await page.locator('.tab-bar .tab').allInnerTexts()
        const labels = tabTexts.map((t) => t.trim())
        record(
          'three tabs in order',
          labels[0] === '下載' && labels[1] === '音量正規化' && labels[2] === '上傳雲端硬碟' ? 'PASS' : 'FAIL',
          JSON.stringify(labels),
        )

        // 預設下載分頁可見
        const downloadVisible = await page.locator('.selected-panel').isVisible()
        record('default download panel visible', downloadVisible ? 'PASS' : 'FAIL', '')

        // 切到上傳分頁
        await page.locator('.tab-bar .tab').filter({ hasText: '上傳雲端硬碟' }).click()
        await page.waitForSelector('.upload-panel')
        const uploadBtnText = (await page.locator('[data-testid="drive-upload-button"]').innerText()).trim()
        record('upload button label', uploadBtnText === '上傳雲端硬碟' ? 'PASS' : 'FAIL', uploadBtnText)
        const downloadHidden = !(await page.locator('.selected-panel').isVisible().catch(() => false))
        record('download panel hidden on upload tab', downloadHidden ? 'PASS' : 'FAIL', '')
      },
    },
    {
      name: 'full path shown in download and upload dir fields',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        if (!(await page.locator('.tab-bar').isVisible().catch(() => false))) {
          await page.goto('http://localhost:5173')
          await openUrlFeed(page)
        }

        await page.locator('.tab-bar .tab').filter({ hasText: '下載' }).click()
        await page.waitForSelector('[data-testid="download-target-dir"]')
        const downloadDir = await page.locator('[data-testid="download-target-dir"]').inputValue()
        record('download target dir is full path', FULL_PATH_RE.test(downloadDir) ? 'PASS' : 'FAIL', downloadDir)

        await page.locator('.tab-bar .tab').filter({ hasText: '上傳雲端硬碟' }).click()
        await page.waitForSelector('[data-testid="drive-upload-dir"]')
        const uploadDir = await page.locator('[data-testid="drive-upload-dir"]').inputValue()
        record('upload local dir is full path', FULL_PATH_RE.test(uploadDir) ? 'PASS' : 'FAIL', uploadDir)
      },
    },
  ],
}).then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`)
    process.exit(1)
  })
