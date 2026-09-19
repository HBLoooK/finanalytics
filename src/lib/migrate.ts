// State migrations. Runs once per loaded state, on the client, before the store is used.
// Each step upgrades `version` in place. Keep them cheap and idempotent.
import { DATA_VERSION, defaultGamification, defaultSettings } from './seed'
import { derivedStats, emptyProgress, personalBests, seedProgressFromHistory } from './gamification'
import type { AppData, GamificationSettings, Progress, StreakState, Transaction } from './types'
import { today } from './utils'

type Any = Record<string, any>

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** v2 → v3: new optional fields, archived accounts, transfer destination amounts. */
function toV3(s: Any) {
  for (const a of s.accounts ?? []) {
    if (a.archived === undefined) a.archived = false
    if (a.includeInTotal === undefined) a.includeInTotal = true
  }
  for (const t of s.transactions ?? []) {
    if (t.status === undefined) t.status = 'cleared'
    if (t.toAmount === undefined) t.toAmount = null
    if (t.refundOf === undefined) t.refundOf = null
    if (t.owedBy === undefined) t.owedBy = null
    if (t.attachmentId === undefined) t.attachmentId = null
    if (t.importBatchId === undefined) t.importBatchId = null
    if (t.investment === undefined) t.investment = null
  }
  for (const r of s.recurring ?? []) {
    if (r.variable === undefined) r.variable = false
    if (r.autoMatch === undefined) r.autoMatch = true
  }
  for (const h of s.holdings ?? []) {
    if (!Array.isArray(h.lots) || h.lots.length === 0) {
      h.lots = h.quantity > 0 && h.avgCost > 0 ? [{ date: h.updatedAt ?? today(), qty: h.quantity, price: h.avgCost }] : []
    }
    if (h.dividends === undefined) h.dividends = 0
    if (h.targetPct === undefined) h.targetPct = null
  }
  for (const d of s.debts ?? []) {
    if (d.lastInterestAt === undefined) d.lastInterestAt = null
    if (d.accrueInterest === undefined) d.accrueInterest = d.apr > 0
    if (d.interestPaid === undefined) d.interestPaid = 0
  }
  for (const p of s.debtPayments ?? []) {
    if (p.kind === undefined) p.kind = 'payment'
  }
  for (const b of s.budgets ?? []) {
    if (b.period === undefined) b.period = 'monthly'
    if (b.rollover === undefined) b.rollover = false
    if (b.rolloverAmount === undefined) b.rolloverAmount = 0
  }
  for (const g of s.goals ?? []) {
    if (g.accountId === undefined) g.accountId = null
    if (g.monthlyContribution === undefined) g.monthlyContribution = 0
  }
  const st = (s.settings ??= { ...defaultSettings })
  if (st.ratesUpdatedAt === undefined) st.ratesUpdatedAt = null
  if (st.onboarded === undefined) st.onboarded = true // existing installs skip onboarding
  if (st.safeToSpend === undefined) st.safeToSpend = true
  if (st.hideArchived === undefined) st.hideArchived = true
  if (st.weekStart === undefined) st.weekStart = 1
  if (!Array.isArray(st.aliases)) st.aliases = []
  if (!Array.isArray(st.savedViews)) st.savedViews = []
  s.version = 3
}

