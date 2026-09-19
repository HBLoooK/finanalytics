// Mobile quick-add sheet: numeric keypad, last-used account/category chips, "same as last time".
import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useStore } from '../store'
import { parseTags, round2, today } from '../lib/utils'
import { applyRules } from '../lib/rules'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { accounts, categories, transactions, rules, addTransaction, settings } = useStore()
  const [value, setValue] = useState('')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [payee, setPayee] = useState('')
  const [accountId, setAccountId] = useState(accounts.find((a) => !a.archived)?.id ?? accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const recentAccounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of transactions.slice(0, 200)) counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => accounts.find((a) => a.id === id)).filter(Boolean)
  }, [transactions, accounts])

  /** Most frequent payees for the chosen type, with the category they are usually booked to. */
  const recentPayees = useMemo(() => {
    const map = new Map<string, { count: number; categoryId: string | null; accountId: string }>()
    for (const t of transactions) {
      if (t.type !== type) continue
      const cur = map.get(t.payee) ?? { count: 0, categoryId: t.categoryId, accountId: t.accountId }
      cur.count++
      map.set(t.payee, cur)
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([payee, v]) => ({ payee, ...v }))
  }, [transactions, type])

  const cats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
  const amount = Number(value) || 0

  const press = (k: string) => {
    if (k === '⌫') return setValue((v) => v.slice(0, -1))
    if (k === '.' && value.includes('.')) return
    setValue((v) => (v === '0' ? k : v + k))
  }

  const save = () => {
    if (!(amount > 0)) return
    const { tx } = applyRules(rules, { payee, note: '', categoryId, tags: [], type, amount, date: today(), accountId })
    addTransaction({
      type,
      amount: round2(amount),
      date: today(),
      accountId,
      toAccountId: null,
      categoryId: tx.categoryId ?? cats[0]?.id ?? null,
      payee: payee.trim() || (cats.find((c) => c.id === tx.categoryId)?.name ?? 'Quick add'),
      note: '',
      tags: parseTags(payee),
      status: 'cleared',
    })
    setDone(true)
    setTimeout(onClose, 700)
  }

  return (
    <div className="modal-backdrop quick-add-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-add" role="dialog" aria-modal aria-label="Quick add">
        <div className="quick-head">
          <div className="type-toggle" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className={`expense ${type === 'expense' ? 'active' : ''}`} onClick={() => setType('expense')}>
              Expense
            </button>
            <button className={`income ${type === 'income' ? 'active' : ''}`} onClick={() => setType('income')}>
              Income
            </button>
          </div>
          <button className="mini-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="quick-amount mono">
          {value || '0'}
          <span className="cur">{settings.currency}</span>
        </div>

        {recentPayees.length > 0 && (
          <div className="quick-chips">
            {recentPayees.map((p) => (
              <button
                key={p.payee}
                className={`chip ${payee === p.payee ? 'on' : ''}`}
                onClick={() => {
                  setPayee(p.payee)
                  if (p.categoryId) setCategoryId(p.categoryId)
                  setAccountId(p.accountId || accountId)
                }}
              >
                {p.payee}
              </button>
            ))}
          </div>
        )}

        <input className="input" placeholder="Payee (optional)" value={payee} onChange={(e) => setPayee(e.target.value)} />

        <div className="quick-chips">
          {(recentAccounts.length ? recentAccounts : accounts.slice(0, 3)).map((a) => (
            <button key={a!.id} className={`chip ${accountId === a!.id ? 'on' : ''}`} onClick={() => setAccountId(a!.id)}>
              {a!.name}
            </button>
          ))}
        </div>
        <div className="quick-chips">
          {cats.slice(0, 8).map((c) => (
            <button key={c.id} className={`chip ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div className="quick-keys">
          {KEYS.map((k) => (
            <button key={k} className="key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
        </div>

        <button className="btn primary quick-save" onClick={save} disabled={!(amount > 0)}>
          {done ? <Check size={16} /> : null} {done ? 'Saved' : `Save ${type === 'expense' ? 'expense' : 'income'}`}
        </button>
      </div>
    </div>
  )
}
