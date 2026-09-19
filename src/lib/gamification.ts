// Progression engine: XP, levels, streaks, quests and seasons.
// Pure — no React, no store. Everything here is deterministic for a given
// (context, date) pair so it can be replayed over history when seeding.
import type { AppData, Progress, Quest, SeasonRecord, StreakState, XpEvent } from './types'
import { BADGES } from './badges'
import { addDays, clamp, daysBetween, monthKey, pad, round2, sum, toISODate, today } from './utils'

/** The progression engine reads the whole data set; `version` is irrelevant to it. */
export type GameCtx = Omit<AppData, 'version'>

/* ------------------------------------------------------------------ XP ---- */

export const XP: Record<XpEvent, number> = {
  'tx.add': 10,
  'tx.transfer': 5,
  'tx.categorise': 6,
  'tx.split': 8,
  'tx.receipt': 6,
  'tx.import': 20,
  'health.fix': 8,
  'account.reconcile': 40,
  'bill.post': 10,
  'debt.pay': 12,
  'goal.contribute': 15,
  'holding.price': 6,
  'setup.budget': 15,
  'setup.rule': 15,
  'setup.recurring': 15,
  checkin: 25,
  review: 120,
  quest: 1,
}

/** Per-event ceiling within one day, in XP. Missing entry = uncapped per event. */
export const DAILY_EVENT_CAP: Partial<Record<XpEvent, number>> = {
  'tx.add': 60,
  'tx.transfer': 20,
  'tx.categorise': 60,
  'tx.split': 24,
  'tx.receipt': 18,
  'health.fix': 40,
  'bill.post': 30,
  'debt.pay': 36,
  'goal.contribute': 45,
  'holding.price': 24,
  checkin: 25,
  review: 120,
}

/** Per-event ceiling over a trailing 7-day window, in XP. */
export const WEEKLY_EVENT_CAP: Partial<Record<XpEvent, number>> = {
  'tx.import': 40,
  'account.reconcile': 120,
}

/** Hard ceiling on total XP awarded in a single day. */
export const DAILY_TOTAL_CAP = 200

/** Events that keep the daily activity streak alive (setup one-shots do not). */
export const ACTIVITY: XpEvent[] = [
  'tx.add',
  'tx.transfer',
  'tx.categorise',
  'tx.split',
  'tx.receipt',
  'tx.import',
  'health.fix',
  'account.reconcile',
  'bill.post',
  'debt.pay',
  'goal.contribute',
  'holding.price',
  'checkin',
  'review',
]

/** Events that can only be awarded once per object (a budget, a rule, a bill). */
export const SETUP_EVENTS: XpEvent[] = ['setup.budget', 'setup.rule', 'setup.recurring']

/* --------------------------------------------------------------- levels --- */

export const MAX_LEVEL = 99

/** XP needed to clear `level` — a gentle power curve so early levels come fast. */
export const xpForLevel = (level: number) => Math.round(60 * Math.pow(Math.max(1, level), 1.45))

/** Total XP required to *reach* `level` (sum of every level below it). */
export function xpToReach(level: number): number {
  let total = 0
  for (let l = 1; l < level; l++) total += xpForLevel(l)
  return total
}

export function levelFromXp(xp: number): number {
  let level = 1
  while (level < MAX_LEVEL && xp >= xpToReach(level + 1)) level++
  return level
}

export function levelProgress(xp: number): { level: number; into: number; need: number; pct: number; toNext: number } {
  const level = levelFromXp(xp)
  const into = Math.max(0, xp - xpToReach(level))
  const need = xpForLevel(level)
  return { level, into, need, pct: need > 0 ? clamp((into / need) * 100, 0, 100) : 0, toNext: Math.max(0, need - into) }
}

/* --------------------------------------------------------------- titles --- */

