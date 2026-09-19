// Persistent notification centre: read/unread, snooze, grouped by day.
// Notifications are derived from the data (so they never go stale) and their
// read/snooze state lives in settings.notifications.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BellOff, CalendarClock, CheckCircle2, Eye, Sparkles, Target, TrendingDown, Wallet } from 'lucide-react'
import { Modal, useMoney } from './ui'
import { useConverter, useStore } from '../store'
import { budgetProgress, nextDueDate, upcoming } from '../lib/analytics'
import { detectAnomalies, subscriptionInsights } from '../lib/matching'
import { cashFlowForecast, safeToSpend } from '../lib/forecast'
import { addDays, daysBetween, fmtDate, fmtDateLong, monthKey, today } from '../lib/utils'
import type { NotificationRecord } from '../lib/types'

type Item = {
  key: string
  kind: NotificationRecord['kind']
  icon: React.ReactNode
  title: string
  body: string
  date: string
  action?: React.ReactNode
}

export function useNotificationItems(): Item[] {
  const { budgets, transactions, categories, accounts, recurring, debts, goals, settings } = useStore()
  const conv = useConverter()
  const money = useMoney()

  return useMemo(() => {
    const items: Item[] = []
    const over = budgetProgress(budgets, transactions, categories, accounts, conv, monthKey(today()), settings.monthStartDay).filter((b) => b.pct >= 90)
    const due = upcoming(recurring, 14)
    const overdue = due.filter((u) => u.daysAway < 0)

    for (const u of overdue)
      items.push({
        key: `bill:${u.rec.id}:${u.date}`,
        kind: 'bill',
        date: u.date,
        icon: <AlertTriangle size={16} color="var(--red)" />,
        title: `${u.rec.name} was due ${fmtDate(u.date, settings.locale)}`,
        body: `${money(u.rec.amount)} — ${u.rec.autoPost ? 'will auto-post' : 'mark it as paid on the Bills page'}`,
        action: (
          <Link to="/recurring" className="btn sm">
            Open
          </Link>
        ),
      })

    for (const u of due.filter((x) => x.daysAway >= 0 && x.daysAway <= x.rec.remindDays))
      items.push({
        key: `due:${u.rec.id}:${u.date}`,
        kind: 'bill',
        date: u.date,
        icon: <CalendarClock size={16} color="var(--primary-2)" />,
        title: `${u.rec.name} ${u.daysAway === 0 ? 'is due today' : `due in ${u.daysAway} day${u.daysAway === 1 ? '' : 's'}`}`,
        body: `${money(u.rec.amount)} · ${u.rec.autoPost ? 'auto-posts' : 'manual'} · ${fmtDate(u.date, settings.locale)}`,
        action: (
          <Link to="/recurring" className="btn sm">
            Open
          </Link>
        ),
      })

    for (const b of over)
      items.push({
        key: `budget:${b.id}:${monthKey(today())}`,
        kind: 'budget',
        date: today(),
        icon: <TrendingDown size={16} color={b.pct >= 100 ? 'var(--red)' : 'var(--orange)'} />,
        title: `${b.category!.name} budget at ${Math.round(b.pct)}%`,
        body: `${money(b.spent)} of ${money(b.limitWithRollover)} spent this period`,
        action: (
          <Link to="/budgets" className="btn sm">
            View
          </Link>
        ),
      })

    // Debts: due date wraps the month correctly (due day 2 on the 29th → next month).
    for (const d of debts) {
      if (!(d.balance > 0)) continue
      const next = nextDueDate(d.dueDay)
      const away = daysBetween(today(), next)
      if (away > 5) continue
      items.push({
        key: `debt:${d.id}:${next}`,
        kind: 'debt',
        date: next,
        icon: <Wallet size={16} color="var(--orange)" />,
        title: `${d.name} payment due ${away === 0 ? 'today' : away === 1 ? 'tomorrow' : `in ${away} days`}`,
        body: `Minimum ${money(d.minPayment)} · balance ${money(d.balance)}`,
        action: (
          <Link to="/debts" className="btn sm">
            Pay
          </Link>
        ),
      })
    }

    for (const g of goals)
      if (g.saved < g.target && g.saved / g.target >= 0.9)
        items.push({
          key: `goal:${g.id}`,
          kind: 'goal',
          date: today(),
          icon: <Target size={16} color="var(--green)" />,
          title: `${g.name} is ${Math.round((g.saved / g.target) * 100)}% funded`,
          body: `Only ${money(g.target - g.saved)} to go`,
          action: (
            <Link to="/goals" className="btn sm">
              Goals
            </Link>
          ),
        })

    for (const a of detectAnomalies(transactions).slice(0, 3))
      items.push({
        key: `anomaly:${a.tx.id}`,
        kind: 'anomaly',
        date: a.tx.date,
        icon: <Sparkles size={16} color="var(--yellow)" />,
        title: `Unusual: ${money(a.tx.amount)} at ${a.tx.payee}`,
        body: `${a.ratio.toFixed(1)}× your usual — ${a.reason}`,
        action: (
          <Link to="/transactions" className="btn sm">
            Review
          </Link>
        ),
      })

    for (const s of subscriptionInsights(recurring, transactions).slice(0, 3))
      items.push({
        key: `sub:${s.recurring.id}`,
        kind: 'subscription',
        date: today(),
        icon: <AlertTriangle size={16} color={s.changePct > 0 ? 'var(--orange)' : 'var(--muted)'} />,
        title: s.changePct > 0 ? `${s.recurring.name} went up ${s.changePct.toFixed(0)}%` : `${s.recurring.name} looks unused`,
        body:
          s.changePct > 0
            ? `${money(s.prevMonthly)} → ${money(s.monthly)} per month`
            : `No matching transaction for ${s.unusedCycles} cycles · ${money(s.monthly)}/mo`,
        action: (
          <Link to="/recurring" className="btn sm">
            Open
          </Link>
        ),
      })

    const { min } = cashFlowForecast({ accounts, transactions, recurring, budgets, goals, conv, days: 30 })
    if (min && min.balance < 0)
      items.push({
        key: `forecast:${min.date}`,
        kind: 'forecast',
        date: min.date,
        icon: <AlertTriangle size={16} color="var(--red)" />,
        title: `Projected balance goes negative on ${fmtDate(min.date, settings.locale)}`,
        body: `${money(min.balance)} — bills and your usual spending exceed what is coming in`,
        action: (
          <Link to="/recurring" className="btn sm">
            Plan
          </Link>
        ),
      })

    return items.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [budgets, transactions, categories, accounts, recurring, debts, goals, settings.monthStartDay, settings.locale, conv, money])
}

const NO_RECORDS: NotificationRecord[] = []

export function NotificationBadge() {
  const items = useNotificationItems()
  const read = useStore((s) => s.settings.notifications) ?? NO_RECORDS
  const now = today()
  const unread = items.filter((i) => {
    const r = read.find((x) => x.ref === i.key)
    return !r?.read && !(r?.snoozedUntil && r.snoozedUntil > now)
  })
  return unread.length > 0 ? <span className="dot" /> : null
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const items = useNotificationItems()
  const records = useStore((s) => s.settings.notifications) ?? NO_RECORDS
  const updateSettings = useStore((s) => s.updateSettings)
  const [showRead, setShowRead] = useState(false)
  const now = today()

  const stateOf = (key: string) => records.find((x) => x.ref === key)
  const isHidden = (i: Item) => {
    const r = stateOf(i.key)
    if (!r) return false
    if (r.snoozedUntil && r.snoozedUntil > now) return !showRead
    return r.read ? !showRead : false
  }

  const set = (i: Item, patch: Partial<NotificationRecord>) => {
    const existing = stateOf(i.key)
    const next: NotificationRecord = existing
      ? { ...existing, ...patch }
      : { id: `${i.key}`, kind: i.kind, ref: i.key, title: i.title, body: i.body, createdAt: today(), read: false, snoozedUntil: null, ...patch }
    updateSettings({ notifications: [next, ...records.filter((x) => x.ref !== i.key)].slice(0, 200) })
  }

  const visible = items.filter((i) => !isHidden(i))
  const groups = new Map<string, Item[]>()
  for (const i of visible) {
    const g = groups.get(i.date) ?? []
    g.push(i)
    groups.set(i.date, g)
  }
  const hiddenCount = items.length - visible.length

  return (
    <Modal title="Notifications" onClose={onClose} width={520}>
      <div className="flex between" style={{ marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {visible.length} active{hiddenCount ? ` · ${hiddenCount} dismissed` : ''}
        </span>
        <div className="flex" style={{ gap: 6 }}>
          {hiddenCount > 0 && (
            <button
              className="btn sm ghost"
              onClick={() => {
                updateSettings({ notifications: records.filter((x) => !x.read && (!x.snoozedUntil || x.snoozedUntil <= now)) })
              }}
            >
              Clear dismissed
            </button>
          )}
          <button className="btn sm" disabled={!visible.length} onClick={() => updateSettings({ notifications: [...visible.map((i) => ({ id: i.key, kind: i.kind, ref: i.key, title: i.title, body: i.body, createdAt: today(), read: true, snoozedUntil: null })), ...records.filter((x) => !visible.some((i) => i.key === x.ref))] })}>
            <Eye size={13} /> Mark all read
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <CheckCircle2 size={22} color="var(--green)" />
          <strong>All clear</strong>
          Nothing needs your attention right now.
        </div>
      ) : (
        <div className="stack notif-list" style={{ gap: 8 }}>
          {[...groups.entries()].map(([date, rows]) => (
            <div key={date}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 4px' }}>
                {fmtDateLong(date)}
              </div>
              {rows.map((it) => (
                <div key={it.key} className="subtle-panel flex" style={{ gap: 12, marginBottom: 6 }}>
                  {it.icon}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{it.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {it.body}
                    </div>
                  </div>
                  <button className="mini-btn" title="Snooze 3 days" onClick={() => set(it, { snoozedUntil: addDays(today(), 3) })}>
                    <BellOff size={13} />
                  </button>
                  <button className="mini-btn" title="Mark as read" onClick={() => set(it, { read: true })}>
                    <Eye size={13} />
                  </button>
                  {it.action}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {hiddenCount > 0 && (
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setShowRead((v) => !v)}>
          {showRead ? 'Hide dismissed' : `Show ${hiddenCount} dismissed`}
        </button>
      )}
    </Modal>
  )
}

/** Safe-to-spend headline figure, shared by the Dashboard and Today card. */
export function useSafeToSpend() {
  const { accounts, transactions, recurring, budgets, goals } = useStore()
  const conv = useConverter()
  return useMemo(() => safeToSpend({ accounts, transactions, recurring, budgets, goals, conv }), [accounts, transactions, recurring, budgets, goals, conv])
}
