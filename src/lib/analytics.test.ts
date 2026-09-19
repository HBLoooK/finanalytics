import { describe, expect, it } from 'vitest'
import { accountBalance, payoffPlan, portfolio, twr, xirr } from './analytics'
import type { Account, Holding, Transaction } from './types'
import { makeConverter } from './analytics'
import { defaultSettings } from './seed'

const acc = (over: Partial<Account>): Account => ({ id: 'a', name: 'A', type: 'checking', balance: 0, currency: 'USD', color: '#000', ...over })
const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't',
  type: 'expense',
  amount: 10,
  date: '2026-01-10',
  categoryId: null,
  accountId: 'a',
  toAccountId: null,
  note: '',
  payee: 'X',
  ...over,
})

const conv = makeConverter(defaultSettings)

describe('accountBalance', () => {
  it('adds income and subtracts expenses', () => {
    const a = acc({ id: 'a', balance: 100 })
    expect(accountBalance(a, [tx({ type: 'income', amount: 50 }), tx({ type: 'expense', amount: 20 })])).toBe(130)
  })

  it('uses toAmount for cross-currency transfers instead of the source amount', () => {
    const usd = acc({ id: 'usd', currency: 'USD', balance: 1000 })
    const eur = acc({ id: 'eur', currency: 'EUR', balance: 0 })
    const transfer = tx({ type: 'transfer', amount: 100, accountId: 'usd', toAccountId: 'eur', toAmount: 92 })
    expect(accountBalance(usd, [transfer])).toBe(900)
    expect(accountBalance(eur, [transfer])).toBe(92) // not 100
  })

  it('falls back to the source amount when no destination amount is recorded', () => {
    const eur = acc({ id: 'eur', currency: 'EUR', balance: 0 })
    const transfer = tx({ type: 'transfer', amount: 100, accountId: 'usd', toAccountId: 'eur' })
    expect(accountBalance(eur, [transfer])).toBe(100)
  })

  it('moves cash for investment trades: buy out, sell in', () => {
    const a = acc({ id: 'a', balance: 500 })
    const buy = tx({ type: 'transfer', amount: 300, accountId: 'a', investment: { holdingId: 'h', side: 'buy', qty: 1, price: 300 } })
    const sell = tx({ id: 't2', type: 'transfer', amount: 120, accountId: 'a', investment: { holdingId: 'h', side: 'sell', qty: 0.5, price: 240 } })
    expect(accountBalance(a, [buy, sell])).toBe(320)
  })
})

describe('portfolio', () => {
  const h: Holding = { id: 'h', symbol: 'VTI', name: 'V', assetClass: 'etf', quantity: 10, avgCost: 200, price: 250, currency: 'USD', updatedAt: '2026-01-01', color: '#000' }
  it('computes value, cost and P&L', () => {
    const pf = portfolio([h], conv)
    expect(pf.value).toBe(2500)
    expect(pf.cost).toBe(2000)
    expect(pf.pnl).toBe(500)
    expect(pf.pnlPct).toBeCloseTo(25)
  })
  it('weights each holding', () => {
    const pf = portfolio([h, { ...h, id: 'h2', symbol: 'BND', quantity: 10, avgCost: 100, price: 100 }], conv)
    expect(pf.rows[0]!.weight).toBeCloseTo(71.43, 1)
    expect(pf.realized).toBe(0)
  })
})

describe('payoffPlan', () => {
  it('returns Infinity when the payment does not cover interest', () => {
    const p = payoffPlan(1000, 24, 10)
    expect(p.months).toBe(Infinity)
  })
  it('amortises and splits interest from principal', () => {
    const p = payoffPlan(1000, 12, 100)
    expect(p.months).toBeGreaterThan(10)
    expect(p.schedule[1]!.interest).toBeCloseTo(10)
    expect(p.schedule[1]!.principal).toBeCloseTo(90)
    expect(p.schedule.at(-1)!.balance).toBeLessThan(0.01)
  })
})

describe('returns', () => {
  it('solves XIRR for a simple two-flow case', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ])
    expect(r).not.toBeNull()
    expect(r!).toBeCloseTo(0.1, 3)
  })
  it('computes time-weighted return', () => {
    expect(
      twr([
        { date: '2025-01-01', value: 100 },
        { date: '2025-06-01', value: 120 },
        { date: '2025-12-01', value: 132 },
      ]),
    ).toBeCloseTo(32)
  })
})
