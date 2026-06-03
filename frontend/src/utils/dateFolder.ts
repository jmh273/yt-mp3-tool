export function todayYyyymmdd(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function rolloverDatePrefix(name: string, today = todayYyyymmdd()): string {
  const match = /^(\d{8})(.*)$/.exec(name)
  if (!match) return name
  return match[1] === today ? name : `${today}${match[2]}`
}

export function joinPath(base: string, sub: string): string {
  if (!base) return sub
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base.replace(/[\\/]+$/, '')}${sep}${sub}`
}
