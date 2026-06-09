export interface TakeoutChannel {
  channel_id: string
  title: string
  url: string
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells
}

export function parseTakeoutCsv(text: string): TakeoutChannel[] {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const out: TakeoutChannel[] = []

  for (const line of lines) {
    const [id = '', url = '', ...titleParts] = parseCsvLine(line)
    if (!id.startsWith('UC')) continue
    out.push({
      channel_id: id,
      url,
      title: titleParts.join(',').trim(),
    })
  }

  return out
}
