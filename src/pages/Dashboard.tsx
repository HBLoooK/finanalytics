import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, ChevronDown, PiggyBank } from 'lucide-react'
import { useConverter, useStore } from '../store'
import { accountBalance, budgetProgress, byCategory, inMonth, inPeriod, monthlySeries, netWorth, portfolio, totals, weekSeries } from '../lib/analytics'
import { addMonths, currentPeriod, fmtCompact, fmtDate, monthKey, monthLabel } from '../lib/utils'
import { cashFlowForecast, safeToSpend } from '../lib/forecast'
import { Card, ChartTooltip, Gauge, Legend, Money, Empty, axisProps, useCountUp, useMoney } from '../components/ui'
import { BankCard } from './Wallet'
import { DrillDown, type DrillFilter } from '../components/DrillDown'
import { WeekDigest } from '../components/WeekDigest'

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
  const { accounts, transactions, categories, budgets, holdings, debts, settings, recurring, goals } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const [catMonth, setCatMonth] = useState<'this' | 'last'>('this')
  const [gaugeMonth, setGaugeMonth] = useState<'this' | 'last'>('this')
  const [week, setWeek] = useState<0 | 1>(0)
  const [range, setRange] = useState<6 | 12>(12)
  const [balancePeriod, setBalancePeriod] = useState<'this' | 'last'>('this')
  const [drill, setDrill] = useState<DrillFilter | null>(null)

  const startDay = settings.monthStartDay
  const thisKey = currentPeriod(startDay)
  const prevKey = addMonths(thisKey, -1)
  const cur = useMemo(() => totals(inPeriod(transactions, thisKey, startDay), accounts, conv), [transactions, thisKey, accounts, conv, startDay])
  const prev = useMemo(() => totals(inPeriod(transactions, prevKey, startDay), accounts, conv), [transactions, prevKey, accounts, conv, startDay])
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
    () => budgetProgress(budgets, transactions, categories, accounts, conv, gaugeMonth === 'this' ? thisKey : prevKey, startDay).slice(0, 5),
    [budgets, transactions, categories, accounts, conv, gaugeMonth, thisKey, prevKey, startDay],
  )
  const prevGauges = useMemo(
    () => budgetProgress(budgets, transactions, categories, accounts, conv, gaugeMonth === 'this' ? prevKey : addMonths(prevKey, -1), startDay),
    [budgets, transactions, categories, accounts, conv, gaugeMonth, prevKey, startDay],
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

  const safe = useMemo(() => safeToSpend({ accounts, transactions, recurring, budgets, goals, conv }), [accounts, transactions, recurring, budgets, goals, conv])
  const forecast = useMemo(() => cashFlowForecast({ accounts, transactions, recurring, budgets, goals, conv, days: 30 }), [accounts, transactions, recurring, budgets, goals, conv])

  const catById = (id: string | null) => categories.find((c) => c.id === id)
  const tick = (v: number) => fmtCompact(v, settings.currency, settings.locale)
  const worthAnim = useCountUp(worth)
  const expAnim = useCountUp(cur.expense)
  const safeAnim = useCountUp(safe.value)

  return (
    <div className="grid dash-grid">
      {/* ---- SAFE TO SPEND ---- */}
      {settings.safeToSpend !== false && (
        <Card
          className="col-12"
          title="Safe to spend"
          sub={safe.nextIncomeDate ? `Money left after bills until your next income on ${fmtDate(safe.nextIncomeDate, settings.locale)}` : 'Money left after bills for the next 30 days'}
          action={
            <span className={`pill ${safe.value < 0 ? 'danger' : ''}`} style={{ color: safe.value < 0 ? 'var(--red)' : 'var(--green)' }}>
              {safe.value < 0 ? 'Over-committed' : `${money(safe.perDay)} / day`}
            </span>
          }
        >
          <div className="safe-card">
            <div>
              <div className={`safe-figure ${safe.value < 0 ? 'neg' : ''}`}>{money(safeAnim, { maximumFractionDigits: 0 })}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {safe.value < 0 ? 'Your upcoming bills exceed your balance' : 'Yours to spend without touching bills or budgets'}
              </div>
            </div>
            <div className="safe-breakdown">
              <div className="row">
                <span>Liquid balance</span>
                <b>{money(safe.liquid)}</b>
              </div>
              <div className="row">
                <span>Bills before next income</span>
                <b style={{ color: 'var(--orange)' }}>−{money(safe.billsDue)}</b>
              </div>
              <div className="row">
                <span>Budget not yet spent</span>
                <b style={{ color: 'var(--primary-2)' }}>−{money(safe.budgetLeft)}</b>
              </div>
              {safe.goalDue > 0 && (
                <div className="row">
                  <span>Goal contributions</span>
                  <b>−{money(safe.goalDue)}</b>
                </div>
              )}
              {safe.pendingOut > 0 && (
                <div className="row">
                  <span>Pending transactions</span>
                  <b>−{money(safe.pendingOut)}</b>
                </div>
              )}
            </div>
            <div className="safe-spark">
              <ResponsiveContainer>
                <AreaChart data={forecast.days} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={forecast.min && forecast.min.balance < 0 ? 'var(--red)' : P} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={forecast.min && forecast.min.balance < 0 ? 'var(--red)' : P} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip content={<ChartTooltip labelFormatter={(l) => String(l)} />} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Projected"
                    stroke={forecast.min && forecast.min.balance < 0 ? 'var(--red)' : P}
                    strokeWidth={2}
                    fill="url(#fc)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="muted" style={{ fontSize: 11 }}>
                {forecast.min && forecast.min.balance < 0
                  ? `Dips to ${money(forecast.min.balance, { maximumFractionDigits: 0 })} on ${fmtDate(forecast.min.date, settings.locale)}`
                  : `Next 30 days stay above ${money(forecast.min?.balance ?? 0, { maximumFractionDigits: 0 })}`}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="col-12" title="This week so far" sub="Your automated Monday digest, available any day">
        <WeekDigest />
      </Card>

      {/* ---- LEFT COLUMN ---- */}
      <div className="col-7 grid" style={{ gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}>
        <Card className="stat">
          <div>
            <div className="flex between">
              <span className="label">Total balance</span>
              <button className="chip-select" onClick={() => setBalancePeriod(balancePeriod === 'this' ? 'last' : 'this')} title="Compare with the previous month">
                {balancePeriod === 'this' ? 'last month ▾' : 'two months ago ▾'}
              </button>
            </div>
            <div className="value" onClick={() => setDrill({ title: 'All accounts', subtitle: 'Every transaction on your accounts', match: () => true })}>
              {money(worthAnim, { maximumFractionDigits: 0 })}
            </div>
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
              <span className="chip-select">this period</span>
            </div>
            <div className="value" onClick={() => setDrill({ title: 'Expenses this period', subtitle: monthLabel(thisKey, false), match: (t) => t.type === 'expense' && monthKey(t.date) === thisKey })}>
              {money(expAnim, { maximumFractionDigits: 0 })}
            </div>
            <span className={`delta ${expDelta <= 0 ? 'up' : 'down'}`}>
              {expDelta <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
              {Math.abs(expDelta).toFixed(1)}% <span className="m">vs last period</span>
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
              <BarChart
                data={series}
                barGap={3}
                margin={{ left: -14, right: 0, top: 6 }}
                onClick={(e: unknown) => {
                  const p = e as { activePayload?: { payload?: { key?: string } }[] } | null
                  const key = p?.activePayload?.[0]?.payload?.key
                  if (key)
                    setDrill({
                      title: monthLabel(key, false),
                      subtitle: 'Everything booked in this month',
                      match: (t) => monthKey(t.date) === key && t.type !== 'transfer',
                    })
                }}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axisProps} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis {...axisProps} tickFormatter={tick} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
                <Bar dataKey="income" name="Income" fill={P} radius={[5, 5, 5, 5]} maxBarSize={10} className="clickable" />
                <Bar dataKey="expense" name="Expenses" fill={M} radius={[5, 5, 5, 5]} maxBarSize={10} className="clickable" />
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
                      <div className="tx-meta">
                        {fmtDate(t.date, settings.locale)} · {isTransfer === true ? 'Transfer' : (c?.name ?? 'Uncategorised')}
                      </div>
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
                    <Pie
                      data={cats.slice(0, 6)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={46}
                      outerRadius={56}
                      paddingAngle={4}
                      cornerRadius={6}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      onClick={(d) => {
                        const id = (d as unknown as { id?: string }).id
                        if (!id) return
                        const c = categories.find((x) => x.id === id)
                        setDrill({
                          title: c?.name ?? 'Category',
                          subtitle: monthLabel(catKey, false),
                          match: (t) => monthKey(t.date) === catKey && (t.categoryId === id || Boolean(t.splits?.some((s) => s.categoryId === id))),
                        })
                      }}
                    >
                      {cats.slice(0, 6).map((c) => (
                        <Cell key={c.id} fill={c.color} className="clickable" />
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
                  <div
                    className="gauge"
                    key={b.id}
                    onClick={() =>
                      setDrill({
                        title: `${b.category!.name} budget`,
                        subtitle: `${money(b.spent)} of ${money(b.limitWithRollover)}`,
                        match: (t) => t.type === 'expense' && monthKey(t.date) === (gaugeMonth === 'this' ? thisKey : prevKey) && (t.categoryId === b.categoryId || Boolean(t.splits?.some((s) => s.categoryId === b.categoryId))),
                      })
                    }
                  >
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
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: P, opacity: 0.9, display: 'grid', placeItems: 'center', color: '#fff' }}>
                    <PiggyBank size={17} />
                  </div>
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

      {drill && <DrillDown filter={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}
