import type { BrowserContext } from 'playwright'
import { runVerifySuite, mockJson, mockPostCapture } from './verify-helpers'

const persistedVideos = [
  {
    video_id: 'resume-ok',
    title: 'Resume OK',
    url: 'https://www.youtube.com/watch?v=resume-ok',
    thumbnail: 'https://i.ytimg.com/vi/resume-ok/mqdefault.jpg',
    published: '',
    duration_seconds: 180,
    channel_id: 'UC_resume',
    channel_title: 'Resume Channel',
  },
  {
    video_id: 'resume-fail',
    title: 'Resume Fail',
    url: 'https://www.youtube.com/watch?v=resume-fail',
    thumbnail: 'https://i.ytimg.com/vi/resume-fail/mqdefault.jpg',
    published: '',
    duration_seconds: 200,
    channel_id: 'UC_resume',
    channel_title: 'Resume Channel',
  },
]

async function commonMocks(browserCtx: BrowserContext) {
  await mockJson(browserCtx, '**/subscriptions', { channels: [] })
  await mockJson(browserCtx, '**/quota', { used: 0, limit: 10000, date: '2026-06-01' })
  await mockJson(browserCtx, '**/version', { version: 'verify' })
  await mockJson(browserCtx, '**/settings', {
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
  await mockJson(browserCtx, '**/download/next-seq', { next_seq: '01', existing: [] })
}

async function mockMixedProgress(browserCtx: BrowserContext) {
  await browserCtx.unroute('**/download/progress/**').catch(() => {})
  const items = {
    'resume-ok': { title: 'Resume OK', percent: 100, status: 'done' },
    'resume-fail': { title: 'Resume Fail', percent: 0, status: 'error', error: 'network failed' },
  }
  const body = `data: ${JSON.stringify({ status: 'done', items })}\n\n`
  await browserCtx.route('**/download/progress/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
}

runVerifySuite({
  title: 'verify resilient-download-resume',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: 'restores selected videos from localStorage',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.evaluate((videos) => {
          localStorage.setItem('yt_mp3_selected', JSON.stringify(videos))
          localStorage.removeItem('yt_mp3_downloaded_ids')
        }, persistedVideos)
        await page.reload()
        await page.waitForSelector('.selected-panel')

        const panelText = await page.locator('.selected-panel .header > span').first().innerText()
        const dlEnabled = await page.locator('.selected-panel .dl').isEnabled()
        const listTitles = await page.locator('.selected-list .selected-item .stitle').allInnerTexts()
        const titlesShown =
          listTitles.length === 2 &&
          listTitles.some((t) => t.includes('Resume OK')) &&
          listTitles.some((t) => t.includes('Resume Fail'))
        const ok = panelText.includes('2') && dlEnabled && titlesShown
        record(
          'selected resumes after reload',
          ok ? 'PASS' : 'FAIL',
          `panel="${panelText}" dlEnabled=${dlEnabled} titles=${JSON.stringify(listTitles)}`,
        )
      },
    },
    {
      name: 'keeps failed video selected and shows completed progress',
      run: async ({ page, browserCtx, record }) => {
        const postCapture = await mockPostCapture(browserCtx, '**/download', { task_id: 'resume-task' })
        await mockMixedProgress(browserCtx)

        await page.locator('.selected-panel .dl').click()
        await page.waitForSelector('.progress-list .bar.error')

        const selectedIds = await page.evaluate(() => {
          const raw = localStorage.getItem('yt_mp3_selected') || '[]'
          return JSON.parse(raw).map((v: { video_id: string }) => v.video_id)
        })
        const sentCount = Array.isArray(postCapture.payloads[0]?.videos)
          ? (postCapture.payloads[0].videos as unknown[]).length
          : 0
        const progressVisible = await page.locator('.progress-list').isVisible()
        const errorVisible = await page.locator('.progress-list .bar.error').isVisible()
        const ok =
          sentCount === 2 &&
          progressVisible &&
          errorVisible &&
          JSON.stringify(selectedIds) === JSON.stringify(['resume-fail'])

        record(
          'done removes only successful video',
          ok ? 'PASS' : 'FAIL',
          `sent=${sentCount} selected=${JSON.stringify(selectedIds)} progress=${progressVisible} error=${errorVisible}`,
        )
      },
    },
    {
      name: 'clear all removes persisted retry state and progress',
      run: async ({ page, record }) => {
        await page.locator('.selected-panel .clear').click()
        const selectedRaw = await page.evaluate(() => localStorage.getItem('yt_mp3_selected'))
        const progressVisible = await page.locator('.progress-list').isVisible().catch(() => false)
        const ok = selectedRaw === '[]' && !progressVisible
        record('clearAll clears selected and progress', ok ? 'PASS' : 'FAIL', `selected=${selectedRaw} progress=${progressVisible}`)
      },
    },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('yt_mp3_selected')
      localStorage.removeItem('yt_mp3_downloaded_ids')
    })
  },
}).then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`)
    process.exit(1)
  })
