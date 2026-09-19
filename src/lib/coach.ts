// The coach: one contextual nudge a day, derived from the data that is already
// on screen. Never a modal, never a nag — it explains *why* it is nudging and
// links straight to the place where the thing can be fixed.
import type { GameCtx } from './gamification'
import { seasonMetrics, streakValue, weekKey } from './gamification'
import { budgetProgress, payoffPlan, upcoming } from './analytics'
import type { Converter } from './analytics'
import { detectAnomalies, detectRecurring } from './matching'
import { dailyDiscretionary, safeToSpend } from './forecast'
import { addDays, currentPeriod, daysBetween, fmtMoney, monthKey, today } from './utils'

export interface CoachNudge {
  key: string
  icon: string
  tone: 'info' | 'good' | 'warn'
  title: string
  body: string
  action?: { label: string; to: string }
}

const knownPayees = (ctx: GameCtx) =>
  new Set(ctx.recurring.flatMap((r) => [(r.payee || r.name).toLowerCase(), r.name.toLowerCase()]))

/**
 * Every nudge the data currently justifies, in priority order. The coach shows
 * the first one that is not dismissed, so the ordering *is* the policy:
 * correctness first (uncategorised), then cash risk, then optimisation.
 */
export function coachNudges(ctx: GameCtx, conv: Converter, now = today()): CoachNudge[] {
  const out: CoachNudge[] = []
  const currency = ctx.settings.currency
  const money = (v: number) => fmtMoney(v, currency, ctx.settings.locale)
  const progress = ctx.progress
  const forecastOpts = {
    accounts: ctx.accounts,
    transactions: ctx.transactions,
    recurring: ctx.recurring,
    budgets: ctx.budgets,
    goals: ctx.goals,
    conv,
  }

  /* 1 · uncategorised transactions silently corrupt every category report */
  const uncategorised = ctx.transactions.filter((t) => t.type !== 'transfer' && !t.categoryId)
  if (uncategorised.length)
    out.push({
      key: 'uncategorised',
      icon: '🗂️',
      tone: 'warn',
      title: `${uncategorised.length} transaction${uncategorised.length === 1 ? '' : 's'} without a category`,
      body: 'Uncategorised rows are excluded from every category breakdown, so your analytics understate spending until they are filed.',
      action: { label: 'Categorise them', to: '/transactions?q=is:uncategorised' },
    })

  /* 2 · a bill due within two days that will not post itself */
  const due = upcoming(ctx.recurring, 2, now).filter((u) => u.rec.type === 'expense' && !u.rec.autoPost)
  if (due.length) {
    const first = due[0]
    out.push({
      key: 'bill-due',
      icon: '📅',
      tone: 'warn',
      title: `${first.rec.name} is due ${first.daysAway <= 0 ? 'today' : `in ${first.daysAway} day${first.daysAway === 1 ? '' : 's'}`}`,
      body: `It is not set to post automatically, so the ${money(conv(first.rec.amount, ctx.accounts.find((a) => a.id === first.rec.accountId)?.currency ?? currency))} will not appear in your books unless you post it.`,
      action: { label: 'Open bills', to: '/recurring' },
    })
  }

  /* 3 · safe-to-spend running well below the normal daily burn */
  const burn = dailyDiscretionary(ctx.transactions, ctx.accounts, conv)
  if (ctx.transactions.length >= 5 && burn > 0) {
    const safe = safeToSpend(forecastOpts)
    if (safe.perDay < burn * 0.6)
      out.push({
        key: 'safe-low',
        icon: '🧭',
        tone: 'warn',
        title: 'Less room than usual this stretch',
        body: `Safe to spend works out at ${money(safe.perDay)} a day until ${safe.horizon}, against your usual ${money(burn)}. Bills and unused budgets are the usual reason.`,
        action: { label: 'See the dashboard', to: '/' },
      })
  }

  /* 4 · the hottest budget is about to breach */
  const rows = budgetProgress(ctx.budgets, ctx.transactions, ctx.categories, ctx.accounts, conv, currentPeriod(ctx.settings.monthStartDay), ctx.settings.monthStartDay)
    .filter((b) => b.pct >= 90)
    .sort((a, b) => b.pct - a.pct)
  if (rows.length) {
    const hot = rows[0]
    out.push({
      key: `budget-${hot.categoryId}`,
      icon: '🎯',
      tone: hot.pct >= 100 ? 'warn' : 'info',
      title: `${hot.category?.name ?? 'A budget'} is at ${Math.round(hot.pct)}%`,
      body: `${money(hot.spent)} of ${money(hot.limitWithRollover)} used this period. ${hot.remaining > 0 ? `${money(hot.remaining)} left.` : `${money(-hot.remaining)} over.`}`,
      action: { label: 'Open budgets', to: '/budgets' },
    })
  }

  /* 5 · a payee that looks like a bill you are not tracking */
  const detected = detectRecurring(ctx.transactions, knownPayees(ctx)).filter((d) => d.confidence >= 0.6)
  if (detected.length) {
    const top = detected[0]
    out.push({
      key: `recurring-${top.payee}`,
      icon: '🔁',
      tone: 'info',
      title: `${top.payee} looks like a recurring bill`,
      body: `${top.dates.length} charges around ${money(top.amount)}, roughly every ${top.spacingDays} days, and it is not tracked as a bill yet.`,
      action: { label: 'Track it', to: '/recurring' },
    })
  }

  /* 6 · an expense far outside its own norm */
  const anomalies = detectAnomalies(ctx.transactions)
  if (anomalies.length) {
    const a = anomalies[0]
    out.push({
      key: `anomaly-${a.tx.id}`,
      icon: '🚨',
      tone: 'warn',
      title: `${a.tx.payee} was ${a.ratio.toFixed(1)}× your usual`,
      body: `You paid ${money(a.tx.amount)} where you normally pay ${money(a.expected)} for this payee. Worth a look in case it is a duplicate or a mistake.`,
      action: { label: 'Find it', to: `/transactions?q=${encodeURIComponent(`payee:"${a.tx.payee}"`)}` },
    })
  }

  /* 7 · doubling the minimum payment would save real interest */
  for (const d of ctx.debts) {
    if (d.balance <= 0 || d.apr <= 0 || d.minPayment <= 0) continue
    const base = payoffPlan(d.balance, d.apr, d.minPayment)
    const doubled = payoffPlan(d.balance, d.apr, d.minPayment * 2)
    if (!Number.isFinite(base.interest) || !Number.isFinite(doubled.interest)) continue
    const saved = base.interest - doubled.interest
    if (saved > 20) {
      out.push({
        key: `debt-${d.id}`,
        icon: '🏦',
        tone: 'info',
        title: `Paying ${money(d.minPayment)} more on ${d.name} saves ${money(saved)}`,
        body: `At ${d.apr}% APR, doubling the minimum clears it in ${doubled.months} months instead of ${base.months}, saving ${money(saved)} in interest.`,
        action: { label: 'Open debts', to: '/debts' },
      })
      break
    }
  }

  /* 8 · the streak is alive and today has nothing in it yet, late in the day */
  const hour = new Date(`${now}T00:00:00`).getHours()
  const streak = streakValue(progress?.streak ?? { current: 0, longest: 0, lastDay: null, freezes: 0 }, now)
  const loggedToday = ctx.transactions.some((t) => t.date === now)
  if (hour >= 18 && streak >= 3 && !loggedToday)
    out.push({
      key: 'streak-risk',
      icon: '🔥',
      tone: 'info',
      title: `Your ${streak}-day streak is still open`,
      body: 'Nothing logged today yet. One transaction keeps the chain alive — and a missed day only costs you a grace token if you have one banked.',
      action: { label: 'Quick add', to: '/?quick=1' },
    })

  /* 9 · a goal that is behind its own pace */
  for (const g of ctx.goals) {
    if (!g.deadline || g.saved >= g.target) continue
    const days = daysBetween(now, g.deadline)
    if (days <= 0 || days > 120) continue
    const perDay = (g.target - g.saved) / days
    out.push({
      key: `goal-${g.id}`,
      icon: '🏁',
      tone: 'info',
      title: `${g.name} needs ${money(perDay)} a day`,
      body: `${money(g.target - g.saved)} to go with ${days} days left. That is ${money(perDay * 30)} a month against your current ${money(g.monthlyContribution ?? 0)}.`,
      action: { label: 'Open goals', to: '/goals' },
    })
    break
  }

  /* 10 · this week has not been reviewed — pointless on an empty book */
  if (ctx.transactions.length > 0 && !progress?.reviews.includes(weekKey(now)))
    out.push({
      key: 'review',
      icon: '🗓️',
      tone: 'info',
      title: 'This week is not reviewed yet',
      body: 'Five short steps: uncategorised, bills, budgets, new recurring, then the summary. It takes a couple of minutes and earns 120 XP.',
      action: { label: 'Start the review', to: '/weekly' },
    })

  /* 11 · something genuinely good, so the coach is not only a critic */
  const savings = seasonMetrics(ctx, monthKey(now)).savingsRate
  if (ctx.transactions.some((t) => t.type === 'income') && savings >= 20)
    out.push({
      key: 'savings-good',
      icon: '🎉',
      tone: 'good',
      title: `You are saving ${savings.toFixed(0)}% this month`,
      body: 'That is comfortably above the 20% benchmark. If it holds, consider pointing the surplus at a goal or a debt.',
      action: { label: 'Open goals', to: '/goals' },
    })

  /* 12 · fallback: stale prices quietly misreport your net worth */
  if (ctx.holdings.length) {
    const stale = ctx.holdings.filter((h) => h.quantity > 0 && daysBetween(h.updatedAt, now) > 14).length
    out.push({
      key: 'prices',
      icon: '📈',
      tone: 'info',
      title: stale ? `${stale} holding${stale === 1 ? '' : 's'} with a stale price` : 'Keep your holding prices fresh',
      body: stale ? 'Net worth and allocation use the last price you entered, so old prices misreport both.' : 'Updating prices keeps net worth, allocation and P&L honest.',
      action: { label: 'Open investments', to: '/investments' },
    })
  }

  return out
}

