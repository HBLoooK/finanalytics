// Cash-flow forecasting: what is safe to spend today, and what the next 90 days look like.
import type { Account, Budget, Goal, Recurring, Transaction } from './types'
import { accountBalance, upcoming } from './analytics'
import type { Converter } from './analytics'
import { addDays, monthKey, nextOccurrence, today } from './utils'

export interface ForecastOptions {
  accounts: Account[]
  transactions: Transaction[]
  recurring: Recurring[]
  budgets: Budget[]
  goals: Goal[]
  conv: Converter
  days?: number
  includeArchived?: boolean
}

export interface ForecastDay {
  date: string
  balance: number
  income: number
  expense: number
  items: { label: string; amount: number; kind: 'income' | 'expense' | 'bill' }[]
}

/** Average daily discretionary spend over the last 60 days (recurring bills excluded). */
export const dailyDiscretionary = (transactions: Transaction[], accounts: Account[], conv: Converter, days = 60) => {
  const from = addDays(today(), -days)
  const billLike = new Set(transactions.filter((t) => t.recurringId).map((t) => t.id))
  const txs = transactions.filter((t) => t.type === 'expense' && t.date >= from && !billLike.has(t.id))
  const acc = (id: string) => accounts.find((a) => a.id === id)?.currency ?? ''
  const total = txs.reduce((s, t) => s + conv(t.amount, acc(t.accountId)) * (t.refundOf ? -1 : 1), 0)
  return total / Math.max(1, days)
}

/**
 * Safe to spend = liquid balance
 *   − bills due before the next income arrives
 *   − budget commitments still unused this period
 *   − goal contributions still due
 * Never negative-aware: it is a guardrail, not a promise.
 */
export function safeToSpend(o: ForecastOptions) {
  const { accounts, transactions, recurring, budgets, goals, conv } = o
  const liquid = accounts.filter((a) => o.includeArchived || !a.archived).reduce((s, a) => s + conv(accountBalance(a, transactions), a.currency), 0)

  const up = upcoming(recurring, 60)
  const nextIncome = up.find((u) => u.rec.type === 'income')
  const horizon = nextIncome ? nextIncome.date : addDays(today(), 30)

  const billsDue = up.filter((u) => u.rec.type === 'expense' && u.date < horizon).reduce((s, u) => s + conv(u.rec.amount, accounts.find((a) => a.id === u.rec.accountId)?.currency ?? ''), 0)

  const key = monthKey(today())
  let budgetLeft = 0
  for (const b of budgets) {
    const spent = transactions
      .filter((t) => t.type === 'expense' && monthKey(t.date) === key)
      .reduce((s, t) => {
        const parts = t.splits?.length ? t.splits.map((x) => (x.categoryId === b.categoryId ? x.amount : 0)) : [t.categoryId === b.categoryId ? t.amount : 0]
        const acc = accounts.find((a) => a.id === t.accountId)?.currency ?? ''
        return s + conv(parts.reduce((a, c) => a + c, 0), acc)
      }, 0)
    budgetLeft += Math.max(0, (b.limit + (b.rollover ? b.rolloverAmount ?? 0 : 0)) - spent)
  }

  const goalDue = goals.filter((g) => g.saved < g.target).reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)
  const pendingOut = transactions.filter((t) => t.status === 'pending' && t.type === 'expense').reduce((s, t) => s + conv(t.amount, accounts.find((a) => a.id === t.accountId)?.currency ?? ''), 0)

  const value = liquid - billsDue - budgetLeft - goalDue - pendingOut
  return {
    liquid,
    billsDue,
    budgetLeft,
    goalDue,
    pendingOut,
    horizon,
    nextIncomeDate: nextIncome?.date ?? null,
    value,
    perDay: Math.max(0, value) / Math.max(1, daysBetweenLocal(today(), horizon)),
  }
}

const daysBetweenLocal = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86400000))

/**
 * Projected daily balance for the next `days` days: known recurring items plus the average
 * discretionary burn. Returns the series, the minimum point and a warning when it dips below 0.
 */
export function cashFlowForecast(o: ForecastOptions): { days: ForecastDay[]; min: ForecastDay | null; startBalance: number } {
  const { accounts, transactions, recurring, conv } = o
  const days = o.days ?? 90
  const startBalance = accounts.filter((a) => o.includeArchived || !a.archived).reduce((s, a) => s + conv(accountBalance(a, transactions), a.currency), 0)
  const burn = dailyDiscretionary(transactions, accounts, conv)

  // Expand recurring items across the window.
  const events = new Map<string, ForecastDay['items']>()
  const push = (date: string, item: ForecastDay['items'][number]) => {
    const list = events.get(date) ?? []
    list.push(item)
    events.set(date, list)
  }
  for (const r of recurring) {
    if (!r.active) continue
    let d = r.nextDate
    let guard = 0
    while (d <= addDays(today(), days) && guard++ < 200) {
      if (r.endDate && d > r.endDate) break
      if (d >= today()) {
        const amount = conv(r.amount, accounts.find((a) => a.id === r.accountId)?.currency ?? '')
        if (r.type === 'income') push(d, { label: r.name, amount, kind: 'income' })
        else if (r.type === 'expense') push(d, { label: r.name, amount: -amount, kind: 'bill' })
        // transfers are internal: they move money between accounts, not out of net worth
      }
      d = nextOccurrence(d, r.frequency)
    }
  }

  const out: ForecastDay[] = []
  let bal = startBalance
  for (let i = 0; i <= days; i++) {
    const date = addDays(today(), i)
    const items = events.get(date) ?? []
    const income = items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0)
    const expense = items.filter((x) => x.amount < 0).reduce((s, x) => s + -x.amount, 0)
    // Discretionary burn only counts on days without a big bill (avoids double counting).
    bal += income - expense - (expense > 0 ? 0 : burn)
    out.push({ date, balance: bal, income, expense: expense + (expense > 0 ? 0 : burn), items })
  }
  const min = out.reduce<ForecastDay | null>((m, d) => (!m || d.balance < m.balance ? d : m), null)
  return { days: out, min, startBalance }
}

/** Expected balance per day, condensed into a calendar-friendly map. */
export const forecastCalendar = (o: ForecastOptions) => {
  const { days } = cashFlowForecast({ ...o, days: 45 })
  const map = new Map<string, ForecastDay>()
  for (const d of days) map.set(d.date, d)
  return map
}
