// Pattern recognition on your own history: merchant normalisation, bill matching,
// anomaly detection, subscription creep and "this looks like a bill".
import type { Recurring, Rule, Transaction } from './types'
import { addDays, daysBetween, monthKey, perMonthFactor, sum, today } from './utils'

/* ---------- merchant normalisation ---------- */

const NOISE: [RegExp, string][] = [
  [/amzn\s*mktp|amazon\.\w+|amzn/i, 'Amazon'],
  [/sq\s*\*|square\s*inc/i, 'Square'],
  [/tst\*\s*/i, ''],
  [/pos\s*\/|purchase\s*\/|card\s*purchase/i, ''],
  [/www\.[a-z0-9-]+\.[a-z]{2,}/i, ''],
  [/#\d{3,}/g, ''],
  [/\b\d{6,}\b/g, ''],
  [/\*/g, ' '],
  [/\s{2,}/g, ' '],
]

/** Clean up a raw bank payee string: "AMZN*MKTP US*2K4Q8" → "Amazon". */
export const normalizePayee = (raw: string, aliases: { from: string; to: string }[] = [], rules: Rule[] = []) => {
  let s = (raw ?? '').trim()
  for (const a of aliases) if (s.toLowerCase().includes(a.from)) return a.to
  for (const r of rules) {
    const to = r.renameTo.trim()
    if (r.enabled && to && s.toLowerCase().includes(to.toLowerCase())) return to
  }
  for (const [re, to] of NOISE) s = s.replace(re, to)
  s = s.replace(/[.,\-|]+$/, '').trim()
  return s || raw || '—'
}

/** Group raw payees that normalise to the same name — used to propose aliases. */
export const suggestAliases = (transactions: Transaction[], aliases: { from: string; to: string }[] = []) => {
  const groups = new Map<string, Map<string, number>>()
  const known = new Set(aliases.map((a) => a.from))
  for (const t of transactions) {
    if (t.type === 'transfer') continue
    const clean = normalizePayee(t.payee)
    if (clean === t.payee || !clean) continue
    if (known.has(t.payee.toLowerCase())) continue
    const g = groups.get(clean) ?? new Map()
    g.set(t.payee, (g.get(t.payee) ?? 0) + 1)
    groups.set(clean, g)
  }
  return [...groups.entries()]
    .map(([to, raws]) => ({ to, variants: [...raws.entries()].sort((a, b) => b[1] - a[1]), count: sum([...raws.values()]) }))
    .filter((g) => g.variants.length > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
}

/* ---------- bill matching ---------- */

export interface BillMatch {
  rec: Recurring
  tx: Transaction
  date: string
  amountDiff: number
  dayDiff: number
}

/**
 * Pair an incoming transaction with a scheduled bill: same direction, payee-ish,
 * amount within 10% and date within ±5 days (or ±10 for monthly+).
 */
export const matchBills = (recurring: Recurring[], transactions: Transaction[], days = 5, tolerance = 0.1): BillMatch[] => {
  const out: BillMatch[] = []
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const r of recurring) {
    if (!r.active || r.autoMatch === false) continue
    const window = r.frequency === 'weekly' || r.frequency === 'biweekly' ? 3 : Math.max(days, 5)
    const rName = norm(r.payee || r.name)
    for (const t of transactions) {
      if (t.type !== r.type) continue
      if (t.recurringId) continue // already posted by this bill
      const dayDiff = Math.abs(daysBetween(r.nextDate, t.date))
      if (dayDiff > window) continue
      const amountDiff = Math.abs(t.amount - r.amount) / Math.max(1, r.amount)
      if (amountDiff > tolerance) continue
      const samePayee = norm(t.payee) === rName || norm(t.payee).includes(rName.slice(0, 6)) || rName.includes(norm(t.payee).slice(0, 6))
      if (!samePayee && rName) continue
      out.push({ rec: r, tx: t, date: t.date, amountDiff, dayDiff })
    }
  }
  // one transaction per bill, closest first
  const seen = new Set<string>()
  return out
    .sort((a, b) => a.dayDiff - b.dayDiff || a.amountDiff - b.amountDiff)
    .filter((m) => {
      const k = `${m.rec.id}:${m.tx.id}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

/** Link a transaction to the bill it settles (instead of double counting). */
export const settleBill = (_recurring: Recurring[], m: BillMatch) => ({
  transactionPatch: { recurringId: m.rec.id },
  recurringPatch: { nextDate: addDays(m.rec.nextDate, 0) },
})

/* ---------- anomalies ---------- */

export interface Anomaly {
  tx: Transaction
  expected: number
  ratio: number
  reason: string
}

/**
 * Flag transactions far outside the norm for their payee (or category), using mean + 2σ
 * over the previous occurrences. Needs at least 3 data points.
 */
export const detectAnomalies = (transactions: Transaction[], minHistory = 3, sigma = 2, lookback = 120): Anomaly[] => {
  const from = addDays(today(), -lookback)
  const recent = transactions.filter((t) => t.type === 'expense' && t.date >= from)
  const byPayee = new Map<string, number[]>()
  const byCat = new Map<string, number[]>()
  for (const t of recent) {
    if (!byPayee.has(t.payee)) byPayee.set(t.payee, [])
    byPayee.get(t.payee)!.push(t.amount)
    const k = t.categoryId ?? '_none'
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k)!.push(t.amount)
  }
  const stats = (xs: number[]) => {
    if (xs.length < minHistory) return null
    const mean = sum(xs) / xs.length
    const variance = sum(xs.map((x) => (x - mean) ** 2)) / xs.length
    return { mean, sd: Math.sqrt(variance) }
  }
  const out: Anomaly[] = []
  for (const t of recent) {
    const s = stats(byPayee.get(t.payee) ?? []) ?? stats(byCat.get(t.categoryId ?? '_none') ?? [])
    if (!s || s.sd <= 0) continue
    const z = (t.amount - s.mean) / s.sd
    if (z >= sigma) out.push({ tx: t, expected: s.mean, ratio: t.amount / Math.max(0.01, s.mean), reason: `usual ${s.mean.toFixed(0)} for ${t.payee}` })
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, 8)
}

/* ---------- subscription creep ---------- */

export interface SubscriptionInsight {
  recurring: Recurring
  monthly: number
  prevMonthly: number
  changePct: number
  unusedCycles: number
}

/** Subscriptions whose price went up, or which have not generated a transaction in 2+ cycles. */
export const subscriptionInsights = (recurring: Recurring[], transactions: Transaction[]): SubscriptionInsight[] => {
  const out: SubscriptionInsight[] = []
  for (const r of recurring) {
    if (!r.active || r.type !== 'expense') continue
    const monthly = r.amount * perMonthFactor[r.frequency]
    const history = transactions
      .filter((t) => t.recurringId === r.id || (t.payee || '').toLowerCase() === (r.payee || r.name).toLowerCase())
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    const recent = history.slice(0, 3)
    const older = history.slice(3, 6)
    const avg = (xs: Transaction[]) => (xs.length ? sum(xs.map((t) => t.amount)) / xs.length : 0)
    const prevMonthly = older.length ? avg(older) * perMonthFactor[r.frequency] : monthly
    const last = recent[0]?.date
    const cycleDays = r.frequency === 'weekly' ? 7 : r.frequency === 'biweekly' ? 14 : r.frequency === 'monthly' ? 30 : r.frequency === 'quarterly' ? 91 : 365
    const unusedCycles = last ? Math.floor(daysBetween(last, today()) / cycleDays) : 99
    if (prevMonthly > 0 && Math.abs(monthly - prevMonthly) / prevMonthly > 0.02) out.push({ recurring: r, monthly, prevMonthly, changePct: ((monthly - prevMonthly) / prevMonthly) * 100, unusedCycles })
    else if (unusedCycles >= 2) out.push({ recurring: r, monthly, prevMonthly, changePct: 0, unusedCycles })
  }
  return out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.unusedCycles - a.unusedCycles)
}

/* ---------- recurring detection ---------- */

export interface DetectedRecurring {
  payee: string
  amount: number
  dates: string[]
  spacingDays: number
  frequency: Recurring['frequency']
  categoryId: string | null
  accountId: string
  confidence: number
}

/** Find payees that repeat on a roughly fixed cadence and are not yet tracked as bills. */
export const detectRecurring = (transactions: Transaction[], knownPayees: Set<string>): DetectedRecurring[] => {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.type === 'transfer' || t.recurringId) continue
    const k = (t.payee || '').toLowerCase()
    if (!k || knownPayees.has(k)) continue
    const g = groups.get(k) ?? []
    g.push(t)
    groups.set(k, g)
  }
  const out: DetectedRecurring[] = []
  for (const [, rows] of groups) {
    if (rows.length < 3) continue
    const sorted = rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1]!.date, sorted[i]!.date))
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0
    if (median < 5) continue
    const spread = gaps.length ? sum(gaps.map((g) => Math.abs(g - median))) / gaps.length : 99
    const amounts = sorted.map((t) => t.amount)
    const amountSpread = Math.max(...amounts) - Math.min(...amounts)
    const confidence = Math.max(0, 1 - spread / Math.max(7, median * 0.35)) * (amountSpread < Math.max(1, median) ? 1 : 0.5)
    if (confidence < 0.45) continue
    const frequency: Recurring['frequency'] = median <= 9 ? 'weekly' : median <= 20 ? 'biweekly' : median <= 45 ? 'monthly' : median <= 120 ? 'quarterly' : 'yearly'
    const last = sorted[sorted.length - 1]!
    out.push({
      payee: last.payee,
      amount: Math.round((sum(amounts) / amounts.length) * 100) / 100,
      dates: sorted.map((t) => t.date),
      spacingDays: median,
      frequency,
      categoryId: last.categoryId,
      accountId: last.accountId,
      confidence,
    })
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 10)
}

/* ---------- payee history ---------- */

export interface PayeeStats {
  payee: string
  total: number
  count: number
  average: number
  last: string
  first: string
  categoryId: string | null
  monthly: { key: string; total: number }[]
}

export const payeeHistory = (transactions: Transaction[], payee: string): PayeeStats | null => {
  const rows = transactions.filter((t) => t.payee === payee && t.type !== 'transfer')
  if (!rows.length) return null
  const monthlyMap = new Map<string, number>()
  for (const t of rows) monthlyMap.set(monthKey(t.date), (monthlyMap.get(monthKey(t.date)) ?? 0) + t.amount)
  const total = sum(rows.map((t) => t.amount))
  return {
    payee,
    total,
    count: rows.length,
    average: total / rows.length,
    last: rows.map((t) => t.date).sort().reverse()[0]!,
    first: rows.map((t) => t.date).sort()[0]!,
    categoryId: rows[rows.length - 1]!.categoryId,
    monthly: [...monthlyMap.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => (a.key < b.key ? -1 : 1)),
  }
}