export const TITLES: [number, string][] = [
  [1, 'Newcomer'],
  [3, 'Tracker'],
  [6, 'Bookkeeper'],
  [10, 'Analyst'],
  [15, 'Controller'],
  [20, 'Treasurer'],
  [30, 'CFO'],
  [40, 'Chief of Coin'],
]

export const ALL_TITLES = TITLES.map(([level, name]) => ({ level, name }))

export function titleForLevel(level: number): string {
  let name = TITLES[0]![1]
  for (const [at, title] of TITLES) if (level >= at) name = title
  return name
}

/** Is the title granted at level `at` already unlocked for `level`? */
export const titleUnlocked = (level: number, at: number) => level >= at

/* -------------------------------------------------------------- streaks --- */

export const emptyStreak = (): StreakState => ({ current: 0, longest: 0, lastDay: null, freezes: 0 })

/**
 * A streak survives a one-day gap outright, or a two-day gap when a grace
 * token is banked. Nothing is ever taken away — a broken streak reports the
 * record instead of scolding.
 */
export function streakIsAlive(s: StreakState, date = today()): boolean {
  if (!s.lastDay) return false
  const gap = daysBetween(s.lastDay, date)
  if (gap <= 1) return true
  return gap === 2 && s.freezes > 0
}

export const streakValue = (s: StreakState, date = today()) => (streakIsAlive(s, date) ? s.current : 0)

function withFreeze(s: StreakState): StreakState {
  return s.current > 0 && s.current % 7 === 0 && s.freezes < 2 ? { ...s, freezes: s.freezes + 1 } : s
}

/** Record activity on `date`. Idempotent within a day; `longest` never decreases. */
export function markDay(s: StreakState, date = today()): StreakState {
  const gap = s.lastDay ? daysBetween(s.lastDay, date) : Number.POSITIVE_INFINITY
  if (gap === 0) return s
  let next: StreakState
  if (gap === 1) next = { ...s, current: s.current + 1, lastDay: date }
  else if (gap === 2 && s.freezes > 0) next = { ...s, current: s.current + 1, freezes: s.freezes - 1, lastDay: date }
  else next = { ...s, current: 1, lastDay: date }
  next = withFreeze(next)
  return { ...next, longest: Math.max(s.longest, next.current) }
}

/** Weekly cadence (the review streak): a gap of up to 10 days keeps the chain. */
export function markWeek(s: StreakState, date = today()): StreakState {
  const gap = s.lastDay ? daysBetween(s.lastDay, date) : Number.POSITIVE_INFINITY
  if (gap === 0) return s
  const next = gap > 0 && gap <= 10 ? { ...s, current: s.current + 1, lastDay: date } : { ...s, current: 1, lastDay: date }
  return { ...next, longest: Math.max(s.longest, next.current) }
}

/* ------------------------------------------------------------ XP ledger --- */

/** Drop ledger rows older than 30 days; one-shot markers are kept forever. */
function pruneLedger(log: Record<string, number>, date: string): Record<string, number> {
  const cutoff = addDays(date, -30)
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(log)) {
    if (k.startsWith('once#')) {
      out[k] = v
      continue
    }
    if (k.slice(0, 10) >= cutoff) out[k] = v
  }
  return out
}

export interface ApplyXpResult {
  progress: Progress
  gained: number
  capped: boolean
}

/**
 * Award XP for one event, honouring the caps in order:
 * one-shot key → daily per-event cap → weekly per-event cap → daily total cap.
 * Always returns a new `Progress`; the ledger is pruned as it is written.
 */