/** v3 → v4: progression. Existing installs get their history back-computed. */
function toV4(s: Any) {
  const st = (s.settings ??= { ...defaultSettings })

  // Settings: progression defaults, never overwriting an explicit choice.
  if (!st.gamification || typeof st.gamification !== 'object') st.gamification = { ...defaultGamification }
  const g = st.gamification as GamificationSettings
  if (typeof g.enabled !== 'boolean') g.enabled = defaultGamification.enabled
  if (typeof g.celebrations !== 'boolean') g.celebrations = defaultGamification.celebrations
  if (typeof g.coach !== 'boolean') g.coach = defaultGamification.coach
  if (!Array.isArray(g.quietHours) || g.quietHours.length !== 2 || !g.quietHours.every((n) => isNum(n) && n >= 0 && n <= 23)) g.quietHours = [...defaultGamification.quietHours]
  if (g.pinnedTitle === undefined) g.pinnedTitle = null
  if (typeof g.showTips !== 'boolean') g.showTips = defaultGamification.showTips
  if (!Array.isArray(st.tourSeen)) st.tourSeen = []

  // Progress: normalise whatever is there, or seed it from history.
  const normalStreak = (x: Any): StreakState => ({
    current: isNum(x?.current) ? Math.max(0, Math.floor(x.current)) : 0,
    longest: isNum(x?.longest) ? Math.max(0, Math.floor(x.longest)) : 0,
    lastDay: typeof x?.lastDay === 'string' ? x.lastDay : null,
    freezes: isNum(x?.freezes) ? Math.min(2, Math.max(0, Math.floor(x.freezes))) : 0,
  })

  let p: Progress = s.progress && typeof s.progress === 'object' ? (s.progress as Progress) : emptyProgress()
  if (!isNum(p.xp) || p.xp < 0) p.xp = 0
  if (!p.xpLog || typeof p.xpLog !== 'object') p.xpLog = {}
  p.streak = normalStreak(p.streak)
  p.streak.longest = Math.max(p.streak.longest, p.streak.current)
  p.reviewStreak = normalStreak(p.reviewStreak)
  if (!p.badges || typeof p.badges !== 'object') p.badges = {}
  if (!Array.isArray(p.quests)) p.quests = []
  if (p.questsGeneratedOn !== null && typeof p.questsGeneratedOn !== 'string') p.questsGeneratedOn = null
  if (!Array.isArray(p.seasons)) p.seasons = []
  if (!p.coach || typeof p.coach !== 'object') p.coach = { lastShownAt: null, lastKey: null, dismissed: [] }
  if (!Array.isArray(p.coach.dismissed)) p.coach.dismissed = []
  if (!p.stats || typeof p.stats !== 'object') p.stats = {}
  if (!Array.isArray(p.checkIns)) p.checkIns = []
  if (!Array.isArray(p.reviews)) p.reviews = []
  if (!p.personalBests || typeof p.personalBests !== 'object') p.personalBests = {}

  const ctx = { ...s, progress: p, version: DATA_VERSION } as unknown as AppData
  const hasHistory = (s.transactions ?? []).length > 0 && Object.keys(p.xpLog).length === 0
  if (hasHistory) {
    const { version: _version, ...rest } = ctx
    p = seedProgressFromHistory(rest, today())
  } else {
    // Fill in the stats that can be derived, without touching awarded XP.
    p = { ...p, stats: { ...derivedStats(ctx), ...p.stats }, personalBests: personalBests(ctx, today()) }
  }

  s.progress = p
  s.version = 4
}

/** Repair pass: runs on every load, fixes things that should never be wrong. */
export function repair(state: AppData): AppData {
  const s = state as unknown as Any
  const version = Number(s.version ?? 0)
  if (version < 3) toV3(s)
  if (version < 4) toV4(s)
  s.version = DATA_VERSION

  const ids = new Set<string>((s.accounts ?? []).map((a: Any) => a.id))
  const catIds = new Set<string>((s.categories ?? []).map((c: Any) => c.id))

  // Transactions on unknown accounts, bad amounts, splits that do not add up
  const txs: Transaction[] = (s.transactions ?? []).filter((t: Any) => {
    if (!t || typeof t.id !== 'string') return false
    if (!isNum(t.amount) || t.amount <= 0) return false
    if (!ids.has(t.accountId)) return false
    if (t.toAccountId && !ids.has(t.toAccountId)) t.toAccountId = null
    if (t.categoryId && !catIds.has(t.categoryId)) t.categoryId = null
    return true
  })
  for (const t of txs as Any[]) {
    if (Array.isArray(t.splits)) {
      const total = t.splits.reduce((a: number, x: Any) => a + (Number(x.amount) || 0), 0)
      // Orphan splits (sum != amount) would skew every category report — drop them.
      if (Math.abs(total - t.amount) > 0.02) t.splits = undefined
    }
  }
  s.transactions = txs
  return state
}

export const dataVersion = DATA_VERSION
