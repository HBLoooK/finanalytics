import { useMemo, useState } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import { Modal } from './ui'
import { useStore } from '../store'
import type { Split, Transaction, TxType } from '../lib/types'
import { parseTags, round2, sum, today } from '../lib/utils'
import { applyRules } from '../lib/rules'

export function TransactionModal({ initial, onClose }: { initial?: Partial<Transaction> | null; onClose: () => void }) {
  const { accounts, categories, rules, addTransaction, updateTransaction, transactions } = useStore()
  const isEdit = Boolean(initial?.id)
  const [type, setType] = useState<TxType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? today())
  const [payee, setPayee] = useState(initial?.payee ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? accounts.find((a) => a.id !== (initial?.accountId ?? accounts[0]?.id))?.id ?? '')
  const [categoryId, setCategoryId] = useState<string>(initial?.categoryId ?? '')
  const [splits, setSplits] = useState<Split[]>(initial?.splits ?? [])
  const [useSplits, setUseSplits] = useState((initial?.splits?.length ?? 0) > 0)
  const [error, setError] = useState('')

  const cats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
  const effectiveCategory = cats.some((c) => c.id === categoryId) ? categoryId : (cats[0]?.id ?? '')
  const account = accounts.find((a) => a.id === accountId)
  const amt = Number(amount) || 0
  const splitTotal = round2(sum(splits.map((s) => Number(s.amount) || 0)))
  const splitRemaining = round2(amt - splitTotal)

  const payeeSuggestions = useMemo(() => {
    const seen = new Map<string, string | null>()
    for (const t of transactions) if (t.type !== 'transfer' && !seen.has(t.payee)) seen.set(t.payee, t.categoryId)
    return seen
  }, [transactions])

  const suggestFromPayee = (p: string) => {
    setPayee(p)
    if (isEdit) return
    const r = applyRules(rules, { payee: p, note, categoryId: null, tags: [], type, amount: Number(amount) || 0, date, accountId })
    if (r.rule) {
      if (r.rule.categoryId) setCategoryId(r.rule.categoryId)
      if (r.rule.tags.length) setTags((t) => [...new Set([...parseTags(t), ...r.rule!.tags])].join(', '))
      return
    }
    const known = payeeSuggestions.get(p)
    if (known) setCategoryId(known)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amt || amt <= 0) return setError('Enter an amount greater than zero.')
    if (!accountId) return setError('Choose an account.')
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError('Choose a different destination account.')
    if (useSplits && type === 'expense') {
      if (splits.length < 2) return setError('Add at least two split lines, or turn splits off.')
      if (Math.abs(splitRemaining) > 0.005) return setError(`Splits must add up to the total (${splitRemaining > 0 ? 'missing' : 'over by'} ${Math.abs(splitRemaining).toFixed(2)}).`)
    }
    const payload: Omit<Transaction, 'id'> = {
      type,
      amount: round2(amt),
      date,
      payee: payee.trim() || (type === 'transfer' ? 'Transfer' : (cats.find((c) => c.id === effectiveCategory)?.name ?? 'Transaction')),
      note: note.trim(),
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : useSplits && type === 'expense' ? (splits[0]?.categoryId ?? effectiveCategory) : effectiveCategory || null,
      tags: parseTags(tags),
      splits: useSplits && type === 'expense' ? splits.map((s) => ({ ...s, amount: round2(Number(s.amount)) })) : undefined,
      recurringId: initial?.recurringId ?? null,
    }
    if (isEdit && initial?.id) updateTransaction(initial.id, payload)
    else addTransaction(payload)
    onClose()
  }

  return (
    <Modal title={isEdit ? 'Edit transaction' : 'New transaction'} onClose={onClose}>
      <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
        <div className="type-toggle">
          {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
            <button type="button" key={t} className={`${t} ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Amount {account && account.currency !== useStore.getState().settings.currency ? `(${account.currency})` : ''}</label>
            <input className="input" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus style={{ fontSize: 18, fontWeight: 600 }} />
          </div>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>{type === 'transfer' ? 'From account' : 'Account'}</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
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
                      {a.name} ({a.currency})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Category</label>
              <select className="select" value={effectiveCategory} onChange={(e) => setCategoryId(e.target.value)} disabled={useSplits && type === 'expense'}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field full">
            <label>{type === 'income' ? 'Source' : 'Payee'}</label>
            <input className="input" list="payee-list" placeholder={type === 'income' ? 'e.g. Employer' : 'e.g. Whole Foods'} value={payee} onChange={(e) => suggestFromPayee(e.target.value)} />
            <datalist id="payee-list">
              {[...payeeSuggestions.keys()].slice(0, 200).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Tags (comma separated)</label>
            <input className="input" placeholder="e.g. travel, work" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="field">
            <label>Note</label>
            <input className="input" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {type === 'expense' && (
          <div className="subtle-panel">
            <label className="check">
              <input type="checkbox" checked={useSplits} onChange={(e) => setUseSplits(e.target.checked)} />
              Split across categories
            </label>
            {useSplits && (
              <div className="stack" style={{ marginTop: 10 }}>
                {splits.map((s, i) => (
                  <div className="flex" key={i}>
                    <select className="select" value={s.categoryId} onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                    </select>
                    <input className="input" type="number" step="0.01" style={{ width: 120 }} value={s.amount} onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
                    <button type="button" className="mini-btn danger" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex between">
                  <button type="button" className="btn sm" onClick={() => setSplits([...splits, { categoryId: cats[0]?.id ?? '', amount: Math.max(0, splitRemaining), note: '' }])}>
                    <Plus size={13} /> Add line
                  </button>
                  <span className="muted" style={{ fontSize: 12, color: Math.abs(splitRemaining) > 0.005 ? 'var(--orange)' : 'var(--green)' }}>
                    {Math.abs(splitRemaining) > 0.005 ? `${splitRemaining > 0 ? 'Unallocated' : 'Over'}: ${Math.abs(splitRemaining).toFixed(2)}` : 'Balanced'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {!isEdit && type !== 'transfer' && (
          <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wand2 size={13} /> Category auto-suggested from your rules and past payees.
          </div>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {isEdit ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
