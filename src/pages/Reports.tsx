import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { useConverter, useStore } from '../store'
import { accountBalance, budgetProgress, byCategory, byTag, inMonth, netWorth, topPayees, totals, txBase } from '../lib/analytics'
import { addMonths, csvEscape, downloadFile, monthKey, monthLabel, today } from '../lib/utils'
import { Card, Money, useMoney } from '../components/ui'

export function Reports() {
  const { transactions, categories, accounts, budgets, holdings, debts, settings, recurring } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const [month, setMonth] = useState(monthKey(today()))
  const prevKey = addMonths(month, -1)

  const txs = useMemo(() => inMonth(transactions, month), [transactions, month])
  const prevTxs = useMemo(() => inMonth(transactions, prevKey), [transactions, prevKey])
  const t = totals(txs, accounts, conv)
  const p = totals(prevTxs, accounts, conv)
  const cats = byCategory(txs, categories, accounts, conv)
  const prevCats = byCategory(prevTxs, categories, accounts, conv)
  const incomeCats = byCategory(txs, categories, accounts, conv, 'income')
  const payees = topPayees(txs, accounts, conv, 8)
  const tags = byTag(txs, accounts, conv)
  const bud = budgetProgress(budgets, transactions, categories, accounts, conv, month)
  const endKey = month
  const worthEnd = netWorth(accounts, transactions.filter((x) => monthKey(x.date) <= endKey), conv, holdings, debts)
  const worthStart = netWorth(accounts, transactions.filter((x) => monthKey(x.date) <= prevKey), conv, holdings, debts)
  const largest = txs
    .filter((x) => x.type === 'expense')
    .map((x) => ({ ...x, base: txBase(x, accounts, conv) }))
    .sort((a, b) => b.base - a.base)
    .slice(0, 5)
  const transfersOut = txs.filter((x) => x.type === 'transfer').reduce((s, x) => s + txBase(x, accounts, conv), 0)
  const fixed = recurring.filter((r) => r.active && r.type === 'expense').length
  const ch = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0)

  const exportCsv = () => {
    const rows = [
      ['section', 'name', 'value', 'previous'],
      ['summary', 'income', t.income, p.income],
      ['summary', 'expenses', t.expense, p.expense],
      ['summary', 'net', t.net, p.net],
      ['summary', 'savings_rate_pct', t.savingsRate.toFixed(1), p.savingsRate.toFixed(1)],
      ...cats.map((c) => ['category', c.name, c.value.toFixed(2), (prevCats.find((x) => x.id === c.id)?.value ?? 0).toFixed(2)]),
      ...payees.map((x) => ['payee', x.payee, x.total.toFixed(2), x.count]),
      ...bud.map((b) => ['budget', b.category!.name, b.spent.toFixed(2), b.limit]),
    ]
    downloadFile(`report-${month}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv')
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="flex between wrap no-print">
        <div className="flex">
          <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft size={16} />
          </button>
          <b style={{ minWidth: 160, textAlign: 'center', fontSize: 15 }}>{monthLabel(month, false)}</b>
          <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex">
          <button className="btn" onClick={exportCsv}>
            <Download size={14} /> CSV
          </button>
          <button className="btn primary" onClick={() => window.print()}>
            <Printer size={14} /> Print / Save as PDF
          </button>
        </div>
      </div>

      <Card>
        <div style={{ marginBottom: 14 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Monthly report · {settings.name}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: 20 }}>{monthLabel(month, false)}</h2>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            ['Income', t.income, ch(t.income, p.income), false],
            ['Expenses', t.expense, ch(t.expense, p.expense), true],
            ['Net', t.net, ch(t.net, p.net), false],
            ['Savings rate', t.savingsRate, t.savingsRate - p.savingsRate, false, true],
            ['Net worth (end)', worthEnd, ch(worthEnd, worthStart), false],
          ].map(([l, v, d, inv, isPct]) => {
            const dd = Number(d)
            const good = inv ? dd <= 0 : dd >= 0
            return (
              <div key={String(l)} className="subtle-panel">
                <div className="muted" style={{ fontSize: 12 }}>
                  {String(l)}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, margin: '2px 0' }}>{isPct ? `${Number(v).toFixed(1)}%` : money(Number(v))}</div>
                <div style={{ fontSize: 11.5, color: good ? 'var(--green)' : 'var(--red)' }}>
                  {dd >= 0 ? '+' : ''}
                  {dd.toFixed(1)}
                  {isPct ? ' pts' : '%'} vs {monthLabel(prevKey)}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid dash-grid">
        <Card className="col-6" title="Spending by category" sub="Compared with previous month">
          {cats.map((c) => (
            <Row key={c.id} label={`${c.icon} ${c.name} (${c.pct.toFixed(0)}%)`} value={c.value} prev={prevCats.find((x) => x.id === c.id)?.value ?? 0} invert />
          ))}
          {cats.length === 0 && <div className="muted">No expenses.</div>}
        </Card>
        <Card className="col-6" title="Income sources">
          {incomeCats.map((c) => (
            <Row key={c.id} label={`${c.icon} ${c.name} (${c.pct.toFixed(0)}%)`} value={c.value} />
          ))}
          {incomeCats.length === 0 && <div className="muted">No income.</div>}
          <div style={{ height: 14 }} />
          <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Money moved</h4>
          <Row label="Transfers between accounts" value={transfersOut} />
          <Row label={`Fixed bills tracked (${fixed})`} value={bud.reduce((s, b) => s + b.spent, 0)} />
        </Card>

        <Card className="col-6" title="Budgets">
          {bud.length === 0 && <div className="muted">No budgets set.</div>}
          {bud.map((b) => (
            <div key={b.id} className="bar-row">
              <div className="t">
                <span>
                  {b.category!.icon} {b.category!.name}
                </span>
                <span>
                  <b>{money(b.spent, { maximumFractionDigits: 0 })}</b> <span className="muted">/ {money(b.limit, { maximumFractionDigits: 0 })}</span>
                  <span style={{ marginLeft: 8, color: b.pct >= 100 ? 'var(--red)' : b.pct >= 80 ? 'var(--orange)' : 'var(--green)' }}>{Math.round(b.pct)}%</span>
                </span>
              </div>
              <div className={`progress ${b.pct >= 100 ? 'over' : ''}`}>
                <span style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct >= 100 ? undefined : b.category!.color }} />
              </div>
            </div>
          ))}
        </Card>

        <Card className="col-6" title="Largest expenses">
          {largest.map((x) => (
            <div key={x.id} className="flex between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>
                <b>{x.payee}</b> <span className="muted">· {x.date.slice(8)} {monthLabel(month)}</span>
              </span>
              <Money value={x.base} />
            </div>
          ))}
          <div style={{ height: 14 }} />
          <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Top payees</h4>
          {payees.map((x) => (
            <div key={x.payee} className="flex between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <span className="muted">
                {x.payee} × {x.count}
              </span>
              <b>{money(x.total)}</b>
            </div>
          ))}
        </Card>

        {tags.length > 0 && (
          <Card className="col-6" title="By tag">
            {tags.map((x) => (
              <div key={x.tag} className="flex between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                <span className="tag">#{x.tag}</span>
                <span>
                  <b>{money(x.total)}</b> <span className="muted">· {x.count}</span>
                </span>
              </div>
            ))}
          </Card>
        )}

        <Card className="col-6" title="Account balances (end of month)">
          {accounts.map((a) => {
            const bal = accountBalance(a, transactions.filter((x) => monthKey(x.date) <= month))
            return (
              <div key={a.id} className="flex between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span>
                  {a.name} <span className="muted">· {a.currency}</span>
                </span>
                <span>
                  <Money value={bal} currency={a.currency} />
                  {a.currency !== settings.currency && <span className="muted" style={{ marginLeft: 6, fontSize: 11.5 }}>≈ {money(conv(bal, a.currency))}</span>}
                </span>
              </div>
            )
          })}
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, prev, invert }: { label: string; value: number; prev?: number; invert?: boolean }) {
  const money = useMoney()
  const d = prev !== undefined ? (prev ? ((value - prev) / prev) * 100 : 0) : null
  const good = d === null ? true : invert ? d <= 0 : d >= 0
  return (
    <div className="flex between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span>
        <b>{money(value)}</b>
        {d !== null && (
          <span style={{ marginLeft: 8, fontSize: 11.5, color: good ? 'var(--green)' : 'var(--red)' }}>
            {d >= 0 ? '+' : ''}
            {d.toFixed(0)}%
          </span>
        )}
      </span>
    </div>
  )
}
