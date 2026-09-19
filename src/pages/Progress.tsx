import { useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { Card, Tabs, axisProps } from '../components/ui'
import { InfoTip } from '../components/InfoTip'
import { useStore } from '../store'
import {
  ALL_TITLES,
  MAX_LEVEL,
  levelProgress,
  questProgress,
  seasonRecords,
  streakValue,
  titleForLevel,
  xpForLevel,
  xpSeries,
  type GameCtx,
} from '../lib/gamification'
import { BADGES, TIER_NAMES, badgeProgressLabel, badgesByFamily } from '../lib/badges'
import { addDays, lastNMonths, monthLabel, today } from '../lib/utils'

type Tab = 'quests' | 'badges' | 'history'

const BEST_LABELS: Record<string, string> = {
  streak: 'Longest logging streak',
  reviewStreak: 'Longest review streak',
  loggingDays: 'Most days logged in a month',
  savingsRate: 'Best savings rate',
}

export function Progress() {
  const state = useStore()
  const [tab, setTab] = useState<Tab>('quests')
  const date = today()
  const p = state.progress
  const xp = p?.xp ?? 0
  const lv = levelProgress(xp)
  const live = p ? streakValue(p.streak, date) : 0
  const enabled = state.settings.gamification?.enabled !== false

  const ctx = state as unknown as GameCtx
  const series = useMemo(() => (p ? xpSeries(p, 14, date) : []), [p, date])
  const grid = useMemo(() => {
    const cells: { date: string; xp: number }[] = []
    for (let i = 48; i >= 0; i--) {
      const d = addDays(date, -i)
      cells.push({ date: d, xp: p?.xpLog[d] ?? 0 })
    }
    return cells
  }, [p, date])
  const seasons = useMemo(() => (p ? seasonRecords(p, ctx, lastNMonths(6, date.slice(0, 7))) : []), [p, ctx, date])
  const unlockedCount = Object.keys(p?.badges ?? {}).length

  // Level ring
  const size = 148
  const stroke = 10
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, lv.pct)) / 100) * circ

  if (!enabled)
    return (
      <Card title="Progress is switched off">
        <p className="muted">
          Turn it back on in <Link to="/settings">Settings → Progress &amp; tips</Link>.
        </p>
      </Card>
    )

  return (
    <>
      <section className="progress-hero">
        <div className="level-ring" aria-hidden>
          <svg width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ - dash}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="level-ring-label">
            <b>{lv.level}</b>
            <span>level</span>
          </div>
        </div>
        <div className="progress-hero-meta">
          <h2>
            {state.settings.gamification?.pinnedTitle?.trim() || titleForLevel(lv.level)}
            {live > 0 && <span className="progress-flame">🔥 {live} days</span>}
          </h2>
          <p className="muted">
            {xp.toLocaleString()} XP · {lv.into} of {lv.need} towards level {Math.min(MAX_LEVEL, lv.level + 1)}
            {lv.level < MAX_LEVEL ? ` · ${xpForLevel(lv.level + 1).toLocaleString()} XP total needed` : ' · maximum level reached'}
          </p>
          <ul className="metric-list">
            <li>
              <span>Badges</span>
              <b>
                {unlockedCount} / {BADGES.length}
              </b>
            </li>
            <li>
              <span>Reviews</span>
              <b>{p?.reviews.length ?? 0}</b>
            </li>
            <li>
              <span>Check-ins</span>
              <b>{p?.checkIns.length ?? 0}</b>
            </li>
            <li>
              <span>Longest streak</span>
              <b>{p?.streak.longest ?? 0} days</b>
            </li>
          </ul>
          <div className="progress-hero-actions">
            <Link className="btn small" to="/weekly">
              Weekly review
            </Link>
            <button className="btn small ghost" onClick={() => state.resetProgress()}>
              Recompute from history
            </button>
          </div>
        </div>
        <div className="progress-hero-titles">
          <div className="card-sub">
            Titles <InfoTip id="xp" />
          </div>
          <div className="title-row">
            {ALL_TITLES.map((t) => (
              <span key={t.level} className={`title-chip ${lv.level >= t.level ? 'on' : ''}`} title={`Level ${t.level}`}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'quests', label: 'Quests' },
          { value: 'badges', label: 'Badges' },
          { value: 'history', label: 'History' },
        ]}
      />

      {tab === 'quests' && (
        <div className="quest-board">
          {['daily', 'weekly'].map((kind) => {
            const rows = (p?.quests ?? []).filter((q) => q.kind === kind && q.expires >= date)
            return (
              <Card key={kind} title={kind === 'daily' ? 'Today' : 'This week'} sub={kind === 'daily' ? 'Generated from your own averages' : 'One mission'}>
                {rows.length === 0 && <p className="muted">Nothing here yet — the board refreshes a moment after the page loads.</p>}
                <ul className="quest-list">
                  {rows.map((q) => {
                    const done = questProgress(q, ctx, date)
                    const pct = Math.max(0, Math.min(100, (done / Math.max(1, q.target)) * 100))
                    const complete = done >= q.target
                    return (
                      <li key={q.id} className={`quest ${complete ? 'complete' : ''}`}>
                        <div className="quest-top">
                          <span className="quest-text">{q.text}</span>
                          <span className="quest-reward">+{q.reward} XP</span>
                        </div>
                        <div className="quest-bar">
                          <i style={{ width: `${pct}%` }} />
                        </div>
                        <div className="quest-foot">
                          <span>
                            {done} / {q.target}
                          </span>
                          <span className="muted">expires {q.expires}</span>
                          {complete && q.state === 'done' && (
                            <button className="btn small ghost" onClick={() => state.claimQuest(q.id)}>
                              Claim
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'badges' && (
        <div className="badge-shelf">
          {badgesByFamily().map((group) => (
            <Card key={group.family} title={group.family} sub={`${group.items.filter((b) => p?.badges[b.id]).length} of ${group.items.length}`}>
              <div className="badge-grid">
                {group.items.map((b) => {
                  const award = p?.badges[b.id]
                  let value = 0
                  try {
                    value = b.value(ctx)
                  } catch {
                    value = 0
                  }
                  return (
                    <div key={b.id} className={`badge ${award ? `tier-${award.tier}` : 'locked'}`} title={b.desc}>
                      <span className="badge-icon" aria-hidden>
                        {award ? b.icon : '🔒'}
                      </span>
                      <span className="badge-name">{b.name}</span>
                      <span className="badge-prog">{award ? TIER_NAMES[award.tier] : badgeProgressLabel(b, value)}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <>
          <Card title="Last 14 days" sub="XP per day, capped at 200">
            <div style={{ height: 190 }}>
              <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(8)} {...axisProps} />
                  <Tooltip cursor={{ fill: 'var(--panel-2)' }} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10 }} labelFormatter={(v) => String(v)} formatter={(v) => [`${v} XP`, 'XP']} />
                  <Bar dataKey="xp" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Streak" sub="Last seven weeks — one square per day">
            <div className="streak-grid">
              {grid.map((c) => {
                const level = c.xp <= 0 ? 0 : c.xp < 40 ? 1 : c.xp < 100 ? 2 : c.xp < 170 ? 3 : 4
                return <i key={c.date} className={`streak-cell lv${level}`} title={`${c.date} — ${c.xp} XP`} aria-label={`${c.date}, ${c.xp} XP`} />
              })}
            </div>
            <p className="muted">
              Current {live} · longest {p?.streak.longest ?? 0} · grace tokens {p?.streak.freezes ?? 0}
            </p>
          </Card>

          <Card title="Personal bests" sub="Records only ever go up">
            <ul className="metric-list">
              {Object.entries(p?.personalBests ?? {}).map(([k, v]) => (
                <li key={k}>
                  <span>{BEST_LABELS[k] ?? k}</span>
                  <b>
                    {v}
                    {k === 'savingsRate' ? '%' : ''}
                    {k.endsWith('streak') ? ' weeks' : k === 'streak' ? ' days' : ''}
                  </b>
                </li>
              ))}
              {Object.keys(p?.personalBests ?? {}).length === 0 && <li className="muted">No records yet — they appear as you build history.</li>}
            </ul>
          </Card>

          <Card title="Seasons" sub="You against your own past months">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Days logged</th>
                  <th>Categorised</th>
                  <th>Reviews</th>
                  <th>Savings</th>
                  <th>XP</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.month}>
                    <td>{monthLabel(s.month)}</td>
                    <td className="mono">{s.metrics.loggingDays}</td>
                    <td className="mono">{s.metrics.categorisedPct}%</td>
                    <td className="mono">{s.metrics.reviews}</td>
                    <td className="mono">{s.metrics.savingsRate}%</td>
                    <td className="mono">{s.xp}</td>
                    <td>{s.best ? <span className="chip gold">{s.best}</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Savings rate is income minus expenses over income, in {state.settings.currency}.</p>
          </Card>
        </>
      )}
    </>
  )
}

