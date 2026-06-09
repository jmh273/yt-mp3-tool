import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson } from './verify-helpers'

// 對照 spec（download-target-folder / download-filename-prefix）：
// 下載面板的設定欄位（下載到、起始號、格式）SHALL 在尚未選取任何影片時即顯示且預填；
// 「下載選取影片」在無選取時停用；選取影片後可正常顯示數量並啟用下載。

const FAKE_VIDEO = {
  video_id: 'prefill01',
  title: 'Prefill Song',
  url: 'https://www.youtube.com/watch?v=prefill01',
  thumbnail: 'https://i.ytimg.com/vi/prefill01/mqdefault.jpg',
  published: '',
  duration_seconds: 180,
  channel_id: 'UC_prefill',
  channel_title: 'Prefill Channel',
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
  await mockJson(ctx, '**/download/next-seq', { next_seq: '08', existing: [1, 2, 3, 4, 5, 6, 7] })
  await mockJson(ctx, '**/url-preview*', { videos: [FAKE_VIDEO] })
}

async function selectUrlVideo(page: Page) {
  await page.locator('button.url-btn').click()
  await page.waitForSelector('.url-feed input.search-input')
  await page.locator('.url-feed input.search-input').fill('https://www.youtube.com/watch?v=prefill01')
  await page.locator('.url-feed button').filter({ hasText: /解析|Parse/ }).first().click()
  await page.waitForSelector('.url-feed .video-item')
  await page.locator('.url-feed .video-item input[type="checkbox"]').first().check()
}

runVerifySuite({
  title: 'verify download-panel-prefill-fields',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: '未選取即顯示設定欄位並預填',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.goto('http://localhost:5173')
        await page.evaluate(() => localStorage.removeItem('yt_mp3_downloaded_ids'))
        await page.reload()

        // 下載分頁預設 active，面板與設定欄位即顯示（無選取）
        await page.waitForSelector('.selected-panel')
        const panelText = await page.locator('.selected-panel .header > span').first().innerText()
        const targetVisible = await page.locator('[data-testid="download-target-dir"]').isVisible()
        const targetVal = await page.locator('[data-testid="download-target-dir"]').inputValue()
        const seqVisible = await page.locator('.start-seq-input').isVisible()
        const seqVal = await page.locator('.start-seq-input').inputValue()
        const formatVisible = await page.locator('.format-select').isVisible()

        const ok =
          panelText.includes('尚未選取') &&
          targetVisible &&
          /\d{8}/.test(targetVal) &&
          seqVisible &&
          seqVal === '08' &&
          formatVisible
        record(
          '無選取時欄位即顯示且預填',
          ok ? 'PASS' : 'FAIL',
          `panel="${panelText}" target="${targetVal}" seq="${seqVal}" formatVisible=${formatVisible}`,
        )
      },
    },
    {
      name: '無選取時下載按鈕停用',
      run: async ({ page, record }) => {
        const dlDisabled = await page.locator('.selected-panel .dl').isDisabled()
        const clearDisabled = await page.locator('.selected-panel .clear').isDisabled()
        record(
          '下載/清除按鈕在無選取時停用',
          dlDisabled && clearDisabled ? 'PASS' : 'FAIL',
          `dlDisabled=${dlDisabled} clearDisabled=${clearDisabled}`,
        )
      },
    },
    {
      name: '選取影片後顯示數量並啟用下載',
      run: async ({ page, record }) => {
        await selectUrlVideo(page)
        await page.waitForSelector('.selected-panel .header > span')
        const panelText = await page.locator('.selected-panel .header > span').first().innerText()
        const dlEnabled = await page.locator('.selected-panel .dl').isEnabled()
        const ok = panelText.includes('已選取 1') && dlEnabled
        record(
          '選取後顯示數量並可下載',
          ok ? 'PASS' : 'FAIL',
          `panel="${panelText}" dlEnabled=${dlEnabled}`,
        )
      },
    },
  ],
}).then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`)
    process.exit(1)
  })
