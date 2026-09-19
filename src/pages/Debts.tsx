import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store'
import type { Debt } from '../lib/types'
import { CATEGORY_COLORS } from '../lib/seed'
import { debtStrategy, payoffPlan } from '../lib/analytics'
import { fmtCompact, fmtDate, today } from '../lib/utils'
import { Card, ChartTooltip, Empty, Modal, Money, Segmented, axisProps, confirmDelete, useMoney } from '../components/ui'

const KINDS: Debt['kind'][] = ['credit_card', 'loan', 'mortgage', 'student', 'personal', 'other']
const kindLabel = (k: string) => k.replace('_', ' ').replace(/^\w/, (m) => m.toUpperCase())

export function Debts() {
  const { debts, debtPayments, accounts, settings, addDebt, updateDebt, deleteDebt, payDebt } = useStore()
  const money = useMoney()
  const [editing, setEditing] = useState<Debt | 'new' | null>(null)
  const [paying, setPaying] = useState<Debt | null>(null)
  const [extra, setExtra] = useState('200')
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche')

  const active = useMemo(() => debts.filter((d) => d.balance > 0), [debts])
  const total = active.reduce((s, d) => s + d.balance, 0)
  const principal = debts.reduce((s, d) => s + d.principal, 0)
  const minTotal = active.reduce((s, d) => s + d.minPayment, 0)
  const monthlyInterest = active.reduce((s, d) => s + (d.balance * d.apr) / 100 / 12, 0)
  const plan = useMemo(() => debtStrategy(active, Number(extra) || 0, strategy), [active, extra, strategy])
  const baseline = useMemo(() => debtStrategy(active, 0, strategy), [active, strategy])

  const projection = useMemo(() => {
    // combined balance curve with minimums + extra (approximation: sum of individual plans with extra to first target)
    const out: { month: number; balance: number }[] = []
    const bals = new Map(active.map((d) => [d.id, d.balance]))
    const order = [...active].sort((a, b) => (strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance))
    for (let m = 0; m <= Math.min(plan.months, 360); m++) {
      out.push({ month: m, balance: [...bals.values()].reduce((s, b) => s + Math.max(0, b), 0) })
      let pool = Number(extra) || 0
      for (const d of order) {
        const b = bals.get(d.id)!
        if (b <= 0) {
          pool += d.minPayment
          continue
        }
        bals.set(d.id, b + (b * d.apr) / 100 / 12 - d.minPayment)
      }
      for (const d of order) {
        const b = bals.get(d.id)!
        if (b <= 0 || pool <= 0) continue
        const p = Math.min(pool, b)
        bals.set(d.id, b - p)
        pool -= p
      }
    }
    return out
  }, [active, extra, strategy, plan.months])

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpi-inline">
        <div>
          <div className="l">Total owed</div>
          <div className="v" style={{ color: 'var(--red)' }}>
            <Money value={total} />
          </div>
        </div>
        <div>
          <div className="l">Paid off</div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {principal ? Math.round(((principal - total) / principal) * 100) : 0}% <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>of {money(principal, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div>
          <div className="l">Minimums / month</div>
          <div className="v">
            <Money value={minTotal} />
          </div>
        </div>
        <div>
          <div className="l">Interest this month</div>
          <div className="v" style={{ color: 'var(--orange)' }}>
            <Money value={monthlyInterest} />
          </div>
        </div>
      </div>

      <div className="grid dash-grid">
        <Card
          className="col-7"
          title="Your debts"
          action={
            <button className="btn primary sm" onClick={() => setEditing('new')}>
              <Plus size={14} /> Add debt
            </button>
          }
        >
          {debts.length === 0 ? (
            <Empty title="Debt free 🎉" hint="Add a loan or credit card to plan its payoff." />
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {debts.map((d) => {
                const paid = d.principal ? ((d.principal - d.balance) / d.principal) * 100 : 0
                const p = payoffPlan(d.balance, d.apr, d.minPayment)
                const last = debtPayments.filter((x) => x.debtId === d.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
                return (
                  <div key={d.id} className="subtle-panel">
                    <div className="flex between">
                      <div className="flex">
                        <span className="tx-icon" style={{ background: `${d.color}22`, borderColor: `${d.color}55` }}>
                          💳
                        </span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{d.name}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {kindLabel(d.kind)} · {d.apr}% APR · due on the {d.dueDay}th
                            {last && ` · last paid ${fmtDate(last.date, settings.locale)}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex" style={{ gap: 6 }}>
                        <button className="btn sm" onClick={() => setPaying(d)} disabled={d.balance <= 0}>
                          <Wallet size={13} /> Pay
                        </button>
                        <button className="mini-btn" onClick={() => setEditing(d)}>
                          <Pencil size={13} />
                        </button>
                        <button className="mini-btn danger" onClick={() => confirmDelete(d.name) && deleteDebt(d.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="flex between" style={{ margin: '12px 0 6px', fontSize: 13 }}>
                      <span>
                        <b>{money(d.balance)}</b> <span className="muted">remaining of {money(d.principal, { maximumFractionDigits: 0 })}</span>
                      </span>
                      <span style={{ color: d.color, fontWeight: 600 }}>{Math.round(paid)}% paid</span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${paid}%`, background: d.color }} />
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                      {d.balance <= 0
                        ? 'Paid off 🎉'
                        : p.months === Infinity
                          ? `Minimum ${money(d.minPayment)} does not cover interest — increase it`
                          : `At ${money(d.minPayment)}/mo: paid off in ${p.months} months, ${money(p.interest, { maximumFractionDigits: 0 })} interest`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="col-5" title="Payoff planner" sub="Extra money on top of minimums">
          {active.length === 0 ? (
            <Empty title="Nothing to plan" />
          ) : (
            <>
              <div className="flex between wrap" style={{ marginBottom: 12 }}>
                <Segmented
                  value={strategy}
                  onChange={setStrategy}
                  options={[
                    { value: 'avalanche', label: 'Avalanche (highest APR)' },
                    { value: 'snowball', label: 'Snowball (smallest)' },
                  ]}
                />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Extra per month: {money(Number(extra) || 0)}</label>
                <input type="range" min="0" max="2000" step="25" value={extra} onChange={(e) => setExtra(e.target.value)} style={{ accentColor: 'var(--primary)', width: '100%' }} />
              </div>
              <div className="kpi-inline" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
                <div style={{ background: 'var(--panel-2)' }}>
                  <div className="l">Debt-free in</div>
                  <div className="v">
                    {plan.months} mo <span className="muted" style={{ fontSize: 11, fontWeight: 500 }}>(vs {baseline.months})</span>
                  </div>
                </div>
                <div style={{ background: 'var(--panel-2)' }}>
                  <div className="l">Interest saved</div>
                  <div className="v" style={{ color: 'var(--green)' }}>
                    <Money value={Math.max(0, baseline.interest - plan.interest)} digits={0} />
                  </div>
                </div>
              </div>
              <div style={{ height: 150 }}>
                <ResponsiveContainer>
                  <AreaChart data={projection} margin={{ left: -14, right: 4, top: 4 }}>
                    <defs>
                      <linearGradient id="dbt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e05be0" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#e05be0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="month" {...axisProps} tickFormatter={(v) => `${v}m`} />
                    <YAxis {...axisProps} tickFormatter={(v) => fmtCompact(v, settings.currency, settings.locale)} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => `Month ${l}`} />} />
                    <Area type="monotone" dataKey="balance" name="Balance" stroke="#e05be0" strokeWidth={2} fill="url(#dbt)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                {[...plan.payoffMonth.entries()]
                  .sort((a, b) => a[1] - b[1])
                  .map(([id, m]) => {
                    const d = debts.find((x) => x.id === id)!
                    return (
                      <div key={id} className="flex between" style={{ fontSize: 12.5 }}>
                        <span className="flex" style={{ gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: d.color }} />
                          {d.name}
                        </span>
                        <span className="muted">paid off in month {m}</span>
                      </div>
                    )
                  })}
              </div>
            </>
          )}
        </Card>

        {debtPayments.length > 0 && (
          <Card className="col-12" title="Payment history">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Debt</th>
                    <th>Note</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {debtPayments
                    .slice()
                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                    .slice(0, 20)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.date, settings.locale)}</td>
                        <td>{debts.find((d) => d.id === p.debtId)?.name ?? '—'}</td>
                        <td className="muted">{p.note || '—'}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {money(p.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {editing && (
        <DebtModal
          initial={editing === 'new' ? null : editing}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          onClose={() => setEditing(null)}
          onSave={(d) => {
            if (editing === 'new') addDebt(d)
            else updateDebt(editing.id, d)
            setEditing(null)
          }}
        />
      )}
      {paying && (
        <PayModal
          debt={paying}
          onClose={() => setPaying(null)}
          onSave={(amt, date, note, record) => {
            payDebt(paying.id, amt, date, note, record)
            setPaying(null)
          }}
        />
      )}
    </div>
  )
}

function DebtModal({ initial, accounts, onClose, onSave }: { initial: Debt | null; accounts: { id: string; name: string }[]; onClose: () => void; onSave: (d: Omit<Debt, 'id'>) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<Debt['kind']>(initial?.kind ?? 'loan')
  const [principal, setPrincipal] = useState(initial ? String(initial.principal) : '')
  const [balance, setBalance] = useState(initial ? String(initial.balance) : '')
  const [apr, setApr] = useState(initial ? String(initial.apr) : '')
  const [minPayment, setMinPayment] = useState(initial ? String(initial.minPayment) : '')
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 1))
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '')
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]!)
  return (
    <Modal title={initial ? 'Edit debt' : 'Add debt'} onClose={onClose}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onSave({ name: name.trim(), kind, principal: Number(principal) || Number(balance) || 0, balance: Number(balance) || 0, apr: Number(apr) || 0, minPayment: Number(minPayment) || 0, dueDay: Math.min(28, Math.max(1, Number(dueDay) || 1)), color, accountId: accountId || null })
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Debt['kind'])}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Original amount</label>
            <input className="input" type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </div>
          <div className="field">
            <label>Current balance</label>
            <input className="input" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div className="field">
            <label>APR %</label>
            <input className="input" type="number" step="0.01" value={apr} onChange={(e) => setApr(e.target.value)} />
          </div>
          <div className="field">
            <label>Minimum payment</label>
            <input className="input" type="number" step="0.01" value={minPayment} onChange={(e) => setMinPayment(e.target.value)} />
          </div>
          <div className="field">
            <label>Due day of month</label>
            <input className="input" type="number" min="1" max="28" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
          </div>
          <div className="field">
            <label>Pay from account</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— none —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label>Colour</label>
            <div className="flex wrap" style={{ gap: 6 }}>
              {CATEGORY_COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, outline: color === c ? '2px solid var(--text)' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {initial ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PayModal({ debt, onClose, onSave }: { debt: Debt; onClose: () => void; onSave: (amt: number, date: string, note: string, record: boolean) => void }) {
  const money = useMoney()
  const [amt, setAmt] = useState(String(debt.minPayment))
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [record, setRecord] = useState(Boolean(debt.accountId))
  return (
    <Modal title={`Pay ${debt.name}`} onClose={onClose} width={420}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (Number(amt) > 0) onSave(Number(amt), date, note, record)
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label>Amount (balance {money(debt.balance)})</label>
            <input className="input" type="number" step="0.01" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus style={{ fontSize: 18, fontWeight: 600 }} />
          </div>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field full">
            <label>Note</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex wrap" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => setAmt(String(debt.minPayment))}>
            Minimum
          </button>
          <button type="button" className="btn sm" onClick={() => setAmt(String(debt.minPayment * 2))}>
            Double
          </button>
          <button type="button" className="btn sm" onClick={() => setAmt(String(debt.balance))}>
            Pay off
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} disabled={!debt.accountId} />
          Also record an expense transaction from the linked account
        </label>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Record payment
          </button>
        </div>
      </form>
    </Modal>
  )
}
