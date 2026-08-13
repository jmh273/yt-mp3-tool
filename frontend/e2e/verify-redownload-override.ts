// Verify for redownload-override.
// 「允許再次下載」由最新影片頁的區域 toggle 提升為全域開關（HomeView header），
// 適用於全部影片清單頁；關閉開關只恢復 checkbox 停用呈現，刻意不清除 download.selected。
// Run: npx tsx e2e/verify-redownload-override.ts  (from frontend/)

import type { BrowserContext, Page } from 'playwright'
import { runVerifySuite, mockJson, type VerifyContext } from './verify-helpers'

const TRENDING_VIDEOS = [
  {
    video_id: 'tr0001',
    title: '熱門重播片',
    url: 'https://www.youtube.com/watch?v=tr0001',
    thumbnail: 'https://i.ytimg.com/vi/tr0001/mqdefault.jpg',
    published: new Date(Date.now() - 3600_000).toISOString(),
    duration_seconds: 420,
    channel_id: 'UC_tr',
    channel_title: 'Trending Channel',
    view_count: 98765,
  },
  {
    video_id: 'tr0002',
    title: '熱門新片',
    url: 'https://www.youtube.com/watch?v=tr0002',
    thumbnail: 'https://i.ytimg.com/vi/tr0002/mqdefault.jpg',
    published: new Date(Date.now() - 7200_000).toISOString(),
    duration_seconds: 300,
    channel_id: 'UC_tr',
    channel_title: 'Trending Channel',
    view_count: 4321,
  },
]

async function commonMocks(ctx: BrowserContext) {
  await mockJson(ctx, '**/subscriptions', { channels: [] })
  await mockJson(ctx, '**/quota', { used: 0, limit: 10000, date: '2026-08-13' })
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
  await mockJson(ctx, '**/trending-videos/categories', { categories: [{ id: null, label: '全部' }] })
  await mockJson(ctx, '**/trending-videos*', { videos: TRENDING_VIDEOS, next_page_token: null })
}

function cardByTitle(page: Page, title: string) {
  return page.locator('.video-item', { has: page.locator('.title', { hasText: title }) })
}

const toggle = (page: Page) => page.locator('header .redownload-toggle input[type="checkbox"]')

