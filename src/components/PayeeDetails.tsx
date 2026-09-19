// Payee page: history, average, frequency, and every rule or alias touching this payee.
import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { payeeHistory } from '../lib/matching'
import { explainCategorisation } from '../lib/rules'
import { fmtDate, round2, today } from '../lib/utils'
import { Card, ChartTooltip, Empty, Money, axisProps, useMoney } from '../components/ui'

export function PayeeDetails({ payee, onClose }: { payee: string; onClose: () => void }) {
  const { transactions, categories, rules, settings, updateTransaction, addAlias } = useStore()
  const money = useMoney()
  const history = useMemo(() => payeeHistory(transactions, payee), [transactions, payee])
  const rows = useMemo(() => transactions.filter((t) => t.payee === payee).sort((a, b) => (a.date < b.date ? 1 : -1)), [transactions, payee])
  const cat = categories.find((c) => c.id === history?.categoryId)
  const rule = rows[0] ? explainCategorisation(rules, rows[0]!).applied : null
  const alias = (settings.aliases ?? []).find((a) => payee.toLowerCase().includes(a.from))

  if (!history)
    return (
      <div className="empty">
        <strong>Unknown payee</strong>
        No transactions for “{payee}”.
      </div>
    )

  const days = Math.max(1, Math.round((Date.parse(today()) - Date.parse(history.first)) / 86400000) + 1)
  const perMonth = (history.total / days) * 30.4

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="flex between wrap" style={{ gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20 }}>{payee}</h2>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {history.count} transactions since {fmtDate(history.first)} · about {money(perMonth)} / month
            {cat && (
              <>
                {' · '}
                <span className="pill">
                  <span className="sw" style={{ background: cat.color }} /> {cat.icon} {cat.name}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {!alias && (
            <button className="btn sm" onClick={() => addAlias(payee.toLowerCase(), payee)}>
              Add as merchant alias
            </button>
          )}
          <Link to="/transactions" className="btn sm ghost" onClick={onClose}>
            Open in Transactions
          </Link>
          <button className="mini-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      <div className="kpi-inline">
        <div>
          <div className="l">Total</div>
          <div className="v">
            <Money value={history.total} />
          </div>
        </div>
        <div>
          <div className="l">Average</div>
          <div className="v">{money(history.average)}</div>
        </div>
        <div>
          <div className="l">Last</div>
          <div className="v" style={{ fontSize: 14, marginTop: 4 }}>
            {fmtDate(history.last)}
          </div>
        </div>
        <div>
          <div className="l">Frequency</div>
          <div className="v" style={{ fontSize: 15, marginTop: 3 }}>
            every ~{Math.max(1, Math.round(days / Math.max(1, history.count)))} days
          </div>
        </div>
      </div>

      <Card title="History" sub="Monthly totals">
        {history.monthly.length < 2 ? (
          <Empty title="Not enough history yet" hint="Two months of data are needed to draw a trend." />
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={history.monthly} margin={{ left: -18, right: 4 }}>
                <XAxis dataKey="key" {...axisProps} tickFormatter={(v) => String(v).slice(2)} />
                <YAxis {...axisProps} tickFormatter={(v) => money(v, { notation: 'compact', maximumFractionDigits: 1 })} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="total" name="Spend" stroke="#e05be0" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {rule && (
        <div className="subtle-panel" style={{ fontSize: 12.5 }}>
          Categorised by rule <b>{rule.r.name}</b> ({rule.r.field} {rule.r.match} “{rule.r.pattern}”).
        </div>
      )}
      {alias && (
        <div className="subtle-panel" style={{ fontSize: 12.5 }}>
          Merchant alias: <b>{alias.from}</b> → {alias.to}
        </div>
      )}

      <Card title="Transactions" sub={`${rows.length} total`}>
        <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((t) => {
                const c = categories.find((x) => x.id === t.categoryId)
                return (
                  <tr key={t.id}>
                    <td className="muted">{t.date}</td>
                    <td>
                      <span className="pill">
                        <span className="sw" style={{ background: c?.color ?? '#6b7280' }} /> {c?.name ?? 'Uncategorised'}
                      </span>
                    </td>
                    <td className="num">{money(round2(t.amount))}</td>
                    <td>
                      <button
                        className="mini-btn"
                        title="Rename every transaction with this payee"
                        onClick={() => {
                          const to = window.prompt('Rename this payee everywhere?', payee)
                          if (!to || to === payee) return
                          for (const r of rows) updateTransaction(r.id, { payee: to })
                        }}
                      >
                        rename
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
