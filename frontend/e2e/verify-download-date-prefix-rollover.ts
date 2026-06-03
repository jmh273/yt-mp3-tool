import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson } from './verify-helpers'

// 對照 spec：啟動帶入「下載到」預設資料夾名稱時，若以 8 碼日期(YYYYMMDD)開頭且非當日，
// 換成當日日期、保留後面標籤；無前綴不動。此處驗證 stale 前綴會被翻新為今日。

const FAKE_VIDEO = {
  video_id: 'rollover01',
  title: 'Rollover Song',
  url: 'https://www.youtube.com/watch?v=rollover01',
  thumbnail: 'https://i.ytimg.com/vi/rollover01/mqdefault.jpg',
  published: '',
  duration_seconds: 180,
  channel_id: 'UC_roll',
  channel_title: 'Rollover Channel',
}

function todayYyyymmdd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
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
    download_concurrency: 3,
    drive_upload_concurrency: 3,
  })
  await mockJson(ctx, '**/download/next-seq', { next_seq: '01', existing: [] })
  await mockJson(ctx, '**/url-preview*', { videos: [FAKE_VIDEO] })
}

async function openUrlFeedAndSelect(page: Page) {
  await page.locator('button.url-btn').click()
  await page.waitForSelector('.url-feed input.search-input')
  await page.locator('.url-feed input.search-input').fill('https://www.youtube.com/watch?v=rollover01')
  await page.locator('.url-feed button').filter({ hasText: /解析|Parse/ }).first().click()
  await page.waitForSelector('.url-feed .video-item')
  await page.locator('.url-feed .video-item input[type="checkbox"]').first().check()
  await page.waitForSelector('.selected-panel')
}

runVerifySuite({
  title: 'verify download-date-prefix-rollover',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: 'stale date prefix rolls to today, suffix preserved',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        // 先植入 stale 的上次資料夾名（昨年同月日 + _sports），store 在頁面載入時讀取
        await page.goto('http://localhost:5173')
        await page.evaluate(() => {
          localStorage.setItem('yt_mp3_last_work_dir', '20200101_sports')
          localStorage.removeItem('yt_mp3_downloaded_ids')
        })
        await page.reload()
        await openUrlFeedAndSelect(page)

        const value = await page.locator('[data-testid="download-target-dir"]').inputValue()
        const today = todayYyyymmdd()
        const ok = value.endsWith(`${today}_sports`) && !value.includes('20200101')
        record('default target dir rolled to today', ok ? 'PASS' : 'FAIL', `value=${value} today=${today}`)
      },
    },
    {
      name: 'no date prefix is left unchanged',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.goto('http://localhost:5173')
        await page.evaluate(() => {
          localStorage.setItem('yt_mp3_last_work_dir', 'mylabel')
          localStorage.removeItem('yt_mp3_downloaded_ids')
        })
        await page.reload()
        await openUrlFeedAndSelect(page)

        const value = await page.locator('[data-testid="download-target-dir"]').inputValue()
        const ok = value.endsWith('mylabel') && !/\d{8}mylabel$/.test(value)
        record('non-date name unchanged', ok ? 'PASS' : 'FAIL', `value=${value}`)
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
