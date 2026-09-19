import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Card } from '../components/ui'
import { useStore } from '../store'
import { HELP, HELP_GROUPS, helpById, searchHelp } from '../lib/help'
import { TOURS } from '../lib/tours'

const RECIPES: { q: string; title: string; ids: string[] }[] = [
  { q: 'safe to spend', title: 'Work out what I can actually spend today', ids: ['safe-to-spend', 'safe-to-spend-perday'] },
  { q: 'budget', title: 'Stop a category from overrunning', ids: ['budget', 'burn-down', 'rollover'] },
  { q: 'drill down', title: 'See which transactions make up a total', ids: ['drill-down', 'heatmap'] },
  { q: 'split', title: 'Split one receipt across categories', ids: ['splits', 'transaction'] },
  { q: 'variable bill', title: 'Track a bill that changes every month', ids: ['variable-bill', 'auto-match'] },
  { q: 'return', title: 'Understand my investment return', ids: ['xirr', 'twr', 'lot'] },
  { q: 'debt', title: 'Pay off debt in the cheapest order', ids: ['avalanche', 'amortisation', 'apr'] },
  { q: 'import', title: 'Import a bank statement safely', ids: ['import', 'import-batch'] },
  { q: 'alias', title: 'Rename a merchant once and for all', ids: ['alias', 'rules', 'why-category'] },
  { q: 'backup', title: 'Back up my data and prove it restores', ids: ['backup', 'sql-console', 'sync'] },
  { q: 'tax', title: 'Work out my tax-deductible spend', ids: ['tax-deductible', 'attachment', 'reports'] },
  { q: 'badges', title: 'Understand how progression works', ids: ['xp', 'badges', 'quests', 'coach'] },
]

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl K', 'Command palette'],
  ['/', 'Focus search'],
  ['N', 'New transaction'],
  ['?', 'This help centre'],
  ['Esc', 'Close any dialog or tour'],
]

/** The searchable explanation centre: every concept the app uses, in one place. */
export function HelpPage() {
  const [q, setQ] = useState('')
  const tourSeen = useStore((s) => s.settings.tourSeen ?? [])
  const updateSettings = useStore((s) => s.updateSettings)

  const results = useMemo(() => searchHelp(q), [q])
  const grouped = useMemo(() => {
    if (q.trim()) return [{ group: `Results for “${q.trim()}”`, ids: results.map((r) => r.id) }]
    return HELP_GROUPS.map((g) => ({ ...g, ids: g.ids.filter((id) => helpById.has(id)) }))
  }, [q, results])

  return (
    <>
      <Card>
        <label className="search help-search">
          <input
            placeholder={`Search ${HELP.length} explanations — try “XIRR”, “rollover”, “safe to spend”…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <Search size={15} />
        </label>
      </Card>

      <Card title="How do I…?" sub="Twelve common questions, answered from the same catalogue">
        <ul className="recipe-list">
          {RECIPES.map((r) => (
            <li key={r.q} className="recipe">
              <div className="recipe-q">{r.title}</div>
              <div className="recipe-links">
                {r.ids.map((id) => {
                  const entry = helpById.get(id)
                  if (!entry) return null
                  return (
                    <button key={id} className="chip" onClick={() => document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
                      {entry.title}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {grouped.map((g) =>
        g.ids.length ? (
          <Card key={g.group} title={g.group} sub={`${g.ids.length} entries`}>
            <div className="help-index">
              {g.ids.map((id) => {
                const entry = helpById.get(id)
                if (!entry) return null
                return (
                  <details key={id} className="help-entry" id={`help-${id}`}>
                    <summary>
                      <b>{entry.title}</b>
                      <span className="muted">{entry.what}</span>
                    </summary>
                    <div className="help-entry-body">
                      <p>{entry.how}</p>
                      {entry.formula && <code className="infotip-formula">{entry.formula}</code>}
                      <p>
                        <b>Why it matters.</b> {entry.why}
                      </p>
                      {entry.example && <p className="help-example">{entry.example}</p>}
                      {entry.seeAlso?.length ? (
                        <div className="infotip-seealso">
                          {entry.seeAlso.map((sid) => {
                            const other = helpById.get(sid)
                            if (!other) return null
                            return (
                              <button key={sid} className="chip" onClick={() => document.getElementById(`help-${sid}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
                                {other.title}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  </details>
                )
              })}
            </div>
          </Card>
        ) : null,
      )}

      <Card title="Keyboard" sub="Everything reachable without the mouse">
        <ul className="metric-list">
          {SHORTCUTS.map(([key, label]) => (
            <li key={key}>
              <span>{label}</span>
              <b>
                <code>{key}</code>
              </b>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Guided tours" sub="Three spotlights per page, shown once">
        <div className="title-row">
          {TOURS.map((t) => (
            <span key={t.id} className={`title-chip ${tourSeen.includes(t.id) ? 'on' : ''}`}>
              {t.id}
            </span>
          ))}
        </div>
        <div className="review-actions">
          <button className="btn small" onClick={() => updateSettings({ tourSeen: [] })}>
            Replay every tour
          </button>
          {tourSeen.length > 0 && (
            <button
              className="btn small ghost"
              onClick={() => updateSettings({ tourSeen: tourSeen.filter((id) => id !== TOURS[0]?.id) })}
            >
              Replay the dashboard tour
            </button>
          )}
        </div>
      </Card>
    </>
  )
}
