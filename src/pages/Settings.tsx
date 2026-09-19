import { useEffect, useRef, useState } from 'react'
import { Database, Download, HardDriveDownload, Pencil, Plus, RotateCcw, Terminal, Trash2, Upload } from 'lucide-react'
import { exportData, useStore } from '../store'
import type { AppData, Category } from '../lib/types'
import { CATEGORY_COLORS, ICONS } from '../lib/seed'
import { downloadFile, today } from '../lib/utils'
import { fetchDbStatus, requestBackup, restoreBackup, restoreUpload, runQuery, useSync, type DbStatus } from '../lib/sync'
import { Card, Modal } from '../components/ui'
import { useToast } from '../components/Toasts'
import { suggestAliases } from '../lib/matching'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'MAD', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'PLN', 'CZK', 'TRY', 'ZAR', 'SGD', 'AED', 'SAR', 'EGP', 'CNY', 'KRW']

export function SettingsPage() {
  const { settings, updateSettings, setRate, categories, addCategory, updateCategory, deleteCategory, transactions, accounts, replaceAll, resetDemo, resetEmpty, clearAll, addAlias, deleteAlias, deleteSavedView, archiveAccount } = useStore()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [tab, setTab] = useState<'general' | 'data' | 'categories' | 'advanced'>('general')
  const [newCur, setNewCur] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const dbFileRef = useRef<HTMLInputElement>(null)
  const sync = useSync()
  const toast = useToast()
  const [db, setDb] = useState<DbStatus | null>(null)
  const refreshDb = () => fetchDbStatus().then(setDb)
  useEffect(() => {
    refreshDb()
  }, [sync.lastSavedAt])

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as AppData
      if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('bad')
      if (!window.confirm(`Import ${data.transactions.length} transactions and replace current data?`)) return
      replaceAll(data)
      toast('Backup imported')
    } catch {
      toast('That file is not a valid Finanalytics backup')
    }
  }

  const storageKb = Math.round((localStorage.getItem('finanalytics:v2')?.length ?? 0) / 1024)
  const fmtKb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
  const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(settings.locale) : '—')
  const usedCurrencies = new Set(accounts.map((a) => a.currency))

  const changeBase = (next: string) => {
    // Re-express rates relative to the new base: rate_new(c) = rate_old(c) / rate_old(next)
    const oldRate = settings.rates[next] ?? 1
    const rates: Record<string, number> = {}
    for (const [c, r] of Object.entries(settings.rates)) rates[c] = r / oldRate
    rates[next] = 1
    updateSettings({ currency: next, rates })
  }

  const aliasSuggestions = suggestAliases(transactions, settings.aliases ?? [])

  return (
    <div className="grid dash-grid">
      <div className="col-12 tabs no-print" style={{ marginBottom: -4 }}>
        {(
          [
            ['general', 'Profile & preferences'],
            ['data', 'Database & backups'],
            ['categories', 'Categories, aliases & views'],
            ['advanced', 'Advanced'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
          <Card className="col-6" title="Profile & preferences">
            <div className="form-grid">
              <div className="field full">
                <label>Your name</label>
                <input className="input" value={settings.name} onChange={(e) => updateSettings({ name: e.target.value })} />
              </div>
              <div className="field">
                <label>Base currency (reports & totals)</label>
                <select className="select" value={settings.currency} onChange={(e) => changeBase(e.target.value)}>
                  {[...new Set([...CURRENCIES, ...Object.keys(settings.rates)])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Number format</label>
                <select className="select" value={settings.locale} onChange={(e) => updateSettings({ locale: e.target.value })}>
                  {['en-US', 'en-GB', 'fr-FR', 'fr-MA', 'ar-MA', 'de-DE', 'es-ES', 'it-IT', 'pt-BR', 'nl-NL', 'pl-PL', 'ja-JP', 'en-IN'].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Theme</label>
                <div className="segmented" style={{ width: 'fit-content' }}>
                  <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => updateSettings({ theme: 'dark' })}>
                    Dark
                  </button>
                  <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => updateSettings({ theme: 'light' })}>
                    Light
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Month starts on day</label>
                <select className="select" value={settings.monthStartDay} onChange={(e) => updateSettings({ monthStartDay: Number(e.target.value) })}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  Payday on the 25th? Set 25 and every “this month” figure follows your cycle.
                </div>
              </div>
              <div className="field">
                <label>Week starts on</label>
                <select className="select" value={settings.weekStart ?? 1} onChange={(e) => updateSettings({ weekStart: Number(e.target.value) as 0 | 1 })}>
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </div>
              <label className="check full">
                <input type="checkbox" checked={settings.safeToSpend !== false} onChange={(e) => updateSettings({ safeToSpend: e.target.checked })} />
                Show “safe to spend” on the dashboard
              </label>
              <label className="check full">
                <input type="checkbox" checked={settings.hideArchived !== false} onChange={(e) => updateSettings({ hideArchived: e.target.checked })} />
                Hide archived accounts from totals and pickers
              </label>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 16 }}>
              Shortcuts: <kbd>N</kbd> new · <kbd>⌘K</kbd> command palette · <kbd>/</kbd> search · <kbd>Esc</kbd> close
            </div>
          </Card>

          <Card className="col-6" title="Currencies & exchange rates" sub={`How many units of each currency equal 1 ${settings.currency}.`}>
            <div className="stack" style={{ gap: 8 }}>
              {Object.entries(settings.rates)
                .sort(([a], [b]) => (a === settings.currency ? -1 : b === settings.currency ? 1 : a.localeCompare(b)))
                .map(([c, r]) => (
                  <div key={c} className="flex between" style={{ fontSize: 13 }}>
                    <span className="flex" style={{ gap: 8 }}>
                      <b style={{ width: 44 }}>{c}</b>
                      {usedCurrencies.has(c) && <span className="tag">in use</span>}
                      {c === settings.currency && <span className="muted">base</span>}
                    </span>
                    <span className="flex" style={{ gap: 6 }}>
                      <span className="muted">1 {settings.currency} =</span>
                      <input
                        className="input"
                        type="number"
                        step="any"
                        min="0"
                        value={r}
                        disabled={c === settings.currency}
                        onChange={(e) => setRate(c, Number(e.target.value) || 0)}
                        style={{ width: 110, padding: '5px 8px', textAlign: 'right' }}
                      />
                      <button
                        className="mini-btn danger"
                        disabled={c === settings.currency || usedCurrencies.has(c)}
                        onClick={() => {
                          const { [c]: _gone, ...rest } = settings.rates
                          void _gone
                          updateSettings({ rates: rest })
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </div>
                ))}
              <div className="flex" style={{ marginTop: 6 }}>
                <select className="select" value={newCur} onChange={(e) => setNewCur(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Add currency…</option>
                  {CURRENCIES.filter((c) => !(c in settings.rates)).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  className="btn sm"
                  disabled={!newCur}
                  onClick={() => {
                    setRate(newCur, 1)
                    setNewCur('')
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Rates are manual — nothing leaves your machine. Last updated {fmtWhen(settings.ratesUpdatedAt ?? null)}.
              </div>
            </div>
          </Card>
        </>
      )}

      {tab === 'data' && (
        <>
          <Card
            className="col-12"
            title="Database"
            sub={db ? `SQLite · ${db.path}` : sync.status === 'offline' ? 'The database server is not reachable — changes are cached in this browser and pushed when it is back.' : 'Connecting…'}
            action={
              <span className="pill">
                <span className="sw" style={{ background: sync.status === 'saved' ? 'var(--green)' : sync.status === 'saving' ? 'var(--yellow)' : 'var(--red)' }} />
                {sync.status === 'saved' ? 'Up to date' : sync.status === 'saving' ? 'Saving…' : sync.status === 'offline' ? 'Offline' : sync.status === 'error' ? 'Retrying' : 'Loading'}
              </span>
            }
          >
            <div className="kpi-inline" style={{ marginBottom: 14 }}>
              <div>
                <div className="l">Records</div>
                <div className="v">{db ? Object.values(db.counts).reduce((a, b) => a + b, 0) : transactions.length}</div>
              </div>
              <div>
                <div className="l">Database size</div>
                <div className="v">{db ? fmtKb(db.size) : `${storageKb} KB`}</div>
              </div>
              <div>
                <div className="l">Last saved</div>
                <div className="v" style={{ fontSize: 14, marginTop: 6 }}>
                  {fmtWhen(db?.savedAt ?? sync.lastSavedAt)}
                </div>
              </div>
              <div>
                <div className="l">Last automatic backup</div>
                <div className="v" style={{ fontSize: 14, marginTop: 6 }}>
                  {fmtWhen(db?.lastBackupAt ?? null)}
                </div>
              </div>
            </div>
            <div className="flex wrap">
              <button
                className="btn"
                disabled={!db}
                onClick={async () => {
                  const b = await requestBackup()
                  if (b) {
                    toast('Snapshot created and verified')
                    refreshDb()
                  } else toast('Backup failed')
                }}
              >
                <Database size={15} /> Snapshot now
              </button>
              <a className={`btn ${db ? '' : 'ghost'}`} href="/api/backup/download" download aria-disabled={!db}>
                <HardDriveDownload size={15} /> Download .db file
              </a>
              <button
                className="btn ghost"
                disabled={!db?.backups.length}
                title="Replace the live database with a snapshot (a backup of the current data is taken first)"
                onClick={async () => {
                  const name = db?.backups[0]?.name
                  if (!name) return
                  if (!window.confirm(`Restore ${name}? The current database will be snapshotted first, then replaced.`)) return
                  const r = await restoreBackup(name)
                  if (r.ok) {
                    toast('Restored — reloading')
                    setTimeout(() => window.location.reload(), 900)
                  } else toast(`Restore failed: ${r.error ?? 'unknown error'}`)
                }}
              >
                <RotateCcw size={15} /> Restore latest snapshot
              </button>
              <button className="btn ghost" onClick={() => dbFileRef.current?.click()}>
                <Upload size={15} /> Restore from .db file
              </button>
              <input
                ref={dbFileRef}
                type="file"
                accept=".db,.sqlite,.sqlite3"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  if (!window.confirm(`Replace the whole database with “${f.name}”? A snapshot of the current data is taken first.`)) return
                  const r = await restoreUpload(f)
                  if (r.ok) {
                    toast('Restored — reloading')
                    setTimeout(() => window.location.reload(), 900)
                  } else toast(`Restore failed: ${r.error ?? 'not a valid SQLite file'}`)
                }}
              />
            </div>
            {db && db.backups.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  Snapshots in <span className="mono">{db.backupDir}</span> — a daily one is taken automatically, newest 14 kept, each verified with an integrity check.
                </div>
                <div className="flex wrap" style={{ gap: 6 }}>
                  {db.backups.slice(0, 8).map((b) => (
                    <button
                      key={b.name}
                      className="pill"
                      title={`${fmtWhen(b.createdAt)}${b.sha256 ? `\nSHA-256 ${b.sha256.slice(0, 16)}…` : ''}\nClick to restore`}
                      onClick={async () => {
                        if (!window.confirm(`Restore ${b.name} (${fmtWhen(b.createdAt)})? The current data is snapshotted first.`)) return
                        const r = await restoreBackup(b.name)
                        if (r.ok) {
                          toast('Restored — reloading')
                          setTimeout(() => window.location.reload(), 900)
                        } else toast(`Restore failed: ${r.error ?? ''}`)
                      }}
                    >
                      {b.name.replace('finanalytics-', '').replace('.db', '').slice(0, 10)} · {fmtKb(b.size)}
                    </button>
                  ))}
                  {db.backups.length > 8 && <span className="muted">+{db.backups.length - 8} more</span>}
                </div>
              </div>
            )}
            <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
              Your data lives in a SQLite file on this machine, not in the browser. Clearing site data or switching browsers no longer loses anything.
            </p>
          </Card>

          <Card className="col-12" title="Portable backups & reset" sub={`${transactions.length} transactions`}>
            <div className="flex wrap">
              <button
                className="btn"
                onClick={() => {
                  downloadFile(`finanalytics-backup-${today()}.json`, JSON.stringify(exportData(), null, 2))
                  toast('Backup downloaded')
                }}
              >
                <Download size={15} /> Export backup (JSON)
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Import backup
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onImport(f)
                  e.target.value = ''
                }}
              />
              <span style={{ flex: 1 }} />
              <button
                className="btn"
                onClick={() => {
                  if (window.confirm('Start over with empty data? Accounts, transactions, budgets and debts are cleared (you can undo).')) {
                    resetEmpty()
                    toast('Emptied — undo available')
                  }
                }}
              >
                Start empty
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (window.confirm('Replace everything with fresh demo data?')) {
                    resetDemo()
                    toast('Demo data loaded')
                  }
                }}
              >
                Load demo data
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  if (window.confirm('Delete ALL transactions, budgets, goals, bills, holdings and debts? Accounts are kept with a zero balance.')) {
                    clearAll()
                    toast('Data cleared — undo available')
                  }
                }}
              >
                <Trash2 size={15} /> Clear all data
              </button>
            </div>
          </Card>
        </>
      )}

      {tab === 'categories' && (
        <>
          <Card
            className="col-12"
            title="Categories"
            action={
              <button className="btn primary sm" onClick={() => setEditing('new')}>
                <Plus size={14} /> New category
              </button>
            }
          >
            {(['expense', 'income'] as const).map((kind) => (
              <div key={kind}>
                <div className="nav-section" style={{ paddingLeft: 0 }}>
                  {kind}
                </div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 10 }}>
                  {categories
                    .filter((c) => c.kind === kind)
                    .map((c) => {
                      const count = transactions.filter((t) => t.categoryId === c.id).length
                      return (
                        <div key={c.id} className="flex between subtle-panel" style={{ padding: '10px 12px' }}>
                          <div className="flex">
                            <span className="tx-icon" style={{ width: 34, height: 34, fontSize: 15, background: `${c.color}22`, borderColor: `${c.color}55` }}>
                              {c.icon}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {count} tx
                              </div>
                            </div>
                          </div>
                          <div className="flex" style={{ gap: 4 }}>
                            <button className="mini-btn" onClick={() => setEditing(c)} aria-label="Edit">
                              <Pencil size={13} />
                            </button>
                            <button
                              className="mini-btn danger"
                              aria-label="Delete"
                              onClick={() => {
                                const others = categories.filter((x) => x.kind === kind && x.id !== c.id)
                                const merge = window.confirm(`Delete “${c.name}”?\n\nOK → its ${count} transactions become uncategorised.\nCancel → choose another category to move them to.`) ? null : others.length ? promptMerge(others) : null
                                if (merge === undefined) return
                                deleteCategory(c.id, merge)
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
          </Card>

          <Card className="col-6" title="Merchant aliases" sub="Clean up raw bank payee strings (AMZN*MKTP → Amazon). Applied everywhere payees are shown.">
            <div className="stack" style={{ gap: 8 }}>
              {(settings.aliases ?? []).map((a) => (
                <div key={a.id} className="flex between subtle-panel" style={{ padding: '8px 12px', fontSize: 13 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="muted">{a.from}</span> → <b>{a.to}</b>
                  </span>
                  <button className="mini-btn danger" onClick={() => deleteAlias(a.id)} aria-label="Remove alias">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {aliasSuggestions.slice(0, 6).map((s) => (
                <div key={s.to} className="flex between subtle-panel" style={{ padding: '8px 12px', fontSize: 12.5 }}>
                  <span style={{ minWidth: 0 }}>
                    <b>{s.to}</b> <span className="muted">· {s.variants.map(([v]) => v).slice(0, 2).join(', ')}</span>
                  </span>
                  <button className="btn sm" onClick={() => addAlias(s.variants[0]![0], s.to)}>
                    <Plus size={12} /> Add
                  </button>
                </div>
              ))}
              {(settings.aliases ?? []).length === 0 && aliasSuggestions.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No messy payees found yet — import a statement and check back.</div>}
              <div className="flex">
                <input className="input" id="alias-from" placeholder="raw text (e.g. amzn)" style={{ flex: 1 }} />
                <input className="input" id="alias-to" placeholder="→ Amazon" style={{ flex: 1 }} />
                <button
                  className="btn sm"
                  onClick={() => {
                    const f = document.querySelector<HTMLInputElement>('#alias-from')
                    const t = document.querySelector<HTMLInputElement>('#alias-to')
                    if (f?.value && t?.value) {
                      addAlias(f.value, t.value)
                      f.value = ''
                      t.value = ''
                    }
                  }}
                >
                  Add alias
                </button>
              </div>
            </div>
          </Card>

          <Card className="col-6" title="Saved views" sub="Named transaction filters, one click from the Transactions page.">
            <div className="stack" style={{ gap: 8 }}>
              {(settings.savedViews ?? []).map((v) => (
                <div key={v.id} className="flex between subtle-panel" style={{ padding: '8px 12px', fontSize: 13 }}>
                  <span>
                    <b>{v.name}</b> <span className="muted mono" style={{ fontSize: 11.5 }}>{v.query || '(current filters)'}</span>
                  </span>
                  <button className="mini-btn danger" onClick={() => deleteSavedView(v.id)} aria-label="Remove view">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {(settings.savedViews ?? []).length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Save a filter set from the Transactions page and it shows up here.</div>}
            </div>
          </Card>
        </>
      )}

      {tab === 'advanced' && (
        <>
          <SqlConsole />
          <Card className="col-12" title="Archived accounts" sub="Archiving keeps every transaction; nothing is lost.">
            {accounts.filter((a) => a.archived).length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>Nothing archived.</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {accounts
                  .filter((a) => a.archived)
                  .map((a) => (
                    <div key={a.id} className="flex between subtle-panel" style={{ padding: '8px 12px', fontSize: 13 }}>
                      <span>
                        <b>{a.name}</b> <span className="muted">· {a.currency}</span>
                      </span>
                      <button className="btn sm" onClick={() => archiveAccount(a.id, false)}>
                        <RotateCcw size={13} /> Restore
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </>
      )}

      {editing && (
        <CategoryModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            if (editing === 'new') addCategory(c)
            else updateCategory(editing.id, c)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function promptMerge(others: Category[]): string | null | undefined {
  const pick = window.prompt(`Move its transactions to which category?\n\n${others.map((o, i) => `${i + 1}. ${o.name}`).join('\n')}\n\nType the number (or leave empty for uncategorised):`, '')
  if (pick === null) return undefined
  const idx = Number(pick) - 1
  return others[idx]?.id ?? null
}

function SqlConsole() {
  const [sql, setSql] = useState("SELECT date, payee, amount, type FROM transactions ORDER BY date DESC LIMIT 20")
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    setError('')
    const r = await runQuery(sql)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      setRows(null)
      return
    }
    setRows(r.rows ?? [])
  }

  const toCsv = () => {
    if (!rows?.length) return
    const cols = Object.keys(rows[0]!)
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    downloadFile(`query-${today()}.csv`, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'), 'text/csv')
  }

  return (
    <Card className="col-12" title="SQL console" sub="Read-only (SELECT / WITH / PRAGMA). Runs against your local database.">
      <div className="stack" style={{ gap: 10 }}>
        <textarea className="input" style={{ minHeight: 76, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} />
        <div className="flex">
          <button className="btn primary" onClick={run} disabled={busy}>
            <Terminal size={14} /> Run
          </button>
          <button className="btn sm" onClick={toCsv} disabled={!rows?.length}>
            <Download size={13} /> Export CSV
          </button>
          {rows && <span className="muted" style={{ fontSize: 12 }}>{rows.length} rows</span>}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        {rows && rows.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  {Object.keys(rows[0]!).map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i}>
                    {Object.keys(rows[0]!).map((c) => (
                      <td key={c} className="mono" style={{ fontSize: 12 }}>
                        {typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}

function CategoryModal({ initial, onClose, onSave }: { initial: Category | null; onClose: () => void; onSave: (c: Omit<Category, 'id'>) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<Category['kind']>(initial?.kind ?? 'expense')
  const [icon, setIcon] = useState(initial?.icon ?? ICONS[0]!)
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]!)
  return (
    <Modal title={initial ? 'Edit category' : 'New category'} onClose={onClose}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSave({ name: name.trim(), kind, icon, color, parentId: initial?.parentId ?? null })
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Kind</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Category['kind'])}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="field full">
            <label>Icon</label>
            <div className="flex wrap" style={{ gap: 6 }}>
              {ICONS.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setIcon(i)}
                  className="tx-icon"
                  style={{ width: 34, height: 34, fontSize: 15, borderRadius: 10, background: icon === i ? 'var(--panel-3)' : 'var(--panel-2)', outline: icon === i ? '2px solid var(--primary)' : 'none' }}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="field full">
            <label>Colour</label>
            <div className="flex wrap" style={{ gap: 8 }}>
              {CATEGORY_COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: 8, background: c, outline: color === c ? '2px solid var(--text)' : 'none', outlineOffset: 2 }} aria-label="Colour" />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {initial ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
