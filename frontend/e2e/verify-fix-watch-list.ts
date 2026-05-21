// Regression-style verify for fix-watch-list-url-parsing (archived 2026-05-21).
// Run: npx tsx e2e/verify-fix-watch-list.ts  (from frontend/)

import type { Page } from 'playwright'
import { BASE_URL } from './helpers'
import {
  runVerifySuite,
  mockPostCapture,
  type VerifyContext,
} from './verify-helpers'

const BUG_URL =
  'https://www.youtube.com/watch?v=2oW8gnmnXrU&list=PLaSVd_PZ_Y7yDFfkc4WnWlTApcw2vumlq'
const PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PLaSVd_PZ_Y7yDFfkc4WnWlTApcw2vumlq'
const SINGLE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

async function openUrlFeed(page: Page) {
  await page.locator("button:has-text('網址下載')").first().click()
  await page.waitForSelector('.url-feed input.search-input', { timeout: 5000 })
}

async function parseUrl(page: Page, url: string) {
  await page.locator('.url-feed input.search-input').fill(url)
  await page.locator(".url-feed button:has-text('解析')").click()
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll('.url-feed .video-item').length
      const err = !!document.querySelector('.url-feed .status.error')
      const empty = !!document.querySelector('.url-feed .status.empty-state')
      return items > 0 || err || empty
    },
    null,
    { timeout: 60000 },
  )
}

async function getFirstVideoId(page: Page): Promise<string | null> {
  const src = await page
    .locator('.url-feed .video-item:first-child .thumb')
    .getAttribute('src')
  if (!src) return null
  const m = src.match(/\/vi\/([^/]+)\//)
  return m ? m[1] : null
}

const tasks = [
  {
    name: 'TASK 3.1: parse bug URL (watch+list, 205 entries)',
    run: async (v: VerifyContext) => {
      await openUrlFeed(v.page)
      await parseUrl(v.page, BUG_URL)
      const itemCount = await v.page.locator('.url-feed .video-item').count()
      const firstId = await getFirstVideoId(v.page)
      const pagerText = await v.page.locator('.url-feed .pager').first().innerText().catch(() => '')
      const countText = await v.page
        .locator('.url-feed .selected-count')
        .innerText()
        .catch(() => '')
      const m = countText.match(/共\s*(\d+)\s*部/)
      const total = m ? parseInt(m[1], 10) : -1

      v.record(
        '3.1 預設每頁顯示 25 筆',
        itemCount === 25 ? 'PASS' : 'FAIL',
        `grid 顯示 ${itemCount} 筆`,
      )
      v.record(
        '3.1 第一筆 video_id 是真實影片 ID',
        firstId === '2oW8gnmnXrU' ? 'PASS' : 'FAIL',
        `firstId=${firstId}`,
      )
      v.record(
        '3.1 分頁列顯示「第 1 / 9 頁」',
        /第\s*1\s*\/\s*9\s*頁/.test(pagerText) ? 'PASS' : 'FAIL',
        `pagerText="${pagerText.replace(/\n/g, ' ')}"`,
      )
      v.record(
        '3.1 解析回傳總影片數 = 205',
        total === 205 ? 'PASS' : 'FAIL',
        `總數=${total}`,
      )
    },
  },
  {
    name: 'TASK 3.2: download payload uses real video_id',
    run: async (v: VerifyContext) => {
      // Capture POST /download payload while mocking out the actual download.
      const dl = await mockPostCapture(v.browserCtx, '**/download', { task_id: 'verify-fake' })
      await v.page
        .locator('.url-feed .video-item:first-child input[type="checkbox"]')
        .check()
      await v.page.locator('.selected-panel button.dl').click()
      await v.page.waitForTimeout(800)

      if (dl.payloads.length === 0) {
        v.record('3.2 POST /download 被觸發', 'FAIL', '0 payload captured')
        return
      }
      const vids = (dl.payloads[0].videos as { video_id: string }[]) ?? []
      const sentId = vids[0]?.video_id
      v.record(
        '3.2 POST /download payload 的 video_id 是真實影片 ID',
        sentId === '2oW8gnmnXrU' ? 'PASS' : 'FAIL',
        `videos[0].video_id=${sentId}`,
      )
      await v.page.reload()
    },
  },
  {
    name: 'TASK 3.3: regression — pure single video URL',
    run: async (v: VerifyContext) => {
      await openUrlFeed(v.page)
      await parseUrl(v.page, SINGLE_URL)
      const itemCount = await v.page.locator('.url-feed .video-item').count()
      const firstId = await getFirstVideoId(v.page)
      v.record('3.3 純單一影片 URL 回 1 筆', itemCount === 1 ? 'PASS' : 'FAIL', `count=${itemCount}`)
      v.record(
        '3.3 video_id 是預期值',
        firstId === 'dQw4w9WgXcQ' ? 'PASS' : 'FAIL',
        `firstId=${firstId}`,
      )
    },
  },
  {
    name: 'TASK 3.4: regression — pure playlist URL',
    run: async (v: VerifyContext) => {
      await v.page.goto(BASE_URL)
      await openUrlFeed(v.page)
      await parseUrl(v.page, PLAYLIST_URL)
      const itemCount = await v.page.locator('.url-feed .video-item').count()
      const firstId = await getFirstVideoId(v.page)
      const countText = await v.page
        .locator('.url-feed .selected-count')
        .innerText()
        .catch(() => '')
      const m = countText.match(/共\s*(\d+)\s*部/)
      const total = m ? parseInt(m[1], 10) : -1

      v.record(
        '3.4 純 playlist URL 解析成功有結果',
        itemCount > 0 ? 'PASS' : 'FAIL',
        `當頁顯示 ${itemCount} 筆`,
      )
      v.record('3.4 純 playlist URL 總數 = 205', total === 205 ? 'PASS' : 'FAIL', `總數=${total}`)
      v.record(
        '3.4 純 playlist URL 第一筆是真實影片 ID',
        firstId === '2oW8gnmnXrU' ? 'PASS' : 'FAIL',
        `firstId=${firstId}`,
      )
    },
  },
]

runVerifySuite({
  title: 'Verify fix-watch-list-url-parsing — 3.1–3.4',
  tasks,
})
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e)
    process.stderr.write(`[FATAL] ${msg}\n`)
    process.exit(1)
  })
