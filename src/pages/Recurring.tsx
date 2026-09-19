import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from 'lucide-react'
import { useConverter, useStore } from '../store'
import type { Frequency, Recurring, TxType } from '../lib/types'
import { monthlyCommitments, upcoming } from '../lib/analytics'
import { addMonths, daysInMonth, fmtDate, freqLabel, monthKey, monthLabel, nextOccurrence, parseTags, perMonthFactor, today } from '../lib/utils'
import { Card, Empty, Modal, Money, Tabs, confirmDelete, useMoney } from '../components/ui'

type View = 'upcoming' | 'calendar' | 'all'

export function RecurringPage() {
  const { recurring, accounts, categories, postRecurring, skipRecurring, updateRecurring, deleteRecurring, addRecurring, settings } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const [view, setView] = useState<View>('upcoming')
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null)
  const [calMonth, setCalMonth] = useState(monthKey(today()))

  const commitments = useMemo(() => monthlyCommitments(recurring, accounts, conv), [recurring, accounts, conv])
  const next30 = useMemo(() => upcoming(recurring, 30), [recurring])
  const overdue = next30.filter((u) => u.daysAway < 0)
  const subs = recurring.filter((r) => r.active && r.type === 'expense' && r.categoryId === 'c_subscriptions')
  const subsMonthly = subs.reduce((s, r) => s + conv(r.amount, accounts.find((a) => a.id === r.accountId)?.currency ?? '') * perMonthFactor[r.frequency], 0)

  // calendar
  const calEvents = useMemo(() => {
    const start = `${calMonth}-01`
    const end = `${calMonth}-${String(daysInMonth(calMonth)).padStart(2, '0')}`
    const map = new Map<string, Recurring[]>()
    for (const r of recurring) {
      if (!r.active) continue
      let d = r.nextDate
      // roll back to find occurrences before nextDate within this month is not possible; only forward
      let guard = 0
      while (d <= end && guard++ < 80) {
        if (d >= start) (map.get(d) ?? map.set(d, []).get(d))!.push(r)
        d = nextOccurrence(d, r.frequency)
      }
    }
    return map
  }, [recurring, calMonth])

  const catOf = (r: Recurring) => categories.find((c) => c.id === r.categoryId)
  const accOf = (r: Recurring) => accounts.find((a) => a.id === r.accountId)

  const firstDow = new Date(Number(calMonth.slice(0, 4)), Number(calMonth.slice(5, 7)) - 1, 1).getDay()
  const dim = daysInMonth(calMonth)
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpi-inline">
        <div>
          <div className="l">Monthly bills</div>
          <div className="v" style={{ color: 'var(--accent)' }}>
            <Money value={commitments.expense} />
          </div>
        </div>
        <div>
          <div className="l">Recurring income</div>
          <div className="v" style={{ color: 'var(--green)' }}>
            <Money value={commitments.income} />
          </div>
        </div>
        <div>
          <div className="l">Subscriptions</div>
          <div className="v">
            <Money value={subsMonthly} /> <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>/ mo · {subs.length}</span>
          </div>
        </div>
        <div>
          <div className="l">Due in 7 days</div>
          <div className="v" style={{ color: overdue.length ? 'var(--red)' : undefined }}>
            {next30.filter((u) => u.daysAway <= 7).length} {overdue.length > 0 && <span style={{ fontSize: 12 }}>({overdue.length} overdue)</span>}
          </div>
        </div>
      </div>

      <Card
        action={
          <button className="btn primary sm" onClick={() => setEditing('new')}>
            <Plus size={14} /> New recurring
          </button>
        }
        title="Schedule"
      >
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: 'Upcoming 30 days' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'all', label: `All (${recurring.length})` },
          ]}
        />

        {view === 'upcoming' &&
          (next30.length === 0 ? (
            <Empty title="Nothing scheduled" hint="Add rent, salary, subscriptions — anything that repeats." />
          ) : (
            <div className="tx-list">
              {next30.map((u, i) => {
                const c = catOf(u.rec)
                const late = u.daysAway < 0
                return (
                  <div className="tx-row" key={u.rec.id + u.date + i} style={{ gridTemplateColumns: '38px 1fr auto auto', '--i': i } as React.CSSProperties}>
                    <div className="tx-icon" style={{ borderColor: late ? 'var(--red)' : undefined }}>
                      {u.rec.type === 'transfer' ? '⇄' : (c?.icon ?? '•')}
                    </div>
                    <div className="tx-main">
                      <div className="tx-name">{u.rec.name}</div>
                      <div className="tx-meta">
                        <span style={{ color: late ? 'var(--red)' : u.daysAway === 0 ? 'var(--orange)' : undefined }}>
                          {late ? `${-u.daysAway}d overdue` : u.daysAway === 0 ? 'Today' : `in ${u.daysAway}d`}
                        </span>{' '}
                        · {fmtDate(u.date, settings.locale)} · {freqLabel[u.rec.frequency]} · {accOf(u.rec)?.name}
                        {u.rec.autoPost && <span className="tag" style={{ marginLeft: 6 }}>auto</span>}
                      </div>
                    </div>
                    <div className={`tx-amount ${u.rec.type === 'income' ? 'pos' : u.rec.type === 'transfer' ? 'transfer' : 'neg'}`}>
                      <Money value={u.rec.type === 'expense' ? -u.rec.amount : u.rec.amount} currency={accOf(u.rec)?.currency} signed={u.rec.type !== 'transfer'} />
                    </div>
                    <div className="flex" style={{ gap: 4 }}>
                      {u.date === u.rec.nextDate && (
                        <>
                          <button className="mini-btn" title="Mark as paid / post now" onClick={() => postRecurring(u.rec.id, u.date <= today() ? u.date : today())}>
                            <Check size={14} />
                          </button>
                          <button className="mini-btn" title="Skip this occurrence" onClick={() => skipRecurring(u.rec.id)}>
                            <SkipForward size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

        {view === 'calendar' && (
          <div>
            <div className="flex" style={{ marginBottom: 12 }}>
              <button className="icon-btn" onClick={() => setCalMonth((m) => addMonths(m, -1))}>
                <ChevronLeft size={16} />
              </button>
              <b style={{ minWidth: 150, textAlign: 'center' }}>{monthLabel(calMonth, false)}</b>
              <button className="icon-btn" onClick={() => setCalMonth((m) => addMonths(m, 1))}>
                <ChevronRight size={16} />
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Shows occurrences from each item's next due date onward
              </span>
            </div>
            <div className="calendar">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div className="dow" key={d}>
                  {d}
                </div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="day other" />
                const date = `${calMonth}-${String(day).padStart(2, '0')}`
                const evs = calEvents.get(date) ?? []
                const total = evs.reduce((s, r) => s + (r.type === 'expense' ? -r.amount : r.type === 'income' ? r.amount : 0), 0)
                return (
                  <div key={i} className={`day ${date === today() ? 'today' : ''}`}>
                    <div className="flex between">
                      <span>{day}</span>
                      {total !== 0 && (
                        <span style={{ color: total > 0 ? 'var(--green)' : 'var(--text-2)', fontSize: 10 }}>
                          {money(total, { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                    {evs.slice(0, 3).map((r) => (
                      <span key={r.id} className="ev" style={{ background: r.type === 'income' ? 'var(--green)' : r.type === 'transfer' ? 'var(--primary)' : (catOf(r)?.color ?? 'var(--accent)') }}>
                        {r.name}
                      </span>
                    ))}
                    {evs.length > 3 && <span className="muted">+{evs.length - 3}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'all' && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Frequency</th>
                  <th>Next</th>
                  <th>Account</th>
                  <th>Posting</th>
                  <th className="num">Amount</th>
                  <th className="num">/ month</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recurring
                  .slice()
                  .sort((a, b) => Number(b.active) - Number(a.active) || (a.nextDate < b.nextDate ? -1 : 1))
                  .map((r) => (
                    <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                      <td>
                        <div className="flex">
                          <span className="tx-icon" style={{ width: 30, height: 30, fontSize: 12 }}>
                            {r.type === 'transfer' ? '⇄' : (catOf(r)?.icon ?? '•')}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                            <div className="muted" style={{ fontSize: 11 }}>
                              {r.payee}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{freqLabel[r.frequency]}</td>
                      <td>{fmtDate(r.nextDate, settings.locale)}</td>
                      <td className="muted">{accOf(r)?.name}</td>
                      <td>{r.autoPost ? <span className="tag">auto</span> : <span className="muted">manual</span>}</td>
                      <td className={`num tx-amount ${r.type === 'income' ? 'pos' : r.type === 'transfer' ? 'transfer' : 'neg'}`}>
                        <Money value={r.type === 'expense' ? -r.amount : r.amount} currency={accOf(r)?.currency} signed={r.type !== 'transfer'} />
                      </td>
                      <td className="num muted">{money(conv(r.amount, accOf(r)?.currency ?? '') * perMonthFactor[r.frequency], { maximumFractionDigits: 0 })}</td>
                      <td>
                        <div className="row-actions show-actions" style={{ opacity: 1 }}>
                          <button className="mini-btn" title={r.active ? 'Pause' : 'Resume'} onClick={() => updateRecurring(r.id, { active: !r.active })}>
                            {r.active ? <Pause size={13} /> : <Play size={13} />}
                          </button>
                          <button className="mini-btn" onClick={() => setEditing(r)}>
                            <Pencil size={13} />
                          </button>
                          <button className="mini-btn danger" onClick={() => confirmDelete(`“${r.name}”`) && deleteRecurring(r.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <RecurringModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            if (editing === 'new') addRecurring(r)
            else updateRecurring(editing.id, r)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function RecurringModal({ initial, onClose, onSave }: { initial: Recurring | null; onClose: () => void; onSave: (r: Omit<Recurring, 'id'>) => void }) {
  const { accounts, categories } = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<TxType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'monthly')
  const [nextDate, setNextDate] = useState(initial?.nextDate ?? today())
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? accounts[1]?.id ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [payee, setPayee] = useState(initial?.payee ?? '')
  const [autoPost, setAutoPost] = useState(initial?.autoPost ?? true)
  const [remindDays, setRemindDays] = useState(String(initial?.remindDays ?? 3))
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const cats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
  const effCat = cats.some((c) => c.id === categoryId) ? categoryId : (cats[0]?.id ?? '')

  return (
    <Modal title={initial ? 'Edit recurring' : 'New recurring'} onClose={onClose}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || !(Number(amount) > 0)) return
          onSave({
            name: name.trim(),
            type,
            amount: Number(amount),
            frequency,
            nextDate,
            endDate: endDate || null,
            accountId,
            toAccountId: type === 'transfer' ? toAccountId : null,
            categoryId: type === 'transfer' ? null : effCat,
            payee: payee.trim() || name.trim(),
            note: initial?.note ?? '',
            autoPost,
            active: initial?.active ?? true,
            remindDays: Number(remindDays) || 0,
            tags: parseTags(tags),
          })
        }}
      >
        <div className="type-toggle">
          {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
            <button type="button" key={t} className={`${t} ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" autoFocus />
          </div>
          <div className="field">
            <label>Amount</label>
            <input className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Frequency</label>
            <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {(Object.keys(freqLabel) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {freqLabel[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Next due date</label>
            <input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{type === 'transfer' ? 'From account' : 'Account'}</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {type === 'transfer' ? (
            <div className="field">
              <label>To account</label>
              <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Category</label>
              <select className="select" value={effCat} onChange={(e) => setCategoryId(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Payee</label>
            <input className="input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Defaults to name" />
          </div>
          <div className="field">
            <label>End date (optional)</label>
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Remind me (days before)</label>
            <input className="input" type="number" min="0" value={remindDays} onChange={(e) => setRemindDays(e.target.value)} />
          </div>
          <div className="field">
            <label>Tags</label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="fixed, work" />
          </div>
          <label className="check full">
            <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
            Auto-post the transaction on the due date (otherwise you mark it as paid manually)
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {initial ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
