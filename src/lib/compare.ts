import type { Account, Category, Transaction } from './types'
import { type Converter, byCategory, categoryParts, topPayees, txBase } from './analytics'
import { addDays, addMonths, daysBetween, daysInMonth, monthKey, monthLabel, today } from './utils'

/** An inclusive date range. */
export interface Period {
  from: string
  to: string
  label: string
}

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const monthPeriod = (key: string): Period => ({
  from: `${key}-01`,
  to: `${key}-${String(daysInMonth(key)).padStart(2, '0')}`,
  label: monthLabel(key, false),
})

/** `q` is 1-4. */
export const quarterPeriod = (year: number, q: number): Period => {
  const startKey = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}`
  const endKey = addMonths(startKey, 2)
  return { from: `${startKey}-01`, to: `${endKey}-${String(daysInMonth(endKey)).padStart(2, '0')}`, label: `Q${q} ${year}` }
}

export const yearPeriod = (year: number): Period => ({ from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) })

export const customPeriod = (from: string, to: string): Period => {
  const [a, b] = from <= to ? [from, to] : [to, from]
  const fmt = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`
  return { from: a, to: b, label: `${fmt(a)} – ${fmt(b)}${a.slice(0, 4) !== b.slice(0, 4) ? ` ${b.slice(0, 4)}` : ''}` }
}

/** Number of days in the period (inclusive). */
export const periodDays = (p: Period) => daysBetween(p.from, p.to) + 1

/** The period immediately preceding `p`, with the same length (or same calendar unit for month/quarter/year). */
export const previousPeriod = (p: Period, kind: PeriodKind): Period => {
  if (kind === 'month') return monthPeriod(addMonths(monthKey(p.from), -1))
  if (kind === 'quarter') {
    const y = Number(p.from.slice(0, 4))
    const q = Math.floor((Number(p.from.slice(5, 7)) - 1) / 3) + 1
    return q === 1 ? quarterPeriod(y - 1, 4) : quarterPeriod(y, q - 1)
  }
  if (kind === 'year') return yearPeriod(Number(p.from.slice(0, 4)) - 1)
  const len = periodDays(p)
  return customPeriod(addDays(p.from, -len), addDays(p.from, -1))
}

/** Same period one year earlier. */
export const yearAgoPeriod = (p: Period, kind: PeriodKind): Period => {
  if (kind === 'month') return monthPeriod(addMonths(monthKey(p.from), -12))
  if (kind === 'quarter') return quarterPeriod(Number(p.from.slice(0, 4)) - 1, Math.floor((Number(p.from.slice(5, 7)) - 1) / 3) + 1)
  if (kind === 'year') return yearPeriod(Number(p.from.slice(0, 4)) - 1)
  const shift = (s: string) => {
    const y = Number(s.slice(0, 4)) - 1
    const key = `${y}${s.slice(4, 7)}`
    const day = Math.min(Number(s.slice(8, 10)), daysInMonth(key)) // Feb 29 → Feb 28
    return `${key}-${String(day).padStart(2, '0')}`
  }
  return customPeriod(shift(p.from), shift(p.to))
}

export const currentPeriod = (kind: PeriodKind): Period => {
  const t = today()
  const y = Number(t.slice(0, 4))
  if (kind === 'month') return monthPeriod(monthKey(t))
  if (kind === 'quarter') return quarterPeriod(y, Math.floor((Number(t.slice(5, 7)) - 1) / 3) + 1)
  if (kind === 'year') return yearPeriod(y)
  return customPeriod(addDays(t, -29), t)
}

export const inPeriod = (txs: Transaction[], p: Period) => txs.filter((t) => t.date >= p.from && t.date <= p.to)

export interface PeriodStats {
  period: Period
  days: number
  /** Days that have already happened (for in-progress periods). */
  elapsedDays: number
  income: number
  expense: number
  net: number
  savingsRate: number
  avgDaily: number
  txCount: number
  expenseCount: number
  avgTx: number
  largest: number
  categories: ReturnType<typeof byCategory>
  incomeCats: ReturnType<typeof byCategory>
  payees: ReturnType<typeof topPayees>
  /** Cumulative expense per day index (0-based), for overlay charts. */
  cumulative: number[]
  /** Expense per weekday (Sun..Sat) totals. */
  weekday: number[]
}