export function applyXp(progress: Progress, event: XpEvent, opts: { date?: string; count?: number; once?: string } = {}): ApplyXpResult {
  const date = opts.date ?? today()
  const unit = XP[event] ?? 0
  const xpLog = { ...progress.xpLog }
  const onceKey = opts.once ? `once#${event}#${opts.once}` : null

  if (onceKey && xpLog[onceKey]) return { progress, gained: 0, capped: true }

  let n = Math.max(0, Math.floor(opts.count ?? 1))
  let capped = false
  const eventKey = `${date}#${event}`

  const dailyCap = DAILY_EVENT_CAP[event]
  if (dailyCap !== undefined && n > 0) {
    const room = Math.max(0, dailyCap - (xpLog[eventKey] ?? 0))
    const allowed = Math.floor(room / Math.max(1, unit))
    if (allowed < n) {
      n = allowed
      capped = true
    }
  }

  const weeklyCap = WEEKLY_EVENT_CAP[event]
  if (weeklyCap !== undefined && n > 0) {
    let used = 0
    for (let i = 0; i < 7; i++) used += xpLog[`${addDays(date, -i)}#${event}`] ?? 0
    const room = Math.max(0, weeklyCap - used)
    const allowed = Math.floor(room / Math.max(1, unit))
    if (allowed < n) {
      n = allowed
      capped = true
    }
  }

  const dayTotal = xpLog[date] ?? 0
  if (n > 0) {
    const room = Math.max(0, DAILY_TOTAL_CAP - dayTotal)
    const allowed = Math.floor(room / Math.max(1, unit))
    if (allowed < n) {
      n = allowed
      capped = true
    }
  }

  const gained = unit * n
  if (onceKey) xpLog[onceKey] = 1
  if (gained > 0) {
    xpLog[date] = dayTotal + gained
    xpLog[eventKey] = (xpLog[eventKey] ?? 0) + gained
  }
  return { progress: { ...progress, xp: progress.xp + gained, xpLog: pruneLedger(xpLog, date) }, gained, capped }
}

/* --------------------------------------------------------------- badges --- */

export interface BadgeUnlock {
  id: string
  name: string
  tier: number
}

/**
 * Evaluate every badge rule against the data. Tier promotions are recorded,
 * existing awards are never duplicated, and a rule that throws (or returns
 * something non-finite on odd data) is skipped rather than crashing the app.
 */
export function evaluateBadges(
  ctx: GameCtx,
  date = today(),
  prev: Record<string, { at: string; tier: number }> = {},
): { badges: Record<string, { at: string; tier: number }>; unlocked: BadgeUnlock[] } {
  const badges = { ...prev }
  const unlocked: BadgeUnlock[] = []
  for (const def of BADGES) {
    let value = 0
    try {
      value = def.value(ctx)
    } catch {
      continue
    }
    if (!Number.isFinite(value)) continue
    let tier = 0
    def.tiers.forEach((threshold, i) => {
      if (value >= threshold) tier = i + 1
    })
    if (tier === 0) continue
    const had = badges[def.id]
    if (!had) {
      badges[def.id] = { at: date, tier }
      unlocked.push({ id: def.id, name: def.name, tier })
    } else if (tier > had.tier) {
      badges[def.id] = { at: had.at, tier }
      unlocked.push({ id: def.id, name: def.name, tier })
    }
  }
  return { badges, unlocked }
}

/* --------------------------------------------------------------- quests --- */

/** Deterministic FNV-1a — the same date always produces the same quest board. */
export const hashSeed = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickSeeded<T>(items: T[], seed: number, n: number): T[] {
  const pool = items.slice()
  const out: T[] = []
  let h = seed
  while (out.length < n && pool.length) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    out.push(pool.splice(h % pool.length, 1)[0])
  }
  return out
}

/** ISO week key, Monday-based: 2026-W08. */
export function weekKey(date = today()): string {
  const d = new Date(`${date}T00:00:00`)
  const mondayOffset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - mondayOffset + 3) // Thursday decides the ISO year
  const firstThursday = new Date(d.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000))
  return `${d.getFullYear()}-W${pad(week)}`
}

/** Last day (Sunday) of the ISO week containing `date`. */
export function endOfWeek(date = today()): string {
  const d = new Date(`${date}T00:00:00`)
  const mondayOffset = (d.getDay() + 6) % 7
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + (6 - mondayOffset)))
}

/* ---- data probes used by quest targets, seasons and the coach ---- */

