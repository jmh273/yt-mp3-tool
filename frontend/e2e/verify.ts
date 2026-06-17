const change = process.argv[2]

if (!change) {
  process.stderr.write('Usage: npm run verify -- <change-name>\n')
  process.exit(1)
}

const known: Record<string, () => Promise<unknown>> = {
  'add-channel-watchlist': () => import('./verify-add-channel-watchlist'),
  'discovery-per-account-keywords': () => import('./verify-discovery-per-account-keywords'),
  'watchlist-add-and-channel-count': () => import('./verify-watchlist-add-and-channel-count'),
  'search-channels': () => import('./verify-search-channels'),
  'search-subscribe-graceful-toast': () => import('./verify-search-subscribe-graceful-toast'),
  'subscription-reconciliation': () => import('./verify-subscription-reconciliation'),
  'download-panel-prefill-fields': () => import('./verify-download-panel-prefill-fields'),
  'strip-highlight-prefix-dedup': () => import('./verify-strip-highlight-prefix-dedup'),
}

const run = known[change]
if (!run) {
  process.stderr.write(`Unknown verify change "${change}". Known: ${Object.keys(known).join(', ')}\n`)
  process.exit(1)
}

await run()
