// Badge catalogue. Every rule is a pure function of the data — no randomness,
// no timers — so the same books always produce the same shelf, and locked
// badges can tell you exactly what is left to do.
import type { GameCtx } from './gamification'
import { seasonMetrics, streakValue } from './gamification'
import { monthKey, today } from './utils'

export type BadgeFamily = 'Foundations' | 'Discipline' | 'Mastery' | 'Outcomes' | 'Insight' | 'Seasons'

export const BADGE_FAMILIES: BadgeFamily[] = ['Foundations', 'Discipline', 'Mastery', 'Outcomes', 'Insight', 'Seasons']

export const TIER_NAMES = ['', 'bronze', 'silver', 'gold']

export interface BadgeDef {
  id: string
  name: string
  icon: string
  family: BadgeFamily
  desc: string
  /** Ascending thresholds; reaching `tiers[i]` awards tier `i + 1`. */
  tiers: number[]
  value: (ctx: GameCtx) => number
  unit?: '%' | 'days' | 'tx' | ''
}

const stat = (ctx: GameCtx, key: string) => ctx.progress?.stats?.[key] ?? 0
const prog = (ctx: GameCtx) => ctx.progress
const categorisedPctNow = (ctx: GameCtx) => {
  const rows = ctx.transactions.filter((t) => t.type !== 'transfer')
  return rows.length ? (rows.filter((t) => t.categoryId).length / rows.length) * 100 : 0
}
const savingsRateNow = (ctx: GameCtx) => seasonMetrics(ctx, monthKey(today())).savingsRate

