import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, ChevronDown } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useConverter, useStore } from '../store'
import { accountBalance, budgetProgress, byCategory, inMonth, monthlySeries, netWorth, portfolio, totals, weekSeries } from '../lib/analytics'
import { addMonths, fmtCompact, fmtDate, monthKey, monthLabel, today } from '../lib/utils'
import { Card, ChartTooltip, Gauge, Legend, Money, Empty, axisProps, useCountUp, useMoney } from '../components/ui'
import { BankCard } from './Wallet'

const P = '#6270f2'
const M = '#e05be0'

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => ({ i, v }))
  return (
    <div className="spark">
      <ResponsiveContainer>
        <AreaChart data={pts} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`sp-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${color.slice(1)})`} animationDuration={900} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Dashboard() {
  const { accounts, transactions, categories, budgets, holdings, debts, settings } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const [catMonth, setCatMonth] = useState<'this' | 'last'>('this')
  const [gaugeMonth, setGaugeMonth] = useState<'this' | 'last'>('this')
  const [week, setWeek] = useState<0 | 1>(0)
  const [range, setRange] = useState<6 | 12>(12)

  const thisKey = monthKey(today())
  const prevKey = addMonths(thisKey, -1)
  const cur = useMemo(() => totals(inMonth(transactions, thisKey), accounts, conv), [transactions, thisKey, accounts, conv])
  const prev = useMemo(() => totals(inMonth(transactions, prevKey), accounts, conv), [transactions, prevKey, accounts, conv])
  const worth = useMemo(() => netWorth(accounts, transactions, conv, holdings, debts), [accounts, transactions, conv, holdings, debts])
  const worthPrev = useMemo(
    () => netWorth(accounts, transactions.filter((t) => monthKey(t.date) <= prevKey), conv, holdings, debts),
    [accounts, transactions, conv, holdings, debts, prevKey],
  )
  const series = useMemo(() => monthlySeries(transactions, accounts, conv, range).map((s) => ({ ...s, label: monthLabel(s.key).toUpperCase() })), [transactions, accounts, conv, range])
  const catKey = catMonth === 'this' ? thisKey : prevKey
  const cats = useMemo(() => byCategory(inMonth(transactions, catKey), categories, accounts, conv), [transactions, categories, accounts, conv, catKey])
  const catTotal = cats.reduce((s, c) => s + c.value, 0)
  const gauges = useMemo(
    () => budgetProgress(budgets, transactions, categories, accounts, conv, gaugeMonth === 'this' ? thisKey : prevKey).slice(0, 5),
    [budgets, transactions, categories, accounts, conv, gaugeMonth, thisKey, prevKey],
  )
  const prevGauges = useMemo(
    () => budgetProgress(budgets, transactions, categories, accounts, conv, gaugeMonth === 'this' ? prevKey : addMonths(prevKey, -1)),
    [budgets, transactions, categories, accounts, conv, gaugeMonth, prevKey],
  )
  const wk = useMemo(() => weekSeries(transactions, accounts, conv, week), [transactions, accounts, conv, week])
  const pf = useMemo(() => portfolio(holdings, conv), [holdings, conv])
  const recent = transactions.slice(0, 4)
  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100)
  const worthDelta = delta(worth, worthPrev)
  const expDelta = delta(cur.expense, prev.expense)
  const balanceSpark = useMemo(() => {
    const keys = series.map((s) => s.key)
    return keys.map((k) => netWorth(accounts, transactions.filter((t) => monthKey(t.date) <= k), conv, holdings, debts))
  }, [series, accounts, transactions, conv, holdings, debts])

  const catById = (id: string | null) => categories.find((c) => c.id === id)
  const tick = (v: number) => fmtCompact(v, settings.currency, settings.locale)
  const worthAnim = useCountUp(worth)
  const expAnim = useCountUp(cur.expense)

  return (
    <div className="grid dash-grid">
      {/* ---- LEFT COLUMN ---- */}
      <div className="col-7 grid" style={{ gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}>
        <Card className="stat">
          <div>
            <div className="flex between">
              <span className="label">Total balance</span>
              <span className="chip-select">
                last month <ChevronDown size={12} style={{ verticalAlign: -2 }} />
              </span>
            </div>
            <div className="value">{money(worthAnim, { maximumFractionDigits: 0 })}</div>
            <span className={`delta ${worthDelta >= 0 ? 'up' : 'down'}`}>
              {worthDelta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(worthDelta).toFixed(1)}% <span className="m">last month</span>
            </span>
          </div>
          <Sparkline data={balanceSpark} color={P} />
        </Card>
        <Card className="stat">
          <div>
            <div className="flex between">
              <span className="label">Total expenses</span>
              <span className="chip-select">
                this month <ChevronDown size={12} style={{ verticalAlign: -2 }} />
              </span>
            </div>
            <div className="value">{money(expAnim, { maximumFractionDigits: 0 })}</div>
            <span className={`delta ${expDelta <= 0 ? 'up' : 'down'}`}>
              {expDelta <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
              {Math.abs(expDelta).toFixed(1)}% <span className="m">vs last month</span>
            </span>
          </div>
          <Sparkline data={series.map((s) => s.expense)} color={M} />
        </Card>

        <Card
          style={{ gridColumn: '1 / -1' }}
          title="Dissection"
          action={
            <button className="chip-select" onClick={() => setRange(range === 12 ? 6 : 12)}>
              {range} months <ChevronDown size={12} style={{ verticalAlign: -2 }} />
            </button>
          }
        >
          <Legend
            items={[
              { color: P, label: 'Income' },
              { color: M, label: 'Expenses' },
            ]}
          />
          <div style={{ height: 230 }}>
            <ResponsiveContainer>
              <BarChart data={series} barGap={3} margin={{ left: -14, right: 0, top: 6 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axisProps} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis {...axisProps} tickFormatter={tick} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
                <Bar dataKey="income" name="Income" fill={P} radius={[5, 5, 5, 5]} maxBarSize={10} />
                <Bar dataKey="expense" name="Expenses" fill={M} radius={[5, 5, 5, 5]} maxBarSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Transactions"
          action={
            <Link to="/transactions" className="link">
              See all <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
            </Link>
          }
        >
          {recent.length === 0 ? (
            <Empty title="No transactions yet" hint="Press N to add your first one." />
          ) : (
            <div className="tx-list">
              {recent.map((t, i) => {
                const c = catById(t.categoryId)
                const isTransfer = t.type === 'transfer'
                const acc = accounts.find((a) => a.id === t.accountId)
                return (
                  <div className="tx-row" key={t.id} style={{ '--i': i } as React.CSSProperties}>
                    <div className="tx-icon">{isTransfer ? '⇄' : (c?.icon ?? '•')}</div>
                    <div className="tx-main">
                      <div className="tx-name">{t.payee}</div>
                      <div className="tx-meta">{fmtDate(t.date, settings.locale)} · {isTransfer ? 'Transfer' : (c?.name ?? 'Uncategorised')}</div>
                    </div>
                    <div className={`tx-amount ${t.type === 'income' ? 'pos' : isTransfer ? 'transfer' : 'neg'}`}>
                      <Money value={t.type === 'expense' ? -t.amount : t.amount} currency={acc?.currency} signed={!isTransfer} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card
          title="Investments"
          action={
            <Link to="/investments" className="link">
              Details <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
            </Link>
          }
        >
          {pf.rows.length === 0 ? (
            <Empty title="No holdings" hint="Add stocks, ETFs or crypto on the Investments page." />
          ) : (
            <div>
              {pf.allocation.slice(0, 5).map((a, i) => (
                <div className="bar-row" key={a.assetClass}>
                  <div className="t">
                    <span style={{ textTransform: 'capitalize' }}>{a.assetClass.replace('_', ' ')}</span>
                    <b>{a.pct.toFixed(0)}%</b>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${a.pct}%`, background: i % 2 ? M : P }} />
                  </div>
                </div>
              ))}
              <div className="flex between" style={{ fontSize: 12, marginTop: 4 }}>
                <span className="muted">Portfolio value</span>
                <b>{money(pf.value, { maximumFractionDigits: 0 })}</b>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ---- RIGHT COLUMN ---- */}
      <div className="col-5 grid" style={{ gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}>
        <Card
          title="Active cards"
          action={
            <Link to="/wallet" className="link">
              View all
            </Link>
          }
        >
          {accounts.length ? <BankCard account={accounts[0]!} balance={accountBalance(accounts[0]!, transactions)} holder={settings.name} /> : <Empty title="No cards" />}
        </Card>

        <Card
          title="Categories"
          action={
            <button className="chip-select" onClick={() => setCatMonth(catMonth === 'this' ? 'last' : 'this')}>
              {catMonth === 'this' ? 'this month' : 'last month'} <ChevronDown size={12} style={{ verticalAlign: -2 }} />
            </button>
          }
        >
          {cats.length === 0 ? (
            <Empty title="No expenses" />
          ) : (
            <div className="flex" style={{ gap: 6 }}>
              <div style={{ width: 120, height: 120, position: 'relative', flexShrink: 0 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={cats.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={46} outerRadius={56} paddingAngle={4} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270}>
                      {cats.slice(0, 6).map((c) => (
                        <Cell key={c.id} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>100%</div>
                    <div className="muted" style={{ fontSize: 10 }}>
                      expenses
                    </div>
                  </div>
                </div>
              </div>
              <div className="legend" style={{ flex: 1, gap: 7, fontSize: 11.5 }}>
                {cats.slice(0, 5).map((c) => (
                  <div className="legend-item" key={c.id}>
                    <span className="sw" style={{ background: c.color }} />
                    <span className="n" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </span>
                    <span className="p" style={{ width: 'auto' }}>
                      {c.pct.toFixed(0)}%
                    </span>
                  </div>
                ))}
                {catTotal > 0 && (
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                    Total {money(catTotal, { maximumFractionDigits: 0 })}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card
          style={{ gridColumn: '1 / -1' }}
          title="Spending parameters"
          action={
            <button className="chip-select" onClick={() => setGaugeMonth(gaugeMonth === 'this' ? 'last' : 'this')}>
              {gaugeMonth === 'this' ? 'this month' : 'last month'} <ChevronDown size={12} style={{ verticalAlign: -2 }} />
            </button>
          }
        >
          {gauges.length === 0 ? (
            <Empty title="No budgets" hint="Set limits per category on the Budgets page." />
          ) : (
            <div className="gauges">
              {gauges.map((b) => {
                const pb = prevGauges.find((x) => x.categoryId === b.categoryId)
                const d = pb ? b.pct - pb.pct : 0
                return (
                  <div className="gauge" key={b.id}>
                    <Gauge pct={b.pct} color={b.category!.color} size={82} stroke={7}>
                      <div style={{ textAlign: 'center', lineHeight: 1.15 }}>
                        <div style={{ fontSize: 13 }}>{Math.round(b.pct)}%</div>
                        <div className="sub" style={{ color: d <= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {d <= 0 ? '▼' : '▲'} {Math.abs(d).toFixed(1)}%
                        </div>
                      </div>
                    </Gauge>
                    <div className="lbl">{b.category!.name}</div>
                  </div>
                )
              })}
              {budgets.length > 5 && (
                <Link to="/budgets" className="gauge" style={{ justifyContent: 'center' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: P, opacity: 0.9 }} />
                  <div className="lbl">+{budgets.length - 5} more</div>
                </Link>
              )}
            </div>
          )}
        </Card>

        <Card
          style={{ gridColumn: '1 / -1' }}
          title="Income and expenses"
          action={
            <button className="chip-select" onClick={() => setWeek(week === 0 ? 1 : 0)}>
              {week === 0 ? 'this week' : 'last week'} <ChevronDown size={12} style={{ verticalAlign: -2 }} />
            </button>
          }
        >
          <Legend
            items={[
              { color: P, label: 'Income' },
              { color: M, label: 'Expenses' },
            ]}
          />
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <LineChart data={wk} margin={{ left: -14, right: 6, top: 10 }}>
                <defs>
                  <linearGradient id="wInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={P} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={P} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" {...axisProps} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis {...axisProps} tickFormatter={tick} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => String(l)} />} />
                <Line type="monotone" dataKey="income" name="Income" stroke={P} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: P, stroke: '#fff', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="expense" name="Expenses" stroke={M} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: M, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
