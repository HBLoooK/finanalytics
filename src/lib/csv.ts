import { pad } from './utils'

/** RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF, ; and tab delimiters). */
export function parseCSV(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t', '|'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQ = false
      } else cell += ch
    } else if (ch === '"') inQ = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/** Parse many date formats into YYYY-MM-DD. Returns null on failure. */
export function parseDateLoose(s: string, dayFirst = false): string | null {
  const t = s.trim()
  if (!t) return null
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    let y = +m[3]!
    if (y < 100) y += 2000
    const a = +m[1]!
    const b = +m[2]!
    const [d, mo] = dayFirst || a > 12 ? [a, b] : [b, a]
    return `${y}-${pad(mo)}-${pad(d)}`
  }
  const d = new Date(t)
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return null
}

/** Parse "1,234.56", "1.234,56", "(12.00)", "-$12", "12,00 €" */
export function parseAmountLoose(s: string): number | null {
  let t = s.trim()
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1)
  }
  if (t.includes('-')) neg = !neg ? true : neg
  t = t.replace(/[^\d.,]/g, '')
  if (!t) return null
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const v = parseFloat(t)
  if (isNaN(v)) return null
  return neg ? -Math.abs(v) : v
}

/** Minimal OFX/QIF reader: returns rows of {date, payee, amount, note, type}. */
export interface ParsedRow {
  date: string
  payee: string
  amount: number
  note: string
}

export function parseOFX(text: string): ParsedRow[] {
  const out: ParsedRow[] = []
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  const get = (b: string, tag: string) => b.match(new RegExp(`<${tag}>([^<]*)`, 'i'))?.[1]?.trim() ?? ''
  for (const b of blocks) {
    const raw = get(b, 'DTPOSTED')
    const date = raw ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : ''
    const amount = Number(get(b, 'TRNAMT'))
    if (!date || !Number.isFinite(amount)) continue
    out.push({ date, payee: get(b, 'NAME') || get(b, 'MEMO') || 'Imported', amount, note: get(b, 'MEMO') })
  }
  return out
}

export function parseQIF(text: string): ParsedRow[] {
  const out: ParsedRow[] = []
  let cur: Partial<ParsedRow> = {}
  let dayFirst = false
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('D')) {
      const v = line.slice(1).trim()
      // QIF uses the locale's format; guess from the first field
      dayFirst = /^\d{1,2}[/.]/.test(v)
      cur.date = v
    } else if (line.startsWith('T')) cur.amount = Number(line.slice(1).replace(/,/g, ''))
    else if (line.startsWith('P')) cur.payee = line.slice(1).trim()
    else if (line.startsWith('M')) cur.note = line.slice(1).trim()
    else if (line.startsWith('^')) {
      if (cur.date && typeof cur.amount === 'number') {
        const norm = cur.date.replace(/[/.]/g, '-')
        const parts = norm.split('-').map(Number)
        let iso = ''
        if (parts.length === 3) {
          const [a, b, c] = parts
          const year = (c ?? 0) < 100 ? 2000 + (c ?? 0) : (c ?? 0)
          iso = dayFirst ? `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}` : `${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
        }
        if (iso) out.push({ date: iso, payee: cur.payee ?? 'Imported', amount: cur.amount, note: cur.note ?? '' })
      }
      cur = {}
    }
  }
  return out
}

export interface ColumnMap {
  date: number
  payee: number
  amount: number // signed amount, or debit column if credit >= 0
  credit: number // -1 if unused
  note: number
  category: number
}

const guess = (headers: string[], keys: string[]) =>
  headers.findIndex((h) => keys.some((k) => h.toLowerCase().replace(/[^a-z]/g, '').includes(k)))

export function guessColumns(headers: string[]): ColumnMap {
  const debit = guess(headers, ['debit', 'withdrawal', 'out'])
  const credit = guess(headers, ['credit', 'deposit', 'in'])
  const amount = guess(headers, ['amount', 'sum', 'value', 'montant', 'betrag'])
  return {
    date: guess(headers, ['date', 'posted', 'datum']),
    payee: guess(headers, ['payee', 'description', 'merchant', 'name', 'memo', 'details', 'libelle', 'label']),
    amount: amount >= 0 ? amount : debit,
    credit: amount >= 0 ? -1 : credit,
    note: guess(headers, ['note', 'reference', 'comment', 'memo']),
    category: guess(headers, ['category', 'type']),
  }
}
