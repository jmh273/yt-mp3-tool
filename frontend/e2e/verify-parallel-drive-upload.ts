import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson, mockPostCapture, mockSseDone } from './verify-helpers'

// 對照 spec：drive_upload_concurrency 為獨立設定且可於設定頁調整；多檔上傳逐檔回報、整批完成。
// 真正的並行行為由後端單元測試覆蓋；e2e 驗證 UI 接線（設定欄位 + 多檔上傳流程）。

const FAKE_VIDEO = {
  video_id: 'pdu01',
  title: 'Parallel Song',
  url: 'https://www.youtube.com/watch?v=pdu01',
  thumbnail: 'https://i.ytimg.com/vi/pdu01/mqdefault.jpg',
  published: '',
  duration_seconds: 180,
  channel_id: 'UC_pdu',
  channel_title: 'Parallel Channel',
}

const BASE_SETTINGS = {
  output_path: 'C:/music/YT-MP3',
  videos_per_channel: 5,
  latest_hours: 24,
  min_duration_minutes: 3,
  max_duration_minutes: 60,
  normalize_target_db: 89,
  drive_root_folder: 'YT-MP3',
  download_concurrency: 3,
  drive_upload_concurrency: 5,
}

async function commonMocks(ctx: BrowserContext) {
  await mockJson(ctx, '**/subscriptions', { channels: [] })
  await mockJson(ctx, '**/quota', { used: 0, limit: 10000, date: '2026-06-01' })
  await mockJson(ctx, '**/version', { version: 'verify' })
  await mockJson(ctx, '**/download/next-seq', { next_seq: '01', existing: [] })
  await mockJson(ctx, '**/url-preview*', { videos: [FAKE_VIDEO] })
}

async function openUrlFeedAndSelect(page: Page) {
  await page.evaluate(() => localStorage.removeItem('yt_mp3_downloaded_ids'))
  await page.locator('button.url-btn').click()
  await page.waitForSelector('.url-feed input.search-input')
  await page.locator('.url-feed input.search-input').fill('https://www.youtube.com/watch?v=pdu01')
  await page.locator('.url-feed button').filter({ hasText: /解析|Parse/ }).first().click()
  await page.waitForSelector('.url-feed .video-item')
  await page.locator('.url-feed .video-item input[type="checkbox"]').first().check()
  await page.waitForSelector('.selected-panel')
}

runVerifySuite({
  title: 'verify parallel-drive-upload',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: 'settings page shows and saves drive_upload_concurrency',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await mockJson(browserCtx, '**/settings', BASE_SETTINGS)
        // 設定儲存走 PUT；mockPostCapture 只攔 POST，這裡用自訂 route 攔 PUT、GET 交回上面的 mock。
        const putPayloads: Record<string, unknown>[] = []
        await browserCtx.route('**/settings', async (route, req) => {
          if (req.method() === 'PUT') {
            try {
              putPayloads.push(req.postDataJSON())
            } catch {
              putPayloads.push({})
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ...BASE_SETTINGS, drive_upload_concurrency: 7 }),
            })
          } else {
            await route.fallback()
          }
        })

        await page.goto('http://localhost:5173')
        await page.locator("a[href='/settings']").click()
        await page.waitForSelector('[data-testid="drive-upload-concurrency"]')
        const loaded = await page.locator('[data-testid="drive-upload-concurrency"]').inputValue()
        record('field loads existing value', loaded === '5' ? 'PASS' : 'FAIL', `value=${loaded}`)

        await page.locator('[data-testid="drive-upload-concurrency"]').fill('7')
        await page.locator("button:has-text('儲存')").click()
        await page.waitForTimeout(500)
        const payload = putPayloads[0] as { drive_upload_concurrency?: number } | undefined
        record(
          'save sends drive_upload_concurrency',
          payload?.drive_upload_concurrency === 7 ? 'PASS' : 'FAIL',
          JSON.stringify(payload),
        )
      },
    },
    {
      name: 'multi-file upload reports each file done',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await mockJson(browserCtx, '**/settings', BASE_SETTINGS)
        const uploads = await mockPostCapture(browserCtx, '**/drive/upload', { task_id: 'pdu-task' })
        await mockSseDone(browserCtx, '**/drive/upload/progress/**', {
          '01_Parallel Song.mp3': { filename: '01_Parallel Song.mp3', status: 'done', error: null },
          '02_Parallel Song.mp3': { filename: '02_Parallel Song.mp3', status: 'done', error: null },
          '03_Parallel Song.mp3': { filename: '03_Parallel Song.mp3', status: 'skipped', error: null },
        })

        await page.goto('http://localhost:5173')
        await openUrlFeedAndSelect(page)
        await page.locator('.tab-bar .tab').filter({ hasText: '上傳雲端硬碟' }).click()
        await page.waitForSelector('.upload-panel [data-testid="drive-upload-button"]')
        await page.locator('[data-testid="drive-upload-button"]').click()
        await page.waitForTimeout(600)

        const started = uploads.payloads.length === 1
        record('upload request sent', started ? 'PASS' : 'FAIL', JSON.stringify(uploads.payloads[0]))

        const doneCount = await page.locator('.upload-panel').getByText(/完成|done/i).count()
        record('per-file final states rendered', doneCount >= 1 ? 'PASS' : 'FAIL', `done markers=${doneCount}`)
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
