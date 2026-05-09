import type { Page } from 'playwright'
import { BACKEND_URL, log, startCase, step, type CaseContext } from '../helpers'

export interface Tc04State {
  channelIndex: number
}

interface Channel {
  channel_id: string
  title: string
}

async function findChannelWithVideosIndex(): Promise<number> {
  // Hit backend directly to find the first channel with non-empty RSS, like the legacy Python version did.
  try {
    const r = await fetch(`${BACKEND_URL}/subscriptions`)
    const data = (await r.json()) as { channels: Channel[] }
    const UA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'
    const candidates = data.channels.slice(0, 30)
    for (let i = 0; i < candidates.length; i++) {
      const ch = candidates[i]!
      const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channel_id}`
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 6000)
        const rss = await fetch(url, {
          headers: { 'User-Agent': UA },
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        const text = await rss.text()
        if (text.includes('<entry>')) {
          log(`  API 確認 index=${i} (${ch.title}) 有影片`)
          return i
        }
      } catch {
        // try next
      }
    }
  } catch (e) {
    log(`  findChannelWithVideosIndex 失敗：${e instanceof Error ? e.message : e}`)
  }
  return 0
}

export async function tc04ChannelPick(
  page: Page,
  state: Tc04State,
): Promise<CaseContext> {
  const ctx = startCase(
    'TC-04',
    '頻道選取與影片清單顯示',
    '驗證點選頻道後右欄載入該頻道影片，並顯示完整資訊 (標題/縮圖/時長/發布時間)。',
    5,
  )

  state.channelIndex = await findChannelWithVideosIndex()
  const cards = page.locator('.channel-card')

  await step(
    page,
    ctx,
    `已透過 backend API 找到第 ${state.channelIndex + 1} 個頻道有影片。準備點選它。`,
    undefined,
    200,
  )

  await step(
    page,
    ctx,
    '點擊該頻道卡片。預期卡片變成選中狀態 (淺紅背景 + 左邊紅色直條)，右欄開始載入影片。',
    () => cards.nth(state.channelIndex).click(),
    2000,
  )

  await step(
    page,
    ctx,
    '等待右欄影片清單載入完成。預期看到至少一張影片卡片。',
    () => page.waitForSelector('.video-item', { timeout: 15000 }),
    500,
  )

  await step(
    page,
    ctx,
    '查看影片卡片內容。預期每張卡都顯示：縮圖、標題、發布時間 (例如「2 小時前」)、時長 (例如「12:34」)。',
    undefined,
    300,
  )

  await step(
    page,
    ctx,
    '捲動右欄看後續影片卡片 (如有)。',
    () =>
      page.locator('.middle-pane').evaluate((el) => el.scrollBy(0, 200)),
    400,
  )

  return ctx
}