export const BADGES: BadgeDef[] = [
  /* ---------------------------------------------------- Foundations (9) ---- */
  { id: 'first.account', name: 'Opening balance', icon: '🏦', family: 'Foundations', desc: 'Add your first account', tiers: [1], value: (c) => c.accounts.length },
  { id: 'first.tx', name: 'First entry', icon: '✍️', family: 'Foundations', desc: 'Log your first transaction', tiers: [1], value: (c) => c.transactions.length },
  { id: 'first.budget', name: 'Setting limits', icon: '🎯', family: 'Foundations', desc: 'Create your first budget', tiers: [1], value: (c) => c.budgets.length },
  { id: 'first.rule', name: 'Automator', icon: '🤖', family: 'Foundations', desc: 'Enable a categorisation rule', tiers: [1], value: (c) => c.rules.filter((r) => r.enabled).length },
  { id: 'first.bill', name: 'On the calendar', icon: '📅', family: 'Foundations', desc: 'Track your first recurring bill', tiers: [1], value: (c) => c.recurring.length },
  { id: 'first.goal', name: 'Something to save for', icon: '🏝️', family: 'Foundations', desc: 'Create your first goal', tiers: [1], value: (c) => c.goals.length },
  { id: 'first.holding', name: 'Investor', icon: '📈', family: 'Foundations', desc: 'Add your first holding', tiers: [1], value: (c) => c.holdings.length },
  { id: 'first.import', name: 'Statement in', icon: '📥', family: 'Foundations', desc: 'Import a bank statement', tiers: [1], value: (c) => c.transactions.filter((t) => t.importBatchId).length },
  { id: 'first.lock', name: 'Locked down', icon: '🔒', family: 'Foundations', desc: 'Turn on the passcode lock', tiers: [1], value: (c) => ((c.settings.autoLockMinutes ?? 0) > 0 ? 1 : 0) },

  /* ---------------------------------------------------- Discipline (8) ----- */
  { id: 'streak', name: 'Keeping at it', icon: '🔥', family: 'Discipline', desc: 'Keep a daily logging streak alive', tiers: [3, 14, 60], unit: 'days', value: (c) => streakValue(prog(c)?.streak ?? { current: 0, longest: 0, lastDay: null, freezes: 0 }) },
  { id: 'streak.longest', name: 'Record run', icon: '🏃', family: 'Discipline', desc: 'Your longest ever daily streak', tiers: [7, 30, 100], unit: 'days', value: (c) => prog(c)?.streak.longest ?? 0 },
  { id: 'reviews', name: 'Weekly ritual', icon: '🗓️', family: 'Discipline', desc: 'Complete weekly reviews', tiers: [4, 12, 52], value: (c) => prog(c)?.reviews.length ?? 0 },
  { id: 'reviews.streak', name: 'Review streak', icon: '🔁', family: 'Discipline', desc: 'Consecutive weeks reviewed', tiers: [4, 12, 26], value: (c) => prog(c)?.reviewStreak.longest ?? 0 },
  { id: 'checkins', name: 'Checking in', icon: '✅', family: 'Discipline', desc: 'Complete the daily check-in', tiers: [5, 30, 100], value: (c) => prog(c)?.checkIns.length ?? 0 },
  { id: 'categorised', name: 'Tidy books', icon: '🗂️', family: 'Discipline', desc: 'Categorise transactions', tiers: [25, 250, 1000], unit: 'tx', value: (c) => stat(c, 'categorised') },
  { id: 'categorised.pct', name: 'Nothing loose', icon: '🧹', family: 'Discipline', desc: 'Share of transactions categorised', tiers: [90, 98, 100], unit: '%', value: categorisedPctNow },
  { id: 'reconciled', name: 'Reconciler', icon: '🧾', family: 'Discipline', desc: 'Mark transactions as reconciled', tiers: [1, 6, 24], unit: 'tx', value: (c) => stat(c, 'reconciled') },

  /* ------------------------------------------------------- Mastery (12) ---- */
  { id: 'splits', name: 'Splitting hairs', icon: '✂️', family: 'Mastery', desc: 'Split transactions across categories', tiers: [1, 10, 50], value: (c) => stat(c, 'splits') },
  { id: 'fx', name: 'Currency wrangler', icon: '💱', family: 'Mastery', desc: 'Record cross-currency transfers', tiers: [1, 5, 20], value: (c) => stat(c, 'crossCurrency') },
  { id: 'refunds', name: 'Money back', icon: '↩️', family: 'Mastery', desc: 'Link refunds to their purchase', tiers: [1, 5, 20], value: (c) => stat(c, 'refunds') },
  { id: 'owed', name: 'Debt collector', icon: '🤝', family: 'Mastery', desc: 'Track money owed to you', tiers: [1, 5, 20], value: (c) => stat(c, 'owed') },
  { id: 'receipts', name: 'Paper trail', icon: '🧷', family: 'Mastery', desc: 'Attach receipts', tiers: [1, 10, 50], value: (c) => stat(c, 'receipts') },
  { id: 'tax', name: 'Deduction hunter', icon: '🧮', family: 'Mastery', desc: 'Flag tax-deductible categories', tiers: [1, 3, 5], value: (c) => c.categories.filter((x) => x.taxDeductible).length },
  { id: 'views', name: 'Saved searches', icon: '🔖', family: 'Mastery', desc: 'Save transaction views', tiers: [1, 3, 10], value: (c) => c.settings.savedViews?.length ?? 0 },
  { id: 'aliases', name: 'Name normaliser', icon: '🏷️', family: 'Mastery', desc: 'Teach the app your merchant names', tiers: [1, 5, 15], value: (c) => c.settings.aliases?.length ?? 0 },
  { id: 'operators', name: 'Power searcher', icon: '🔎', family: 'Mastery', desc: 'Use search operators', tiers: [1, 10, 50], value: (c) => stat(c, 'searchOperators') },
  { id: 'drilldown', name: 'Deep diver', icon: '🕳️', family: 'Mastery', desc: 'Drill into category breakdowns', tiers: [1, 10, 50], value: (c) => stat(c, 'drilldowns') },
  { id: 'sql', name: 'Query wizard', icon: '🪄', family: 'Mastery', desc: 'Run queries in the SQL console', tiers: [1, 5, 20], value: (c) => stat(c, 'sqlQueries') },
  { id: 'ofx', name: 'Direct import', icon: '🗃️', family: 'Mastery', desc: 'Import OFX or QIF statements', tiers: [1, 3, 10], value: (c) => stat(c, 'ofxImports') },

  /* ------------------------------------------------------ Outcomes (8) ----- */
  { id: 'savings', name: 'Saving it', icon: '🐖', family: 'Outcomes', desc: 'Monthly savings rate', tiers: [10, 20, 30], unit: '%', value: savingsRateNow },
  { id: 'goal.done', name: 'Goal getter', icon: '🏁', family: 'Outcomes', desc: 'Fully fund your goals', tiers: [1, 3, 10], value: (c) => c.goals.filter((g) => g.saved >= g.target && g.target > 0).length },
  { id: 'debt.cleared', name: 'Debt free', icon: '🕊️', family: 'Outcomes', desc: 'Pay off debts completely', tiers: [1, 2, 5], value: (c) => c.debts.filter((d) => d.balance <= 0).length },
  { id: 'budget.ok', name: 'Under budget', icon: '📉', family: 'Outcomes', desc: 'Months finished under budget', tiers: [1, 3, 12], value: (c) => stat(c, 'monthsUnderBudget') },
  { id: 'no.overspend', name: 'No overspend', icon: '🛡️', family: 'Outcomes', desc: 'Months with no category overspent', tiers: [1, 3, 12], value: (c) => stat(c, 'monthsNoOverspend') },
  { id: 'tracking', name: 'In it for the long run', icon: '📆', family: 'Outcomes', desc: 'Distinct months with activity', tiers: [3, 6, 12], value: (c) => new Set(c.transactions.map((t) => t.date.slice(0, 7))).size },
  { id: 'dividends', name: 'Passive income', icon: '💸', family: 'Outcomes', desc: 'Holdings that pay dividends', tiers: [1, 3, 10], value: (c) => c.holdings.filter((h) => (h.dividends ?? 0) > 0).length },
  { id: 'gains', name: 'In the green', icon: '🌱', family: 'Outcomes', desc: 'Holdings above their average cost', tiers: [1, 3, 10], value: (c) => c.holdings.filter((h) => h.price > h.avgCost && h.quantity > 0).length },

  /* ------------------------------------------------------- Insight (8) ----- */
  { id: 'year', name: 'Year in review', icon: '✨', family: 'Insight', desc: 'Open the year in review', tiers: [1, 2, 5], value: (c) => stat(c, 'yearReviewViews') },
  { id: 'compare', name: 'Side by side', icon: '⚖️', family: 'Insight', desc: 'Compare two periods', tiers: [1, 5, 20], value: (c) => stat(c, 'compares') },
  { id: 'heatmap', name: 'Pattern spotter', icon: '🌡️', family: 'Insight', desc: 'Explore the spending heat-map', tiers: [1, 5, 20], value: (c) => stat(c, 'heatmapClicks') },
  { id: 'anomaly', name: 'Anomaly hunter', icon: '🚨', family: 'Insight', desc: 'Review flagged anomalies', tiers: [1, 5, 20], value: (c) => stat(c, 'anomalyViews') },
  { id: 'bills.settled', name: 'Bills settled', icon: '✔️', family: 'Insight', desc: 'Match incoming money to bills', tiers: [1, 5, 20], value: (c) => stat(c, 'billsSettled') },
  { id: 'subscriptions', name: 'Subscription watchdog', icon: '🔔', family: 'Insight', desc: 'Act on subscription insights', tiers: [1, 3, 10], value: (c) => stat(c, 'subscriptionActions') },
  { id: 'forecast', name: 'Looking ahead', icon: '🔭', family: 'Insight', desc: 'Open the cash-flow forecast', tiers: [1, 5, 20], value: (c) => stat(c, 'forecastViews') },
  { id: 'reports', name: 'Report reader', icon: '📊', family: 'Insight', desc: 'Open monthly reports', tiers: [1, 4, 12], value: (c) => stat(c, 'reports') },

  /* ------------------------------------------------------- Seasons (3) ----- */
  { id: 'seasons', name: 'Seasoned', icon: '🍂', family: 'Seasons', desc: 'Months recorded as a season', tiers: [3, 6, 12], value: (c) => prog(c)?.seasons.length ?? 0 },
  { id: 'seasons.best', name: 'Personal record', icon: '🥇', family: 'Seasons', desc: 'Seasons where you beat your past months', tiers: [1, 3, 6], value: (c) => (prog(c)?.seasons ?? []).filter((s) => s.best).length },
  { id: 'bests', name: 'Best of you', icon: '🏆', family: 'Seasons', desc: 'Personal bests recorded', tiers: [1, 3, 10], value: (c) => Object.keys(prog(c)?.personalBests ?? {}).length },
]

export const badgeById = new Map(BADGES.map((b) => [b.id, b]))

/** "4 / 6" against the next threshold, or the final value once maxed out. */
export function badgeProgressLabel(def: BadgeDef, value: number): string {
  const next = def.tiers.find((t) => value < t)
  const round = (v: number) => (def.unit === '%' ? Math.round(v * 10) / 10 : Math.round(v))
  if (next === undefined) return def.unit === '%' ? `${round(value)}%` : `${round(value)}${def.unit ? ` ${def.unit}` : ''}`
  return `${round(value)} / ${round(next)}`
}

export const badgesByFamily = (badges: BadgeDef[] = BADGES) =>
  BADGE_FAMILIES.map((family) => ({ family, items: badges.filter((b) => b.family === family) })).filter((g) => g.items.length)
