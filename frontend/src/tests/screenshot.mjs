// 讀取測試期間儲存的 HTML 快照，用 Playwright 渲染截圖後輸出 screenshots.json
import { chromium } from 'playwright'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = process.cwd()
const snapDir = resolve(root, 'test-report/snaps')
const imgDir  = resolve(root, 'test-report/screenshots')
const indexPath = resolve(root, 'test-report/screenshots.json')

if (!existsSync(snapDir)) {
  writeFileSync(indexPath, '{}', 'utf-8')
  process.exit(0)
}

const snapFiles = readdirSync(snapDir).filter(f => f.endsWith('.json'))
if (snapFiles.length === 0) {
  writeFileSync(indexPath, '{}', 'utf-8')
  process.exit(0)
}

mkdirSync(imgDir, { recursive: true })
console.log(`📸 開始截圖 ${snapFiles.length} 個快照...`)

const browser = await chromium.launch()
const page    = await browser.newPage()
await page.setViewportSize({ width: 860, height: 500 })

const index = {}

for (const file of snapFiles) {
  const snap = JSON.parse(readFileSync(join(snapDir, file), 'utf-8'))

  const fullHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:#fff;color:#222;padding:1.5rem;
}
img{display:block;max-width:100%;height:auto}
input,button,select,textarea{font-family:inherit;font-size:inherit}
/* 截圖用：fixed 元素改回 relative 以利截圖 */
.selected-panel{
  position:relative!important;
  bottom:auto!important;left:auto!important;right:auto!important;
}
${snap.css}
</style>
</head>
<body>${snap.html}</body>
</html>`

  await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' })
  const safe    = snap.id.replace(/[^\w一-鿿]/g, '_')
  const imgFile = `${safe}.png`
  await page.screenshot({ path: join(imgDir, imgFile), fullPage: true })
  index[snap.id] = `screenshots/${imgFile}`
}

await browser.close()
writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8')
console.log(`✅ 截圖完成：${snapFiles.length} 張`)
