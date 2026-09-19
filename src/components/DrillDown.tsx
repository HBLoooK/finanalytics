// Side panel that opens when you click a chart element: the transactions behind that number.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, X } from 'lucide-react'
import { useConverter, useStore } from '../store'
import type { Transaction } from '../lib/types'
import { txBase } from '../lib/analytics'
import { fmtDateLong, sum } from '../lib/utils'
import { Money } from './ui'
import { PayeeDetails } from './PayeeDetails'

export interface DrillFilter {
  title: string
  subtitle?: string
  match: (t: Transaction) => boolean
}

export function DrillDown({ filter, onClose }: { filter: DrillFilter; onClose: () => void }) {
  const { transactions, accounts, categories, settings } = useStore()
  const conv = useConverter()
  const [payee, setPayee] = useState<string | null>(null)
  const rows = useMemo(() => transactions.filter(filter.match).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200), [transactions, filter])
  const total = sum(rows.map((t) => (t.type === 'expense' ? -txBase(t, accounts, conv) : t.type === 'income' ? txBase(t, accounts, conv) : 0)))

  return (
    <>
      <div className="drill-backdrop" onClick={onClose} />
      <aside className="drill-panel" role="dialog" aria-label={filter.title}>
        <div className="flex between" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 17 }}>{payee ? 'Payee' : filter.title}</h2>
            {filter.subtitle && (
              <div className="muted" style={{ fontSize: 12 }}>
                {filter.subtitle}
              </div>
            )}
          </div>
          <button className="mini-btn" onClick={payee ? () => setPayee(null) : onClose} aria-label={payee ? 'Back to list' : 'Close'}>
            <X size={16} />
          </button>
        </div>

        {payee ? (
          <PayeeDetails payee={payee} onClose={() => setPayee(null)} />
        ) : (
          <>
        <div className="flex between subtle-panel" style={{ marginBottom: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {rows.length} transaction{rows.length === 1 ? '' : 's'}
          </span>
          <b>
            <Money value={total} signed />
          </b>
        </div>

        {rows.length === 0 ? (
          <div className="empty">Nothing to show</div>
        ) : (
          <div className="tx-list">
            {rows.map((t) => {
              const c = categories.find((x) => x.id === t.categoryId)
              const a = accounts.find((x) => x.id === t.accountId)
              const isTransfer = t.type === 'transfer'
              return (
                <div className="tx-row" key={t.id}>
                  <div className="tx-icon">{isTransfer ? '⇄' : (c?.icon ?? '•')}</div>
                  <div className="tx-main">
                    <button className="tx-name link" style={{ border: 0, background: 'none', padding: 0, font: 'inherit', cursor: 'pointer', color: 'var(--text)' }} onClick={() => setPayee(t.payee)}>
                      {t.payee}
                    </button>
                    <div className="tx-meta">
                      {fmtDateLong(t.date, settings.locale)} · {c?.name ?? 'Uncategorised'}
                    </div>
                  </div>
                  <div className={`tx-amount ${t.type === 'income' ? 'pos' : isTransfer ? 'transfer' : 'neg'}`}>
                    <Money value={t.type === 'expense' ? -t.amount : t.amount} currency={a?.currency} signed={!isTransfer} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Link to="/transactions" className="btn sm" style={{ marginTop: 14 }}>
          <ArrowLeftRight size={13} /> Open in Transactions
        </Link>
          </>
        )}
      </aside>
    </>
  )
}
