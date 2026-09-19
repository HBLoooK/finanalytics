import { describe, expect, it } from 'vitest'
import {
  DAILY_TOTAL_CAP,
  XP,
  applyXp,
  emptyProgress,
  emptyStreak,
  evaluateBadges,
  generateQuests,
  levelFromXp,
  levelProgress,
  markDay,
  refreshQuests,
  seedProgressFromHistory,
  streakIsAlive,
  streakValue,
  titleForLevel,
  weekKey,
  xpForLevel,
  xpToReach,
  type GameCtx,
} from './gamification'
import { BADGES } from './badges'
import { HELP, HELP_GROUPS, helpById } from './help'
import { coachNudges, inQuietHours, pickNudge } from './coach'
import { makeConverter } from './analytics'
import { defaultSettings, demoData } from './seed'
import type { Progress, Quest, Transaction } from './types'

const conv = makeConverter(defaultSettings)

const emptyCtx = (over: Partial<GameCtx> = {}): GameCtx => ({
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  recurring: [],
  holdings: [],
  debts: [],
  debtPayments: [],
  rules: [],
  settings: defaultSettings,
  progress: emptyProgress(),
  ...over,
})

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? 't1',
  type: 'expense',
  amount: 25,
  date: '2026-03-10',
  categoryId: 'c_groceries',
  accountId: 'a',
  note: '',
  payee: 'Corner shop',
  ...over,
})

/* ------------------------------------------------------------- levels --- */
describe('levels', () => {
  it('starts at level 1', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelProgress(0)).toMatchObject({ level: 1, into: 0, need: xpForLevel(1) })
  })

  it('clears level 1 at exactly 60 XP', () => {
    expect(xpForLevel(1)).toBe(60)
    expect(levelFromXp(59)).toBe(1)
    expect(levelFromXp(60)).toBe(2)
  })

  it('levelProgress sums the levels below it', () => {
    expect(xpToReach(1)).toBe(0)
    expect(xpToReach(2)).toBe(xpForLevel(1))
    expect(xpToReach(3)).toBe(xpForLevel(1) + xpForLevel(2))
    const p = levelProgress(xpToReach(3) + 10)
    expect(p.level).toBe(3)
    expect(p.into).toBe(10)
    expect(p.toNext).toBe(xpForLevel(3) - 10)
    expect(p.pct).toBeCloseTo((10 / xpForLevel(3)) * 100, 5)
  })

  it('awards the right title at levels 1, 12 and 45', () => {
    expect(titleForLevel(1)).toBe('Newcomer')
    expect(titleForLevel(12)).toBe('Analyst')
    expect(titleForLevel(45)).toBe('Chief of Coin')
  })
})

/* ----------------------------------------------------------------- XP --- */
describe('XP', () => {
  it('awards the exact amount for an event', () => {
    const r = applyXp(emptyProgress(), 'tx.add', { date: '2026-03-10' })
    expect(r.gained).toBe(XP['tx.add'])
    expect(r.progress.xp).toBe(XP['tx.add'])
    expect(r.capped).toBe(false)
  })

  it('caps tx.add at 60 XP a day over ten calls', () => {
    let p = emptyProgress()
    for (let i = 0; i < 10; i++) p = applyXp(p, 'tx.add', { date: '2026-03-10' }).progress
    expect(p.xp).toBe(60)
  })

  it('caps tx.import at 40 XP a week over five calls', () => {
    let p = emptyProgress()
    for (let i = 0; i < 5; i++) p = applyXp(p, 'tx.import', { date: '2026-03-10', once: `batch-${i}` }).progress
    expect(p.xp).toBe(40)
  })

  it('never exceeds 200 XP in a day across eight event types', () => {
    const events = ['tx.add', 'tx.categorise', 'tx.split', 'tx.receipt', 'health.fix', 'bill.post', 'debt.pay', 'goal.contribute'] as const
    let p = emptyProgress()
    for (const e of events) p = applyXp(p, e, { date: '2026-03-10', count: 50 }).progress
    expect(p.xpLog['2026-03-10']).toBeLessThanOrEqual(DAILY_TOTAL_CAP)
    expect(p.xp).toBeLessThanOrEqual(DAILY_TOTAL_CAP)
  })

  it('awards a once-key only once, but separately per key', () => {
    let p = emptyProgress()
    const first = applyXp(p, 'setup.rule', { date: '2026-03-10', once: 'r1' })
    expect(first.gained).toBe(XP['setup.rule'])
    const again = applyXp(first.progress, 'setup.rule', { date: '2026-03-10', once: 'r1' })
    expect(again.gained).toBe(0)
    const other = applyXp(again.progress, 'setup.rule', { date: '2026-03-10', once: 'r2' })
    expect(other.gained).toBe(XP['setup.rule'])
    expect(other.progress.xp).toBe(XP['setup.rule'] * 2)
  })

  it('prunes ledger rows older than 30 days but keeps once-markers', () => {
    const stale: Progress = {
      ...emptyProgress(),
      xpLog: { '2020-01-01': 50, '2020-01-01#tx.add': 50, 'once#setup.rule#old': 1 },
    }
    const r = applyXp(stale, 'tx.add', { date: '2026-03-10' })
    expect(r.progress.xpLog['2020-01-01']).toBeUndefined()
    expect(r.progress.xpLog['2020-01-01#tx.add']).toBeUndefined()
    expect(r.progress.xpLog['once#setup.rule#old']).toBe(1)
    expect(r.progress.xpLog['2026-03-10']).toBe(XP['tx.add'])
  })
})