const baseOf = (ctx: GameCtx, amount: number, accountId: string) => {
  const currency = ctx.accounts.find((a) => a.id === accountId)?.currency ?? ctx.settings.currency
  if (!currency || currency === ctx.settings.currency) return amount
  const rate = ctx.settings.rates[currency]
  return rate && rate > 0 ? amount / rate : amount
}

const expensesIn = (ctx: GameCtx, from: string, to: string) =>
  ctx.transactions.filter((t) => t.type === 'expense' && t.date >= from && t.date <= to && !t.refundOf)

/** Average daily discretionary-ish spend over the trailing window. */
export const avgDailySpend = (ctx: GameCtx, days = 30, date = today()) => {
  const rows = expensesIn(ctx, addDays(date, -days), date)
  const total = rows.reduce((s, t) => s + baseOf(ctx, t.amount, t.accountId), 0)
  return total / Math.max(1, days)
}

export const uncategorisedCount = (ctx: GameCtx) => ctx.transactions.filter((t) => t.type !== 'transfer' && !t.categoryId).length

export const dueWithin = (ctx: GameCtx, days: number, date = today()) =>
  ctx.recurring.filter((r) => r.active && r.type === 'expense' && r.nextDate >= date && r.nextDate <= addDays(date, days))

interface QuestTemplate {
  key: string
  kind: 'daily' | 'weekly'
  text: string
  reward: number
  track: Quest['track']
  target: (ctx: GameCtx, date: string) => number
}

const DAILY_TEMPLATES: QuestTemplate[] = [
  { key: 'log', kind: 'daily', text: 'Log your spending', reward: 30, track: 'tx.add', target: (ctx, date) => (expensesIn(ctx, addDays(date, -30), date).length ? Math.round(clamp(avgDailySpend(ctx, 30, date) > 0 ? clamp(ctx.transactions.filter((t) => t.date >= addDays(date, -30) && t.date <= date && t.type === 'expense').length / 30, 1, 5) : 0, 1, 5)) : 0) },
  { key: 'categorise', kind: 'daily', text: 'Categorise uncategorised transactions', reward: 30, track: 'tx.categorise', target: (ctx) => (uncategorisedCount(ctx) ? Math.round(clamp(uncategorisedCount(ctx), 3, 12)) : 0) },
  { key: 'receipt', kind: 'daily', text: 'Attach a receipt to a transaction', reward: 30, track: 'tx.receipt', target: () => 1 },
  { key: 'split', kind: 'daily', text: 'Split a transaction across categories', reward: 30, track: 'tx.split', target: () => 1 },
  { key: 'bill', kind: 'daily', text: 'Post a bill that is due this week', reward: 30, track: 'bill.post', target: (ctx, date) => (dueWithin(ctx, 7, date).length ? Math.round(clamp(dueWithin(ctx, 7, date).length, 1, 2)) : 0) },
  { key: 'goal', kind: 'daily', text: 'Add money to a goal', reward: 30, track: 'goal.contribute', target: (ctx) => (ctx.goals.length ? 1 : 0) },
  { key: 'price', kind: 'daily', text: 'Update your holding prices', reward: 30, track: 'holding.price', target: (ctx) => (ctx.holdings.length ? Math.round(clamp(ctx.holdings.length, 1, 3)) : 0) },
  { key: 'health', kind: 'daily', text: 'Fix two data-health issues', reward: 30, track: 'health.fix', target: () => 2 },
  { key: 'stayUnder', kind: 'daily', text: 'Spend no more than your daily average', reward: 40, track: 'state', target: () => 1 },
]

