import { describe, expect, it } from 'vitest'
import { diffStates, applyOpsToState } from './sync'
import { parseQuery, matchQuery } from './search'
import { detectRecurring, matchBills, normalizePayee, detectAnomalies } from './matching'
import { safeToSpend, cashFlowForecast } from './forecast'
import { periodKey, periodRange } from './utils'
import { nextDueDate } from './analytics'
import { checkHealth } from './health'
import type { Transaction } from './types'
import { makeConverter } from './analytics'
import { defaultAccounts, defaultCategories, defaultSettings } from './seed'

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't',
  type: 'expense',
  amount: 10,
  date: '2026-01-10',
  categoryId: null,
  accountId: 'a_checking',
  toAccountId: null,
  note: '',
  payee: 'X',
  ...over,
})

describe('sync diff', () => {
  it('produces commutative ops that turn one state into the other', () => {
    const from = { accounts: [{ id: 'a', name: 'A' }], transactions: [{ id: 't1', amount: 1 }], settings: { currency: 'USD' }, version: 3 }
    const to = { accounts: [{ id: 'a', name: 'A2' }], transactions: [{ id: 't1', amount: 1 }, { id: 't2', amount: 2 }], settings: { currency: 'EUR' }, version: 3 }
    const { ops, changed } = diffStates(from as never, to as never)
    expect(changed).toBe(true)
    expect(ops.accounts!.upsert).toHaveLength(1)
    expect(ops.transactions!.upsert).toEqual([{ id: 't2', amount: 2 }])
    expect(ops.settings!.set).toEqual({ currency: 'EUR' })
    // Applying the ops to `from` reproduces `to`
    const merged = applyOpsToState(from as never, ops)
    expect(merged.accounts).toEqual(to.accounts)
    expect(merged.transactions).toEqual(to.transactions)
  })

  it('reports deletions', () => {
    const { ops } = diffStates({ transactions: [{ id: 'x' }] } as never, { transactions: [] } as never)
    expect(ops.transactions!.delete).toEqual(['x'])
  })
})

describe('search operators', () => {
  const cats = defaultCategories
  const accs = defaultAccounts
  const t = tx({ amount: 120, payee: 'Whole Foods', categoryId: 'c_groceries', date: '2026-03-04', tags: ['food'] })
  it('filters by amount, tag, date and text', () => {
    expect(matchQuery(t, parseQuery('>100 cat:food #food'), cats, accs)).toBe(true)
    expect(matchQuery(t, parseQuery('<50'), cats, accs)).toBe(false)
    expect(matchQuery(t, parseQuery('before:2026-03-01'), cats, accs)).toBe(false)
    expect(matchQuery(t, parseQuery('-coffee'), cats, accs)).toBe(true)
    expect(matchQuery(t, parseQuery('account:checking'), cats, accs)).toBe(true)
    expect(matchQuery(t, parseQuery('amount:120'), cats, accs)).toBe(true)
  })
  it('supports is: and has: flags', () => {
    expect(matchQuery(tx({ categoryId: null }), parseQuery('is:uncategorised'), cats, accs)).toBe(true)
    expect(matchQuery(t, parseQuery('is:uncategorised'), cats, accs)).toBe(false)
    expect(matchQuery(tx({ splits: [{ categoryId: 'c_food', amount: 5, note: '' }] }), parseQuery('has:split'), cats, accs)).toBe(true)
  })
})

