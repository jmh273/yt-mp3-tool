import type { BrowserContext } from 'playwright'
import { runVerifySuite, mockJson, mockPostCapture } from './verify-helpers'

const SELECTED_VIDEO = {
  video_id: 'seq-target-01',
  title: 'Seq Target Song',
  url: 'https://www.youtube.com/watch?v=seq-target-01',
  thumbnail: 'https://i.ytimg.com/vi/seq-target-01/mqdefault.jpg',
  published: '',
  duration_seconds: 180,
  channel_id: 'UC_seq_target',
  channel_title: 'Seq Target Channel',
}

async function commonMocks(ctx: BrowserContext) {
  await mockJson(ctx, '**/subscriptions', { channels: [] })
  await mockJson(ctx, '**/quota', { used: 0, limit: 10000, date: '2026-06-23' })
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
  await ctx.unroute('**/download/next-seq').catch(() => {})
  await ctx.route('**/download/next-seq**', async (route) => {
    const url = new URL(route.request().url())
    const dir = url.searchParams.get('dir')
    const body = dir === 'myalbum'
      ? { next_seq: '04', existing: [1, 2, 3] }
      : { next_seq: '10', existing: [9] }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const sseBody = `data: ${JSON.stringify({ status: 'done', items: {} })}\n\n`
  await ctx.unroute('**/download/progress/**').catch(() => {})
  await ctx.route('**/download/progress/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody })
  })
}

runVerifySuite({
  title: 'verify fix-seq-target-dir-mismatch',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: 'target folder change refreshes next-seq and download payload',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        const postCapture = await mockPostCapture(browserCtx, '**/download', { task_id: 'seq-target-task' })
        await page.evaluate((video) => {
          localStorage.setItem('yt_mp3_selected', JSON.stringify([video]))
          localStorage.removeItem('yt_mp3_downloaded_ids')
        }, SELECTED_VIDEO)
        await page.reload()
        await page.waitForSelector('.selected-panel')
        await page.locator('[data-testid="download-target-dir"]').fill('C:/music/YT-MP3/myalbum')
        await page.waitForFunction(() => {
          const input = document.querySelector<HTMLInputElement>('.start-seq-input')
          return input?.value === '04'
        })
        await page.locator('.selected-panel .dl').click()
        await page.waitForTimeout(200)

        const payload = postCapture.payloads[0]
        const ok = payload?.target_dir === 'myalbum' && payload?.start_seq === '04' && payload?.seq_enabled === true
        record(
          'custom target uses matching next-seq',
          ok ? 'PASS' : 'FAIL',
          JSON.stringify({ target_dir: payload?.target_dir, start_seq: payload?.start_seq, seq_enabled: payload?.seq_enabled }),
        )
      },
    },
    {
      name: 'manual stale date target is not rolled over',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        const postCapture = await mockPostCapture(browserCtx, '**/download', { task_id: 'seq-target-dirty-task' })
        await page.evaluate((video) => {
          localStorage.setItem('yt_mp3_selected', JSON.stringify([video]))
        }, SELECTED_VIDEO)
        await page.reload()
        await page.waitForSelector('.selected-panel')
        await page.locator('[data-testid="download-target-dir"]').fill('C:/music/YT-MP3/20260622_manual')
        await page.locator('.selected-panel .dl').click()
        await page.waitForTimeout(200)

        const payload = postCapture.payloads[0]
        const ok = payload?.target_dir === '20260622_manual'
        record('manual target remains dirty', ok ? 'PASS' : 'FAIL', `target_dir=${payload?.target_dir}`)
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
