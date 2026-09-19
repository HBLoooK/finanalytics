import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useStore } from '../store'
import { XP } from '../lib/gamification'
import { upcoming } from '../lib/analytics'
import { today } from '../lib/utils'

/**
 * The three things worth clearing every day, at most. When nothing is
 * outstanding the card completes itself instead of inventing work.
 */
export function DailyCheckIn() {
  const state = useStore()
  const navigate = useNavigate()

  const enabled = state.settings.gamification?.enabled !== false
  const doneToday = (state.progress?.checkIns ?? []).includes(today())

  const items = useMemo(() => {
    const uncategorised = state.transactions.filter((t) => t.type !== 'transfer' && !t.categoryId).length
    const bills = upcoming(state.recurring, 3).filter((u) => u.rec.type === 'expense').length
    const pending = state.transactions.filter((t) => t.status === 'pending').length
    return [
      uncategorised > 0 && { icon: '🗂️', label: `${uncategorised} to categorise`, to: '/transactions?q=is:uncategorised' },
      bills > 0 && { icon: '📅', label: `${bills} bill${bills === 1 ? '' : 's'} due within 3 days`, to: '/recurring' },
      pending > 0 && { icon: '⏳', label: `${pending} still pending`, to: '/transactions?q=is:pending' },
    ].filter(Boolean) as { icon: string; label: string; to: string }[]
  }, [state.transactions, state.recurring])

  const completeCheckIn = useStore((s) => s.completeCheckIn)
  const nothingOutstanding = enabled && !doneToday && items.length === 0

  // Nothing outstanding — award the check-in without making the user click.
  useEffect(() => {
    if (nothingOutstanding) completeCheckIn()
  }, [nothingOutstanding, completeCheckIn])

  if (!enabled) return null

  const complete = () => completeCheckIn()

  if (doneToday || items.length === 0) {
    return (
      <section className="checkin-card done">
        <span className="checkin-icon">
          <Check size={15} />
        </span>
        <div>
          <div className="checkin-title">{doneToday ? 'Checked in for today' : 'Nothing outstanding'}</div>
          <div className="checkin-sub">{doneToday ? 'Everything is filed, posted and settled.' : 'No loose ends right now — come back tomorrow.'}</div>
        </div>
      </section>
    )
  }

  return (
    <section className="checkin-card">
      <div className="checkin-head">
        <div className="checkin-title">Daily check-in</div>
        <div className="checkin-sub">Clear the small stuff, then take the {XP.checkin} XP.</div>
      </div>
      <ul className="checkin-list">
        {items.map((i) => (
          <li key={i.to + i.label}>
            <button className="checkin-item" onClick={() => navigate(i.to)}>
              <span aria-hidden>{i.icon}</span>
              {i.label}
            </button>
          </li>
        ))}
      </ul>
      <button className="btn small primary" onClick={complete}>
        Check in +{XP.checkin} XP
      </button>
    </section>
  )
}
