import type { Frequency } from './types'

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36))

export const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export const today = () => toISODate(new Date())

export const addDays = (s: string, n: number) => {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export const daysBetween = (a: string, b: string) =>
  Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)

export const monthKey = (s: string) => s.slice(0, 7) // YYYY-MM (calendar month)

/**
 * Accounting period key ("YYYY-MM") honouring `settings.monthStartDay`.
 * A date on/before startDay-1 belongs to the previous period.
 * With startDay = 1 this is identical to `monthKey`.
 */
export const periodKey = (s: string, startDay = 1) => {
  if (!s) return s
  const day = Number(s.slice(8, 10)) || 1
  if (startDay <= 1 || day >= startDay) return s.slice(0, 7)
  const d = parseISODate(s)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** First and last calendar date of an accounting period. */
export const periodRange = (key: string, startDay = 1) => {
  const [y, m] = key.split('-').map(Number)
  // Period "YYYY-MM" runs from startDay of the previous month to startDay-1 of this month.
  const start = new Date(y!, m! - 2, startDay)
  const end = new Date(y!, m! - 1, startDay - 1)
  return { from: toISODate(start), to: toISODate(end) }
}

/** "Mar 2026" style label for a period (uses the month the period ends in). */
export const periodLabel = (key: string, startDay = 1, short = true) => {
  if (startDay <= 1) return monthLabel(key, short)
  const { from, to } = periodRange(key, startDay)
  return short ? `${fmtDate(from)} – ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`
}

/** Current period key for "today". */
export const currentPeriod = (startDay = 1) => periodKey(today(), startDay)

export const monthLabel = (key: string, short = true) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-US', {
    month: short ? 'short' : 'long',
    year: short ? undefined : 'numeric',
  })
}

export const addMonths = (key: string, delta: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export const lastNMonths = (n: number, end = monthKey(today())) => {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(end, -i))
  return out
}

export const daysInMonth = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate()

/** Advance a date by one period, keeping the day-of-month where possible. */
export const nextOccurrence = (date: string, freq: Frequency) => {
  const d = parseISODate(date)
  if (freq === 'weekly') d.setDate(d.getDate() + 7)
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14)
  else {
    const months = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + months)
    const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, max))
  }
  return toISODate(d)
}

export const freqLabel: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const perMonthFactor: Record<Frequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}

export const fmtMoney = (v: number, currency = 'USD', locale = 'en-US', opts: Intl.NumberFormatOptions = {}) => {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: Math.abs(v) >= 10000 ? 0 : 2,
      ...opts,
    }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency}`
  }
}

export const fmtCompact = (v: number, currency = 'USD', locale = 'en-US') => {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  } catch {
    return String(v)
  }
}

export const fmtNum = (v: number, locale = 'en-US', digits = 2) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)

export const fmtDate = (s: string, locale = 'en-US') =>
  parseISODate(s).toLocaleDateString(locale, { month: 'short', day: 'numeric' })

export const fmtDateLong = (s: string, locale = 'en-US') =>
  parseISODate(s).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

export const fmtDateTime = (s: string, locale = 'en-US') =>
  parseISODate(s).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })

export const pct = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100)

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export const round2 = (v: number) => Math.round(v * 100) / 100

export const groupBy = <T, K extends string | number>(xs: T[], key: (x: T) => K) =>
  xs.reduce<Record<K, T[]>>((acc, x) => {
    const k = key(x)
    ;(acc[k] ||= []).push(x)
    return acc
  }, {} as Record<K, T[]>)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'U'

export const downloadFile = (name: string, content: string, type = 'application/json') => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const csvEscape = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const parseTags = (s: string) =>
  [...new Set(s.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))]

export const hashString = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}
