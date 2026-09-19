import { useMemo, useState } from 'react'
import { Download, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useConverter, useStore } from '../store'
import type { Transaction, TxType } from '../lib/types'
import { csvEscape, downloadFile, fmtDateLong, groupBy, lastNMonths, monthLabel, sum, today, monthKey } from '../lib/utils'
import { txBase } from '../lib/analytics'
import { Card, Empty, Money, confirmDelete } from '../components/ui'
import { TransactionModal } from '../components/TransactionModal'

const PAGE = 50

export function Transactions({ search }: { search: string }) {
  const { transactions, categories, accounts, deleteTransaction, deleteTransactions, updateTransaction, settings } = useStore()
  const conv = useConverter()
  const [type, setType] = useState<'all' | TxType>('all')
  const [cat, setCat] = useState('all')
  const [acc, setAcc] = useState('all')
  const [month, setMonth] = useState('all')
  const [tag, setTag] = useState('all')
  const [editing, setEditing] = useState<Transaction | null | 'new'>(null)
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const months = useMemo(() => {
    const keys = new Set(transactions.map((t) => monthKey(t.date)))
    for (const k of lastNMonths(3)) keys.add(k)
    return [...keys].sort().reverse()
  }, [transactions])
  const allTags = useMemo(() => [...new Set(transactions.flatMap((t) => t.tags ?? []))].sort(), [transactions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return transactions
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => cat === 'all' || t.categoryId === cat || t.splits?.some((s) => s.categoryId === cat))
      .filter((t) => acc === 'all' || t.accountId === acc || t.toAccountId === acc)
      .filter((t) => month === 'all' || monthKey(t.date) === month)
      .filter((t) => tag === 'all' || t.tags?.includes(tag))
      .filter((t) => {
        if (!q) return true
        if (q.startsWith('#')) return t.tags?.some((x) => x.includes(q.slice(1))) ?? false
        const c = categories.find((x) => x.id === t.categoryId)
        return t.payee.toLowerCase().includes(q) || t.note.toLowerCase().includes(q) || (c?.name.toLowerCase().includes(q) ?? false) || String(t.amount).includes(q) || (t.tags?.some((x) => x.includes(q)) ?? false)
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [transactions, type, cat, acc, month, tag, search, categories])

  const shown = filtered.slice(0, limit)
  const groups = groupBy(shown, (t) => t.date)
  const income = sum(filtered.filter((t) => t.type === 'income').map((t) => txBase(t, accounts, conv)))
  const expense = sum(filtered.filter((t) => t.type === 'expense').map((t) => txBase(t, accounts, conv)))

  const exportCsv = () => {
    const rows = [
      ['date', 'type', 'payee', 'category', 'account', 'to_account', 'amount', 'currency', 'tags', 'note'],
      ...filtered.map((t) => [
        t.date,
        t.type,
        t.payee,
        categories.find((c) => c.id === t.categoryId)?.name ?? '',
        accounts.find((a) => a.id === t.accountId)?.name ?? '',
        accounts.find((a) => a.id === t.toAccountId)?.name ?? '',
        t.type === 'expense' ? -t.amount : t.amount,
        accounts.find((a) => a.id === t.accountId)?.currency ?? '',
        (t.tags ?? []).join(' '),
        t.note,
      ]),
    ]
    downloadFile(`transactions-${today()}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv')
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const bulkCategory = (cid: string) => {
    for (const id of selected) updateTransaction(id, { categoryId: cid })
    setSelected(new Set())
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpi-inline">
        <div>
          <div className="l">Income</div>
          <div className="v" style={{ color: 'var(--green)' }}>
            <Money value={income} />
          </div>
        </div>
        <div>
          <div className="l">Expenses</div>
          <div className="v" style={{ color: 'var(--accent)' }}>
            <Money value={expense} />
          </div>
        </div>
        <div>
          <div className="l">Net</div>
          <div className="v">
            <Money value={income - expense} signed />
          </div>
        </div>
        <div>
          <div className="l">Count</div>
          <div className="v">{filtered.length}</div>
        </div>
      </div>

      <Card
        title={`${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`}
        sub={search ? `Matching “${search}”` : 'Tip: search “#tag” to filter by tag'}
        action={
          <div className="flex">
            <button className="btn sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download size={14} /> CSV
            </button>
            <button className="btn primary sm" onClick={() => setEditing('new')}>
              <Plus size={14} /> New
            </button>
          </div>
        }
      >
        <div className="filters">
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All time</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, false)}
              </option>
            ))}
          </select>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="transfer">Transfers</option>
          </select>
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <select className="select" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className="select" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="all">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
          <button
            className="btn ghost"
            onClick={() => {
              setType('all')
              setCat('all')
              setAcc('all')
              setMonth('all')
              setTag('all')
            }}
          >
            Reset
          </button>
        </div>

        {selected.size > 0 && (
          <div className="subtle-panel flex between" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 13 }}>
              <b>{selected.size}</b> selected
            </span>
            <div className="flex">
              <select className="select" style={{ width: 'auto', padding: '6px 10px' }} defaultValue="" onChange={(e) => e.target.value && bulkCategory(e.target.value)}>
                <option value="" disabled>
                  Set category…
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              <button
                className="btn danger sm"
                onClick={() => {
                  if (confirmDelete(`${selected.size} transactions`)) {
                    deleteTransactions([...selected])
                    setSelected(new Set())
                  }
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
              <button className="mini-btn" onClick={() => setSelected(new Set())}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <Empty
            title="Nothing here"
            hint="Try a different filter or add a new transaction."
            action={
              <button className="btn primary" onClick={() => setEditing('new')}>
                <Plus size={14} /> Add transaction
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 30 }} />
                  <th>Payee</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Tags / note</th>
                  <th className="num">Amount</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {Object.entries(groups).map(([date, rows]) => (
                  <GroupRows key={date} date={date} rows={rows} selected={selected} onToggle={toggle} onEdit={setEditing} onDelete={(t) => confirmDelete(`“${t.payee}”`) && deleteTransaction(t.id)} locale={settings.locale} />
                ))}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div style={{ textAlign: 'center', padding: 14 }}>
                <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({filtered.length - limit} left)
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {editing && <TransactionModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function GroupRows({
  date,
  rows,
  selected,
  onToggle,
  onEdit,
  onDelete,
  locale,
}: {
  date: string
  rows: Transaction[]
  selected: Set<string>
  onToggle: (id: string) => void
  onEdit: (t: Transaction) => void
  onDelete: (t: Transaction) => void
  locale: string
}) {
  const { categories, accounts } = useStore()
  const conv = useConverter()
  const dayNet = sum(rows.map((t) => (t.type === 'income' ? txBase(t, accounts, conv) : t.type === 'expense' ? -txBase(t, accounts, conv) : 0)))
  return (
    <>
      <tr>
        <td colSpan={7} style={{ background: 'var(--panel-2)', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', padding: '7px 12px' }}>
          <span>{fmtDateLong(date, locale)}</span>
          <span className="muted" style={{ float: 'right', fontWeight: 500 }}>
            <Money value={dayNet} signed />
          </span>
        </td>
      </tr>
      {rows.map((t) => {
        const c = categories.find((x) => x.id === t.categoryId)
        const a = accounts.find((x) => x.id === t.accountId)
        const to = accounts.find((x) => x.id === t.toAccountId)
        const isTransfer = t.type === 'transfer'
        return (
          <tr key={t.id} className={selected.has(t.id) ? 'selected' : ''}>
            <td>
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => onToggle(t.id)} style={{ accentColor: 'var(--primary)' }} />
            </td>
            <td>
              <div className="flex">
                <span className="tx-icon" style={{ width: 32, height: 32, fontSize: 13 }}>
                  {isTransfer ? '⇄' : (c?.icon ?? '•')}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.payee}</div>
                  {t.recurringId && (
                    <div className="muted" style={{ fontSize: 10.5 }}>
                      recurring
                    </div>
                  )}
                </div>
              </div>
            </td>
            <td>
              {isTransfer ? (
                <span className="pill" style={{ color: 'var(--primary-2)' }}>
                  Transfer
                </span>
              ) : t.splits?.length ? (
                <span className="pill" title={t.splits.map((s) => `${categories.find((c) => c.id === s.categoryId)?.name}: ${s.amount}`).join(', ')}>
                  <span className="sw" style={{ background: 'var(--yellow)' }} />
                  Split ({t.splits.length})
                </span>
              ) : (
                <span className="pill">
                  <span className="sw" style={{ background: c?.color ?? '#6b7280' }} />
                  {c?.name ?? 'Uncategorised'}
                </span>
              )}
            </td>
            <td className="muted">{isTransfer ? `${a?.name ?? '?'} → ${to?.name ?? '?'}` : (a?.name ?? '—')}</td>
            <td>
              <div className="flex wrap" style={{ gap: 4 }}>
                {(t.tags ?? []).map((x) => (
                  <span className="tag" key={x}>
                    #{x}
                  </span>
                ))}
                {t.note && (
                  <span className="muted" style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.note}
                  </span>
                )}
              </div>
            </td>
            <td className={`num tx-amount ${t.type === 'income' ? 'pos' : isTransfer ? 'transfer' : 'neg'}`}>
              <Money value={t.type === 'expense' ? -t.amount : t.amount} currency={a?.currency} signed={!isTransfer} />
            </td>
            <td>
              <div className="row-actions">
                <button className="mini-btn" onClick={() => onEdit(t)} aria-label="Edit">
                  <Pencil size={14} />
                </button>
                <button className="mini-btn danger" onClick={() => onDelete(t)} aria-label="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
