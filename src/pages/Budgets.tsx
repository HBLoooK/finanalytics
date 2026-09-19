import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, LineChart as LineChartIcon, Plus, Repeat, Trash2, Wand2 } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useConverter, useStore } from '../store'
import { budgetProgress, budgetTemplates, dailySpend, inMonth, totals } from '../lib/analytics'
import { addMonths, monthKey, monthLabel, today, sum, currentPeriod } from '../lib/utils'
import { Card, ChartTooltip, Empty, Gauge, Modal, Money, axisProps, confirmDelete, useMoney } from '../components/ui'

export function Budgets() {
  const { budgets, transactions, categories, accounts, setBudget, deleteBudget, settings } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const [month, setMonth] = useState(currentPeriod(settings.monthStartDay))
  const [adding, setAdding] = useState(false)

  const rows = useMemo(
    () => budgetProgress(budgets, transactions, categories, accounts, conv, month, settings.monthStartDay).sort((a, b) => b.pct - a.pct),
    [budgets, transactions, categories, accounts, conv, month, settings.monthStartDay],
  )
  const templates = useMemo(() => budgetTemplates(transactions, accounts, conv), [transactions, accounts, conv])
  const totalLimit = sum(rows.map((r) => r.limitWithRollover))
  const totalSpent = sum(rows.map((r) => r.spent))
  const monthTotals = totals(inMonth(transactions, month), accounts, conv)
  const unbudgeted = categories.filter((c) => c.kind === 'expense' && !budgets.some((b) => b.categoryId === c.id))

  const isCurrent = month === currentPeriod(settings.monthStartDay)
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const dayOfMonth = isCurrent ? new Date().getDate() : daysInMonth
  const monthPct = (dayOfMonth / daysInMonth) * 100

  /** Ideal vs actual remaining budget through the month. */
  const burnDown = useMemo(() => {
    const daily = dailySpend(transactions, accounts, conv, month)
    const limit = totalLimit
    let cum = 0
    return daily.map((d) => {
      cum += d.expense
      return { day: d.day, ideal: Math.max(0, limit - (limit * d.day) / daily.length), actual: Math.max(0, limit - cum) }
    })
  }, [transactions, accounts, conv, month, totalLimit])

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="flex between wrap">
        <div className="flex">
          <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontWeight: 600, fontSize: 16, minWidth: 150, textAlign: 'center' }}>{monthLabel(month, false)}</div>
          <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
          {!isCurrent && (
            <button className="btn sm ghost" onClick={() => setMonth(monthKey(today()))}>
              Today
            </button>
          )}
        </div>
        <div className="flex wrap" style={{ gap: 8 }}>
          <button
            className="btn sm"
            title="Apply the 50/30/20 split of your average income to the biggest categories"
            onClick={() => {
              if (!window.confirm('Set needs/wants/savings limits from the 50/30/20 rule? Existing limits are replaced.')) return
              const needs = ['c_housing', 'c_groceries', 'c_utilities', 'c_transport', 'c_health']
              const wants = ['c_dining', 'c_entertainment', 'c_shopping', 'c_travel', 'c_subscriptions']
              for (const c of categories.filter((x) => x.kind === 'expense')) {
                const group = needs.includes(c.id) ? templates.fifty / 5 : wants.includes(c.id) ? templates.thirty / 5 : 0
                if (group > 0) setBudget(c.id, Math.round(group))
              }
            }}
          >
            <Wand2 size={14} /> 50/30/20
          </button>
          <button
            className="btn sm"
            title="Carry each unspent budget into the next month"
            onClick={() => {
              for (const r of rows) setBudget(r.categoryId, r.limit, { rollover: true, rolloverAmount: Math.max(0, Math.round(r.remaining)) })
            }}
          >
            <Repeat size={14} /> Roll over leftovers
          </button>
          <button className="btn primary" onClick={() => setAdding(true)} disabled={!unbudgeted.length}>
            <Plus size={16} /> New budget
          </button>
        </div>
      </div>

      <div className="grid dash-grid">
        <Card className="col-4">
          <div className="flex" style={{ gap: 18 }}>
            <Gauge pct={totalLimit ? (totalSpent / totalLimit) * 100 : 0} color={totalSpent > totalLimit ? 'var(--red)' : 'var(--primary)'} size={110} stroke={10}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>{totalLimit ? Math.round((totalSpent / totalLimit) * 100) : 0}%</div>
                <div className="muted" style={{ fontSize: 10, fontWeight: 500 }}>
                  used
                </div>
              </div>
            </Gauge>
            <div className="stack" style={{ gap: 4 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Budgeted spend
              </div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>
                <Money value={totalSpent} />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                of {money(totalLimit)} · {money(Math.max(0, totalLimit - totalSpent))} left
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {Math.round(monthPct)}% of the month elapsed
              </div>
            </div>
          </div>
        </Card>
        <Card className="col-4">
          <div className="muted" style={{ fontSize: 12 }}>
            All expenses this month
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, margin: '4px 0' }}>
            <Money value={monthTotals.expense} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {money(Math.max(0, monthTotals.expense - totalSpent))} outside budgets
          </div>
          <div className="progress" style={{ marginTop: 14 }}>
            <span style={{ width: `${monthTotals.expense ? Math.min(100, (totalSpent / monthTotals.expense) * 100) : 0}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Share of spending covered by budgets
          </div>
        </Card>
        <Card className="col-4" title="Burn-down" sub="Ideal pace vs what you actually spent">
          <div style={{ height: 120 }}>
            <ResponsiveContainer>
              <AreaChart data={burnDown} margin={{ left: -22, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" {...axisProps} interval={9} />
                <YAxis {...axisProps} tickFormatter={(v) => money(v, { notation: 'compact', maximumFractionDigits: 0 })} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} />} />
                <Area type="monotone" dataKey="ideal" name="Ideal remaining" stroke="var(--muted)" strokeDasharray="4 4" fill="none" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="actual" name="Actual remaining" stroke="#e05be0" strokeWidth={2} fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <LineChartIcon size={12} /> Below the dotted line means you are ahead of budget.
          </div>
        </Card>

        <Card className="col-4">
          <div className="muted" style={{ fontSize: 12 }}>
            Status
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {[
              ['On track', rows.filter((r) => r.pct < 80).length, 'var(--green)'],
              ['Close to limit', rows.filter((r) => r.pct >= 80 && r.pct < 100).length, 'var(--amber)'],
              ['Over budget', rows.filter((r) => r.pct >= 100).length, 'var(--red)'],
            ].map(([l, n, c]) => (
              <div className="flex between" key={String(l)} style={{ fontSize: 13 }}>
                <span className="flex" style={{ gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: String(c) }} />
                  {l}
                </span>
                <b>{n}</b>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-12" title="Category budgets">
          {rows.length === 0 ? (
            <Empty
              title="No budgets set"
              hint="Create a monthly limit per category to track your spending."
              action={
                <button className="btn primary" onClick={() => setAdding(true)}>
                  <Plus size={14} /> New budget
                </button>
              }
            />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {rows.map((r) => (
                <BudgetRow
                  key={r.id}
                  row={r}
                  monthPct={monthPct}
                  onChange={(v) => setBudget(r.categoryId, v)}
                  onToggleRollover={() => setBudget(r.categoryId, r.limit, { rollover: !r.rollover })}
                  onDelete={() => confirmDelete(`the ${r.category!.name} budget`) && deleteBudget(r.id)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {adding && (
        <Modal title="New budget" onClose={() => setAdding(false)}>
          <NewBudgetForm
            categories={unbudgeted}
            onSave={(cid, limit) => {
              setBudget(cid, limit)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </Modal>
      )}
    </div>
  )
}

function BudgetRow({
  row,
  monthPct,
  onChange,
  onToggleRollover,
  onDelete,
}: {
  row: ReturnType<typeof budgetProgress>[number]
  monthPct: number
  onChange: (v: number) => void
  onToggleRollover: () => void
  onDelete: () => void
}) {
  const money = useMoney()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(row.limit))
  const color = row.pct >= 100 ? 'var(--red)' : row.pct >= 80 ? 'var(--orange)' : row.category!.color
  const pace = row.pct - monthPct // positive => spending faster than month is passing
  return (
    <div className="subtle-panel">
      <div className="flex between">
        <div className="flex">
          <span className="tx-icon" style={{ background: `${row.category!.color}22` }}>
            {row.category!.icon}
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>{row.category!.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {row.remaining >= 0 ? `${money(row.remaining)} left` : `${money(-row.remaining)} over`}
            </div>
          </div>
        </div>
        <button className="mini-btn danger" onClick={onDelete} aria-label="Delete budget">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex between" style={{ margin: '14px 0 6px', fontSize: 13 }}>
        <span>
          <b>{money(row.spent)}</b>{' '}
          <span className="muted">
            of{' '}
            {editing ? (
              <input
                className="input"
                type="number"
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={() => {
                  setEditing(false)
                  if (Number(val) > 0) onChange(Number(val))
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ width: 90, padding: '2px 8px', display: 'inline-block' }}
              />
            ) : (
              <button className="link" onClick={() => setEditing(true)} title="Click to edit limit">
                {money(row.limitWithRollover)}
              </button>
            )}
          </span>
        </span>
        <span style={{ color, fontWeight: 600 }}>{Math.round(row.pct)}%</span>
      </div>
      <div className={`progress ${row.pct >= 100 ? 'over' : ''}`} style={{ position: 'relative' }}>
        <span style={{ width: `${Math.min(100, row.pct)}%`, background: row.pct >= 100 ? undefined : color }} />
        <i
          title="Month progress"
          style={{
            position: 'absolute',
            left: `${monthPct}%`,
            top: -3,
            width: 2,
            height: 14,
            background: 'var(--text)',
            opacity: 0.5,
            borderRadius: 2,
          }}
        />
      </div>
      <div className="flex between" style={{ marginTop: 8 }}>
        <div className="muted" style={{ fontSize: 11 }}>
          {row.pct >= 100 ? 'Over budget' : pace > 10 ? 'Spending faster than the month' : pace < -10 ? 'Well under pace' : 'On pace'}
          {row.rolloverIn ? ` · +${money(row.rolloverIn)} rolled over` : ''}
        </div>
        <button className={`btn sm ghost ${row.rollover ? 'on' : ''}`} style={{ color: row.rollover ? 'var(--primary-2)' : undefined }} onClick={onToggleRollover} title="Carry this month's leftover into next month">
          <Repeat size={12} /> {row.rollover ? 'Rolls over' : 'Rollover'}
        </button>
      </div>
    </div>
  )
}

function NewBudgetForm({
  categories,
  onSave,
  onCancel,
}: {
  categories: { id: string; name: string; icon: string }[]
  onSave: (cid: string, limit: number) => void
  onCancel: () => void
}) {
  const [cid, setCid] = useState(categories[0]?.id ?? '')
  const [limit, setLimit] = useState('')
  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (cid && Number(limit) > 0) onSave(cid, Number(limit))
      }}
    >
      <div className="field">
        <label>Category</label>
        <select className="select" value={cid} onChange={(e) => setCid(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Monthly limit</label>
        <input className="input" type="number" min="1" step="1" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="500" autoFocus />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Create budget
        </button>
      </div>
    </form>
  )
}
