import { rmSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function setup() {
  const snapDir = resolve(process.cwd(), 'test-report/snaps')
  rmSync(snapDir, { recursive: true, force: true })
  mkdirSync(snapDir, { recursive: true })
}
