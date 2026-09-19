// Weekly digest: last 7 days vs the 7 before, top movers, and what is coming up.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, CalendarClock } from 'lucide-react'
import { useConverter, useStore } from '../store'
import { byCategory, totals } from '../lib/analytics'
import { addDays, today } from '../lib/utils'
import { upcoming } from '../lib/analytics'
import { Money, useMoney } from './ui'

export function WeekDigest() {
  const { transactions, accounts, categories, recurring } = useStore()
  const conv = useConverter()
  const money = useMoney()

  const stats = useMemo(() => {
    const to = today()
    const from = addDays(to, -6)
    const prevFrom = addDays(to, -13)
    const prevTo = addDays(to, -7)
    const week = transactions.filter((t) => t.date >= from && t.date <= to && t.type !== 'transfer')
    const prevWeek = transactions.filter((t) => t.date >= prevFrom && t.date <= prevTo && t.type !== 'transfer')
    const t = totals(week, accounts, conv)
    const p = totals(prevWeek, accounts, conv)
    const cats = byCategory(week, categories, accounts, conv)
    const prevCats = byCategory(prevWeek, categories, accounts, conv)
    const movers = cats
      .map((c) => ({ ...c, prev: prevCats.find((x) => x.id === c.id)?.value ?? 0 }))
      .map((c) => ({ ...c, delta: c.value - c.prev }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
    return { t, p, week, movers, chg: p.expense ? ((t.expense - p.expense) / p.expense) * 100 : 0 }
  }, [transactions, accounts, categories, conv])

  const due = upcoming(recurring, 7).filter((u) => u.daysAway >= 0)

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Spent this week</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>
          <Money value={stats.t.expense} />
        </div>
        <div className={`delta ${stats.chg <= 0 ? 'up' : 'down'}`} style={{ fontSize: 12 }}>
          {stats.chg <= 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
          {Math.abs(stats.chg).toFixed(0)}% vs last week
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Income</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--green)' }}>
          <Money value={stats.t.income} />
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {stats.week.length} transactions
        </div>
      </div>
      <div style={{ gridColumn: 'span 2', minWidth: 220 }}>
        <div className="muted" style={{ fontSize: 12 }}>Biggest movers</div>
        {stats.movers.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>Nothing yet this week.</div>
        ) : (
          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            {stats.movers.map((m) => (
              <div key={m.id} className="flex between" style={{ fontSize: 12.5 }}>
                <span>
                  {m.icon} {m.name}
                </span>
                <span style={{ color: m.delta > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {m.delta > 0 ? '+' : '−'}
                  {money(Math.abs(m.delta), { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Due in 7 days</div>
        {due.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>Nothing scheduled.</div>
        ) : (
          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            {due.slice(0, 3).map((u) => (
              <div key={u.rec.id + u.date} className="flex between" style={{ fontSize: 12.5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <CalendarClock size={12} /> {u.rec.name}
                </span>
                <span className="muted">{u.daysAway === 0 ? 'today' : `${u.daysAway}d`}</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/recurring" className="link" style={{ fontSize: 12 }}>
          See schedule
        </Link>
      </div>
    </div>
  )
}
