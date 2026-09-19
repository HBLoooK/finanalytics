// Spotify-Wrapped style summary of a calendar year.
import { useMemo, useState, useEffect } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useConverter, useStore } from '../store'
import { yearInReview } from '../lib/year'
import { fmtDate, today } from '../lib/utils'
import { Card, ChartTooltip, Empty, Money, Segmented, axisProps, useMoney } from '../components/ui'

export function YearInReview() {
  // Insight badges count the analysis you actually open.
  useEffect(() => {
    useStore.getState().bumpStat('yearReviewViews')
  }, [])

  const { transactions, accounts, categories } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const thisYear = Number(today().slice(0, 4))
  const years = useMemo(() => {
    const ys = new Set(transactions.map((t) => t.date.slice(0, 4)))
    ys.add(String(thisYear))
    return [...ys].filter((y) => /^\d{4}$/.test(y)).sort((a, b) => Number(b) - Number(a))
  }, [transactions, thisYear])
  const [year, setYear] = useState(String(thisYear))
  const review = useMemo(() => yearInReview(Number(year), transactions, accounts, categories, conv), [year, transactions, accounts, categories, conv])

  if (review.txCount === 0)
    return (
      <Card>
        <Empty title={`Nothing recorded in ${year}`} hint="Pick another year, or import a statement." />
      </Card>
    )

  const biggestMonth = review.monthly.reduce<(typeof review.monthly)[number] | null>((m, x) => (!m || x.expense > m.expense ? x : m), null)
  const delta = (v: number) => (
    <span style={{ color: v >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 500 }}>
      {v >= 0 ? '▲' : '▼'} {Math.abs(v).toFixed(0)}%
    </span>
  )

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="review-hero">
        <div className="flex between wrap" style={{ gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {review.year} in review
            </div>
            <div className="big">
              <Money value={review.expense} digits={0} />
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              spent across {review.txCount.toLocaleString()} transactions
              {review.comparedToPrev && (
                <>
                  {' · '}
                  {delta(review.comparedToPrev.expense)} vs {review.year - 1}
                </>
              )}
            </div>
          </div>
          <Segmented value={year} onChange={setYear} options={years.slice(0, 6).map((y) => ({ value: y, label: y }))} />
        </div>

        <div className="review-stats">
          <div className="s">
            <div className="l">Income</div>
            <div className="v" style={{ color: 'var(--green)' }}>
              <Money value={review.income} digits={0} />
            </div>
          </div>
          <div className="s">
            <div className="l">Saved</div>
            <div className="v">
              <Money value={review.net} digits={0} />
            </div>
          </div>
          <div className="s">
            <div className="l">Savings rate</div>
            <div className="v">{review.savingsRate.toFixed(0)}%</div>
          </div>
          <div className="s">
            <div className="l">Daily average</div>
            <div className="v">{money(review.dailyAverage, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      </div>

      <div className="grid dash-grid">
        <Card className="col-7" title="Month by month" sub="Income vs expenses">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={review.monthly} margin={{ left: -14, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => money(v, { notation: 'compact', maximumFractionDigits: 1 })} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
                <Bar dataKey="income" name="Income" fill="#3ec97a" radius={[5, 5, 5, 5]} maxBarSize={12} />
                <Bar dataKey="expense" name="Expenses" fill="#e05be0" radius={[5, 5, 5, 5]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-5" title="Highlights" sub="The year in numbers">
          <div className="stack" style={{ gap: 12 }}>
            <Highlight
              icon="🏆"
              label="Biggest spending month"
              value={biggestMonth ? `${biggestMonth.label} · ${money(biggestMonth.expense, { maximumFractionDigits: 0 })}` : '—'}
              hint="most spent"
            />
            <Highlight icon="🌱" label="Best month" value={review.best ? `${review.best.label} · ${money(review.best.net, { maximumFractionDigits: 0 })}` : '—'} hint="most kept" />
            <Highlight
              icon={review.topCategory?.icon ?? '📦'}
              label="Top category"
              value={review.topCategory ? `${review.topCategory.name} · ${money(review.topCategory.value, { maximumFractionDigits: 0 })}` : '—'}
              hint={review.topCategory ? `${((review.topCategory.value / Math.max(1, review.expense)) * 100).toFixed(0)}% of spending` : ''}
            />
            <Highlight icon="🧾" label="Top payee" value={review.topPayee ? `${review.topPayee.payee} · ${money(review.topPayee.total, { maximumFractionDigits: 0 })}` : '—'} hint={review.topPayee ? `${review.topPayee.count} visits` : ''} />
            <Highlight
              icon="💸"
              label="Biggest single purchase"
              value={review.biggest ? `${money(review.biggest.amount, { maximumFractionDigits: 0 })} · ${review.biggest.payee}` : '—'}
              hint={review.biggest ? fmtDate(review.biggest.date) : ''}
            />
            <Highlight icon="🫘" label="Smallest purchase" value={review.smallest ? `${money(review.smallest.amount)} · ${review.smallest.payee}` : '—'} hint="" />
            <Highlight
              icon="📅"
              label="Busiest day"
              value={review.busiestDay ? `${fmtDate(review.busiestDay.date)}` : '—'}
              hint={review.busiestDay ? `${review.busiestDay.count} transactions · ${money(review.busiestDay.total, { maximumFractionDigits: 0 })}` : ''}
            />
            <Highlight icon="🧘" label="Longest no-spend streak" value={`${review.longestNoSpend} days`} hint="consecutive days without an expense" />
            <Highlight icon="☕" label="In coffee units" value={Math.round(review.coffeeEquivalent).toLocaleString()} hint="at about 4 per cup" />
          </div>
        </Card>

        <Card className="col-12" title="Where it went" sub="Category totals for the year">
          <div className="stack" style={{ gap: 10 }}>
            {review.categories.slice(0, 10).map((c) => (
              <div className="bar-row" key={c.id} style={{ marginBottom: 0 }}>
                <div className="t">
                  <span>
                    {c.icon} {c.name}
                  </span>
                  <span>
                    <b>{money(c.value, { maximumFractionDigits: 0 })}</b> <span className="muted">{c.pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="progress" style={{ height: 7 }}>
                  <span style={{ width: `${c.pct}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Highlight({ icon, label, value, hint }: { icon: string; label: string; value: string; hint?: string }) {
  return (
    <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className="tx-icon" style={{ width: 34, height: 34, fontSize: 15 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          {value}
        </div>
        {hint && (
          <div className="muted" style={{ fontSize: 11.5 }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

