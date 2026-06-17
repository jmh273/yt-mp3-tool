// Verify for latest-videos-pagination.
// Backend no longer caps /latest-videos at 100; the feed paginates the full
// list client-side via a "載入更多" button (page size 50).
// Run: npx tsx e2e/verify-latest-videos-pagination.ts  (from frontend/)

import type { Page } from 'playwright'
import {
  runVerifySuite,
  mockJson,
  type VerifyContext,
} from './verify-helpers'

const TOTAL = 120
const PAGE_SIZE = 50

function makeVideos(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const published = new Date(Date.now() - i * 60_000).toISOString()
    const id = `vid${String(i).padStart(3, '0')}`
    return {
      video_id: id,
      title: `驗證影片 ${i}`,
      published,
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
      duration_seconds: 600,
      channel_id: 'UC_verify',
      channel_title: '驗證頻道',
      downloaded_on_disk: false,
    }
  })
}

async function openLatestFeed(page: Page) {
  await page.locator('.left-pane button.latest-btn:not(.trending)').first().click()
  await page.waitForSelector('.latest-feed .video-grid .video-item', { timeout: 10000 })
}

function badgeTotal(text: string): number {
  const m = text.match(/(\d+)\s*部/)
  return m ? parseInt(m[1], 10) : -1
}

const tasks = [
  {
    name: '6.1 首頁只渲染 50 部，顯示「載入更多」與總數',
    run: async (v: VerifyContext) => {
      await mockJson(v.browserCtx, '**/settings', {
        latest_hours: 24,
        min_duration_minutes: 3,
        max_duration_minutes: 60,
      })
      await mockJson(v.browserCtx, '**/quota', { used: 0, limit: 10000, date: '2026-05-28' })
      await mockJson(v.browserCtx, '**/latest-videos*', { videos: makeVideos(TOTAL) })

      await openLatestFeed(v.page)

      const count = await v.page.locator('.latest-feed .video-item').count()
      v.record(
        '6.1 首頁渲染 50 部',
        count === PAGE_SIZE ? 'PASS' : 'FAIL',
        `grid 顯示 ${count} 部`,
      )

      const hasBtn = await v.page.locator('.latest-feed .load-more-btn').isVisible()
      v.record('6.1 顯示「載入更多」按鈕', hasBtn ? 'PASS' : 'FAIL', `visible=${hasBtn}`)

      const badge = await v.page.locator('.latest-feed .count-badge').innerText()
      v.record(
        '6.1 count badge 顯示總數 120（無上限警告）',
        badgeTotal(badge) === TOTAL && !badge.includes('已達上限') ? 'PASS' : 'FAIL',
        `badge="${badge.replace(/\n/g, ' ')}"`,
      )
      v.record(
        '6.1 count badge 顯示「50 / 120」',
        /50\s*\/\s*120/.test(badge) ? 'PASS' : 'FAIL',
        `badge="${badge.replace(/\n/g, ' ')}"`,
      )
    },
  },
  {
    name: '6.1 點「載入更多」逐頁追加',
    run: async (v: VerifyContext) => {
      await v.page.locator('.latest-feed .load-more-btn').click()
      await v.page.waitForFunction(
        () => document.querySelectorAll('.latest-feed .video-item').length === 100,
        null,
        { timeout: 5000 },
      )
      const count = await v.page.locator('.latest-feed .video-item').count()
      v.record('6.1 點一次後顯示 100 部', count === 100 ? 'PASS' : 'FAIL', `grid 顯示 ${count} 部`)

      const stillVisible = await v.page.locator('.latest-feed .load-more-btn').isVisible()
      v.record('6.1 尚未全部顯示時按鈕仍在', stillVisible ? 'PASS' : 'FAIL', `visible=${stillVisible}`)
    },
  },
  {
    name: '6.1 全部顯示後按鈕消失',
    run: async (v: VerifyContext) => {
      await v.page.locator('.latest-feed .load-more-btn').click()
      await v.page.waitForFunction(
        () => document.querySelectorAll('.latest-feed .video-item').length === 120,
        null,
        { timeout: 5000 },
      )
      const count = await v.page.locator('.latest-feed .video-item').count()
      v.record('6.1 再點後顯示全部 120 部', count === TOTAL ? 'PASS' : 'FAIL', `grid 顯示 ${count} 部`)

      const gone = (await v.page.locator('.latest-feed .load-more-btn').count()) === 0
      v.record('6.1 全部顯示後「載入更多」消失', gone ? 'PASS' : 'FAIL', `按鈕數=${gone ? 0 : '>0'}`)

      const badge = await v.page.locator('.latest-feed .count-badge').innerText()
      v.record(
        '6.1 全部顯示後不再有「x / 120」指示',
        !/\/\s*120/.test(badge) ? 'PASS' : 'FAIL',
        `badge="${badge.replace(/\n/g, ' ')}"`,
      )
    },
  },
]

runVerifySuite({
  title: 'Verify latest-videos-pagination — 載入更多分頁',
  tasks,
})
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e)
    process.stderr.write(`[FATAL] ${msg}\n`)
    process.exit(1)
  })
