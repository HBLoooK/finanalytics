import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Minus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useConverter, useStore } from '../store'
import { Card, ChartTooltip, Empty, Segmented, axisProps, useMoney } from '../components/ui'
import {
  type Period,
  type PeriodKind,
  categoryDiff,
  changeDrivers,
  currentPeriod,
  customPeriod,
  monthPeriod,
  payeeDiff,
  periodStats,
  previousPeriod,
  quarterPeriod,
  yearAgoPeriod,
  yearPeriod,
} from '../lib/compare'
import { addDays, fmtCompact, lastNMonths, monthKey, monthLabel, today } from '../lib/utils'

const A_COLOR = '#6270f2'
const B_COLOR = '#e05be0'

/* ---------------- period picker ---------------- */

function PeriodPicker({ kind, value, onChange, earliest, color }: { kind: PeriodKind; value: Period; onChange: (p: Period) => void; earliest: string; color: string }) {
  const nowYear = Number(today().slice(0, 4))
  const firstYear = Number(earliest.slice(0, 4))
  const years = Array.from({ length: nowYear - firstYear + 1 }, (_, i) => nowYear - i)
  const months = useMemo(() => {
    const n = Math.max(1, (nowYear - firstYear) * 12 + Number(today().slice(5, 7)) - Number(earliest.slice(5, 7)) + 1)
    return lastNMonths(Math.min(n, 120)).reverse()
  }, [nowYear, firstYear, earliest])

  const dot = <span className="sw" style={{ background: color, width: 8, height: 8, borderRadius: 4, flex: 'none' }} />

  if (kind === 'month')
    return (
      <label className="flex" style={{ gap: 8 }}>
        {dot}
        <select className="select" style={{ width: 170 }} value={monthKey(value.from)} onChange={(e) => onChange(monthPeriod(e.target.value))}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, false)}
            </option>
          ))}
        </select>
      </label>
    )
  if (kind === 'quarter') {
    const y = Number(value.from.slice(0, 4))
    const q = Math.floor((Number(value.from.slice(5, 7)) - 1) / 3) + 1
    return (
      <div className="flex" style={{ gap: 8 }}>
        {dot}
        <select className="select" style={{ width: 84 }} value={q} onChange={(e) => onChange(quarterPeriod(y, Number(e.target.value)))}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              Q{n}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 96 }} value={y} onChange={(e) => onChange(quarterPeriod(Number(e.target.value), q))}>
          {years.map((yy) => (
            <option key={yy}>{yy}</option>
          ))}
        </select>
      </div>
    )
  }
  if (kind === 'year')
    return (
      <label className="flex" style={{ gap: 8 }}>
        {dot}
        <select className="select" style={{ width: 110 }} value={Number(value.from.slice(0, 4))} onChange={(e) => onChange(yearPeriod(Number(e.target.value)))}>
          {years.map((yy) => (
            <option key={yy}>{yy}</option>
          ))}
        </select>
      </label>
    )
  return (
    <div className="flex" style={{ gap: 8 }}>
      {dot}
      <input className="input" type="date" style={{ width: 150 }} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange(customPeriod(e.target.value, value.to))} />
      <span className="muted">→</span>
      <input className="input" type="date" style={{ width: 150 }} value={value.to} min={value.from} onChange={(e) => e.target.value && onChange(customPeriod(value.from, e.target.value))} />
    </div>
  )
}

/* ---------------- small bits ---------------- */

function Delta({ a, b, invert = false, unit = 'money', format }: { a: number; b: number; invert?: boolean; unit?: 'money' | 'pct' | 'num'; format?: (v: number) => string }) {
  const diff = a - b
  const pct = b !== 0 ? (diff / Math.abs(b)) * 100 : null
  const good = invert ? diff < 0 : diff > 0
  const neutral = Math.abs(diff) < 0.005
  const color = neutral ? 'var(--muted)' : good ? 'var(--green)' : 'var(--red)'
  const Icon = neutral ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight
  const txt = format ? format(Math.abs(diff)) : unit === 'pct' ? `${Math.abs(diff).toFixed(1)} pts` : String(Math.abs(Math.round(diff)))
  return (
    <span className="delta" style={{ color, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500 }}>
      <Icon size={13} />
      {diff > 0 ? '+' : diff < 0 ? '−' : ''}
      {txt}
      {pct !== null && !neutral && <span className="muted"> ({pct > 0 ? '+' : ''}{pct.toFixed(0)}%)</span>}
    </span>
  )
}