export const periodStats = (txs: Transaction[], categories: Category[], accounts: Account[], conv: Converter, period: Period): PeriodStats => {
  const inP = inPeriod(txs, period)
  const days = periodDays(period)
  const t = today()
  const elapsedDays = period.to <= t ? days : period.from > t ? 0 : daysBetween(period.from, t) + 1
  let income = 0
  let expense = 0
  let expenseCount = 0
  let largest = 0
  const perDay = Array(days).fill(0) as number[]
  const weekday = Array(7).fill(0) as number[]
  for (const tx of inP) {
    const v = txBase(tx, accounts, conv)
    if (tx.type === 'income') income += v
    if (tx.type === 'expense') {
      expense += v
      expenseCount++
      largest = Math.max(largest, v)
      perDay[daysBetween(period.from, tx.date)]! += v
      weekday[new Date(tx.date + 'T00:00:00').getDay()]! += v
    }
  }
  let cum = 0
  const cumulative = perDay.map((d) => (cum += d))
  return {
    period,
    days,
    elapsedDays,
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
    avgDaily: elapsedDays > 0 ? expense / elapsedDays : 0,
    txCount: inP.length,
    expenseCount,
    avgTx: expenseCount ? expense / expenseCount : 0,
    largest,
    categories: byCategory(inP, categories, accounts, conv),
    incomeCats: byCategory(inP, categories, accounts, conv, 'income'),
    payees: topPayees(inP, accounts, conv, 50),
    cumulative,
    weekday,
  }
}

export interface CategoryDiff {
  id: string
  name: string
  color: string
  icon: string
  a: number
  b: number
  diff: number
  pct: number | null
  shareA: number
  shareB: number
}

/** Side-by-side category totals. Categories missing from one side count as 0. */
export const categoryDiff = (a: PeriodStats, b: PeriodStats, kind: 'categories' | 'incomeCats' = 'categories'): CategoryDiff[] => {
  const map = new Map<string, CategoryDiff>()
  for (const c of a[kind]) map.set(c.id, { id: c.id, name: c.name, color: c.color, icon: c.icon, a: c.value, b: 0, diff: 0, pct: null, shareA: c.pct, shareB: 0 })
  for (const c of b[kind]) {
    const cur = map.get(c.id) ?? { id: c.id, name: c.name, color: c.color, icon: c.icon, a: 0, b: 0, diff: 0, pct: null, shareA: 0, shareB: 0 }
    cur.b = c.value
    cur.shareB = c.pct
    map.set(c.id, cur)
  }
  return [...map.values()]
    .map((c) => ({ ...c, diff: c.a - c.b, pct: c.b ? ((c.a - c.b) / c.b) * 100 : null }))
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
}

export interface PayeeDiff {
  payee: string
  a: number
  b: number
  countA: number
  countB: number
  diff: number
  status: 'new' | 'gone' | 'up' | 'down' | 'same'
}

export const payeeDiff = (a: PeriodStats, b: PeriodStats): PayeeDiff[] => {
  const map = new Map<string, PayeeDiff>()
  for (const p of a.payees) map.set(p.payee, { payee: p.payee, a: p.total, b: 0, countA: p.count, countB: 0, diff: 0, status: 'new' })
  for (const p of b.payees) {
    const cur = map.get(p.payee) ?? { payee: p.payee, a: 0, b: 0, countA: 0, countB: 0, diff: 0, status: 'gone' as const }
    cur.b = p.total
    cur.countB = p.count
    map.set(p.payee, cur)
  }
  return [...map.values()]
    .map((p) => {
      const diff = p.a - p.b
      const status: PayeeDiff['status'] = p.b === 0 ? 'new' : p.a === 0 ? 'gone' : Math.abs(diff) < 0.005 ? 'same' : diff > 0 ? 'up' : 'down'
      return { ...p, diff, status }
    })
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
}

/** Which categories explain most of the change in total spending, in the spirit of a waterfall. */
export const changeDrivers = (diffs: CategoryDiff[], n = 5) => {
  const totalChange = diffs.reduce((s, d) => s + d.diff, 0)
  const top = diffs.slice(0, n)
  const rest = diffs.slice(n).reduce((s, d) => s + d.diff, 0)
  return { totalChange, top, rest }
}

/** Sum of a category id across split parts — used for per-category breakdown of a single tx list. */
export const categoryTotal = (txs: Transaction[], id: string, accounts: Account[], conv: Converter) => {
  let s = 0
  for (const t of txs) if (t.type === 'expense') for (const [cid, amt] of categoryParts(t, accounts, conv)) if (cid === id) s += amt
  return s
}
