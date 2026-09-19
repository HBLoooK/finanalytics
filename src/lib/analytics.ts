import type { Account, Budget, Category, Debt, Holding, Recurring, Settings, Transaction } from './types'
import { addDays, daysBetween, lastNMonths, monthKey, nextOccurrence, periodKey, perMonthFactor, sum, today } from './utils'

/* ---------- currency ---------- */

export type Converter = (amount: number, from: string) => number

/** Build a converter to base currency using settings.rates (units of currency per 1 base). */
export const makeConverter =
  (settings: Settings): Converter =>
  (amount, from) => {
    if (!from || from === settings.currency) return amount
    const r = settings.rates[from]
    return r && r > 0 ? amount / r : amount
  }

/** id → currency lookup. Built once per render instead of `accounts.find` per transaction. */
export const currencyIndex = (accounts: Account[]): Map<string, string> => new Map(accounts.map((a) => [a.id, a.currency]))

const accCurrency = (accounts: Account[], id: string) => accounts.find((a) => a.id === id)?.currency ?? ''

/** Amount of a transaction expressed in base currency. */
export const txBase = (t: Transaction, accounts: Account[], conv: Converter) => conv(t.amount, accCurrency(accounts, t.accountId))

/** Same as txBase but with a pre-built currency index (O(1) per transaction). */
export const txBaseIdx = (t: Transaction, cur: Map<string, string>, base: string, conv: Converter) =>
  conv(t.amount, cur.get(t.accountId) ?? base)

/* ---------- balances ---------- */

export const accountBalance = (account: Account, txs: Transaction[]) => {
  let bal = account.balance
  for (const t of txs) {
    if (t.investment) {
      // Buy/sell of a holding: cash out on buy, cash in on sell (portfolio value moves instead).
      if (t.accountId === account.id) bal += t.investment.side === 'buy' ? -t.amount : t.amount
      continue
    }
    if (t.type === 'income' && t.accountId === account.id) bal += t.amount
    else if (t.type === 'expense' && t.accountId === account.id) bal -= t.amount
    else if (t.type === 'transfer') {
      if (t.accountId === account.id) bal -= t.amount
      if (t.toAccountId === account.id) {
        // Cross-currency transfer: use the recorded destination amount when we have one.
        bal += t.toAmount != null && t.toAmount > 0 ? t.toAmount : t.amount
      }
    }
  }
  return bal
}

/** Total across accounts, honouring the per-currency rate and archived accounts. */
export const liquidBalance = (accounts: Account[], txs: Transaction[], conv: Converter, includeArchived = false) =>
  sum(accounts.filter((a) => includeArchived || !a.archived).map((a) => conv(accountBalance(a, txs), a.currency)))

export const netWorth = (accounts: Account[], txs: Transaction[], conv: Converter, holdings: Holding[] = [], debts: Debt[] = []) =>
  sum(accounts.map((a) => conv(accountBalance(a, txs), a.currency))) +
  sum(holdings.map((h) => conv(h.quantity * h.price, h.currency))) -
  sum(debts.map((d) => d.balance))

export const inMonth = (txs: Transaction[], key: string) => txs.filter((t) => monthKey(t.date) === key)

/** Filter to an accounting period (respects settings.monthStartDay). */
export const inPeriod = (txs: Transaction[], key: string, startDay = 1) =>
  startDay <= 1 ? inMonth(txs, key) : txs.filter((t) => periodKey(t.date, startDay) === key)

/** Refunds net out against the expense they refund, so category totals stay honest. */
const effectiveAmount = (t: Transaction) => (t.refundOf ? -1 : 1)

export const totals = (txs: Transaction[], accounts: Account[], conv: Converter) => {
  const base = (t: Transaction) => txBase(t, accounts, conv) * effectiveAmount(t)
  const income = sum(txs.filter((t) => t.type === 'income').map(base))
  const expense = sum(txs.filter((t) => t.type === 'expense').map(base))
  return { income, expense, net: income - expense, savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0 }
}

export const monthlySeries = (txs: Transaction[], accounts: Account[], conv: Converter, n = 6, end?: string) =>
  lastNMonths(n, end).map((key) => {
    const t = totals(inMonth(txs, key), accounts, conv)
    return { key, income: t.income, expense: t.expense, net: t.net }
  })