function DualBar({ a, b, max }: { a: number; b: number; max: number }) {
  const w = (v: number) => `${max ? Math.min(100, (v / max) * 100) : 0}%`
  return (
    <div className="dual-bar">
      <span style={{ width: w(a), background: A_COLOR }} />
      <span style={{ width: w(b), background: B_COLOR }} />
    </div>
  )
}

function Metric({ label, a, b, invert, format, unit, sub }: { label: string; a: number; b: number; invert?: boolean; format: (v: number) => string; unit?: 'money' | 'pct' | 'num'; sub?: ReactNode }) {
  return (
    <div className="cmp-metric">
      <div className="l">{label}</div>
      <div className="vals">
        <div>
          <i style={{ background: A_COLOR }} />
          <span className="v">{format(a)}</span>
        </div>
        <div>
          <i style={{ background: B_COLOR }} />
          <span className="v muted">{format(b)}</span>
        </div>
      </div>
      <Delta a={a} b={b} invert={invert} format={format} unit={unit} />
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/* ---------------- page ---------------- */

export function Compare() {
  const { transactions, categories, accounts, settings } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const earliest = useMemo(() => transactions.reduce((m, t) => (t.date < m ? t.date : m), today()), [transactions])

  const [kind, setKind] = useState<PeriodKind>('month')
  const [a, setA] = useState<Period>(() => currentPeriod('month'))
  const [b, setB] = useState<Period>(() => previousPeriod(currentPeriod('month'), 'month'))

  const changeKind = (k: PeriodKind) => {
    setKind(k)
    const cur = currentPeriod(k)
    setA(cur)
    setB(previousPeriod(cur, k))
  }

  const sa = useMemo(() => periodStats(transactions, categories, accounts, conv, a), [transactions, categories, accounts, conv, a])
  const sb = useMemo(() => periodStats(transactions, categories, accounts, conv, b), [transactions, categories, accounts, conv, b])
  const catDiff = useMemo(() => categoryDiff(sa, sb), [sa, sb])
  const incDiff = useMemo(() => categoryDiff(sa, sb, 'incomeCats'), [sa, sb])
  const payees = useMemo(() => payeeDiff(sa, sb), [sa, sb])
  const drivers = useMemo(() => changeDrivers(catDiff, 5), [catDiff])

  const cumulative = useMemo(() => {
    const len = Math.max(sa.cumulative.length, sb.cumulative.length)
    const tA = today()
    return Array.from({ length: len }, (_, i) => {
      // Local-date arithmetic: toISOString() would shift the day in UTC+ zones.
      const futureA = sa.cumulative[i] !== undefined ? addDays(a.from, i) > tA : true
      return { day: i + 1, a: futureA ? null : (sa.cumulative[i] ?? null), b: sb.cumulative[i] ?? null }
    })
  }, [sa, sb, a.from])

  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => {
    const idx = (i + 1) % 7
    return { day: d, a: sa.weekday[idx]!, b: sb.weekday[idx]! }
  })

  const catMax = Math.max(1, ...catDiff.map((c) => Math.max(c.a, c.b)))
  const tick = (v: number) => fmtCompact(v, settings.currency, settings.locale)
  const fmt0 = (v: number) => money(v, { maximumFractionDigits: 0 })
  const inProgress = sa.elapsedDays < sa.days && sa.elapsedDays > 0

  if (transactions.length === 0)
    return (
      <Card>
        <Empty title="Nothing to compare yet" hint="Add some transactions first." />
      </Card>
    )

  const presets: { label: string; run: () => void }[] = [
    { label: 'Previous period', run: () => setB(previousPeriod(a, kind)) },
    { label: 'Same period last year', run: () => setB(yearAgoPeriod(a, kind)) },
    { label: 'Today’s period', run: () => setA(currentPeriod(kind)) },
  ]

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <div className="flex between wrap" style={{ gap: 14 }}>
          <Segmented
            value={kind}
            onChange={changeKind}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'quarter', label: 'Quarter' },
              { value: 'year', label: 'Year' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          <div className="flex wrap" style={{ gap: 12 }}>
            <PeriodPicker kind={kind} value={a} onChange={setA} earliest={earliest} color={A_COLOR} />
            <button
              className="icon-btn"
              title="Swap periods"
              aria-label="Swap periods"
              onClick={() => {
                setA(b)
                setB(a)
              }}
            >
              <ArrowLeftRight size={15} />
            </button>
            <PeriodPicker kind={kind} value={b} onChange={setB} earliest={earliest} color={B_COLOR} />
          </div>
        </div>
        <div className="flex wrap" style={{ gap: 6, marginTop: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Quick:
          </span>
          {presets.map((p) => (
            <button key={p.label} className="btn sm ghost" onClick={p.run}>
              {p.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>
            <b style={{ color: A_COLOR }}>{a.label}</b> vs <b style={{ color: B_COLOR }}>{b.label}</b>
            {inProgress && ` · ${a.label} is ${sa.elapsedDays} of ${sa.days} days in`}
          </span>
        </div>
      </Card>

      <div className="cmp-metrics">
        <Metric label="Income" a={sa.income} b={sb.income} format={fmt0} />
        <Metric label="Expenses" a={sa.expense} b={sb.expense} invert format={fmt0} />
        <Metric label="Net" a={sa.net} b={sb.net} format={fmt0} />
        <Metric label="Savings rate" a={sa.savingsRate} b={sb.savingsRate} format={(v) => `${v.toFixed(1)}%`} unit="pct" />
        <Metric label="Avg. daily spend" a={sa.avgDaily} b={sb.avgDaily} invert format={fmt0} sub={inProgress ? 'Based on elapsed days' : undefined} />
        <Metric label="Avg. transaction" a={sa.avgTx} b={sb.avgTx} invert format={fmt0} />
        <Metric label="Largest expense" a={sa.largest} b={sb.largest} invert format={fmt0} />
        <Metric label="Transactions" a={sa.txCount} b={sb.txCount} format={(v) => String(Math.round(v))} unit="num" />
      </div>

      <div className="grid dash-grid">
        <Card className="col-7" title="Cumulative spending" sub="Running total of expenses, day by day">
          <div className="chart-legend">
            <span>
              <i style={{ background: A_COLOR }} /> {a.label}
            </span>
            <span>
              <i style={{ background: B_COLOR }} /> {b.label}
            </span>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={cumulative} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" {...axisProps} interval={kind === 'year' ? 30 : kind === 'quarter' ? 6 : 4} tickFormatter={(v) => `Day ${v}`} />
                <YAxis {...axisProps} tickFormatter={tick} width={56} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} />} />
                <Line type="monotone" dataKey="a" name={a.label} stroke={A_COLOR} strokeWidth={2.5} dot={false} connectNulls={false} animationDuration={800} />
                <Line type="monotone" dataKey="b" name={b.label} stroke={B_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={false} animationDuration={800} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-5" title="What changed" sub={`Spending ${drivers.totalChange >= 0 ? 'rose' : 'fell'} by ${money(Math.abs(drivers.totalChange), { maximumFractionDigits: 0 })}`}>
          {drivers.top.length === 0 ? (
            <Empty title="No expenses in either period" />
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {drivers.top.map((c) => {
                const share = drivers.totalChange ? (c.diff / Math.abs(drivers.totalChange)) * 100 : 0
                return (
                  <div key={c.id} className="driver">
                    <span className="tx-icon" style={{ width: 30, height: 30, fontSize: 13, background: `${c.color}22`, borderColor: `${c.color}55` }}>
                      {c.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex between">
                        <span style={{ fontWeight: 500 }}>{c.name}</span>
                        <span style={{ color: c.diff > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 500 }}>
                          {c.diff > 0 ? '+' : '−'}
                          {money(Math.abs(c.diff), { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="driver-bar">
                        <span style={{ width: `${Math.min(100, Math.abs(share))}%`, background: c.diff > 0 ? 'var(--red)' : 'var(--green)' }} />
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {money(c.b, { maximumFractionDigits: 0 })} → {money(c.a, { maximumFractionDigits: 0 })}
                        {c.pct !== null && ` · ${c.pct > 0 ? '+' : ''}${c.pct.toFixed(0)}%`}
                        {c.b === 0 && ' · new'}
                        {c.a === 0 && c.b > 0 && ' · none this period'}
                      </div>
                    </div>
                  </div>
                )
              })}
              {Math.abs(drivers.rest) > 0.5 && (
                <div className="muted" style={{ fontSize: 12 }}>
                  Everything else: {drivers.rest > 0 ? '+' : '−'}
                  {money(Math.abs(drivers.rest), { maximumFractionDigits: 0 })}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="col-7" title="Spending by category" sub="Side by side, sorted by the size of the change">
          {catDiff.length === 0 ? (
            <Empty title="No expenses" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th style={{ width: '30%' }} />
                    <th className="num" style={{ color: A_COLOR }}>
                      {a.label}
                    </th>
                    <th className="num" style={{ color: B_COLOR }}>
                      {b.label}
                    </th>
                    <th className="num">Change</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {catDiff.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="flex" style={{ gap: 8 }}>
                          <span>{c.icon}</span>
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                        </span>
                      </td>
                      <td>
                        <DualBar a={c.a} b={c.b} max={catMax} />
                      </td>
                      <td className="num">{money(c.a, { maximumFractionDigits: 0 })}</td>
                      <td className="num muted">{money(c.b, { maximumFractionDigits: 0 })}</td>
                      <td className="num">
                        <Delta a={c.a} b={c.b} invert format={fmt0} />
                      </td>
                      <td className="num muted" style={{ fontSize: 12 }}>
                        {c.shareA.toFixed(0)}% <span style={{ opacity: 0.6 }}>/ {c.shareB.toFixed(0)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="col-5 stack" style={{ gap: 16 }}>
          <Card title="Weekday pattern" sub="Total expenses per weekday">
            <div style={{ height: 190 }}>
              <ResponsiveContainer>
                <BarChart data={weekday} barGap={3} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="day" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={tick} width={56} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
                  <Bar dataKey="a" name={a.label} fill={A_COLOR} radius={[5, 5, 0, 0]} animationDuration={700} />
                  <Bar dataKey="b" name={b.label} fill={B_COLOR} radius={[5, 5, 0, 0]} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Income sources">
            {incDiff.length === 0 ? (
              <Empty title="No income in either period" />
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {incDiff.map((c) => (
                  <div key={c.id}>
                    <div className="flex between" style={{ fontSize: 13, marginBottom: 4 }}>
                      <span className="flex" style={{ gap: 6 }}>
                        <span>{c.icon}</span>
                        <span style={{ fontWeight: 500 }}>{c.name}</span>
                      </span>
                      <span className="flex" style={{ gap: 10 }}>
                        <span>{money(c.a, { maximumFractionDigits: 0 })}</span>
                        <Delta a={c.a} b={c.b} format={fmt0} />
                      </span>
                    </div>
                    <DualBar a={c.a} b={c.b} max={Math.max(1, ...incDiff.map((x) => Math.max(x.a, x.b)))} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="col-12" title="Payees" sub="Biggest movers, new payees and ones that disappeared">
          {payees.length === 0 ? (
            <Empty title="No payees" />
          ) : (
            <div className="payee-cols">
              <PayeeList title="Spent more" items={payees.filter((p) => p.status === 'up').slice(0, 6)} color="var(--red)" money={money} />
              <PayeeList title="Spent less" items={payees.filter((p) => p.status === 'down').slice(0, 6)} color="var(--green)" money={money} />
              <PayeeList title={`New in ${a.label}`} items={payees.filter((p) => p.status === 'new').slice(0, 6)} color={A_COLOR} money={money} />
              <PayeeList title={`Only in ${b.label}`} items={payees.filter((p) => p.status === 'gone').slice(0, 6)} color={B_COLOR} money={money} />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function PayeeList({ title, items, color, money }: { title: string; items: ReturnType<typeof payeeDiff>; color: string; money: (v: number, o?: Intl.NumberFormatOptions) => string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          —
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {items.map((p) => (
            <div key={p.payee} className="flex between" style={{ fontSize: 13, gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.payee}</span>
              <span style={{ color, whiteSpace: 'nowrap', fontWeight: 500 }}>
                {p.status === 'new' ? money(p.a, { maximumFractionDigits: 0 }) : p.status === 'gone' ? money(p.b, { maximumFractionDigits: 0 }) : `${p.diff > 0 ? '+' : '−'}${money(Math.abs(p.diff), { maximumFractionDigits: 0 })}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
