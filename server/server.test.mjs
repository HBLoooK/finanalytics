import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from './db.mjs'
import { scheduledOps } from './scheduler.mjs'

const fresh = () => openDatabase(join(mkdtempSync(join(tmpdir(), 'fa-')), 'test.db'))

describe('sqlite store', () => {
  it('starts empty and reports status', () => {
    const db = fresh()
    expect(db.isEmpty()).toBe(true)
    const st = db.status()
    expect(st.engine).toBe('sqlite')
    expect(st.counts.transactions).toBe(0)
    db.close()
  })

  it('bumps a revision on every write and applies incremental ops', () => {
    const db = fresh()
    const r1 = db.write({ accounts: [{ id: 'a', name: 'A' }], settings: { currency: 'USD' } })
    expect(r1.rev).toBe(1)
    const r2 = db.applyOps({ accounts: { upsert: [{ id: 'b', name: 'B' }] } })
    expect(r2.rev).toBe(2)
    const state = db.readAll()
    expect(state.accounts.map((a) => a.id).sort()).toEqual(['a', 'b'])
    expect(state.settings.currency).toBe('USD')
    db.applyOps({ accounts: { delete: ['a'] } })
    expect(db.readAll().accounts.map((a) => a.id)).toEqual(['b'])
    db.close()
  })

  it('takes a verified backup and restores it', () => {
    const db = fresh()
    db.write({ accounts: [{ id: 'a', name: 'Original' }] })
    const name = db.backup()
    expect(db.listBackups()[0].name).toBe(name)
    expect(db.listBackups()[0].sha256).toMatch(/^[a-f0-9]{64}$/)
    db.write({ accounts: [{ id: 'a', name: 'Changed' }] })
    db.restoreFrom(join(db.backupDir, name))
    expect(db.readAll().accounts[0].name).toBe('Original')
    expect(db.listBackups().length).toBeGreaterThanOrEqual(2) // the pre-restore snapshot is kept
    db.close()
  })

  it('refuses to restore a file that is not a valid database', () => {
    const db = fresh()
    db.write({ accounts: [] })
    expect(() => db.restoreFrom(__filename)).toThrow()
    db.close()
  })
})

describe('scheduler', () => {
  const rec = {
    id: 'r1',
    name: 'Rent',
    type: 'expense',
    amount: 500,
    categoryId: null,
    accountId: 'a',
    payee: 'Rent',
    note: '',
    frequency: 'monthly',
    nextDate: '2026-01-01',
    endDate: null,
    autoPost: true,
    active: true,
    remindDays: 3,
  }

  it('posts every due occurrence with its historical date', () => {
    const { ops, posted } = scheduledOps({ recurring: [rec], transactions: [] }, '2026-03-15')
    expect(posted).toBe(3)
    expect(ops.transactions.upsert.map((t) => t.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(ops.recurring.upsert[0].nextDate).toBe('2026-04-01')
  })

  it('is idempotent: already-posted occurrences are skipped', () => {
    const state = { recurring: [rec], transactions: [{ id: 'x', recurringId: 'r1', date: '2026-01-01' }] }
    const { posted } = scheduledOps(state, '2026-03-15')
    expect(posted).toBe(2)
  })

  it('accrues monthly interest once per month', () => {
    const debt = { id: 'd', name: 'Card', kind: 'credit_card', principal: 1000, balance: 1000, apr: 12, minPayment: 50, dueDay: 1, color: '#000', lastInterestAt: '2026-01-01' }
    const { ops } = scheduledOps({ recurring: [], transactions: [], debts: [debt] }, '2026-04-01')
    expect(ops.debts.upsert[0].balance).toBeCloseTo(1030.3, 1) // 3 × 1% compounded
    expect(ops.debtPayments.upsert.every((p) => p.kind === 'interest')).toBe(true)
    // running again on the same day does nothing
    expect(scheduledOps({ recurring: [], transactions: [], debts: [ops.debts.upsert[0]] }, '2026-04-01').touched).toBe(false)
  })
})
