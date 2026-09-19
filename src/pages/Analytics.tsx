import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useConverter, useStore } from '../store'
import { byCategory, byTag, dailySpend, inMonth, monthlySeries, netWorthSeries, topPayees, totals, txBase } from '../lib/analytics'
import { addMonths, fmtCompact, monthKey, monthLabel, today, lastNMonths } from '../lib/utils'
import { Card, ChartTooltip, Empty, Legend, Segmented, axisProps, useMoney } from '../components/ui'

const P = '#6270f2'
const M = '#e05be0'
const Y = '#f2cf3a'
const G = '#3ec97a'

export function Analytics() {
  const { transactions, categories, accounts, settings } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const [range, setRange] = useState<'3' | '6' | '12'>('6')
  const [month, setMonth] = useState(monthKey(today()))
  const n = Number(range)

  const series = useMemo(
    () => monthlySeries(transactions, accounts, conv, n).map((s) => ({ ...s, label: monthLabel(s.key), rate: s.income ? ((s.income - s.expense) / s.income) * 100 : 0 })),
    [transactions, accounts, conv, n],
  )
  const rangeTx = useMemo(() => {
    const keys = new Set(lastNMonths(n))
    return transactions.filter((t) => keys.has(monthKey(t.date)))
  }, [transactions, n])
  const rangeTotals = totals(rangeTx, accounts, conv)
  const cats = useMemo(() => byCategory(rangeTx, categories, accounts, conv), [rangeTx, categories, accounts, conv])
  const incomeCats = useMemo(() => byCategory(rangeTx, categories, accounts, conv, 'income'), [rangeTx, categories, accounts, conv])
  const payees = useMemo(() => topPayees(rangeTx, accounts, conv, 6), [rangeTx, accounts, conv])
  const tags = useMemo(() => byTag(rangeTx, accounts, conv).slice(0, 8), [rangeTx, accounts, conv])
  const worth = useMemo(() => netWorthSeries(accounts, transactions, conv, n).map((s) => ({ ...s, label: monthLabel(s.key) })), [accounts, transactions, conv, n])
  const daily = useMemo(() => dailySpend(transactions, accounts, conv, month), [transactions, accounts, conv, month])
  const prevDaily = useMemo(() => dailySpend(transactions, accounts, conv, addMonths(month, -1)), [transactions, accounts, conv, month])
  const dailyMerged = daily.map((d, i) => ({ ...d, prev: prevDaily[i]?.cumulative ?? null }))

  const topKey = cats.slice(0, 5).map((c) => c.id).join(',')
  const stacked = useMemo(() => {
    const topIds = topKey ? topKey.split(',') : []
    return lastNMonths(n).map((key) => {
      const m = inMonth(transactions, key).filter((t) => t.type === 'expense')
      const row: Record<string, number | string> = { label: monthLabel(key) }
      for (const id of topIds) row[id] = m.filter((t) => t.categoryId === id).reduce((s, t) => s + txBase(t, accounts, conv), 0)
      row.other = m.filter((t) => !topIds.includes(t.categoryId ?? '')).reduce((s, t) => s + txBase(t, accounts, conv), 0)
      return row
    })
  }, [transactions, n, topKey, accounts, conv])

  // weekday heat: average spend per weekday
  const weekday = useMemo(() => {
    const sums = Array(7).fill(0) as number[]
    const counts = new Set<string>()
    for (const t of rangeTx) if (t.type === 'expense') {
      sums[new Date(t.date + 'T00:00:00').getDay()] += txBase(t, accounts, conv)
      counts.add(t.date)
    }
    const weeks = Math.max(1, n * 4.33)
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => ({ day: d, avg: sums[i]! / weeks }))
  }, [rangeTx, accounts, conv, n])

  const avgMonthly = series.length ? rangeTotals.expense / series.length : 0
  const biggestMonth = series.reduce((a, b) => (b.expense > a.expense ? b : a), series[0]!)
  const tick = (v: number) => fmtCompact(v, settings.currency, settings.locale)

  if (transactions.length === 0)
    return (
      <Card>
        <Empty title="Nothing to analyse yet" hint="Add some transactions and the charts will light up." />
      </Card>
    )

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="flex between wrap">
        <div className="kpi-inline" style={{ flex: 1, minWidth: 320 }}>
          <div>
            <div className="l">Avg. monthly spend</div>
            <div className="v">{money(avgMonthly)}</div>
          </div>
          <div>
            <div className="l">Avg. savings rate</div>
            <div className="v" style={{ color: rangeTotals.savingsRate >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {rangeTotals.savingsRate.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="l">Biggest month</div>
            <div className="v">
              {biggestMonth.label} <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{money(biggestMonth.expense, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <div>
            <div className="l">Daily average</div>
            <div className="v">{money(avgMonthly / 30.4)}</div>
          </div>
        </div>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '3', label: '3M' },
            { value: '6', label: '6M' },
            { value: '12', label: '12M' },
          ]}
        />
      </div>

      <div className="grid dash-grid">
        <Card className="col-8" title="Income, expenses & net" sub={`Last ${n} months`}>
          <Legend
            items={[
              { color: G, label: 'Income' },
              { color: M, label: 'Expenses' },
              { color: P, label: 'Net' },
            ]}
          />
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ left: -10, right: 4 }}>
                <defs>
                  <linearGradient id="aInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={G} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={G} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="aExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={M} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={M} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={tick} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="income" name="Income" stroke={G} strokeWidth={2.5} fill="url(#aInc)" />
                <Area type="monotone" dataKey="expense" name="Expenses" stroke={M} strokeWidth={2.5} fill="url(#aExp)" />
                <Line type="monotone" dataKey="net" name="Net" stroke={P} strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-4" title="Savings rate" sub="Share of income kept">
          <div style={{ height: 290 }}>
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: -20, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => `${v}%`} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
                <Bar dataKey="rate" name="Savings rate" radius={[6, 6, 6, 6]} maxBarSize={18}>
                  {series.map((s) => (
                    <Cell key={s.key} fill={s.rate >= 20 ? G : s.rate >= 0 ? Y : M} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          className="col-7"
          title="Daily spending pace"
          sub="Cumulative expenses vs previous month"
          action={
            <select className="select" style={{ width: 'auto', padding: '6px 10px' }} value={month} onChange={(e) => setMonth(e.target.value)}>
              {lastNMonths(12)
                .reverse()
                .map((k) => (
                  <option key={k} value={k}>
                    {monthLabel(k, false)}
                  </option>
                ))}
            </select>
          }
        >
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={dailyMerged} margin={{ left: -10, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" {...axisProps} interval={4} />
                <YAxis {...axisProps} tickFormatter={tick} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} />} />
                <Line type="monotone" dataKey="prev" name={monthLabel(addMonths(month, -1))} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="cumulative" name={monthLabel(month)} stroke={P} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-5" title="Net worth" sub="Cash accounts, end of month">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={worth} margin={{ left: -10, right: 4 }}>
                <defs>
                  <linearGradient id="aNw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={P} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={P} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={tick} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" name="Net worth" stroke={P} strokeWidth={2.5} fill="url(#aNw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-7" title="Spending by category over time" sub="Top 5 categories, stacked">
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={stacked} margin={{ left: -10, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={tick} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
                {cats.slice(0, 5).map((c) => (
                  <Bar key={c.id} dataKey={c.id} name={c.name} stackId="a" fill={c.color} maxBarSize={28} />
                ))}
                <Bar dataKey="other" name="Other" stackId="a" fill="#3a3c4c" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-5" title="Category breakdown" sub={`Last ${n} months`}>
          <div className="stack" style={{ gap: 10 }}>
            {cats.slice(0, 8).map((c) => (
              <div key={c.id} className="bar-row" style={{ marginBottom: 0 }}>
                <div className="t">
                  <span>
                    {c.icon} {c.name}
                  </span>
                  <span>
                    <b>{money(c.value, { maximumFractionDigits: 0 })}</b> <span className="muted">{c.pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="progress" style={{ height: 6 }}>
                  <span style={{ width: `${c.pct}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-4" title="Spend by weekday" sub="Average per week">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={weekday} margin={{ left: -20, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={tick} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
                <Bar dataKey="avg" name="Average" fill={M} radius={[6, 6, 6, 6]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-4" title="Top payees" sub="Where the money goes">
          <div className="tx-list">
            {payees.map((p, i) => (
              <div className="tx-row" key={p.payee} style={{ gridTemplateColumns: '28px 1fr auto', '--i': i } as React.CSSProperties}>
                <div className="muted" style={{ fontWeight: 600 }}>
                  #{i + 1}
                </div>
                <div className="tx-main">
                  <div className="tx-name">{p.payee}</div>
                  <div className="tx-meta">
                    {p.count} payments · avg {money(p.total / p.count)}
                  </div>
                </div>
                <div className="tx-amount">{money(p.total)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-4" title="Income sources & tags">
          {incomeCats.length === 0 ? (
            <Empty title="No income recorded" />
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {incomeCats.map((c) => (
                <div key={c.id} className="bar-row" style={{ marginBottom: 0 }}>
                  <div className="t">
                    <span>
                      {c.icon} {c.name}
                    </span>
                    <span>
                      <b>{money(c.value, { maximumFractionDigits: 0 })}</b> <span className="muted">{c.pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="progress" style={{ height: 6 }}>
                    <span style={{ width: `${c.pct}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex wrap" style={{ gap: 6, marginTop: 14 }}>
              {tags.map((t) => (
                <span key={t.tag} className="pill">
                  #{t.tag} <b>{money(t.total, { maximumFractionDigits: 0 })}</b>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