const WEEKLY_TEMPLATES: QuestTemplate[] = [
  { key: 'review', kind: 'weekly', text: 'Complete the weekly review', reward: 150, track: 'review', target: () => 1 },
  { key: 'logDays', kind: 'weekly', text: 'Log something on five different days', reward: 150, track: 'state', target: () => 5 },
  { key: 'zeroUncat', kind: 'weekly', text: 'Reach zero uncategorised transactions', reward: 150, track: 'state', target: () => 1 },
  { key: 'budgets', kind: 'weekly', text: 'Keep every budget under its limit', reward: 150, track: 'state', target: (ctx) => (ctx.budgets.length ? 1 : 0) },
  { key: 'debt', kind: 'weekly', text: 'Make a debt payment', reward: 150, track: 'debt.pay', target: (ctx) => (ctx.debts.length ? 1 : 0) },
]

function buildQuest(t: QuestTemplate, ctx: GameCtx, date: string): Quest {
  const weekly = t.kind === 'weekly'
  return {
    id: weekly ? `weekly-${t.key}-${weekKey(date)}` : `daily-${t.key}-${date}`,
    kind: t.kind,
    key: t.key,
    text: t.text,
    target: Math.max(1, Math.round(t.target(ctx, date))),
    done: 0,
    reward: t.reward,
    created: date,
    expires: weekly ? endOfWeek(date) : date,
    state: 'open',
    track: t.track,
  }
}

/** Three daily quests and one weekly mission, chosen from the user's own data. */
export function generateQuests(ctx: GameCtx, date = today()): Quest[] {
  const daily = pickSeeded(
    DAILY_TEMPLATES.filter((t) => {
      try {
        return t.target(ctx, date) > 0
      } catch {
        return false
      }
    }),
    hashSeed(`daily:${date}`),
    3,
  )
  const weekly = pickSeeded(
    WEEKLY_TEMPLATES.filter((t) => {
      try {
        return t.target(ctx, date) > 0
      } catch {
        return false
      }
    }),
    hashSeed(`weekly:${weekKey(date)}`),
    1,
  )
  return [...daily, ...weekly].map((t) => buildQuest(t, ctx, date))
}

/* ---- live progress for the state-based quests ---- */

export const loggingDaysThisWeek = (ctx: GameCtx, date = today()) => {
  const from = addDays(endOfWeek(date), -6)
  return new Set(ctx.transactions.filter((t) => t.date >= from && t.date <= date).map((t) => t.date)).size
}

export const spentToday = (ctx: GameCtx, date = today()) =>
  expensesIn(ctx, date, date).reduce((s, t) => s + baseOf(ctx, t.amount, t.accountId), 0)

export const budgetsUnderLimit = (ctx: GameCtx, date = today()) => {
  const month = monthKey(date)
  return ctx.budgets.every((b) => {
    const spent = ctx.transactions
      .filter((t) => t.type === 'expense' && monthKey(t.date) === month)
      .reduce((s, t) => {
        const parts = t.splits?.length ? t.splits.filter((x) => x.categoryId === b.categoryId).map((x) => x.amount) : t.categoryId === b.categoryId ? [t.amount] : []
        return s + parts.reduce((a, c) => a + baseOf(ctx, c, t.accountId), 0)
      }, 0)
    return spent <= b.limit + (b.rollover ? (b.rolloverAmount ?? 0) : 0)
  })
}

/** Event quests report their counter; state quests are recomputed from the data. */
export function questProgress(q: Quest, ctx: GameCtx, date = today()): number {
  if (q.track !== 'state') return q.done
  switch (q.key) {
    case 'stayUnder': {
      const avg = avgDailySpend(ctx, 30, date)
      const spent = spentToday(ctx, date)
      return avg > 0 && spent <= avg ? 1 : 0
    }
    case 'logDays':
      return loggingDaysThisWeek(ctx, date)
    case 'zeroUncat':
      return uncategorisedCount(ctx) === 0 ? 1 : 0
    case 'budgets':
      return ctx.budgets.length > 0 && budgetsUnderLimit(ctx, date) ? 1 : 0
    default:
      return q.done
  }
}

