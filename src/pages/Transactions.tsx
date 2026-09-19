import { useEffect, useMemo, useState } from 'react'
import { Download, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { useConverter, useStore } from '../store'
import type { Transaction, TxType } from '../lib/types'
import { csvEscape, downloadFile, fmtDateLong, groupBy, lastNMonths, monthLabel, sum, today, monthKey } from '../lib/utils'
import { txBase } from '../lib/analytics'
import { Card, Empty, Money, confirmDelete } from '../components/ui'
import { TransactionModal } from '../components/TransactionModal'
import { OPERATOR_HELP, matchQuery, parseQuery } from '../lib/search'
import { useToast } from '../components/Toasts'

const PAGE = 50

export function Transactions({ search }: { search: string }) {
  const { transactions, categories, accounts, deleteTransaction, deleteTransactions, updateTransaction, settings, addSavedView } = useStore()
  const conv = useConverter()
  const toast = useToast()
  const [type, setType] = useState<'all' | TxType>('all')
  const [cat, setCat] = useState('all')
  const [acc, setAcc] = useState('all')
  const [month, setMonth] = useState('all')
  const [tag, setTag] = useState('all')
  const [editing, setEditing] = useState<Transaction | null | 'new'>(null)
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showHelp, setShowHelp] = useState(false)
  const [viewName, setViewName] = useState('')

  const months = useMemo(() => {
    const keys = new Set(transactions.map((t) => monthKey(t.date)))
    for (const k of lastNMonths(3)) keys.add(k)
    return [...keys].sort().reverse()
  }, [transactions])
  const allTags = useMemo(() => [...new Set(transactions.flatMap((t) => t.tags ?? []))].sort(), [transactions])
  const q = useMemo(() => parseQuery(search), [search])

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => cat === 'all' || t.categoryId === cat || t.splits?.some((s) => s.categoryId === cat))
      .filter((t) => acc === 'all' || t.accountId === acc || t.toAccountId === acc)
      .filter((t) => month === 'all' || monthKey(t.date) === month)
      .filter((t) => tag === 'all' || t.tags?.includes(tag))
      .filter((t) => matchQuery(t, q, categories, accounts))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [transactions, type, cat, acc, month, tag, q, categories, accounts])

  const shown = filtered.slice(0, limit)
  const groups = groupBy(shown, (t) => t.date)
  const income = sum(filtered.filter((t) => t.type === 'income').map((t) => txBase(t, accounts, conv)))
  const expense = sum(filtered.filter((t) => t.type === 'expense').map((t) => txBase(t, accounts, conv)))
  const savedViews = settings.savedViews ?? []

  /** Keyboard navigation: J/K move, Enter edits, X selects, Delete removes. */
  const [cursor, setCursor] = useState(-1)
  useEffect(() => setCursor(-1), [search, type, cat, acc, month, tag])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(shown.length - 1, c + 1))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(0, c - 1))
      } else if (e.key === 'Enter' && cursor >= 0 && shown[cursor]) {
        e.preventDefault()
        setEditing(shown[cursor]!)
      } else if (e.key === 'x' && cursor >= 0 && shown[cursor]) {
        e.preventDefault()
        toggle(shown[cursor]!.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor, shown])

  const exportCsv = () => {
    const rows = [
      ['date', 'type', 'payee', 'category', 'account', 'to_account', 'amount', 'currency', 'status', 'tags', 'note'],
      ...filtered.map((t) => [
        t.date,
        t.type,
        t.payee,
        categories.find((c) => c.id === t.categoryId)?.name ?? '',
        accounts.find((a) => a.id === t.accountId)?.name ?? '',
        accounts.find((a) => a.id === t.toAccountId)?.name ?? '',
        t.type === 'expense' ? -t.amount : t.amount,
        accounts.find((a) => a.id === t.accountId)?.currency ?? '',
        t.status ?? 'cleared',
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
  const bulkStatus = (status: 'pending' | 'cleared') => {
    for (const id of selected) updateTransaction(id, { status })
    setSelected(new Set())
    toast(`Marked ${selected.size} as ${status}`)
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

      {savedViews.length > 0 && (
        <div className="saved-views">
          {savedViews.map((v) => (
            <span key={v.id} className={`saved-view`}>
              <button
                style={{ border: 0, background: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  window.location.hash = `#/transactions?q=${encodeURIComponent(v.query)}`
                  window.location.reload()
                }}
              >
                <Star size={12} /> {v.name}
              </button>
              <button
                className="x"
                aria-label="Delete view"
                onClick={() => {
                  const rest = savedViews.filter((x) => x.id !== v.id)
                  useStore.getState().updateSettings({ savedViews: rest })
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <Card
        title={`${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`}
        sub={search ? `Matching “${search}”` : 'Search with operators: >100, cat:food, before:2026-03, is:uncategorised'}
        action={
          <div className="flex">
            <button className="btn sm" onClick={() => setShowHelp((v) => !v)} title="Search operators">
              <Search size={13} /> Operators
            </button>
            <button className="btn sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download size={14} /> CSV
            </button>
            <button className="btn primary sm" onClick={() => setEditing('new')}>
              <Plus size={14} /> New
            </button>
          </div>
        }
      >
        {showHelp && (
          <div className="subtle-panel" style={{ marginBottom: 12 }}>
            <div className="operator-help">
              {OPERATOR_HELP.map(([k, v]) => (
                <div key={k}>
                  <code>{k}</code> <span className="muted">— {v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
                {a.archived ? ' (archived)' : ''}
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
          <input
            className="input"
            style={{ width: 'auto', flex: 1, minWidth: 140 }}
            placeholder="Save this filter as…"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && viewName.trim()) {
                addSavedView({ name: viewName.trim(), query: search, type, categoryId: cat, accountId: acc, month, tag })
                setViewName('')
                toast('View saved')
              }
            }}
          />
        </div>

        {selected.size > 0 && (
          <div className="subtle-panel flex between wrap" style={{ marginBottom: 12, gap: 8 }}>
            <span style={{ fontSize: 13 }}>
              <b>{selected.size}</b> selected
            </span>
            <div className="flex wrap" style={{ gap: 6 }}>
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
              <button className="btn sm" onClick={() => bulkStatus('cleared')}>
                Mark cleared
              </button>
              <button className="btn sm" onClick={() => bulkStatus('pending')}>
                Mark pending
              </button>
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
          <>
            <div className="table-wrap hide-table-on-mobile">
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
                  {Object.entries(groups).map(([date, rows], gi) => (
                    <GroupRows
                      key={date}
                      startIndex={Object.entries(groups).slice(0, gi).reduce((n, [, r]) => n + r.length, 0)}
                      date={date}
                      rows={rows}
                      selected={selected}
                      onToggle={toggle}
                      onEdit={setEditing}
                      onDelete={(t) => confirmDelete(`“${t.payee}”`) && deleteTransaction(t.id)}
                      locale={settings.locale}
                      cursorIndex={cursor}
                      onCursor={setCursor}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tx-cards">
              {Object.entries(groups).map(([date, rows]) => (
                <div key={date}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 0 4px' }}>
                    {fmtDateLong(date, settings.locale)}
                  </div>
                  {rows.map((t) => (
                    <CardRow key={t.id} t={t} selected={selected.has(t.id)} onToggle={() => toggle(t.id)} onEdit={() => setEditing(t)} onDelete={() => confirmDelete(`“${t.payee}”`) && deleteTransaction(t.id)} />
                  ))}
                </div>
              ))}
            </div>
            {filtered.length > limit && (
              <div style={{ textAlign: 'center', padding: 14 }}>
                <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({filtered.length - limit} left)
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {editing && <TransactionModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Phone layout: a swipeable card row instead of a table row. */
function CardRow({ t, selected, onToggle, onEdit, onDelete }: { t: Transaction; selected: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const { categories, accounts } = useStore()
  const [swipe, setSwipe] = useState(false)
  const startX = { current: 0 }
  const c = categories.find((x) => x.id === t.categoryId)
  const a = accounts.find((x) => x.id === t.accountId)
  const isTransfer = t.type === 'transfer'
  return (
    <div
      className={`tx-card ${swipe ? 'swiping' : ''}`}
      style={{ borderColor: selected ? 'var(--primary)' : undefined }}
      onTouchStart={(e) => (startX.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0]!.clientX - startX.current
        if (dx < -50) setSwipe(true)
        else if (dx > 50) setSwipe(false)
        else onToggle()
      }}
    >
      <span className="tx-icon" style={{ width: 34, height: 34, fontSize: 14 }}>
        {isTransfer ? '⇄' : (c?.icon ?? '•')}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.payee}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {isTransfer ? 'Transfer' : (c?.name ?? 'Uncategorised')} · {a?.name ?? '—'}
          {t.status === 'pending' && <span className="tag" style={{ marginLeft: 6 }}>pending</span>}
          {t.refundOf && <span className="tag" style={{ marginLeft: 6 }}>refund</span>}
        </div>
      </div>
      <div className={`tx-amount ${t.type === 'income' ? 'pos' : isTransfer ? 'transfer' : 'neg'}`}>
        <Money value={t.type === 'expense' ? -t.amount : t.amount} currency={a?.currency} signed={!isTransfer} />
      </div>
      {swipe ? (
        <div className="act">
          <button className="mini-btn" onClick={onEdit} aria-label="Edit">
            <Pencil size={14} />
          </button>
          <button className="mini-btn danger" onClick={onDelete} aria-label="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      ) : null}
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
  cursorIndex,
  onCursor,
  startIndex,
}: {
  startIndex: number
  date: string
  rows: Transaction[]
  selected: Set<string>
  onToggle: (id: string) => void
  onEdit: (t: Transaction) => void
  onDelete: (t: Transaction) => void
  locale: string
  cursorIndex: number
  onCursor: (i: number) => void
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
      {rows.map((t, ri) => {
        const shownIndex = startIndex + ri
        const c = categories.find((x) => x.id === t.categoryId)
        const a = accounts.find((x) => x.id === t.accountId)
        const to = accounts.find((x) => x.id === t.toAccountId)
        const isTransfer = t.type === 'transfer'
        return (
          <tr
            key={t.id}
            className={`${selected.has(t.id) ? 'selected' : ''} ${shownIndex === cursorIndex ? 'cursor' : ''}`.trim()}
            onMouseEnter={() => onCursor(shownIndex)}
          >
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
                  <div className="flex" style={{ gap: 5 }}>
                    {t.recurringId && (
                      <div className="muted" style={{ fontSize: 10.5 }}>
                        recurring
                      </div>
                    )}
                    {t.status === 'pending' && (
                      <span className="tag" style={{ fontSize: 10 }}>
                        pending
                      </span>
                    )}
                    {t.refundOf && (
                      <span className="tag" style={{ fontSize: 10 }}>
                        refund
                      </span>
                    )}
                    {t.owedBy && (
                      <span className="tag" style={{ fontSize: 10 }}>
                        owed by {t.owedBy}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </td>
            <td>
              {isTransfer ? (
                <span className="pill" style={{ color: 'var(--primary-2)' }}>
                  {t.investment ? `${t.investment.side === 'buy' ? 'Buy' : 'Sell'} ${t.investment.qty} @ ${t.investment.price}` : 'Transfer'}
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
            <td className="muted">{isTransfer && !t.investment ? `${a?.name ?? '?'} → ${to?.name ?? '?'}` : (a?.name ?? '—')}</td>
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