/* ------------------------------------------------------------ streaks --- */
describe('streaks', () => {
  it('counts three consecutive days', () => {
    let s = emptyStreak()
    s = markDay(s, '2026-03-08')
    s = markDay(s, '2026-03-09')
    s = markDay(s, '2026-03-10')
    expect(s.current).toBe(3)
    expect(streakValue(s, '2026-03-10')).toBe(3)
  })

  it('is idempotent within a day', () => {
    let s = markDay(emptyStreak(), '2026-03-10')
    const again = markDay(s, '2026-03-10')
    expect(again).toBe(s)
    s = markDay(s, '2026-03-10')
    expect(s.current).toBe(1)
  })

  it('earns a grace token on day seven and spends it on a one-day gap', () => {
    let s = emptyStreak()
    for (let i = 1; i <= 7; i++) s = markDay(s, `2026-03-0${i}`)
    expect(s.current).toBe(7)
    expect(s.freezes).toBe(1)
    // Two-day gap: without a token the chain would break.
    const jumped = markDay(s, '2026-03-09')
    expect(jumped.current).toBe(8)
    expect(jumped.freezes).toBe(0)
  })

  it('restarts after a real break but keeps the record', () => {
    let s = emptyStreak()
    for (let i = 1; i <= 4; i++) s = markDay(s, `2026-03-0${i}`)
    const restarted = markDay(s, '2026-03-20')
    expect(restarted.current).toBe(1)
    expect(restarted.longest).toBe(4)
  })

  it('reports zero once the chain is stale', () => {
    const s = markDay(emptyStreak(), '2026-03-01')
    expect(streakIsAlive(s, '2026-03-02')).toBe(true)
    expect(streakValue(s, '2026-03-20')).toBe(0)
    expect(s.longest).toBe(1)
  })
})

/* ------------------------------------------------------------- badges --- */
describe('badges', () => {
  it('unlocks the foundations from the data', () => {
    const ctx = emptyCtx({
      accounts: [{ id: 'a', name: 'A', type: 'checking', balance: 0, currency: 'USD', color: '#000' }],
      transactions: [tx({})],
    })
    const { badges } = evaluateBadges(ctx, '2026-03-10')
    expect(badges['first.account']).toMatchObject({ tier: 1 })
    expect(badges['first.tx']).toMatchObject({ tier: 1 })
    expect(badges['first.goal']).toBeUndefined()
  })

  it('reaches tier 2 at 300 categorised transactions', () => {
    const ctx = emptyCtx({ progress: { ...emptyProgress(), stats: { categorised: 300 } } })
    const { badges } = evaluateBadges(ctx, '2026-03-10')
    expect(badges['categorised']).toMatchObject({ tier: 2 })
  })

  it('never re-awards a badge it has already granted', () => {
    const ctx = emptyCtx({ transactions: [tx({})] })
    const first = evaluateBadges(ctx, '2026-03-10')
    expect(first.unlocked.length).toBeGreaterThan(0)
    const second = evaluateBadges(ctx, '2026-03-11', first.badges)
    expect(second.unlocked).toEqual([])
    expect(second.badges['first.tx'].at).toBe('2026-03-10')
  })

  it('has unique ids with ascending tiers', () => {
    const ids = BADGES.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const b of BADGES) {
      expect(b.tiers.length).toBeGreaterThan(0)
      expect([...b.tiers].sort((a, c) => a - c)).toEqual(b.tiers)
      expect(b.tiers.every((t) => t > 0)).toBe(true)
    }
  })

  it('returns a finite number from every rule on empty data', () => {
    const ctx = emptyCtx()
    for (const b of BADGES) expect(Number.isFinite(b.value(ctx))).toBe(true)
  })
})

