import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useConverter, useStore } from '../store'
import { pickNudge } from '../lib/coach'
import type { GameCtx } from '../lib/gamification'

/**
 * One nudge a day. "Not now" hides it for today; the × dismisses it for good.
 * The chosen key is pinned for the rest of the day so the card never shuffles
 * while the user is reading it.
 */
export function CoachCard() {
  const state = useStore()
  const conv = useConverter()
  const navigate = useNavigate()
  const [snoozed, setSnoozed] = useState(false)

  const enabled = state.settings.gamification?.enabled !== false && state.settings.gamification?.coach !== false
  const quietHours = state.settings.gamification?.quietHours ?? [21, 8]
  const dismissed = state.progress?.coach.dismissed ?? []

  const { nudge, quiet } = useMemo(
    () => (enabled ? pickNudge(state as unknown as GameCtx, conv, { quietHours: quietHours as [number, number], dismissed }) : { nudge: null, quiet: false }),
    // The coach is recomputed when the underlying data or the day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, state.transactions, state.budgets, state.recurring, state.debts, state.goals, state.holdings, state.progress, dismissed.length, conv],
  )

  useEffect(() => {
    if (nudge) state.markCoachShown(nudge.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudge?.key])

  if (!enabled || !nudge || quiet || snoozed) return null

  return (
    <section className={`coach-card ${nudge.tone}`}>
      <span className="coach-icon" aria-hidden>
        {nudge.icon}
      </span>
      <div className="coach-body">
        <div className="coach-kicker">Coach</div>
        <div className="coach-title">{nudge.title}</div>
        <p className="coach-text">{nudge.body}</p>
        <div className="coach-actions">
          {nudge.action && (
            <button
              className="btn small primary"
              onClick={() => {
                state.markCoachShown(nudge.key)
                navigate(nudge.action!.to)
              }}
            >
              {nudge.action.label}
            </button>
          )}
          <button className="btn small ghost" onClick={() => setSnoozed(true)}>
            Not now
          </button>
        </div>
      </div>
      <button
        className="icon-btn coach-dismiss"
        aria-label="Do not show this again"
        title="Do not show this again"
        onClick={() => state.dismissCoach(nudge.key)}
      >
        <X size={14} />
      </button>
    </section>
  )
}
