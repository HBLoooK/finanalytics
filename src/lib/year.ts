// "Year in review": a narrative summary of a calendar year.
import type { Account, Category, Transaction } from './types'
import type { Converter } from './analytics'
import { byCategory, categoryParts, totals, txBase } from './analytics'
import { addDays, daysBetween, monthKey, monthLabel, sum, today } from './utils'

export interface YearReview {
  year: number
  income: number
  expense: number
  net: number
  savingsRate: number
  txCount: number
  categories: ReturnType<typeof byCategory>
  topCategory: { name: string; icon: string; value: number; color: string } | null
  monthly: { key: string; label: string; income: number; expense: number; net: number }[]
  best: { key: string; label: string; net: number } | null
  worst: { key: string; label: string; net: number } | null
  biggest: Transaction | null
  smallest: Transaction | null
  busiestDay: { date: string; count: number; total: number } | null
  topPayee: { payee: string; total: number; count: number } | null
  longestNoSpend: number
  dailyAverage: number
  coffeeEquivalent: number
  comparedToPrev: { income: number; expense: number } | null
  uncategorised: number
}

export function yearInReview(
  year: number,
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  conv: Converter,
  averageSmallExpense = 4,
): YearReview {
  const inYear = transactions.filter((t) => t.date.startsWith(String(year)))
  const t = totals(inYear, accounts, conv)
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const m = totals(inYear.filter((x) => monthKey(x.date) === key), accounts, conv)
    return { key, label: monthLabel(key), ...m }
  })
  const expenses = inYear.filter((x) => x.type === 'expense')
  const biggest = expenses.reduce<Transaction | null>((a, b) => (!a || b.amount > a.amount ? b : a), null)
  const smallest = expenses.reduce<Transaction | null>((a, b) => (!a || b.amount < a.amount ? b : a), null)

  const byDate = new Map<string, { count: number; total: number }>()
  for (const x of expenses) {
    const cur = byDate.get(x.date) ?? { count: 0, total: 0 }
    cur.count++
    cur.total += txBase(x, accounts, conv)
    byDate.set(x.date, cur)
  }
  const busiestDay = [...byDate.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => b.count - a.count || b.total - a.total)[0] ?? null

  const payees = new Map<string, { total: number; count: number }>()
  for (const x of expenses) {
    const cur = payees.get(x.payee) ?? { total: 0, count: 0 }
    cur.total += txBase(x, accounts, conv)
    cur.count++
    payees.set(x.payee, cur)
  }
  const topPayee = [...payees.entries()].map(([payee, v]) => ({ payee, ...v })).sort((a, b) => b.total - a.total)[0] ?? null

  // longest streak of days with no spending
  const dates = new Set(expenses.map((x) => x.date))
  const start = `${year}-01-01`
  let streak = 0
  let longest = 0
  let cursor = start
  while (cursor <= `${year}-12-31`) {
    if (dates.has(cursor)) streak = 0
    else {
      streak++
      longest = Math.max(longest, streak)
    }
    cursor = addDays(cursor, 1)
  }

  const prev = totals(transactions.filter((x) => x.date.startsWith(String(year - 1))), accounts, conv)
  const cats = byCategory(inYear, categories, accounts, conv)
  const days = Math.max(1, daysBetween(`${year}-01-01`, year === Number(today().slice(0, 4)) ? today() : `${year}-12-31`) + 1)

  return {
    year,
    income: t.income,
    expense: t.expense,
    net: t.net,
    savingsRate: t.savingsRate,
    txCount: inYear.length,
    categories: cats,
    topCategory: cats[0] ? { name: cats[0]!.name, icon: cats[0]!.icon, value: cats[0]!.value, color: cats[0]!.color } : null,
    monthly,
    best: monthly.filter((m) => m.income + m.expense > 0).reduce<YearReview['best']>((a, b) => (!a || b.net > a.net ? b : a), null),
    worst: monthly.filter((m) => m.income + m.expense > 0).reduce<YearReview['worst']>((a, b) => (!a || b.net < a.net ? b : a), null),
    biggest,
    smallest,
    busiestDay,
    topPayee,
    longestNoSpend: longest,
    dailyAverage: t.expense / days,
    coffeeEquivalent: averageSmallExpense > 0 ? t.expense / averageSmallExpense : 0,
    comparedToPrev: prev.income + prev.expense > 0 ? { income: prev.income ? ((t.income - prev.income) / prev.income) * 100 : 0, expense: prev.expense ? ((t.expense - prev.expense) / prev.expense) * 100 : 0 } : null,
    uncategorised: inYear.filter((x) => x.type !== 'transfer' && !x.categoryId).length,
  }
}

/** Category totals for a drill-down panel. */
export const drillDown = (transactions: Transaction[], accounts: Account[], conv: Converter, categories: Category[]) => {
  const map = new Map<string, number>()
  for (const t of transactions) if (t.type === 'expense') for (const [cid, amt] of categoryParts(t, accounts, conv)) map.set(cid, (map.get(cid) ?? 0) + amt)
  return [...map.entries()]
    .map(([id, value]) => ({ id, value, name: categories.find((c) => c.id === id)?.name ?? 'Uncategorised', color: categories.find((c) => c.id === id)?.color ?? '#6b7280' }))
    .sort((a, b) => b.value - a.value)
}

export const sumSafe = sum