/** Expand a transaction into (categoryId, baseAmount) pairs, respecting splits and refunds. */
export const categoryParts = (t: Transaction, accounts: Account[], conv: Converter): [string, number][] => {
  const cur = accCurrency(accounts, t.accountId)
  const sign = effectiveAmount(t)
  if (t.splits && t.splits.length) return t.splits.map((s) => [s.categoryId, conv(s.amount, cur) * sign])
  return [[t.categoryId ?? '_none', conv(t.amount, cur) * sign]]
}

export const byCategory = (
  txs: Transaction[],
  categories: Category[],
  accounts: Account[],
  conv: Converter,
  type: 'expense' | 'income' = 'expense',
) => {
  const map = new Map<string, number>()
  for (const t of txs)
    if (t.type === type) for (const [cid, amt] of categoryParts(t, accounts, conv)) map.set(cid, (map.get(cid) ?? 0) + amt)
  const positive = [...map.values()].filter((v) => v > 0)
  const total = sum(positive.length ? positive : [...map.values()])
  return [...map.entries()]
    .map(([id, value]) => {
      const c = categories.find((x) => x.id === id)
      return { id, name: c?.name ?? 'Uncategorised', color: c?.color ?? '#6b7280', icon: c?.icon ?? '•', value, pct: total ? (value / total) * 100 : 0 }
    })
    .filter((r) => Math.abs(r.value) > 0.004)
    .sort((a, b) => b.value - a.value)
}

export interface BudgetRow extends Budget {
  category?: Category
  spent: number
  pct: number
  remaining: number
  rolloverIn?: number
  limitWithRollover: number
}

export const budgetProgress = (
  budgets: Budget[],
  txs: Transaction[],
  categories: Category[],
  accounts: Account[],
  conv: Converter,
  key: string,
  startDay = 1,
): BudgetRow[] => {
  const month = inPeriod(txs, key, startDay).filter((t) => t.type === 'expense')
  return budgets
    .map((b) => {
      const c = categories.find((x) => x.id === b.categoryId)
      let spent = 0
      for (const t of month) for (const [cid, amt] of categoryParts(t, accounts, conv)) if (cid === b.categoryId) spent += amt
      const rolloverIn = b.rollover ? (b.rolloverAmount ?? 0) : 0
      const limitWithRollover = (b.limit ?? 0) + rolloverIn
      return { ...b, category: c, spent, pct: limitWithRollover ? (spent / limitWithRollover) * 100 : 0, remaining: limitWithRollover - spent, rolloverIn, limitWithRollover }
    })
    .filter((b) => b.category)
}

/** Suggested budget limits: the 50/30/20 split or the average of the last 3 months. */
export const budgetTemplates = (txs: Transaction[], accounts: Account[], conv: Converter, months = 3) => {
  const keys = lastNMonths(months)
  const avg = (pick: (t: Transaction) => boolean) => sum(txs.filter((t) => keys.includes(monthKey(t.date)) && pick(t)).map((t) => txBase(t, accounts, conv))) / Math.max(1, months)
  const income = avg((t) => t.type === 'income')
  const expense = avg((t) => t.type === 'expense')
  return { income, expense, fifty: income * 0.5, thirty: income * 0.3, twenty: income * 0.2, expenseAvg: expense }
}

export const dailySpend = (txs: Transaction[], accounts: Account[], conv: Converter, key: string) => {
  const [y, m] = key.split('-').map(Number)
  const days = new Date(y!, m!, 0).getDate()
  const arr = Array.from({ length: days }, (_, i) => ({ day: i + 1, expense: 0, income: 0 }))
  for (const t of inMonth(txs, key)) {
    const d = Number(t.date.slice(8, 10)) - 1
    const v = txBase(t, accounts, conv) * effectiveAmount(t)
    if (t.type === 'expense') arr[d]!.expense += v
    if (t.type === 'income') arr[d]!.income += v
  }
  let cum = 0
  return arr.map((x) => ({ ...x, cumulative: (cum += x.expense) }))
}

/** Last 7 days income/expense series (for the reference's weekday wave chart). */
export const weekSeries = (txs: Transaction[], accounts: Account[], conv: Converter, weeksBack = 0) => {
  const end = addDays(today(), -7 * weeksBack)
  const out: { day: string; date: string; income: number; expense: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const date = addDays(end, -i)
    const dayTx = txs.filter((t) => t.date === date)
    out.push({
      date,
      day: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
      income: sum(dayTx.filter((t) => t.type === 'income').map((t) => txBase(t, accounts, conv))),
      expense: sum(dayTx.filter((t) => t.type === 'expense').map((t) => txBase(t, accounts, conv) * effectiveAmount(t))),
    })
  }
  return out
}