/* ------------------------------------------------------------- quests --- */
describe('quests', () => {
  const ctx = emptyCtx({
    transactions: [
      tx({ id: 't1', date: '2026-03-08' }),
      tx({ id: 't2', date: '2026-03-09', categoryId: null }),
      tx({ id: 't3', date: '2026-03-10', categoryId: null }),
    ],
    holdings: [{ id: 'h1', symbol: 'X', name: 'X', assetClass: 'etf', quantity: 1, avgCost: 1, price: 1, currency: 'USD', updatedAt: '2026-03-10', color: '#000' }],
  })

  it('generates the same board for the same day', () => {
    const a = generateQuests(ctx, '2026-03-10').map((q) => q.id)
    const b = generateQuests(ctx, '2026-03-10').map((q) => q.id)
    expect(a).toEqual(b)
    expect(a.length).toBe(4)
    expect(a.filter((id) => id.startsWith('daily-')).length).toBe(3)
    expect(a.filter((id) => id.startsWith('weekly-')).length).toBe(1)
  })

  it('gives every quest a target, a reward and an expiry', () => {
    for (const q of generateQuests(ctx, '2026-03-10')) {
      expect(q.target).toBeGreaterThanOrEqual(1)
      expect(q.reward).toBeGreaterThan(0)
      expect(q.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(q.state).toBe('open')
      expect(q.done).toBe(0)
    }
  })

  it('drops expired quests on refresh', () => {
    const stale: Quest = {
      id: 'daily-old-2026-03-01',
      kind: 'daily',
      key: 'log',
      text: 'Old',
      target: 1,
      done: 0,
      reward: 30,
      created: '2026-03-01',
      expires: '2026-03-01',
      state: 'open',
      track: 'tx.add',
    }
    const next = refreshQuests({ ...emptyProgress(), quests: [stale] }, ctx, '2026-03-10')
    expect(next.quests.some((q) => q.id === stale.id)).toBe(false)
    expect(next.quests.length).toBeGreaterThan(0)
    expect(next.questsGeneratedOn).toBe('2026-03-10')
  })
})

/* -------------------------------------------------------------- coach --- */
describe('coach', () => {
  it('says nothing on empty data', () => {
    expect(coachNudges(emptyCtx(), conv, '2026-03-10')).toEqual([])
    expect(pickNudge(emptyCtx(), conv, { now: '2026-03-10' }).nudge).toBeNull()
  })

  it('puts uncategorised transactions first', () => {
    const ctx = emptyCtx({ transactions: [tx({ categoryId: null }), tx({ id: 't2', categoryId: 'c_groceries' })] })
    const nudges = coachNudges(ctx, conv, '2026-03-10')
    expect(nudges[0].key).toBe('uncategorised')
  })

  it('suppresses everything during quiet hours', () => {
    const ctx = emptyCtx({ transactions: [tx({ categoryId: null })] })
    expect(inQuietHours(22, [21, 8])).toBe(true)
    expect(inQuietHours(7, [21, 8])).toBe(true)
    expect(inQuietHours(12, [21, 8])).toBe(false)
    const picked = pickNudge(ctx, conv, { now: '2026-03-10', hour: 23 })
    expect(picked.quiet).toBe(true)
  })

  it('moves to the next candidate when one is dismissed', () => {
    const ctx = emptyCtx({ transactions: [tx({ categoryId: null })] })
    const before = pickNudge(ctx, conv, { now: '2026-03-10', hour: 12 })
    expect(before.nudge?.key).toBe('uncategorised')
    const after = pickNudge(ctx, conv, { now: '2026-03-10', hour: 12, dismissed: ['uncategorised'] })
    expect(after.nudge?.key).not.toBe('uncategorised')
  })
})

/* ------------------------------------------------------------ seeding --- */
describe('seeding', () => {
  const { version: _version, ...demo } = demoData()
  const seeded = seedProgressFromHistory(demo, '2026-03-10')

  it('earns XP from existing history, without breaching a daily cap', () => {
    expect(seeded.xp).toBeGreaterThan(0)
    for (const [key, value] of Object.entries(seeded.xpLog)) {
      if (!key.includes('#')) expect(value).toBeLessThanOrEqual(DAILY_TOTAL_CAP)
    }
    expect(Object.keys(seeded.stats).length).toBeGreaterThan(0)
  })

  it('records a streak and personal bests', () => {
    expect(seeded.streak.longest).toBeGreaterThan(0)
    expect(Object.keys(seeded.personalBests).length).toBeGreaterThan(0)
    expect(seeded.streak.longest).toBeGreaterThanOrEqual(seeded.streak.current)
  })
})

/* --------------------------------------------------------------- help --- */
describe('help', () => {
  it('has unique ids, complete entries and a resolvable index', () => {
    const ids = HELP.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const h of HELP) {
      expect(h.what.length).toBeGreaterThan(20)
      expect(h.how.length).toBeGreaterThan(20)
      expect(h.why.length).toBeGreaterThan(20)
      for (const ref of h.seeAlso ?? []) expect(helpById.has(ref)).toBe(true)
    }
    for (const g of HELP_GROUPS) for (const id of g.ids) expect(helpById.has(id)).toBe(true)
    expect(HELP_GROUPS.reduce((n, g) => n + g.ids.length, 0)).toBe(ids.length)
  })
})

/* ---------------------------------------------------------- week keys --- */
describe('weekKey', () => {
  it('is stable inside a week and differs across the boundary', () => {
    expect(weekKey('2026-03-09')).toMatch(/^\d{4}-W\d{2}$/)
    expect(weekKey('2026-03-09')).toBe(weekKey('2026-03-12'))
    expect(weekKey('2026-03-12')).toBe(weekKey('2026-03-15'))
    expect(weekKey('2026-03-15')).not.toBe(weekKey('2026-03-16'))
  })
})
