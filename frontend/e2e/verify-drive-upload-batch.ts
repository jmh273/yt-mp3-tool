import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson, mockPostCapture, mockSseDone } from './verify-helpers'

const FAKE_VIDEO = {
  video_id: 'drivefake01',
  title: 'Drive Batch Song',
  url: 'https://www.youtube.com/watch?v=drivefake01',
  thumbnail: 'https://i.ytimg.com/vi/drivefake01/mqdefault.jpg',
  published: '',
  duration_seconds: 180,
  channel_id: 'UC_drive',
  channel_title: 'Drive Channel',
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
  await page.locator('.url-feed input.search-input').fill('https://www.youtube.com/watch?v=drivefake01')
  await page.locator('.url-feed button').filter({ hasText: /解析|Parse|閫/ }).first().click()
  await page.waitForSelector('.url-feed .video-item')
  await page.locator('.url-feed .video-item input[type="checkbox"]').first().check()
  await page.waitForSelector('.selected-panel')
}

async function gotoUploadTab(page: Page) {
  await page.locator('.tab-bar .tab').filter({ hasText: '上傳雲端硬碟' }).click()
  await page.waitForSelector('.upload-panel [data-testid="drive-upload-button"]')
}

runVerifySuite({
  title: 'verify drive-upload-batch',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: 'target_dir download payload and manual upload',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        const downloads = await mockPostCapture(browserCtx, '**/download', { task_id: 'download-task' })
        await mockSseDone(browserCtx, '**/download/progress/**', {
          drivefake01: { title: 'Drive Batch Song', percent: 100, status: 'done' },
        })
        const uploads = await mockPostCapture(browserCtx, '**/drive/upload', { task_id: 'drive-task' })
        await mockSseDone(browserCtx, '**/drive/upload/progress/**', {
          '01_Drive Batch Song.mp3': { filename: '01_Drive Batch Song.mp3', status: 'done', error: null },
        })

        if (!(await page.locator('.selected-panel').isVisible().catch(() => false))) {
          await page.goto('http://localhost:5173')
          await openUrlFeed(page)
        }
        await page.locator('[data-testid="download-target-dir"]').fill('20260601_sports')
        await page.locator('.selected-panel button.dl').click()
        await page.waitForTimeout(500)

        const payload = downloads.payloads[0]
        record(
          'download target_dir',
          payload?.target_dir === '20260601_sports' ? 'PASS' : 'FAIL',
          JSON.stringify(payload),
        )

        await gotoUploadTab(page)
        await page.locator('[data-testid="drive-upload-button"]').click()
        await page.waitForTimeout(500)
        record(
          'manual upload directory',
          uploads.payloads[0]?.directory === 'C:/music/YT-MP3/20260601_sports' ? 'PASS' : 'FAIL',
          JSON.stringify(uploads.payloads[0]),
        )
      },
    },
    {
      name: 'folder chooser marks uploaded and uses selected folder',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await mockJson(browserCtx, '**/drive/upload/folders', {
          folders: [
            { name: '20260601_sports', directory: 'C:/music/YT-MP3/20260601_sports', uploaded: true },
            { name: '20260601_evening', directory: 'C:/music/YT-MP3/20260601_evening', uploaded: false },
          ],
        })
        const uploads = await mockPostCapture(browserCtx, '**/drive/upload', { task_id: 'drive-task-2' })
        await mockSseDone(browserCtx, '**/drive/upload/progress/**', {})

        if (!(await page.locator('.selected-panel').isVisible().catch(() => false))) {
          await page.goto('http://localhost:5173')
          await openUrlFeed(page)
        }
        await gotoUploadTab(page)
        await page.locator('.choose-btn').click()
        await page.waitForSelector('.folder-modal')
        const uploadedVisible = await page.locator('.uploaded-mark').first().isVisible()
        await page.locator('.folder-choice').filter({ hasText: '20260601_evening' }).click()
        await page.locator('[data-testid="drive-upload-button"]').click()
        await page.waitForTimeout(300)

        record('uploaded marker visible', uploadedVisible ? 'PASS' : 'FAIL', '')
        record(
          'selected folder uploaded',
          uploads.payloads[0]?.directory === 'C:/music/YT-MP3/20260601_evening' ? 'PASS' : 'FAIL',
          JSON.stringify(uploads.payloads[0]),
        )
      },
    },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('yt_mp3_last_work_dir'))
  },
}).then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`)
    process.exit(1)
  })
