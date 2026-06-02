// One-shot verification for auto-post-download-pipeline (task 6.1).
// Run: npx tsx e2e/verify-auto-post-download-pipeline.ts   (from frontend/)
//
// 驗證下載面板「下載完成後自動正規化並上傳」勾選框的前端串接：
//   A) mp3 + 勾選 → 下載 done → 自動 normalize → 自動 upload（右欄走到上傳面板）
//   B) mp4 + 勾選 → 下載 done → 跳過 normalize、直接 upload
//   C) 未勾選 → 下載 done → 不 normalize、不 upload（右欄留在下載）
// 全程 mock 後端端點與 SSE，不動真實配額/檔案。API 走 /api 前綴（dev）。

import { chromium, type Page, type Route, type Request, type BrowserContext } from 'playwright'
import { BASE_URL, STORAGE_STATE_PATH, preconditionCheck, log } from './helpers'

interface Result { task: string; status: 'PASS' | 'FAIL'; detail: string }
const results: Result[] = []
function record(task: string, status: 'PASS' | 'FAIL', detail: string) {
  results.push({ task, status, detail })
  log(`  [${status}] ${task}: ${detail}`)
}

const DIR = 'C:\\fake\\YT-MP3\\20260602'

const FAKE_VIDEOS = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    video_id: `apdp${String(i).padStart(2, '0')}`,
    title: `Pipeline Video ${i + 1}`,
    url: `https://www.youtube.com/watch?v=apdp${String(i).padStart(2, '0')}`,
    thumbnail: '', published: '', duration_seconds: 180 + i,
    channel_id: 'UC_x', channel_title: 'X',
  }))

function sse(body: object) {
  return `data: ${JSON.stringify(body)}\n\n`
}

interface Captured { normalizeStart: Record<string, unknown>[]; driveUpload: Record<string, unknown>[] }

async function installMocks(ctx: BrowserContext, videoCount: number): Promise<Captured> {
  const cap: Captured = { normalizeStart: [], driveUpload: [] }
  const routes: [string, (r: Route, req: Request) => Promise<void>][] = [
    ['**/api/settings', async (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ output_path: 'C:\\fake\\YT-MP3', videos_per_channel: 5, latest_hours: 24,
        discovery_keyword_top_n: 8, min_duration_minutes: 3, max_duration_minutes: 60,
        normalize_target_db: 89, drive_root_folder: 'YT-MP3', download_concurrency: 3 }) })],
    ['**/api/url-preview*', async (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ videos: FAKE_VIDEOS(videoCount) }) })],
    ['**/api/download/next-seq', async (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ next_seq: '01', existing: [] }) })],
    ['**/api/download', async (r, req) => {
      if (req.method() !== 'POST') return r.continue()
      await r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ task_id: 'dl-task', directory: DIR }) })
    }],
    ['**/api/download/progress/**', async (r) => {
      const items: Record<string, unknown> = {}
      FAKE_VIDEOS(videoCount).forEach((v) => (items[v.video_id] = { title: v.title, percent: 100, status: 'done' }))
      await r.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ status: 'done', items }) })
    }],
    ['**/api/normalize/list*', async (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ directory: DIR, files: [
        { filename: '01_a.mp3', size_bytes: 1, needs_rename: false, suggested_name: '01_a.mp3' },
        { filename: '02_b.mp3', size_bytes: 1, needs_rename: false, suggested_name: '02_b.mp3' },
      ] }) })],
    ['**/api/normalize/start', async (r, req) => {
      if (req.method() !== 'POST') return r.continue()
      try { cap.normalizeStart.push(req.postDataJSON()) } catch { cap.normalizeStart.push({}) }
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task_id: 'norm-task' }) })
    }],
    ['**/api/normalize/progress/**', async (r) => r.fulfill({ status: 200, contentType: 'text/event-stream',
      body: sse({ status: 'done', items: {
        '01_a.mp3': { filename: '01_a.mp3', status: 'done', measured_db: 84, target_db: 89, recommended_db_change: 5, error: null },
        '02_b.mp3': { filename: '02_b.mp3', status: 'done', measured_db: 85, target_db: 89, recommended_db_change: 4, error: null },
      } }) })],
    ['**/api/drive/upload', async (r, req) => {
      if (req.method() !== 'POST') return r.continue()
      try { cap.driveUpload.push(req.postDataJSON()) } catch { cap.driveUpload.push({}) }
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task_id: 'up-task' }) })
    }],
    ['**/api/drive/upload/progress/**', async (r) => r.fulfill({ status: 200, contentType: 'text/event-stream',
      body: sse({ status: 'done', directory: DIR, items: {
        '01_a.mp3': { filename: '01_a.mp3', status: 'done', error: null },
      } }) })],
    ['**/api/drive/upload/folders', async (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ folders: [] }) })],
  ]
  for (const [pat, handler] of routes) {
    await ctx.unroute(pat).catch(() => {})
    await ctx.route(pat, handler)
  }
  return cap
}

