import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useConverter, useStore } from '../store'
import { budgetProgress, inMonth, totals } from '../lib/analytics'
import { addMonths, monthKey, monthLabel, today, sum } from '../lib/utils'
import { Card, Empty, Gauge, Modal, Money, confirmDelete, useMoney } from '../components/ui'

export function Budgets() {
  const { budgets, transactions, categories, accounts, setBudget, deleteBudget } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const [month, setMonth] = useState(monthKey(today()))
  const [adding, setAdding] = useState(false)

  const rows = useMemo(
    () => budgetProgress(budgets, transactions, categories, accounts, conv, month).sort((a, b) => b.pct - a.pct),
    [budgets, transactions, categories, accounts, conv, month],
  )
  const totalLimit = sum(rows.map((r) => r.limit))
  const totalSpent = sum(rows.map((r) => r.spent))
  const monthTotals = totals(inMonth(transactions, month), accounts, conv)
  const unbudgeted = categories.filter((c) => c.kind === 'expense' && !budgets.some((b) => b.categoryId === c.id))

  const isCurrent = month === monthKey(today())
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const dayOfMonth = isCurrent ? new Date().getDate() : daysInMonth
  const monthPct = (dayOfMonth / daysInMonth) * 100

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
        <button className="btn primary" onClick={() => setAdding(true)} disabled={!unbudgeted.length}>
          <Plus size={16} /> New budget
        </button>
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
  onDelete,
}: {
  row: ReturnType<typeof budgetProgress>[number]
  monthPct: number
  onChange: (v: number) => void
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
                {money(row.limit)}
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
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        {row.pct >= 100 ? 'Over budget' : pace > 10 ? 'Spending faster than the month' : pace < -10 ? 'Well under pace' : 'On pace'}
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