const tasks = [
  {
    name: '6.1 header 提供開關且預設 OFF',
    run: async (v: VerifyContext) => {
      await commonMocks(v.browserCtx)
      await v.page.goto('http://localhost:5173')
      // 預先把 tr0001 標記為已下載，模擬「之前下載過」
      await v.page.evaluate(() => {
        localStorage.setItem('yt_mp3_downloaded_ids', JSON.stringify(['tr0001']))
        localStorage.removeItem('yt_mp3_selected')
      })
      await v.page.reload()
      // count() 不會自動等待，需先等 Vue 掛載完成
      await v.page.waitForSelector('header .redownload-toggle', { timeout: 20000 })

      const exists = await toggle(v.page).count()
      v.record('6.1 header 顯示「允許再次下載」開關', exists === 1 ? 'PASS' : 'FAIL', `count=${exists}`)

      const checked = await toggle(v.page).isChecked()
      v.record('6.1 開關預設為 OFF', checked === false ? 'PASS' : 'FAIL', `checked=${checked}`)
    },
  },
  {
    name: '6.1 非最新影片頁：開關 OFF 時已下載影片停用',
    run: async (v: VerifyContext) => {
      await v.page.locator("button:has-text('發燒影片')").first().click()
      await v.page.waitForSelector('.video-item', { timeout: 20000 })

      const card = cardByTitle(v.page, '熱門重播片')
      const disabled = await card.locator('input.video-checkbox').isDisabled()
      const badge = await card.locator('.dl-badge').isVisible()
      v.record(
        '6.1 發燒影片頁已下載影片 disabled 且顯示徽章',
        disabled && badge ? 'PASS' : 'FAIL',
        `disabled=${disabled} badgeVisible=${badge}`,
      )
    },
  },
  {
    name: '6.1 開啟開關後可勾選，徽章仍在且呈現未勾選',
    run: async (v: VerifyContext) => {
      await toggle(v.page).setChecked(true)

      const card = cardByTitle(v.page, '熱門重播片')
      const cb = card.locator('input.video-checkbox')
      const enabled = await cb.isEnabled()
      const checked = await cb.isChecked()
      const badge = await card.locator('.dl-badge').isVisible()
      v.record(
        '6.1 開關 ON 後 checkbox 可操作、呈現未勾選、徽章仍在',
        enabled && !checked && badge ? 'PASS' : 'FAIL',
        `enabled=${enabled} checked=${checked} badgeVisible=${badge}`,
      )
    },
  },
  {
    name: '6.1 點擊有明確勾選狀態變化',
    run: async (v: VerifyContext) => {
      const cb = cardByTitle(v.page, '熱門重播片').locator('input.video-checkbox')
      await cb.click()
      const afterCheck = await cb.isChecked()

      const selectedCount = await v.page.evaluate(
        () => JSON.parse(localStorage.getItem('yt_mp3_selected') || '[]').length,
      )
      v.record(
        '6.1 點擊後轉為已勾選並進入待下載清單',
        afterCheck && selectedCount === 1 ? 'PASS' : 'FAIL',
        `checked=${afterCheck} selectedCount=${selectedCount}`,
      )
    },
  },
  {
    name: '6.1 關閉開關後選取項目仍保留（B2）',
    run: async (v: VerifyContext) => {
      await toggle(v.page).setChecked(false)

      const selected = await v.page.evaluate(
        () => JSON.parse(localStorage.getItem('yt_mp3_selected') || '[]') as { video_id: string }[],
      )
      v.record(
        '6.1 關閉開關不移除已選取的已下載影片',
        selected.length === 1 && selected[0]?.video_id === 'tr0001' ? 'PASS' : 'FAIL',
        `selected=${JSON.stringify(selected.map((s) => s.video_id))}`,
      )

      const cb = cardByTitle(v.page, '熱門重播片').locator('input.video-checkbox')
      const disabled = await cb.isDisabled()
      v.record('6.1 關閉開關後恢復 disabled 呈現', disabled ? 'PASS' : 'FAIL', `disabled=${disabled}`)
    },
  },
  {
    name: '6.1 開關狀態跨清單頁保持',
    run: async (v: VerifyContext) => {
      await toggle(v.page).setChecked(true)
      await v.page.locator("button:has-text('最新影片')").first().click()
      await v.page.waitForTimeout(500)

      const stillOn = await toggle(v.page).isChecked()
      v.record('6.1 切換到最新影片頁後開關維持 ON', stillOn ? 'PASS' : 'FAIL', `checked=${stillOn}`)

      const inFeed = await v.page.locator('.latest-feed .redownload-toggle').count()
      v.record(
        '6.1 最新影片頁 filter-bar 不再有自己的開關',
        inFeed === 0 ? 'PASS' : 'FAIL',
        `feed-local toggle count=${inFeed}`,
      )
    },
  },
  {
    name: '6.1 重新整理後開關回到 OFF（不持久化）',
    run: async (v: VerifyContext) => {
      await v.page.reload()
      await v.page.waitForSelector('header .redownload-toggle', { timeout: 20000 })

      const checked = await toggle(v.page).isChecked()
      v.record('6.1 重新整理後開關為 OFF', checked === false ? 'PASS' : 'FAIL', `checked=${checked}`)

      const persisted = await v.page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.toLowerCase().includes('redownload')),
      )
      v.record(
        '6.1 localStorage 未寫入開關狀態',
        persisted.length === 0 ? 'PASS' : 'FAIL',
        `keys=${JSON.stringify(persisted)}`,
      )
    },
  },
]

runVerifySuite({
  title: 'Verify redownload-override — 全域「允許再次下載」開關',
  headless: true,
  slowMo: 0,
  tasks,
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('yt_mp3_downloaded_ids')
      localStorage.removeItem('yt_mp3_selected')
    })
  },
})
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e)
    process.stderr.write(`[FATAL] ${msg}\n`)
    process.exit(1)
  })
