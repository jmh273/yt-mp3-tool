import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = process.cwd()
const snapDir = resolve(root, 'test-report/snaps')

export function extractCss(vueRelPath: string): string {
  try {
    const src = readFileSync(resolve(root, vueRelPath), 'utf-8')
    return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
  } catch {
    return ''
  }
}

export function snap(id: string, html: string, css: string): void {
  mkdirSync(snapDir, { recursive: true })
  const safe = id.replace(/[^\w一-鿿]/g, '_')
  writeFileSync(join(snapDir, `${safe}.json`), JSON.stringify({ id, html, css }), 'utf-8')
}
