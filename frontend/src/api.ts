// In dev, Vite serves the SPA on :5173 and proxies /api/* to the backend on
// :8000 (stripping /api). In a bundled exe the SPA is served from the same
// origin as the backend (default :8000), so the /api prefix would 404 — call
// routes at their real path instead. Detect by current port.
export const API_BASE = window.location.port === '5173' ? '/api' : ''
const BASE = API_BASE

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
  return r.json()
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
  return r.json()
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
  return r.json()
}

export async function apiDelete<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
  return r.json()
}
