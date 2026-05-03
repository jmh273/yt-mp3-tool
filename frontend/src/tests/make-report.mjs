// 讀取 Vitest JSON 結果，產生自包含 HTML 報告（可直接用瀏覽器開啟）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = resolve(__dir, '../..')   // frontend/

const jsonPath  = resolve(root, 'test-report/results.json')
const ssPath    = resolve(root, 'test-report/screenshots.json')
const outPath   = resolve(root, 'test-report/report.html')

const data        = JSON.parse(readFileSync(jsonPath, 'utf-8'))
const screenshots = existsSync(ssPath) ? JSON.parse(readFileSync(ssPath, 'utf-8')) : {}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const total   = data.numTotalTests   ?? 0
const passed  = data.numPassedTests  ?? 0
const failed  = data.numFailedTests  ?? 0
const skipped = total - passed - failed
const ok      = failed === 0
const now     = new Date().toLocaleString('zh-TW')

function fileBlock(suite) {
  const tests      = suite.assertionResults ?? []
  const filePassed = tests.filter(t => t.status === 'passed').length
  const fileFailed = tests.filter(t => t.status === 'failed').length
  const fileOk     = fileFailed === 0

  // 依 ancestorTitles 分組
  const groups = {}
  for (const t of tests) {
    const key = t.ancestorTitles?.join(' › ') || '(root)'
    ;(groups[key] ??= []).push(t)
  }

  const suiteHtml = Object.entries(groups).map(([name, tests]) => {
    const rows = tests.map(t => {
      const state = t.status === 'passed' ? 'pass' : t.status === 'failed' ? 'fail' : 'skip'
      const icon  = state === 'pass' ? '✓' : state === 'fail' ? '✗' : '−'
      const dur   = typeof t.duration === 'number' ? `${Math.round(t.duration)} ms` : '—'
      const errMsg = (t.failureMessages ?? []).join('\n').split('\n')[0]
      const errRow = errMsg
        ? `<tr class="${state} err-row"><td colspan="3"><div class="err-msg">${esc(errMsg)}</div></td></tr>`
        : ''

      // 截圖：key 格式為 suiteName|testTitle
      const snapKey = (t.ancestorTitles ?? []).join('|') + '|' + t.title
      const imgPath = screenshots[snapKey]
      const ssRow   = imgPath
        ? `<tr class="ss-row"><td colspan="3"><img src="${imgPath}" alt="截圖" class="test-ss" /></td></tr>`
        : ''

      return `<tr class="${state}">
        <td class="icon">${icon}</td>
        <td class="tname">${esc(t.title)}</td>
        <td class="dur">${dur}</td>
      </tr>${errRow}${ssRow}`
    }).join('')

    return `<div class="suite">
      <div class="suite-name">${esc(name)}</div>
      <table><tbody>${rows}</tbody></table>
    </div>`
  }).join('')

  const shortName = suite.testFilePath?.replace(/\\/g, '/').replace(/.*\/src\//, 'src/') ?? suite.name
  return `<details open>
    <summary class="file-summary ${fileOk ? 'ok' : 'bad'}">
      <span class="file-icon">${fileOk ? '✓' : '✗'}</span>
      <span class="file-name">${esc(shortName)}</span>
      <span class="file-counts">${filePassed} 通過${fileFailed ? ` · ${fileFailed} 失敗` : ''}</span>
    </summary>
    <div class="file-body">${suiteHtml}</div>
  </details>`
}

const blocks = (data.testResults ?? []).map(fileBlock).join('\n')

const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UI 測試報告</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f5;color:#222;padding:1.5rem}
h1{font-size:1.4rem;margin-bottom:.25rem}
.meta{font-size:.8rem;color:#888;margin-bottom:1.5rem}
.summary-bar{display:flex;gap:1.5rem;align-items:center;background:white;border-radius:8px;padding:1rem 1.5rem;margin-bottom:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat{text-align:center}
.stat-num{font-size:2rem;font-weight:700;line-height:1}
.stat-lbl{font-size:.72rem;color:#888;margin-top:.1rem}
.pass-num{color:#2ea043}.fail-num{color:#d1242f}.skip-num{color:#888}
.badge{margin-left:auto;padding:.4rem 1.2rem;border-radius:20px;font-weight:700;font-size:.9rem}
.badge.ok{background:#e6f4ea;color:#2ea043}.badge.fail{background:#fce8e9;color:#d1242f}
details{background:white;border-radius:8px;margin-bottom:.75rem;box-shadow:0 1px 3px rgba(0,0,0,.07);overflow:hidden}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
.file-summary{display:flex;align-items:center;gap:.6rem;padding:.7rem 1rem;user-select:none}
.file-summary:hover{background:#fafafa}
.file-summary.ok{border-left:4px solid #2ea043}.file-summary.bad{border-left:4px solid #d1242f}
.file-icon{font-size:1rem;width:1.2rem;text-align:center}
.file-summary.ok .file-icon{color:#2ea043}.file-summary.bad .file-icon{color:#d1242f}
.file-name{flex:1;font-size:.85rem;font-weight:600;font-family:monospace}
.file-counts{font-size:.78rem;color:#555;white-space:nowrap}
.file-body{padding:.5rem 1rem 1rem}
.suite-name{font-size:.78rem;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.04em;margin:.75rem 0 .3rem}
table{width:100%;border-collapse:collapse;font-size:.83rem}
tr{border-bottom:1px solid #f0f0f0}
tr:last-child{border-bottom:none}
td{padding:.3rem .4rem;vertical-align:top}
.icon{width:1.4rem;text-align:center}
.dur{width:5rem;text-align:right;color:#aaa;font-variant-numeric:tabular-nums}
tr.pass .icon{color:#2ea043}
tr.fail .icon{color:#d1242f;font-weight:700}
tr.fail .tname{color:#d1242f}
tr.skip .icon{color:#aaa}
.err-row td{padding:0 .4rem .45rem 2rem}
.err-msg{background:#fce8e9;color:#8b1a1a;font-size:.78rem;font-family:monospace;white-space:pre-wrap;padding:.4rem .6rem;border-radius:4px}
.ss-row td{padding:.2rem .4rem .75rem 2rem}
.test-ss{max-width:100%;border:1px solid #e0e0e0;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.08);display:block}
</style>
</head>
<body>
<h1>UI 測試報告</h1>
<p class="meta">產生時間：${now}</p>
<div class="summary-bar">
  <div class="stat"><div class="stat-num">${total}</div><div class="stat-lbl">總計</div></div>
  <div class="stat"><div class="stat-num pass-num">${passed}</div><div class="stat-lbl">通過</div></div>
  <div class="stat"><div class="stat-num fail-num">${failed}</div><div class="stat-lbl">失敗</div></div>
  <div class="stat"><div class="stat-num skip-num">${skipped}</div><div class="stat-lbl">略過</div></div>
  <span class="badge ${ok ? 'ok' : 'fail'}">${ok ? '全部通過 ✓' : `${failed} 個失敗`}</span>
</div>
${blocks}
</body>
</html>`

mkdirSync(resolve(root, 'test-report'), { recursive: true })
writeFileSync(outPath, html, 'utf-8')
console.log(`\n📄 測試報告已產生：${outPath}`)
