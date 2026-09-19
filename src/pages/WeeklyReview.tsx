import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { useConverter, useStore } from '../store'
import { budgetProgress, upcoming } from '../lib/analytics'
import { detectRecurring } from '../lib/matching'
import { safeToSpend } from '../lib/forecast'
import { seasonMetrics, streakValue, weekKey, type GameCtx } from '../lib/gamification'
import { currentPeriod, fmtMoney, monthKey, today } from '../lib/utils'

const STEPS = [
  { key: 'uncategorised', title: 'File what is loose', body: 'Uncategorised rows are excluded from every breakdown. Clear them first and the rest of the app tells the truth.' },
  { key: 'bills', title: 'Post what is due', body: 'Bills that will not post themselves need posting, or safe to spend is overstating your room.' },
  { key: 'budgets', title: 'Check the budgets', body: 'Anything at 90% or more deserves a decision now rather than a surprise on the 30th.' },
  { key: 'recurring', title: 'Catch new recurring', body: 'Payees that repeat on a steady cadence and are not tracked yet are the classic slow leak.' },
  { key: 'summary', title: 'The week in numbers', body: 'Where the week landed, and what the review earned you.' },
] as const

/** Five short steps that leave the books correct and earn the review XP. */
export function WeeklyReview() {
  const state = useStore()
  const conv = useConverter()
  const [step, setStep] = useState(0)
  const date = today()
  const currency = state.settings.currency
  const locale = state.settings.locale
  const money = (v: number) => fmtMoney(v, currency, locale)
  const ctx = state as unknown as GameCtx

  const uncategorised = useMemo(() => state.transactions.filter((t) => t.type !== 'transfer' && !t.categoryId), [state.transactions])
  const due = useMemo(() => upcoming(state.recurring, 7).filter((u) => u.rec.type === 'expense'), [state.recurring])
  const hot = useMemo(
    () =>
      budgetProgress(state.budgets, state.transactions, state.categories, state.accounts, conv, currentPeriod(state.settings.monthStartDay), state.settings.monthStartDay)
        .filter((b) => b.pct >= 90)
        .sort((a, b) => b.pct - a.pct),
    [state.budgets, state.transactions, state.categories, state.accounts, conv, state.settings.monthStartDay],
  )
  const detected = useMemo(
    () => detectRecurring(state.transactions, new Set(state.recurring.flatMap((r) => [(r.payee || r.name).toLowerCase(), r.name.toLowerCase()]))).filter((d) => d.confidence >= 0.6),
    [state.transactions, state.recurring],
  )
  const metrics = useMemo(() => seasonMetrics(ctx, monthKey(date)), [ctx, date])
  const safe = useMemo(
    () => safeToSpend({ accounts: state.accounts, transactions: state.transactions, recurring: state.recurring, budgets: state.budgets, goals: state.goals, conv }),
    [state.accounts, state.transactions, state.recurring, state.budgets, state.goals, conv],
  )

  const done = (state.progress?.reviews ?? []).includes(weekKey(date))
  const current = STEPS[step]

  const finish = () => {
    if (!done) {
      state.completeReview() // +120 XP and the review streak
      const under = hot.length === 0
      state.bumpStat('monthsUnderBudget', under ? 1 : 0)
      state.bumpStat('monthsNoOverspend', hot.every((b) => b.pct < 100) ? 1 : 0)
      state.refreshBadges()
    }
    setStep(STEPS.length - 1)
  }

  return (
    <>
      <Card
        title={`Weekly review — ${weekKey(date)}`}
        sub={done ? 'Completed this week. Run through it again any time.' : 'Five steps, every one skippable. Completing it awards 120 XP.'}
        action={
          <div className="review-steps">
            {STEPS.map((s, i) => (
              <button key={s.key} className={`review-dot ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} onClick={() => setStep(i)} aria-label={s.title} />
            ))}
          </div>
        }
      >
        <div className="review-head">
          <h3 className="review-title">{current.title}</h3>
          <p className="muted">{current.body}</p>
        </div>

        {current.key === 'uncategorised' && (
          <div className="review-body">
            {uncategorised.length === 0 ? (
              <p className="review-ok">Nothing uncategorised. Your breakdowns are honest this week.</p>
            ) : (
              <>
                <p>
                  <b>{uncategorised.length}</b> transaction{uncategorised.length === 1 ? '' : 's'} still need a category.
                </p>
                <Link className="btn small primary" to="/transactions?q=is:uncategorised">
                  Categorise them
                </Link>
              </>
            )}
          </div>
        )}

        {current.key === 'bills' && (
          <div className="review-body">
            {due.length === 0 ? (
              <p className="review-ok">No bills due in the next seven days.</p>
            ) : (
              <ul className="review-list">
                {due.map((u) => (
                  <li key={u.rec.id}>
                    <span>
                      {u.rec.name} · {u.date} {u.rec.autoPost ? '(auto-posts)' : '(manual)'}
                    </span>
                    <b>{money(conv(u.rec.amount, state.accounts.find((a) => a.id === u.rec.accountId)?.currency ?? currency))}</b>
                    {!u.rec.autoPost && (
                      <button
                        className="btn small ghost"
                        onClick={() => {
                          state.postRecurring(u.rec.id, u.date)
                          state.bumpStat('billsSettled')
                        }}
                      >
                        Post now
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn small" to="/recurring">
              Open bills
            </Link>
          </div>
        )}

        {current.key === 'budgets' && (
          <div className="review-body">
            {hot.length === 0 ? (
              <p className="review-ok">Every budget is comfortably inside its limit.</p>
            ) : (
              <ul className="review-list">
                {hot.map((b) => (
                  <li key={b.id}>
                    <span>
                      {b.category?.name} · {Math.round(b.pct)}%
                    </span>
                    <b>{money(b.remaining)}</b>
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn small" to="/budgets">
              Open budgets
            </Link>
          </div>
        )}

        {current.key === 'recurring' && (
          <div className="review-body">
            {detected.length === 0 ? (
              <p className="review-ok">No untracked payees repeating on a steady cadence.</p>
            ) : (
              <ul className="review-list">
                {detected.slice(0, 5).map((d) => (
                  <li key={d.payee}>
                    <span>
                      {d.payee} · every {d.spacingDays} days · {Math.round(d.confidence * 100)}% confident
                    </span>
                    <b>{money(d.amount)}</b>
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn small" to="/recurring">
              Track them
            </Link>
          </div>
        )}

        {current.key === 'summary' && (
          <div className="review-body">
            <ul className="metric-list">
              <li>
                <span>Days logged this month</span>
                <b>{metrics.loggingDays}</b>
              </li>
              <li>
                <span>Categorised</span>
                <b>{metrics.categorisedPct}%</b>
              </li>
              <li>
                <span>Savings rate</span>
                <b>{metrics.savingsRate}%</b>
              </li>
              <li>
                <span>Safe to spend today</span>
                <b>{money(safe.value)}</b>
              </li>
              <li>
                <span>Streak</span>
                <b>{state.progress ? streakValue(state.progress.streak, date) : 0} days</b>
              </li>
            </ul>
            {done ? <p className="review-ok">This week is reviewed. See you next Monday.</p> : <p className="muted">Finish the review to bank the 120 XP and keep the review streak alive.</p>}
          </div>
        )}

        <div className="review-actions">
          <button className="btn small ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn small" onClick={() => setStep(step + 1)}>
              Skip
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button className="btn small primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button className="btn small primary" onClick={finish}>
              {done ? 'Reviewed' : 'Finish review +120 XP'}
            </button>
          )}
        </div>
      </Card>
    </>
  )
}