/** Drop expired quests, mark completions, and generate today's/this week's board. */
export function refreshQuests(progress: Progress, ctx: GameCtx, date = today()): Progress {
  const kept = progress.quests.filter((q) => q.expires >= date && q.state !== 'expired')
  const stamped = kept.map((q) => {
    const done = questProgress(q, ctx, date)
    return { ...q, done, state: (done >= q.target ? 'done' : 'open') as Quest['state'] }
  })
  const have = new Set(stamped.map((q) => q.id))
  const fresh = generateQuests(ctx, date).filter((q) => !have.has(q.id))
  const dailyCount = stamped.filter((q) => q.kind === 'daily').length
  const weeklyCount = stamped.filter((q) => q.kind === 'weekly').length
  const topUp = fresh.filter((q) => (q.kind === 'daily' ? dailyCount < 3 : weeklyCount < 1))
  return { ...progress, quests: [...stamped, ...topUp], questsGeneratedOn: date }
}

/* -------------------------------------------------------------- seasons --- */

export interface SeasonMetrics {
  loggingDays: number
  categorisedPct: number
  reviews: number
  savingsRate: number
}

export function seasonMetrics(ctx: GameCtx, month = monthKey(today())): SeasonMetrics {
  const rows = ctx.transactions.filter((t) => monthKey(t.date) === month)
  const loggingDays = new Set(rows.map((t) => t.date)).size
  const categorisable = rows.filter((t) => t.type !== 'transfer')
  const categorisedPct = categorisable.length ? (categorisable.filter((t) => t.categoryId).length / categorisable.length) * 100 : 0
  const reviews = (ctx.progress?.reviews ?? []).filter((r) => r.startsWith(`${month.slice(0, 4)}-W`)).length
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + baseOf(ctx, t.amount, t.accountId), 0)
  const expense = rows.filter((t) => t.type === 'expense' && !t.refundOf).reduce((s, t) => s + baseOf(ctx, t.amount, t.accountId), 0)
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0
  return { loggingDays, categorisedPct: round2(categorisedPct), reviews, savingsRate: round2(savingsRate) }
}

/** Highest value ever recorded for each tracked metric (records only ever go up). */
export function personalBests(ctx: GameCtx, date = today()): Record<string, number> {
  const p = ctx.progress ?? emptyProgress()
  const metrics = seasonMetrics(ctx, monthKey(date))
  const candidates: Record<string, number> = {
    streak: p.streak.longest,
    reviewStreak: p.reviewStreak.longest,
    loggingDays: metrics.loggingDays,
    savingsRate: metrics.savingsRate,
  }
  const out: Record<string, number> = { ...p.personalBests }
  for (const [k, v] of Object.entries(candidates)) {
    if (!Number.isFinite(v)) continue
    out[k] = Math.max(out[k] ?? 0, v)
  }
  return out
}

/* --------------------------------------------------------------- seeding --- */

export const emptyProgress = (): Progress => ({
  xp: 0,
  xpLog: {},
  streak: emptyStreak(),
  reviewStreak: emptyStreak(),
  badges: {},
  quests: [],
  questsGeneratedOn: null,
  seasons: [],
  coach: { lastShownAt: null, lastKey: null, dismissed: [] },
  stats: {},
  checkIns: [],
  reviews: [],
  personalBests: {},
})

/** Stats that can be derived from the data itself rather than counted live. */
export function derivedStats(ctx: GameCtx): Record<string, number> {
  const txs = ctx.transactions
  return {
    categorised: txs.filter((t) => t.type !== 'transfer' && t.categoryId).length,
    splits: txs.filter((t) => t.splits?.length).length,
    receipts: txs.filter((t) => t.attachmentId).length,
    reconciled: txs.filter((t) => t.status === 'reconciled').length,
    crossCurrency: txs.filter((t) => t.type === 'transfer' && t.toAmount && t.rateUsed).length,
    refunds: txs.filter((t) => t.refundOf).length,
    owed: txs.filter((t) => t.owedBy).length,
  }
}

