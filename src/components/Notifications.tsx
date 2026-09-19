import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, TrendingDown } from 'lucide-react'
import { Modal, useMoney } from './ui'
import { useConverter, useStore } from '../store'
import { budgetProgress, upcoming } from '../lib/analytics'
import { fmtDate, monthKey, today } from '../lib/utils'

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { budgets, transactions, categories, accounts, recurring, debts, goals, settings, postRecurring } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const over = budgetProgress(budgets, transactions, categories, accounts, conv, monthKey(today())).filter((b) => b.pct >= 90)
  const due = upcoming(recurring, 7)
  const overdue = due.filter((u) => u.daysAway < 0)
  const dueDebts = debts.filter((d) => {
    const day = new Date().getDate()
    return d.balance > 0 && d.dueDay >= day && d.dueDay - day <= 5
  })
  const nearGoals = goals.filter((g) => g.saved < g.target && g.saved / g.target >= 0.9)

  const items = [
    ...overdue.map((u) => ({
      icon: <AlertTriangle size={16} color="var(--red)" />,
      title: `${u.rec.name} was due ${fmtDate(u.date, settings.locale)}`,
      body: `${money(u.rec.amount)} — ${u.rec.autoPost ? 'will auto-post' : 'mark as paid on the Bills page'}`,
      action: !u.rec.autoPost ? (
        <button className="btn sm" onClick={() => postRecurring(u.rec.id, u.date)}>
          Mark paid
        </button>
      ) : null,
    })),
    ...over.map((b) => ({
      icon: <TrendingDown size={16} color={b.pct >= 100 ? 'var(--red)' : 'var(--orange)'} />,
      title: `${b.category!.name} budget at ${Math.round(b.pct)}%`,
      body: `${money(b.spent)} of ${money(b.limit)} spent this month`,
      action: (
        <Link to="/budgets" className="btn sm" onClick={onClose}>
          View
        </Link>
      ),
    })),
    ...due
      .filter((u) => u.daysAway >= 0 && u.daysAway <= u.rec.remindDays)
      .map((u) => ({
        icon: <CalendarClock size={16} color="var(--primary-2)" />,
        title: `${u.rec.name} ${u.daysAway === 0 ? 'is due today' : `due in ${u.daysAway} day${u.daysAway === 1 ? '' : 's'}`}`,
        body: `${money(u.rec.amount)} · ${u.rec.autoPost ? 'auto-posts' : 'manual'}`,
        action: (
          <Link to="/recurring" className="btn sm" onClick={onClose}>
            Open
          </Link>
        ),
      })),
    ...dueDebts.map((d) => ({
      icon: <CalendarClock size={16} color="var(--orange)" />,
      title: `${d.name} payment due on the ${d.dueDay}th`,
      body: `Minimum ${money(d.minPayment)} · balance ${money(d.balance)}`,
      action: (
        <Link to="/debts" className="btn sm" onClick={onClose}>
          Pay
        </Link>
      ),
    })),
    ...nearGoals.map((g) => ({
      icon: <CheckCircle2 size={16} color="var(--green)" />,
      title: `${g.name} is ${Math.round((g.saved / g.target) * 100)}% funded`,
      body: `Only ${money(g.target - g.saved)} to go`,
      action: (
        <Link to="/goals" className="btn sm" onClick={onClose}>
          Goals
        </Link>
      ),
    })),
  ]

  return (
    <Modal title="Notifications" onClose={onClose} width={480}>
      {items.length === 0 ? (
        <div className="empty">
          <strong>All clear</strong>Nothing needs your attention right now.
        </div>
      ) : (
        <div className="stack notif-list" style={{ gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} className="subtle-panel flex" style={{ gap: 12 }}>
              {it.icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{it.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {it.body}
                </div>
              </div>
              {it.action}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
