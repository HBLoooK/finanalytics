// Data health: the things that quietly make every number on every page wrong.
import type { Account, Category, Debt, Goal, Holding, Recurring, Rule, Settings, Transaction } from './types'
import { addDays, daysBetween, monthKey, today } from './utils'

export type Severity = 'error' | 'warn' | 'info'

export interface HealthIssue {
  id: string
  severity: Severity
  title: string
  detail: string
  count?: number
  /** Optional one-click fix; returns a description of what happened. */
  fix?: () => string
  fixLabel?: string
  link?: string
}

export interface HealthInput {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  recurring: Recurring[]
  holdings: Holding[]
  debts: Debt[]
  rules: Rule[]
  goals: Goal[]
  settings: Settings
  lastBackupAt?: string | null
  dbIntegrity?: boolean
}

export function checkHealth(i: HealthInput): HealthIssue[] {
  const out: HealthIssue[] = []
  const push = (x: HealthIssue) => out.push(x)

  const uncategorised = i.transactions.filter((t) => t.type !== 'transfer' && !t.categoryId)
  if (uncategorised.length)
    push({
      id: 'uncategorised',
      severity: 'warn',
      title: `${uncategorised.length} uncategorised transaction${uncategorised.length === 1 ? '' : 's'}`,
      detail: 'They are counted in totals but missing from every category chart.',
      count: uncategorised.length,
      link: '/transactions?is:uncategorised',
    })

  const orphan = i.transactions.filter((t) => !i.accounts.some((a) => a.id === t.accountId))
  if (orphan.length)
    push({
      id: 'orphan-account',
      severity: 'error',
      title: `${orphan.length} transactions on a missing account`,
      detail: 'Their amount is excluded from balances.',
      count: orphan.length,
    })

  const badSplits = i.transactions.filter((t) => t.splits?.length && Math.abs(t.splits.reduce((s, x) => s + x.amount, 0) - t.amount) > 0.02)
  if (badSplits.length)
    push({
      id: 'bad-splits',
      severity: 'error',
      title: `${badSplits.length} split${badSplits.length === 1 ? '' : 's'} do not add up`,
      detail: 'Category totals are over- or under-stated.',
      count: badSplits.length,
    })

  const missingCat = i.transactions.filter((t) => t.categoryId && !i.categories.some((c) => c.id === t.categoryId) && !t.splits?.length)
  if (missingCat.length)
    push({
      id: 'missing-category',
      severity: 'warn',
      title: `${missingCat.length} transactions point at a deleted category`,
      detail: 'They show as “Uncategorised”.',
      count: missingCat.length,
    })

  const overdue = i.recurring.filter((r) => r.active && !r.autoPost && daysBetween(today(), r.nextDate) < -30)
  if (overdue.length)
    push({
      id: 'overdue-bills',
      severity: 'warn',
      title: `${overdue.length} bill${overdue.length === 1 ? '' : 's'} overdue by more than 30 days`,
      detail: 'Post them or the schedule falls further behind.',
      count: overdue.length,
      link: '/recurring',
    })

  const staleRates = i.settings.ratesUpdatedAt ? daysBetween(i.settings.ratesUpdatedAt, today()) : null
  const usedForeign = new Set(i.accounts.map((a) => a.currency).filter((c) => c !== i.settings.currency))
  if (usedForeign.size && (staleRates === null || staleRates > 30))
    push({
      id: 'stale-rates',
      severity: 'info',
      title: `Exchange rates last updated ${staleRates === null ? 'never' : `${staleRates} days ago`}`,
      detail: `Accounts in ${[...usedForeign].join(', ')} are converted with them.`,
      link: '/settings',
    })

  const backupAge = i.lastBackupAt ? daysBetween(i.lastBackupAt, today()) : null
  if (backupAge === null || backupAge > 7)
    push({
      id: 'backup-age',
      severity: backupAge === null || backupAge > 30 ? 'warn' : 'info',
      title: backupAge === null ? 'No snapshot has been taken yet' : `Last snapshot is ${backupAge} days old`,
      detail: 'A daily snapshot is automatic while the server runs.',
      link: '/settings',
    })

  if (i.dbIntegrity === false)
    push({ id: 'integrity', severity: 'error', title: 'The database failed its integrity check', detail: 'Restore from a snapshot before doing anything else.', link: '/settings' })

  const noTxAccounts = i.accounts.filter((a) => !a.archived && !i.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id))
  if (noTxAccounts.length)
    push({
      id: 'empty-accounts',
      severity: 'info',
      title: `${noTxAccounts.length} account${noTxAccounts.length === 1 ? '' : 's'} with no transactions`,
      detail: noTxAccounts.map((a) => a.name).join(', '),
      count: noTxAccounts.length,
    })

  const noRate = i.accounts.filter((a) => a.currency !== i.settings.currency && !(i.settings.rates[a.currency] > 0))
  if (noRate.length)
    push({
      id: 'missing-rate',
      severity: 'error',
      title: `No exchange rate for ${noRate.map((a) => a.currency).join(', ')}`,
      detail: 'Those balances are counted 1:1, which is wrong.',
      link: '/settings',
    })

  const future = i.transactions.filter((t) => t.date > addDays(today(), 1))
  if (future.length)
    push({ id: 'future', severity: 'info', title: `${future.length} transaction${future.length === 1 ? '' : 's'} dated in the future`, detail: 'Usually a date-format slip during import.', count: future.length })

  const dupGroups = new Map<string, Transaction[]>()
  for (const t of i.transactions) {
    const k = `${t.date}|${t.amount.toFixed(2)}|${(t.payee || '').toLowerCase().trim()}|${t.accountId}`
    const g = dupGroups.get(k) ?? []
    g.push(t)
    dupGroups.set(k, g)
  }
  const dups = [...dupGroups.values()].filter((g) => g.length > 1 && !g.every((t) => t.recurringId))
  if (dups.length)
    push({
      id: 'duplicates',
      severity: 'warn',
      title: `${dups.reduce((s, g) => s + g.length - 1, 0)} possible duplicate transactions`,
      detail: 'Same date, amount, payee and account.',
      count: dups.length,
      link: '/transactions',
    })

  const staleHoldings = i.holdings.filter((h) => daysBetween(h.updatedAt, today()) > 30)
  if (staleHoldings.length)
    push({
      id: 'stale-prices',
      severity: 'info',
      title: `${staleHoldings.length} holding${staleHoldings.length === 1 ? '' : 's'} not priced for 30+ days`,
      detail: staleHoldings.map((h) => h.symbol).join(', '),
      link: '/investments',
    })

  const stuckGoals = i.goals.filter((g) => g.deadline && g.deadline < today() && g.saved < g.target)
  if (stuckGoals.length)
    push({ id: 'past-goals', severity: 'info', title: `${stuckGoals.length} goal${stuckGoals.length === 1 ? '' : 's'} past their deadline`, detail: 'Update the date or the target.', link: '/goals' })

  const unpaidDebts = i.debts.filter((d) => d.balance > 0 && d.lastInterestAt && daysBetween(d.lastInterestAt, today()) > 45)
  if (unpaidDebts.length)
    push({ id: 'no-interest', severity: 'info', title: 'Interest has not been accrued recently', detail: 'Debts with an APR accrue monthly on load.', link: '/debts' })

  if (!out.length) push({ id: 'ok', severity: 'info', title: 'Everything checks out', detail: 'No uncategorised transactions, no orphans, backups current.' })

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}

export const monthKeySafe = monthKey