export const topPayees = (txs: Transaction[], accounts: Account[], conv: Converter, n = 5) => {
  const map = new Map<string, { total: number; count: number }>()
  for (const t of txs)
    if (t.type === 'expense') {
      const cur = map.get(t.payee) ?? { total: 0, count: 0 }
      cur.total += txBase(t, accounts, conv) * effectiveAmount(t)
      cur.count++
      map.set(t.payee, cur)
    }
  return [...map.entries()]
    .map(([payee, v]) => ({ payee, ...v }))
    .filter((p) => Math.abs(p.total) > 0.004)
    .sort((a, b) => b.total - a.total)
    .slice(0, n)
}

export const byTag = (txs: Transaction[], accounts: Account[], conv: Converter) => {
  const map = new Map<string, { total: number; count: number }>()
  for (const t of txs)
    if (t.type === 'expense')
      for (const tag of t.tags ?? []) {
        const cur = map.get(tag) ?? { total: 0, count: 0 }
        cur.total += txBase(t, accounts, conv) * effectiveAmount(t)
        cur.count++
        map.set(tag, cur)
      }
  return [...map.entries()].map(([tag, v]) => ({ tag, ...v })).sort((a, b) => b.total - a.total)
}

export const netWorthSeries = (accounts: Account[], txs: Transaction[], conv: Converter, n = 6, holdings: Holding[] = [], debts: Debt[] = []) =>
  lastNMonths(n).map((key) => {
    const upTo = txs.filter((t) => monthKey(t.date) <= key)
    return { key, value: netWorth(accounts, upTo, conv, holdings, debts) }
  })

/* ---------- recurring ---------- */