/**
 * Back-compute a plausible history for an existing installation so nobody
 * starts at zero: replay the last 30 days of transactions through the same
 * capped XP rules, award the one-shot setup events, then record personal bests.
 */
export function seedProgressFromHistory(ctx: GameCtx, date = today()): Progress {
  let p = emptyProgress()
  const from = addDays(date, -30)
  const rows = ctx.transactions.filter((t) => t.date >= from && t.date <= date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let lastActiveDay: string | null = null
  for (const t of rows) {
    const event: XpEvent = t.type === 'transfer' ? 'tx.transfer' : 'tx.add'
    p = applyXp(p, event, { date: t.date, once: t.id }).progress
    if (t.categoryId) p = applyXp(p, 'tx.categorise', { date: t.date, once: `${t.id}:cat` }).progress
    if (t.splits?.length) p = applyXp(p, 'tx.split', { date: t.date, once: `${t.id}:split` }).progress
    if (t.attachmentId) p = applyXp(p, 'tx.receipt', { date: t.date, once: `${t.id}:receipt` }).progress
    if (t.status === 'reconciled') p = applyXp(p, 'account.reconcile', { date: t.date, once: `${t.id}:rec` }).progress
    if (ACTIVITY.includes(event) && t.date !== lastActiveDay) {
      p = { ...p, streak: markDay(p.streak, t.date) }
      lastActiveDay = t.date
    }
  }

  for (const b of ctx.budgets) p = applyXp(p, 'setup.budget', { date, once: b.id }).progress
  for (const r of ctx.rules) p = applyXp(p, 'setup.rule', { date, once: r.id }).progress
  for (const r of ctx.recurring) p = applyXp(p, 'setup.recurring', { date, once: r.id }).progress

  p = { ...p, stats: { ...derivedStats(ctx), ...p.stats } }
  const withProgress: GameCtx = { ...ctx, progress: p }
  p = { ...p, personalBests: personalBests(withProgress, date) }
  return p
}

/** Total XP awarded on one day (for the 14-day history chart). */
export const xpOnDay = (progress: Progress, date: string) => progress.xpLog[date] ?? 0

/** The last `n` days as `{date, xp}` pairs, oldest first. */
export function xpSeries(progress: Progress, n = 14, date = today()): { date: string; xp: number }[] {
  const out: { date: string; xp: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(date, -i)
    out.push({ date: d, xp: xpOnDay(progress, d) })
  }
  return out
}

/** Which of the user's own months holds the record for each season metric. */
export function seasonRecords(progress: Progress, ctx: GameCtx, months: string[]): SeasonRecord[] {
  const metricsFor = months.map((m) => ({ month: m, ...seasonMetrics(ctx, m) }))
  const bestFor = (key: keyof SeasonMetrics) =>
    metricsFor.reduce((best, row) => (row[key] > (best?.[key] ?? -Infinity) ? row : best), metricsFor[0])
  return metricsFor.map((row) => {
    const wins: string[] = []
    for (const key of ['loggingDays', 'categorisedPct', 'reviews', 'savingsRate'] as (keyof SeasonMetrics)[]) {
      const best = bestFor(key)
      if (best && best.month === row.month && row[key] > 0) wins.push(SEASON_LABELS[key])
    }
    const monthXp = Object.entries(progress.xpLog).reduce((total, [k, v]) => (k.slice(0, 7) === row.month && !k.includes('#') ? total + v : total), 0)
    return { month: row.month, xp: monthXp, metrics: { loggingDays: row.loggingDays, categorisedPct: row.categorisedPct, reviews: row.reviews, savingsRate: row.savingsRate }, best: wins.join(' · ') || undefined }
  })
}

export const SEASON_LABELS: Record<string, string> = {
  loggingDays: 'Most days logged',
  categorisedPct: 'Tidiest books',
  reviews: 'Most reviews',
  savingsRate: 'Best savings rate',
}

/** Sum of a set of numbers, exported for parity with the analytics helpers. */
export const total = (xs: number[]) => sum(xs)
