import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson, mockPostCapture } from './verify-helpers'

// 對照 spec：
//  - sidebar-layout：最新影片 🆕 / 同類新頻道 🧭，五個功能按鈕 emoji 不重複；訂閱頻道名稱有原生 title。
//  - channel-watchlist：觀察名單頻道名稱有原生 title。
//  - directory-picker / parallel-normalize / drive-upload：輸入欄尾端 icon 開彈窗，
//    選定資料夾「只填路徑、不執行動作」（正規化不自動載入、上傳不自動上傳）。

const LONG_TITLE = '這是一個非常非常長的頻道名稱會被截斷需要 hover 才看得到全名 ABCDEFG'

const LONG_CHANNEL = {
  subscription_id: 'sub_long',
  channel_id: 'UC_long',
  title: LONG_TITLE,
  thumbnail: 'https://i.ytimg.com/vi/x/default.jpg',
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
  await mockJson(ctx, '**/subscriptions', { channels: [LONG_CHANNEL] })
  await mockJson(ctx, '**/quota', { used: 0, limit: 10000, date: '2026-06-01' })
  await mockJson(ctx, '**/version', { version: 'verify' })
  await mockJson(ctx, '**/settings', BASE_SETTINGS)
}

runVerifySuite({
  title: 'verify ui-consistency-polish',
  headless: true,
  slowMo: 0,
  tasks: [
    {
      name: 'left menu icons consistent (🆕 / 🧭, no duplicate emoji)',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.goto('http://localhost:5173')
        await page.waitForSelector('.left-pane .latest-btn')

        const latest = (await page.locator('.left-pane .latest-btn').first().textContent()) ?? ''
        record('最新影片 has 🆕', latest.includes('🆕') ? 'PASS' : 'FAIL', latest.trim())

        const discovery = (await page.locator('.left-pane .discovery-btn').textContent()) ?? ''
        record(
          '同類新頻道 has 🧭 (not 🔍)',
          discovery.includes('🧭') && !discovery.includes('🔍') ? 'PASS' : 'FAIL',
          discovery.trim(),
        )

        const emojiRe = /\p{Extended_Pictographic}/gu
        const texts = await page.locator('.left-pane button.latest-btn').allTextContents()
        const emojis = texts.map((t) => (t.match(emojiRe) ?? []).join('')).filter(Boolean)
        const unique = new Set(emojis)
        record(
          'function buttons have no duplicate emoji',
          emojis.length === unique.size ? 'PASS' : 'FAIL',
          emojis.join(' '),
        )
      },
    },
    {
      name: 'subscribed channel name exposes full title on hover',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.goto('http://localhost:5173')
        await page.waitForSelector('.channel-card .channel-title')
        const title = await page.locator('.channel-card .channel-title').first().getAttribute('title')
        record('channel-title title attr = full name', title === LONG_TITLE ? 'PASS' : 'FAIL', String(title))
      },
    },
    {
      name: 'watchlist channel name exposes full title on hover',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await page.goto('http://localhost:5173')
        await page.waitForSelector('.channel-card .watchlist-add-btn')
        // 把長名稱頻道加入觀察名單，再切到觀察名單 tab
        await page.locator('.channel-card .watchlist-add-btn').first().click()
        await page.locator('.left-tab-bar .left-tab').filter({ hasText: '觀察名單' }).click()
        await page.waitForSelector('.watchlist-title')
        const title = await page.locator('.watchlist-title').first().getAttribute('title')
        record('watchlist-title title attr = full name', title === LONG_TITLE ? 'PASS' : 'FAIL', String(title))
      },
    },
    {
      name: 'normalize picker fills path only (no auto load)',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await mockJson(browserCtx, '**/folders', {
          folders: [{ name: '20260601_evening', directory: 'C:/music/YT-MP3/20260601_evening' }],
        })
        // 若 picker 誤觸發載入，會打到此端點 — 用 capture 確認「未被呼叫」
        const loadCalls = await mockPostCapture(browserCtx, '**/normalize/load', { directory: '', files: [] })

        await page.goto('http://localhost:5173')
        await page.locator('.tab-bar .tab').filter({ hasText: '正規化' }).click()
        await page.waitForSelector('.normalizer [data-testid="dir-picker-icon"]')
        await page.locator('.normalizer [data-testid="dir-picker-icon"]').click()
        await page.waitForSelector('[data-testid="dir-picker-choice"]')
        await page.locator('[data-testid="dir-picker-choice"]').first().click()

        const val = await page.locator('.normalizer [data-testid="dir-picker-input"]').inputValue()
        record('picker fills path', val === 'C:/music/YT-MP3/20260601_evening' ? 'PASS' : 'FAIL', val)
        record('no auto load triggered', loadCalls.payloads.length === 0 ? 'PASS' : 'FAIL', `loadCalls=${loadCalls.payloads.length}`)
      },
    },
    {
      name: 'drive picker fills path only (no auto upload) + uploaded badge',
      run: async ({ page, browserCtx, record }) => {
        await commonMocks(browserCtx)
        await mockJson(browserCtx, '**/drive/upload/folders', {
          folders: [{ name: '20260601_done', directory: 'C:/music/YT-MP3/20260601_done', uploaded: true }],
        })
        const uploads = await mockPostCapture(browserCtx, '**/drive/upload', { task_id: 'x' })

        await page.goto('http://localhost:5173')
        await page.locator('.tab-bar .tab').filter({ hasText: '上傳' }).click()
        await page.waitForSelector('.upload-panel [data-testid="dir-picker-icon"]')
        await page.locator('.upload-panel [data-testid="dir-picker-icon"]').click()
        await page.waitForSelector('[data-testid="dir-picker-choice"]')

        const badge = await page.locator('.folder-badge').first().textContent()
        record('uploaded badge shown', (badge ?? '').includes('已上傳') ? 'PASS' : 'FAIL', String(badge))

        await page.locator('[data-testid="dir-picker-choice"]').first().click()
        const val = await page.locator('.upload-panel [data-testid="dir-picker-input"]').inputValue()
        record('picker fills path', val === 'C:/music/YT-MP3/20260601_done' ? 'PASS' : 'FAIL', val)
        record('no auto upload triggered', uploads.payloads.length === 0 ? 'PASS' : 'FAIL', `uploadCalls=${uploads.payloads.length}`)
      },
    },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('yt_mp3_last_work_dir')
      localStorage.removeItem('watchlist:shared')
    })
  },
}).then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`)
    process.exit(1)
  })