export const upcoming = (recurring: Recurring[], days = 30, from = today()) => {
  const end = addDays(from, days)
  const out: { rec: Recurring; date: string; daysAway: number }[] = []
  for (const r of recurring) {
    if (!r.active) continue
    let d = r.nextDate
    let guard = 0
    while (d <= end && guard++ < 60) {
      if (r.endDate && d > r.endDate) break
      out.push({ rec: r, date: d, daysAway: daysBetween(from, d) })
      d = nextOccurrence(d, r.frequency)
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Next due date for a day-of-month, handling month wrap (due day 2 on the 29th → next month). */
export const nextDueDate = (dueDay: number, from = today()) => {
  const [y, m] = from.split('-').map(Number)
  const dim = new Date(y!, m!, 0).getDate()
  const day = Math.min(dueDay, dim)
  const thisMonth = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (thisMonth >= from) return thisMonth
  const nm = new Date(y!, m!, 1)
  const dim2 = new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate()
  return `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-${String(Math.min(dueDay, dim2)).padStart(2, '0')}`
}

export const monthlyCommitments = (recurring: Recurring[], accounts: Account[], conv: Converter) => {
  const active = recurring.filter((r) => r.active)
  const exp = sum(active.filter((r) => r.type === 'expense').map((r) => conv(r.amount, accCurrency(accounts, r.accountId)) * perMonthFactor[r.frequency]))
  const inc = sum(active.filter((r) => r.type === 'income').map((r) => conv(r.amount, accCurrency(accounts, r.accountId)) * perMonthFactor[r.frequency]))
  return { expense: exp, income: inc }
}

/* ---------- investments ---------- */

export const portfolio = (holdings: Holding[], conv: Converter) => {
  const rows = holdings.map((h) => {
    const value = conv(h.quantity * h.price, h.currency)
    const cost = conv(h.quantity * h.avgCost, h.currency)
    return { ...h, value, cost, pnl: value - cost, pnlPct: cost ? ((value - cost) / cost) * 100 : 0 }
  })
  const value = sum(rows.map((r) => r.value))
  const cost = sum(rows.map((r) => r.cost))
  const byClass = new Map<string, number>()
  for (const r of rows) byClass.set(r.assetClass, (byClass.get(r.assetClass) ?? 0) + r.value)
  return {
    rows: rows.map((r) => ({ ...r, weight: value ? (r.value / value) * 100 : 0 })).sort((a, b) => b.value - a.value),
    value,
    cost,
    pnl: value - cost,
    pnlPct: cost ? ((value - cost) / cost) * 100 : 0,
    realized: sum(holdings.map((h) => conv(h.realizedPnl ?? 0, h.currency))),
    dividends: sum(holdings.map((h) => conv(h.dividends ?? 0, h.currency))),
    allocation: [...byClass.entries()].map(([k, v]) => ({ assetClass: k, value: v, pct: value ? (v / value) * 100 : 0 })).sort((a, b) => b.value - a.value),
  }
}

/** Rebalance suggestions against `targetPct` on each holding. */
export const rebalancePlan = (holdings: Holding[], conv: Converter) => {
  const pf = portfolio(holdings, conv)
  if (!pf.value) return { total: 0, rows: [] }
  const rows = pf.rows.map((r) => {
    const target = r.targetPct ?? null
    const targetValue = target == null ? r.value : (pf.value * target) / 100
    return { ...r, target, targetValue, drift: r.value - targetValue, driftPct: r.weight - (target ?? r.weight) }
  })
  return { total: pf.value, rows }
}

/** Money-weighted return (XIRR) over a set of dated cash flows, solved by bisection. */
export function xirr(flows: { date: string; amount: number }[], guess = 0.1): number | null {
  if (flows.length < 2) return null
  const t0 = Date.parse(flows[0]!.date)
  const npv = (rate: number) => sum(flows.map((f) => f.amount / Math.pow(1 + rate, (Date.parse(f.date) - t0) / (365 * 86400000))))
  let lo = -0.9999
  let hi = 10
  let fLo = npv(lo)
  let fHi = npv(hi)
  if (fLo * fHi > 0) return null
  let r = guess
  for (let i = 0; i < 200; i++) {
    r = (lo + hi) / 2
    const v = npv(r)
    if (Math.abs(v) < 1e-7) return r
    if (v * fLo > 0) {
      lo = r
      fLo = v
    } else {
      hi = r
      fHi = v
    }
  }
  void fHi
  return r
}

/** Time-weighted return from a series of (date, value) portfolio observations. */
export const twr = (points: { date: string; value: number }[]) => {
  if (points.length < 2) return 0
  let growth = 1
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.value
    if (prev > 0) growth *= points[i]!.value / prev
  }
  return (growth - 1) * 100
}

/* ---------- debts ---------- */

/** Simulate amortisation with a fixed monthly payment. Returns months to payoff and total interest. */
export const payoffPlan = (balance: number, apr: number, payment: number, maxMonths = 600) => {
  let b = balance
  let interest = 0
  let months = 0
  const r = apr / 100 / 12
  if (payment <= b * r) return { months: Infinity, interest: Infinity, schedule: [] as { month: number; balance: number; interest: number; principal: number }[] }
  const schedule: { month: number; balance: number; interest: number; principal: number }[] = [{ month: 0, balance: b, interest: 0, principal: 0 }]
  while (b > 0.005 && months < maxMonths) {
    const i = b * r
    const principal = Math.min(b, payment - i)
    interest += i
    b = b + i - payment
    months++
    schedule.push({ month: months, balance: Math.max(0, b), interest: i, principal })
  }
  return { months, interest, schedule }
}

/** Snowball / avalanche total plan with a fixed extra budget. */
export const debtStrategy = (debts: Debt[], extra: number, strategy: 'avalanche' | 'snowball') => {
  const order = [...debts].sort((a, b) => (strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance))
  const bals = new Map(order.map((d) => [d.id, d.balance]))
  let months = 0
  let interest = 0
  const payoffMonth = new Map<string, number>()
  while ([...bals.values()].some((b) => b > 0.005) && months < 600) {
    months++
    let pool = extra
    for (const d of order) {
      const b = bals.get(d.id)!
      if (b <= 0.005) {
        pool += d.minPayment
        continue
      }
      const i = b * (d.apr / 100 / 12)
      interest += i
      bals.set(d.id, b + i - d.minPayment)
    }
    for (const d of order) {
      const b = bals.get(d.id)!
      if (b <= 0.005 || pool <= 0) continue
      const pay = Math.min(pool, b)
      bals.set(d.id, b - pay)
      pool -= pay
    }
    for (const d of order) if (bals.get(d.id)! <= 0.005 && !payoffMonth.has(d.id)) payoffMonth.set(d.id, months)
  }
  return { months, interest, payoffMonth }
}

/** Total interest paid to date on a debt (from its payment log). */
export const interestPaid = (debt: Debt, payments: { debtId: string; amount: number; kind?: string; interest?: number }[]) => {
  const own = payments.filter((p) => p.debtId === debt.id)
  return sum(own.map((p) => (p.kind === 'interest' ? p.amount : (p.interest ?? 0))))
}