describe('matching', () => {
  it('normalises messy bank payees', () => {
    expect(normalizePayee('AMZN*MKTP US*2K4Q8')).toBe('Amazon')
    expect(normalizePayee('SQ *BLUE BOTTLE #1234')).toBe('BLUE BOTTLE')
    expect(normalizePayee('Café de Flore', [{ from: 'café de flore', to: 'Café de Flore' }])).toBe('Café de Flore')
  })

  it('matches a transaction to the bill it settles', () => {
    const rec = {
      id: 'r',
      name: 'Netflix',
      type: 'expense',
      amount: 15,
      categoryId: null,
      accountId: 'a_checking',
      payee: 'Netflix',
      note: '',
      frequency: 'monthly',
      nextDate: '2026-01-04',
      endDate: null,
      autoPost: false,
      active: true,
      remindDays: 3,
    } as const
    const bills = matchBills([rec as never], [tx({ date: '2026-01-05', amount: 15.2, payee: 'Netflix' })])
    expect(bills).toHaveLength(1)
    expect(bills[0]!.rec.id).toBe('r')
  })

  it('detects a monthly pattern and ignores one-offs', () => {
    const monthly = ['2026-01-05', '2026-02-05', '2026-03-05'].map((date, i) => tx({ id: `m${i}`, date, amount: 42, payee: 'Gym' }))
    const found = detectRecurring([...monthly, tx({ id: 'z', date: '2026-01-07', amount: 9, payee: 'One off' })], new Set())
    expect(found[0]!.payee).toBe('Gym')
    expect(found[0]!.frequency).toBe('monthly')
    expect(found.some((f) => f.payee === 'One off')).toBe(false)
  })

  it('flags an outlier against its own history', () => {
    const history = [18, 22, 19, 21, 20, 20].map((amount, i) => tx({ id: `h${i}`, date: `2026-0${i + 1}-05`, amount, payee: 'Coffee' }))
    const odd = tx({ id: 'big', date: '2026-02-11', amount: 400, payee: 'Coffee' })
    const anomalies = detectAnomalies([...history, odd], 3, 2, 400)
    expect(anomalies[0]!.tx.id).toBe('big')
  })
})

describe('periods', () => {
  it('shifts dates before the start day into the previous period', () => {
    expect(periodKey('2026-03-24', 25)).toBe('2026-02')
    expect(periodKey('2026-03-25', 25)).toBe('2026-03')
    expect(periodRange('2026-03', 25).from).toBe('2026-02-25')
  })
  it('rolls a due day over the end of the month', () => {
    expect(nextDueDate(2, '2026-01-29')).toBe('2026-02-02')
    expect(nextDueDate(2, '2026-01-01')).toBe('2026-01-02')
  })
})

describe('forecast', () => {
  const conv = makeConverter(defaultSettings)
  const base = { accounts: defaultAccounts, transactions: [], budgets: [], goals: [], categories: defaultCategories, conv }
  it('subtracts bills and budgets from the liquid balance', () => {
    const s = safeToSpend({
      ...base,
      recurring: [
        {
          id: 'r',
          name: 'Rent',
          type: 'expense',
          amount: 1000,
          categoryId: null,
          accountId: 'a_checking',
          payee: 'Rent',
          note: '',
          frequency: 'monthly',
          nextDate: '2026-01-10',
          endDate: null,
          autoPost: false,
          active: true,
          remindDays: 3,
        } as never,
      ],
    })
    // 1250 + 9800 - 650 + 1400*… ; bills 1000 are due before any income, so safe < liquid
    expect(s.billsDue).toBe(1000)
    expect(s.value).toBeLessThan(s.liquid)
  })
  it('projects a 30-day balance series', () => {
    const f = cashFlowForecast({ ...base, recurring: [], days: 30 })
    expect(f.days).toHaveLength(31)
    expect(f.days[0]!.balance).toBeCloseTo(f.startBalance, 0)
  })
})

describe('data health', () => {
  const base = {
    accounts: defaultAccounts,
    categories: defaultCategories,
    recurring: [],
    holdings: [],
    debts: [],
    rules: [],
    goals: [],
    settings: defaultSettings,
  }
  it('finds uncategorised transactions and orphaned records', () => {
    const issues = checkHealth({ ...base, transactions: [tx({ categoryId: null }), tx({ id: 'o', accountId: 'ghost' })] })
    expect(issues.some((i) => i.id === 'uncategorised')).toBe(true)
    expect(issues.some((i) => i.id === 'orphan-account')).toBe(true)
  })
  it('reports healthy data', () => {
    const issues = checkHealth({ ...base, transactions: [tx({ categoryId: 'c_groceries' })], lastBackupAt: '2026-09-19' })
    expect(issues.filter((i) => i.severity !== 'info')).toEqual([])
  })
})