export interface PickOptions {
  dismissed?: string[]
  quietHours?: [number, number]
  now?: string
  hour?: number
}

/** Are we inside the quiet window? Wraps past midnight, e.g. [21, 8]. */
export function inQuietHours(hour: number, quiet: [number, number] = [21, 8]): boolean {
  const [from, to] = quiet
  return from > to ? hour >= from || hour < to : hour >= from && hour < to
}

/**
 * Choose the single nudge to show today. Quiet hours suppress everything;
 * dismissed keys are skipped for good; and the same nudge stays pinned for the
 * rest of the day so the coach does not shuffle under the user's cursor.
 */
export function pickNudge(ctx: GameCtx, conv: Converter, opts: PickOptions = {}): { nudge: CoachNudge | null; quiet: boolean } {
  const now = opts.now ?? today()
  const hour = opts.hour ?? new Date().getHours()
  const quietHours = opts.quietHours ?? [21, 8]
  const dismissed = opts.dismissed ?? ctx.progress?.coach.dismissed ?? []
  const quiet = inQuietHours(hour, quietHours as [number, number])
  const candidates = coachNudges(ctx, conv, now).filter((n) => !dismissed.includes(n.key))
  if (!candidates.length) return { nudge: null, quiet }
  const coach = ctx.progress?.coach
  if (coach?.lastShownAt === now && coach.lastKey) {
    const sticky = candidates.find((n) => n.key === coach.lastKey)
    if (sticky) return { nudge: sticky, quiet }
  }
  return { nudge: candidates[0], quiet }
}

/** A neutral date `n` days out — handy for tests and for "no deadline" copy. */
export const inDays = (n: number, from = today()) => addDays(from, n)