async function selectVideos(page: Page, n: number) {
  await page.locator("button:has-text('網址下載')").first().click()
  await page.waitForSelector('.url-feed input.search-input', { timeout: 5000 })
  await page.locator('.url-feed input.search-input').fill('https://www.youtube.com/playlist?list=fake')
  await page.locator(".url-feed button:has-text('解析')").click()
  await page.waitForSelector('.url-feed .video-item', { timeout: 10000 })
  for (let i = 0; i < n; i++) {
    await page.locator(`.url-feed .video-item:nth-child(${i + 1}) input[type='checkbox']`).check()
  }
  await page.waitForSelector('.selected-panel [data-testid="auto-pipeline"]', { timeout: 5000 })
}

async function setCheckbox(page: Page, want: boolean) {
  const cb = page.locator('.selected-panel [data-testid="auto-pipeline"]')
  if ((await cb.isChecked()) !== want) await cb.setChecked(want)
}

async function resetState(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('yt_mp3_auto_pipeline')
    localStorage.removeItem('yt_mp3_downloaded_ids')
  })
}

async function taskMp3(page: Page, ctx: BrowserContext) {
  log('=== A. mp3 + 勾選 → normalize → upload ===')
  const cap = await installMocks(ctx, 2)
  await page.goto(BASE_URL); await resetState(page); await page.reload()
  await selectVideos(page, 2)
  await setCheckbox(page, true)
  await page.locator('.selected-panel button.dl').click()

  let reachedUpload = false
  try { await page.waitForSelector('.upload-panel', { timeout: 10000 }); reachedUpload = true } catch { reachedUpload = false }

  const normDir = cap.normalizeStart[0]?.directory
  const upDir = cap.driveUpload[0]?.directory
  if (reachedUpload && normDir === DIR && upDir === DIR) {
    record('A mp3：normalize→upload 串接且 directory 正確', 'PASS',
      `normalize.dir=${normDir} upload.dir=${upDir}`)
  } else {
    record('A mp3：normalize→upload 串接且 directory 正確', 'FAIL',
      `reachedUpload=${reachedUpload} normalizeStart=${JSON.stringify(cap.normalizeStart)} driveUpload=${JSON.stringify(cap.driveUpload)}`)
  }
}

async function taskMp4(page: Page, ctx: BrowserContext) {
  log('=== B. mp4 + 勾選 → 跳過 normalize、直接 upload ===')
  const cap = await installMocks(ctx, 2)
  await page.goto(BASE_URL); await resetState(page); await page.reload()
  await selectVideos(page, 2)
  await setCheckbox(page, true)
  await page.locator('.selected-panel .format-select').selectOption('mp4')
  await page.locator('.selected-panel button.dl').click()

  let reachedUpload = false
  try { await page.waitForSelector('.upload-panel', { timeout: 10000 }); reachedUpload = true } catch { reachedUpload = false }
  await page.waitForTimeout(500)

  if (reachedUpload && cap.normalizeStart.length === 0 && cap.driveUpload[0]?.directory === DIR) {
    record('B mp4：跳過 normalize、直接 upload', 'PASS', `normalizeStart=0 upload.dir=${cap.driveUpload[0]?.directory}`)
  } else {
    record('B mp4：跳過 normalize、直接 upload', 'FAIL',
      `reachedUpload=${reachedUpload} normalizeStart=${cap.normalizeStart.length} driveUpload=${JSON.stringify(cap.driveUpload)}`)
  }
}

async function taskUnchecked(page: Page, ctx: BrowserContext) {
  log('=== C. 未勾選 → 不 normalize、不 upload ===')
  const cap = await installMocks(ctx, 2)
  await page.goto(BASE_URL); await resetState(page); await page.reload()
  await selectVideos(page, 2)
  await setCheckbox(page, false)
  await page.locator('.selected-panel button.dl').click()
  await page.waitForTimeout(1500) // 給足時間讓（不該發生的）串接有機會發生

  const activeTab = await page.locator('button.tab.active').innerText().catch(() => '')
  const noChain = cap.normalizeStart.length === 0 && cap.driveUpload.length === 0
  if (noChain && /下載/.test(activeTab)) {
    record('C 未勾選：不串接、右欄留在下載', 'PASS', `activeTab="${activeTab.trim()}"`)
  } else {
    record('C 未勾選：不串接、右欄留在下載', 'FAIL',
      `activeTab="${activeTab.trim()}" normalizeStart=${cap.normalizeStart.length} driveUpload=${cap.driveUpload.length}`)
  }
}

async function main(): Promise<number> {
  log('='.repeat(60))
  log('Verify auto-post-download-pipeline — task 6.1')
  log('='.repeat(60))
  await preconditionCheck()
  log('[OK] precondition')

  const browser = await chromium.launch({ headless: false, slowMo: 60 })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: STORAGE_STATE_PATH })
  const page = await ctx.newPage()

  try {
    await taskUnchecked(page, ctx)
    await taskMp3(page, ctx)
    await taskMp4(page, ctx)
  } catch (e: unknown) {
    record('FATAL', 'FAIL', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }

  await resetState(page).catch(() => {})
  await browser.close()

  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.length - passed
  log('='.repeat(60))
  log(`完成：${passed} pass / ${failed} fail（共 ${results.length} 項）`)
  for (const r of results) log(`  [${r.status}] ${r.task}: ${r.detail}`)
  log('='.repeat(60))
  return failed === 0 ? 0 : 1
}

main().then((c) => process.exit(c)).catch((e: unknown) => {
  process.stderr.write(`[FATAL] ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`)
  process.exit(1)
})
