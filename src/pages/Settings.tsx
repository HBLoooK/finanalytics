import { useEffect, useRef, useState } from 'react'
import { Database, Download, HardDriveDownload, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { exportData, useStore } from '../store'
import type { AppData, Category } from '../lib/types'
import { CATEGORY_COLORS, ICONS } from '../lib/seed'
import { downloadFile, today } from '../lib/utils'
import { fetchDbStatus, requestBackup, useSync, type DbStatus } from '../lib/sync'
import { Card, Modal, confirmDelete } from '../components/ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'MAD', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'PLN', 'CZK', 'TRY', 'ZAR', 'SGD', 'AED', 'SAR', 'EGP', 'CNY', 'KRW']

export function SettingsPage() {
  const { settings, updateSettings, setRate, categories, addCategory, updateCategory, deleteCategory, transactions, replaceAll, resetDemo, clearAll, accounts } = useStore()
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [newCur, setNewCur] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const sync = useSync()
  const [db, setDb] = useState<DbStatus | null>(null)
  const refreshDb = () => fetchDbStatus().then(setDb)
  useEffect(() => {
    refreshDb()
  }, [sync.lastSavedAt])

  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2500)
  }

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as AppData
      if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('bad')
      if (!window.confirm(`Import ${data.transactions.length} transactions and replace current data?`)) return
      replaceAll(data)
      notify('Backup imported')
    } catch {
      notify('That file is not a valid Finanalytics backup')
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

  return (
    <div className="grid dash-grid">
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
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          Shortcuts: <kbd>N</kbd> new transaction · <kbd>⌘K</kbd> search · <kbd>Esc</kbd> close dialogs
        </div>
      </Card>

      <Card className="col-6" title="Currencies & exchange rates" sub={`How many units of each currency equal 1 ${settings.currency}. Rates are manual.`}>
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
                  <input className="input" type="number" step="any" min="0" value={r} disabled={c === settings.currency} onChange={(e) => setRate(c, Number(e.target.value) || 0)} style={{ width: 110, padding: '5px 8px', textAlign: 'right' }} />
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
        </div>
      </Card>

      <Card
        className="col-12"
        title="Database"
        sub={db ? `SQLite · ${db.path}` : sync.status === 'offline' ? 'The database server is not reachable — changes are cached in this browser and pushed when it is back.' : 'Connecting…'}
        action={
          <span className={`pill`}>
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
                notify('Snapshot created')
                refreshDb()
              } else notify('Backup failed')
            }}
          >
            <Database size={15} /> Snapshot now
          </button>
          <a className={`btn ${db ? '' : 'ghost'}`} href="/api/backup/download" download aria-disabled={!db}>
            <HardDriveDownload size={15} /> Download .db file
          </a>
        </div>
        {db && db.backups.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Snapshots in <span className="mono">{db.backupDir}</span> (a daily one is taken automatically, newest 14 kept)
            </div>
            <div className="flex wrap" style={{ gap: 6 }}>
              {db.backups.slice(0, 6).map((b) => (
                <span key={b.name} className="pill" title={fmtWhen(b.createdAt)}>
                  {b.name.replace('finanalytics-', '').replace('.db', '').slice(0, 10)} · {fmtKb(b.size)}
                </span>
              ))}
              {db.backups.length > 6 && <span className="muted">+{db.backups.length - 6} more</span>}
            </div>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
          Your data lives in a SQLite file on this machine, not in the browser. Clearing site data or switching browsers no longer loses anything. To
          restore a snapshot, stop the server and copy the snapshot file over the database file.
        </p>
      </Card>

      <Card className="col-12" title="Portable backups & reset" sub={`${transactions.length} transactions`}>
        <div className="flex wrap">
          <button
            className="btn"
            onClick={() => {
              downloadFile(`finanalytics-backup-${today()}.json`, JSON.stringify(exportData(), null, 2))
              notify('Backup downloaded')
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
              if (window.confirm('Replace everything with fresh demo data?')) {
                resetDemo()
                notify('Demo data loaded')
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
                notify('Data cleared — start fresh')
              }
            }}
          >
            <Trash2 size={15} /> Start from scratch
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
          JSON backups are portable between machines and versions; import one to replace everything in the database.
        </p>
      </Card>

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
                        <button className="mini-btn danger" aria-label="Delete" onClick={() => confirmDelete(`“${c.name}” (${count} transactions become uncategorised)`) && deleteCategory(c.id)}>
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
      {toast && <div className="toast">{toast}</div>}
    </div>
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
          if (name.trim()) onSave({ name: name.trim(), kind, icon, color })
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
                <button type="button" key={i} onClick={() => setIcon(i)} className="tx-icon" style={{ width: 34, height: 34, fontSize: 15, borderRadius: 10, background: icon === i ? 'var(--panel-3)' : 'var(--panel-2)', outline: icon === i ? '2px solid var(--primary)' : 'none' }}>
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
