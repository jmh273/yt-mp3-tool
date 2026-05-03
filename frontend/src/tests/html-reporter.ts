import type { Reporter, File, Task } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface TestRow {
  suiteName: string
  name: string
  state: 'pass' | 'fail' | 'skip' | 'run'
  duration: number
  error?: string
}

function collect(tasks: Task[], suiteName: string, rows: TestRow[]) {
  for (const task of tasks) {
    if (task.type === 'test') {
      rows.push({
        suiteName,
        name: task.name,
        state: (task.result?.state ?? 'skip') as TestRow['state'],
        duration: Math.round(task.result?.duration ?? 0),
        error: task.result?.errors?.[0]?.message,
      })
    } else if (task.type === 'suite' && task.tasks?.length) {
      collect(task.tasks, task.name, rows)
    }
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(files: File[]): string {
  const allRows: { file: string; rows: TestRow[] }[] = []
  for (const f of files) {
    const rows: TestRow[] = []
    collect(f.tasks ?? [], '', rows)
    allRows.push({
      file: f.filepath?.replace(/\\/g, '/').replace(/.*\/src\//, 'src/') ?? f.name,
      rows,
    })
  }

  const total   = allRows.reduce((n, f) => n + f.rows.length, 0)
  const passed  = allRows.reduce((n, f) => n + f.rows.filter(r => r.state === 'pass').length, 0)
  const failed  = allRows.reduce((n, f) => n + f.rows.filter(r => r.state === 'fail').length, 0)
  const skipped = total - passed - failed
  const ok      = failed === 0

  const now = new Date().toLocaleString('zh-TW')

  const fileBlocks = allRows.map(({ file, rows }) => {
    const filePassed  = rows.filter(r => r.state === 'pass').length
    const fileFailed  = rows.filter(r => r.state === 'fail').length
    const fileOk      = fileFailed === 0

    const groupedBySuite: Record<string, TestRow[]> = {}
    for (const r of rows) {
      const key = r.suiteName || '(root)'
      ;(groupedBySuite[key] ??= []).push(r)
    }

    const suiteBlocks = Object.entries(groupedBySuite).map(([suite, tests]) => {
      const testRows = tests.map(t => {
        const icon  = t.state === 'pass' ? '✓' : t.state === 'fail' ? '✗' : '−'
        const cls   = t.state === 'pass' ? 'pass' : t.state === 'fail' ? 'fail' : 'skip'
        const err   = t.error
          ? `<div class="err-msg">${esc(t.error)}</div>`
          : ''
        return `
          <tr class="${cls}">
            <td class="icon">${icon}</td>
            <td class="tname">${esc(t.name)}</td>
            <td class="dur">${t.duration} ms</td>
          </tr>${err ? `<tr class="${cls} err-row"><td colspan="3">${err}</td></tr>` : ''}`
      }).join('')

      return `
        <div class="suite">
          <div class="suite-name">${esc(suite)}</div>
          <table><tbody>${testRows}</tbody></table>
        </div>`
    }).join('')

    return `
      <details open>
        <summary class="file-summary ${fileOk ? 'ok' : 'bad'}">
          <span class="file-icon">${fileOk ? '✓' : '✗'}</span>
          <span class="file-name">${esc(file)}</span>
          <span class="file-counts">${filePassed} 通過${fileFailed ? ` · ${fileFailed} 失敗` : ''}</span>
        </summary>
        <div class="file-body">${suiteBlocks}</div>
      </details>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UI 測試報告</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #f5f5f5; color: #222; padding: 1.5rem; }
  h1   { font-size: 1.4rem; margin-bottom: .25rem; }
  .meta { font-size: .8rem; color: #888; margin-bottom: 1.5rem; }

  .summary-bar {
    display: flex; gap: 1.5rem; align-items: center;
    background: white; border-radius: 8px; padding: 1rem 1.5rem;
    margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.08);
  }
  .stat { text-align: center; }
  .stat-num { font-size: 2rem; font-weight: 700; line-height: 1; }
  .stat-lbl { font-size: .72rem; color: #888; margin-top: .1rem; }
  .pass-num  { color: #2ea043; }
  .fail-num  { color: #d1242f; }
  .skip-num  { color: #888; }
  .status-badge {
    margin-left: auto; padding: .4rem 1.2rem; border-radius: 20px;
    font-weight: 700; font-size: .9rem;
  }
  .status-badge.ok   { background: #e6f4ea; color: #2ea043; }
  .status-badge.fail { background: #fce8e9; color: #d1242f; }

  details {
    background: white; border-radius: 8px; margin-bottom: .75rem;
    box-shadow: 0 1px 3px rgba(0,0,0,.07); overflow: hidden;
  }
  summary { list-style: none; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }

  .file-summary {
    display: flex; align-items: center; gap: .6rem;
    padding: .7rem 1rem; user-select: none;
  }
  .file-summary:hover { background: #fafafa; }
  .file-summary.ok   { border-left: 4px solid #2ea043; }
  .file-summary.bad  { border-left: 4px solid #d1242f; }
  .file-icon { font-size: 1rem; width: 1.2rem; text-align: center; }
  .file-summary.ok  .file-icon { color: #2ea043; }
  .file-summary.bad .file-icon { color: #d1242f; }
  .file-name   { flex: 1; font-size: .85rem; font-weight: 600; font-family: monospace; }
  .file-counts { font-size: .78rem; color: #555; white-space: nowrap; }

  .file-body  { padding: .5rem 1rem 1rem; }
  .suite-name { font-size: .78rem; font-weight: 700; color: #666;
                text-transform: uppercase; letter-spacing: .04em;
                margin: .75rem 0 .3rem; }
  table  { width: 100%; border-collapse: collapse; font-size: .83rem; }
  tr     { border-bottom: 1px solid #f0f0f0; }
  tr:last-child { border-bottom: none; }
  td     { padding: .3rem .4rem; vertical-align: top; }
  .icon  { width: 1.4rem; text-align: center; }
  .tname { flex: 1; }
  .dur   { width: 5rem; text-align: right; color: #aaa; font-variant-numeric: tabular-nums; }

  tr.pass .icon { color: #2ea043; }
  tr.fail .icon { color: #d1242f; font-weight: 700; }
  tr.skip .icon { color: #aaa; }
  tr.fail .tname { color: #d1242f; }

  .err-row td { padding: 0 .4rem .45rem 2rem; }
  .err-msg {
    background: #fce8e9; color: #8b1a1a; font-size: .78rem;
    font-family: monospace; white-space: pre-wrap;
    padding: .4rem .6rem; border-radius: 4px;
  }
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
  <span class="status-badge ${ok ? 'ok' : 'fail'}">${ok ? '全部通過' : `${failed} 個失敗`}</span>
</div>

${fileBlocks}
</body>
</html>`
}

export default class SimpleHtmlReporter implements Reporter {
  onFinished(files: File[] = []) {
    const html    = buildHtml(files)
    const outDir  = resolve(process.cwd(), 'test-report')
    const outFile = resolve(outDir, 'report.html')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outFile, html, 'utf-8')
    console.log(`\n📄 測試報告：${outFile}`)
  }
}
