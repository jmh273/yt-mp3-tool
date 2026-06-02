const change = process.argv[2]

if (!change) {
  process.stderr.write('Usage: npm run verify -- <change-name>\n')
  process.exit(1)
}

const known: Record<string, () => Promise<unknown>> = {
  'add-channel-watchlist': () => import('./verify-add-channel-watchlist'),
  'discovery-per-account-keywords': () => import('./verify-discovery-per-account-keywords'),
}

const run = known[change]
if (!run) {
  process.stderr.write(`Unknown verify change "${change}". Known: ${Object.keys(known).join(', ')}\n`)
  process.exit(1)
}

await run()
