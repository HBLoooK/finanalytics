import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, Pencil, Plus, RotateCcw, Trash2, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import type { Rule, Transaction } from '../lib/types'
import { guessColumns, parseAmountLoose, parseCSV, parseDateLoose, parseOFX, parseQIF, type ColumnMap } from '../lib/csv'
import { applyRules, describeRule } from '../lib/rules'
import { hashString, parseTags, uid } from '../lib/utils'
import { Card, Empty, Modal, Money, Tabs, confirmDelete } from '../components/ui'
import { useToast } from '../components/Toasts'

/** Remembered column mapping per bank, keyed by the header signature. */
const PRESET_KEY = 'finanalytics:import-presets'
type Presets = Record<string, ColumnMap & { dayFirst?: boolean; invert?: boolean }>
const loadPresets = (): Presets => {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}') as Presets
  } catch {
    return {}
  }
}
const savePresets = (p: Presets) => localStorage.setItem(PRESET_KEY, JSON.stringify(p))

type Row = Omit<Transaction, 'id'> & { key: string; duplicate: boolean; include: boolean; ruleName: string | null; raw: string[] }

export function ImportPage() {
  const [tab, setTab] = useState<'import' | 'rules' | 'history'>('import')
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'import', label: 'Import statement' },
          { value: 'history', label: 'Import history' },
          { value: 'rules', label: 'Categorisation rules' },
        ]}
      />
      {tab === 'import' ? <CsvImport /> : tab === 'history' ? <ImportHistory /> : <RulesPage />}
    </div>
  )
}

/** Every import is tagged with a batch id so it can be undone as a group. */
function ImportHistory() {
  const { transactions, deleteTransactions } = useStore()
  const toast = useToast()
  const batches = useMemo(() => {
    const map = new Map<string, { id: string; date: string; count: number; total: number; accountId: string }>()
    for (const t of transactions) {
      if (!t.importBatchId) continue
      const b = map.get(t.importBatchId) ?? { id: t.importBatchId, date: t.date, count: 0, total: 0, accountId: t.accountId }
      b.count++
      b.total += t.amount
      if (t.date > b.date) b.date = t.date
      map.set(t.importBatchId, b)
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [transactions])

  if (!batches.length)
    return (
      <Card>
        <Empty title="No imports yet" hint="Anything you import is grouped here so you can roll it back in one click." />
      </Card>
    )

  return (
    <Card title="Import batches" sub="Roll back an import without touching anything else">
      <div className="stack" style={{ gap: 8 }}>
        {batches.map((b) => (
          <div key={b.id} className="flex between subtle-panel" style={{ padding: '10px 12px', fontSize: 13 }}>
            <span>
              <b>{b.count} transactions</b>{' '}
              <span className="muted">
                · imported {b.date} · {b.id.slice(0, 8)}
              </span>
            </span>
            <button
              className="btn danger sm"
              onClick={() => {
                if (!confirmDelete(`these ${b.count} imported transactions`)) return
                const ids = transactions.filter((t) => t.importBatchId === b.id).map((t) => t.id)
                deleteTransactions(ids)
                toast(`Rolled back ${ids.length} transactions — undo available`)
              }}
            >
              <RotateCcw size={13} /> Roll back
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function CsvImport() {
  const { accounts, categories, rules, transactions, addTransactions } = useStore()
  const toast = useToast()
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [map, setMap] = useState<ColumnMap | null>(null)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [dayFirst, setDayFirst] = useState(false)
  const [invert, setInvert] = useState(false)
  const [applyR, setApplyR] = useState(true)
  const [skipDup, setSkipDup] = useState(true)
  const [over, setOver] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  const load = async (f: File) => {
    const text = await f.text()
    const lower = f.name.toLowerCase()
    if (lower.endsWith('.ofx') || lower.endsWith('.qfx') || text.includes('<OFX>')) {
      const parsed = parseOFX(text)
      const rows = [['date', 'payee', 'amount', 'note'], ...parsed.map((r) => [r.date, r.payee, String(r.amount), r.note])]
      setFile({ name: f.name, rows })
      setMap({ date: 0, payee: 1, amount: 2, credit: -1, note: 3, category: -1 })
      setDone(null)
      setOverrides({})
      return
    }
    if (lower.endsWith('.qif')) {
      const parsed = parseQIF(text)
      const rows = [['date', 'payee', 'amount', 'note'], ...parsed.map((r) => [r.date, r.payee, String(r.amount), r.note])]
      setFile({ name: f.name, rows })
      setMap({ date: 0, payee: 1, amount: 2, credit: -1, note: 3, category: -1 })
      setDone(null)
      setOverrides({})
      return
    }
    const rows = parseCSV(text)
    setFile({ name: f.name, rows })
    const signature = hashString((rows[0] ?? []).join('|').toLowerCase())
    const preset = loadPresets()[signature]
    if (preset) {
      setMap({ date: preset.date, payee: preset.payee, amount: preset.amount, credit: preset.credit, note: preset.note, category: preset.category })
      if (preset.dayFirst !== undefined) setDayFirst(preset.dayFirst)
      if (preset.invert !== undefined) setInvert(preset.invert)
      toast('Reusing the column mapping from the last import of this file')
    } else setMap(guessColumns(rows[0] ?? []))
    setDone(null)
    setOverrides({})
  }

  const headers = file?.rows[0] ?? []
  const dataRows = useMemo(() => (file ? (hasHeader ? file.rows.slice(1) : file.rows) : []), [file, hasHeader])
  const existingHashes = useMemo(() => new Set(transactions.map((t) => t.importHash).filter(Boolean)), [transactions])
  const existingLoose = useMemo(() => new Set(transactions.map((t) => `${t.date}|${t.amount.toFixed(2)}|${t.payee.toLowerCase().trim()}`)), [transactions])

  const parsed: Row[] = useMemo(() => {
    if (!map || !file) return []
    const out: Row[] = []
    for (const r of dataRows) {
      const date = map.date >= 0 ? parseDateLoose(r[map.date] ?? '', dayFirst) : null
      let amount = map.amount >= 0 ? parseAmountLoose(r[map.amount] ?? '') : null
      if (map.credit >= 0) {
        const c = parseAmountLoose(r[map.credit] ?? '')
        if (c && c !== 0) amount = Math.abs(c)
        else if (amount !== null) amount = -Math.abs(amount)
      }
      if (!date || amount === null || amount === 0) continue
      if (invert) amount = -amount
      const payee = (map.payee >= 0 ? r[map.payee] : '')?.trim() || 'Imported'
      const note = (map.note >= 0 && map.note !== map.payee ? r[map.note] : '')?.trim() || ''
      const catName = map.category >= 0 ? (r[map.category] ?? '').trim().toLowerCase() : ''
      const catMatch = catName ? categories.find((c) => c.name.toLowerCase() === catName) : undefined
      const type: Transaction['type'] = amount > 0 ? 'income' : 'expense'
      let tx: Omit<Transaction, 'id'> = {
        type,
        amount: Math.abs(amount),
        date,
        payee,
        note,
        accountId,
        toAccountId: null,
        categoryId: catMatch?.id ?? null,
        tags: ['imported'],
        importHash: hashString(`${accountId}|${date}|${amount}|${payee}|${note}`),
      }
      let ruleName: string | null = null
      if (applyR && !catMatch) {
        const res = applyRules(rules, tx)
        tx = res.tx
        ruleName = res.rule?.name ?? null
      }
      if (!tx.categoryId) tx.categoryId = null
      const key = tx.importHash!
      const duplicate = existingHashes.has(key) || existingLoose.has(`${date}|${Math.abs(amount).toFixed(2)}|${payee.toLowerCase().trim()}`)
      out.push({ ...tx, key, duplicate, include: !(duplicate && skipDup), ruleName, raw: r, ...(overrides[key] ?? {}) })
    }
    // in-file duplicates
    const seen = new Set<string>()
    for (const row of out) {
      if (seen.has(row.key)) {
        row.duplicate = true
        if (skipDup && overrides[row.key]?.include === undefined) row.include = false
      }
      seen.add(row.key)
    }
    return out
  }, [map, file, dataRows, dayFirst, invert, accountId, applyR, rules, categories, existingHashes, existingLoose, skipDup, overrides])

  const included = parsed.filter((r) => r.include)
  const setOverride = (key: string, patch: Partial<Row>) => setOverrides((o) => ({ ...o, [key]: { ...o[key], ...patch } }))

  const commit = () => {
    const batchId = uid()
    addTransactions(
      included.map((r) => {
        // strip UI-only fields
        const { key: _k, duplicate: _d, include: _i, ruleName: _r, raw: _raw, ...tx } = r
        void _k
        void _d
        void _i
        void _r
        void _raw
        return { ...tx, importBatchId: batchId }
      }),
    )
    // Remember this file's column mapping for next time.
    if (file && map) {
      const presets = loadPresets()
      presets[hashString((file.rows[0] ?? []).join('|').toLowerCase())] = { ...map, dayFirst, invert }
      savePresets(presets)
    }
    setDone(included.length)
    setFile(null)
    setMap(null)
  }

  const colSelect = (label: string, k: keyof ColumnMap) => (
    <div className="field" key={k}>
      <label>{label}</label>
      <select className="select" value={map?.[k] ?? -1} onChange={(e) => setMap({ ...map!, [k]: Number(e.target.value) })}>
        <option value={-1}>— none —</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {hasHeader ? h || `Column ${i + 1}` : `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="grid dash-grid">
      <Card className="col-12" title="1. Choose a file" sub="CSV, OFX/QFX or QIF. Columns are detected automatically; the mapping is remembered per bank.">
        {done !== null && (
          <div className="subtle-panel flex" style={{ marginBottom: 12, color: 'var(--green)' }}>
            <CheckCircle2 size={16} /> Imported {done} transactions. They're tagged <span className="tag">#imported</span> and grouped as one batch — roll it back on the Import history tab.
          </div>
        )}
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) load(f)
          }}
        >
          <FileUp size={26} style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{file ? file.name : 'Drop a CSV here or click to browse'}</div>
          <div style={{ fontSize: 12 }}>{file ? `${dataRows.length} rows detected` : 'Comma, semicolon or tab separated'}</div>
          <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.ofx,.qfx,.qif,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </div>
      </Card>

      {file && map && (
        <>
          <Card className="col-4" title="2. Map columns">
            <div className="stack" style={{ gap: 10 }}>
              <label className="check">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> First row is a header
              </label>
              {colSelect('Date', 'date')}
              {colSelect('Payee / description', 'payee')}
              {colSelect('Amount (signed) or debit', 'amount')}
              {colSelect('Credit column (optional)', 'credit')}
              {colSelect('Note (optional)', 'note')}
              {colSelect('Category name (optional)', 'category')}
              <div className="field">
                <label>Import into account</label>
                <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
              <label className="check">
                <input type="checkbox" checked={dayFirst} onChange={(e) => setDayFirst(e.target.checked)} /> Dates are day-first (DD/MM/YYYY)
              </label>
              <label className="check">
                <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> Flip signs (bank shows spending as positive)
              </label>
              <label className="check">
                <input type="checkbox" checked={applyR} onChange={(e) => setApplyR(e.target.checked)} /> Auto-categorise with rules
              </label>
              <label className="check">
                <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> Skip likely duplicates
              </label>
            </div>
          </Card>

          <Card
            className="col-8"
            title={`3. Review (${included.length} of ${parsed.length} will be imported)`}
            sub={`${parsed.filter((r) => r.duplicate).length} duplicates · ${parsed.filter((r) => r.ruleName).length} categorised by rules · ${parsed.filter((r) => !r.categoryId).length} uncategorised`}
            action={
              <button className="btn primary" disabled={!included.length} onClick={commit}>
                Import {included.length}
              </button>
            }
          >
            {parsed.length === 0 ? (
              <Empty title="No rows parsed" hint="Check the date and amount column mapping." />
            ) : (
              <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th>Date</th>
                      <th>Payee</th>
                      <th>Category</th>
                      <th className="num">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 300).map((r) => (
                      <tr key={r.key} style={{ opacity: r.include ? 1 : 0.45 }}>
                        <td>
                          <input type="checkbox" checked={r.include} onChange={(e) => setOverride(r.key, { include: e.target.checked })} style={{ accentColor: 'var(--primary)' }} />
                        </td>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                          {r.date}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.payee}</div>
                          {r.note && (
                            <div className="muted" style={{ fontSize: 11 }}>
                              {r.note}
                            </div>
                          )}
                        </td>
                        <td>
                          <select className="select" style={{ padding: '4px 8px', width: 'auto', borderColor: r.categoryId ? undefined : 'var(--orange)' }} value={r.categoryId ?? ''} onChange={(e) => setOverride(r.key, { categoryId: e.target.value || null })}>
                            <option value="">— uncategorised —</option>
                            {categories
                              .filter((c) => c.kind === (r.type === 'income' ? 'income' : 'expense'))
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.icon} {c.name}
                                </option>
                              ))}
                          </select>
                          {r.ruleName && (
                            <span className="muted" style={{ fontSize: 10.5, marginLeft: 6 }} title={`Rule: ${r.ruleName}`}>
                              <Wand2 size={11} />
                            </span>
                          )}
                        </td>
                        <td className={`num tx-amount ${r.type === 'income' ? 'pos' : 'neg'}`}>
                          <Money value={r.type === 'expense' ? -r.amount : r.amount} currency={accounts.find((a) => a.id === accountId)?.currency} signed />
                        </td>
                        <td>{r.duplicate && <span className="pill" style={{ color: 'var(--orange)' }} title="A similar transaction already exists"><AlertTriangle size={11} /> dup</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 300 && (
                  <div className="muted" style={{ padding: 10, textAlign: 'center', fontSize: 12 }}>
                    Showing first 300 of {parsed.length} rows (all will be imported)
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/* ---------------- Rules ---------------- */

export function RulesPage() {
  const { rules, categories, addRule, updateRule, deleteRule, applyRulesToExisting, transactions } = useStore()
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [msg, setMsg] = useState('')
  const uncategorised = transactions.filter((t) => t.type !== 'transfer' && !t.categoryId).length

  return (
    <Card
      title="Rules"
      sub="Applied top to bottom on import and when you type a payee. The first match wins."
      action={
        <div className="flex">
          <button
            className="btn sm"
            onClick={() => {
              const n = applyRulesToExisting(true)
              setMsg(`Categorised ${n} uncategorised transactions`)
            }}
            disabled={!uncategorised}
          >
            <Wand2 size={13} /> Apply to {uncategorised} uncategorised
          </button>
          <button
            className="btn sm"
            onClick={() => {
              if (window.confirm('Re-apply rules to ALL existing transactions? Categories may change.')) {
                const n = applyRulesToExisting(false)
                setMsg(`Updated ${n} transactions`)
              }
            }}
          >
            Re-apply to all
          </button>
          <button className="btn primary sm" onClick={() => setEditing('new')}>
            <Plus size={14} /> New rule
          </button>
        </div>
      }
    >
      {msg && (
        <div className="subtle-panel" style={{ marginBottom: 12, fontSize: 13 }}>
          {msg}
        </div>
      )}
      {rules.length === 0 ? (
        <Empty title="No rules yet" hint='e.g. payee contains "netflix" → Subscriptions' />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>On</th>
                <th>Name</th>
                <th>Condition</th>
                <th>Then</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => {
                const c = categories.find((x) => x.id === r.categoryId)
                void i
                return (
                  <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                    <td>
                      <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} style={{ accentColor: 'var(--primary)' }} />
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="muted">{describeRule(r)}</td>
                    <td>
                      <div className="flex wrap" style={{ gap: 4 }}>
                        {c && (
                          <span className="pill">
                            <span className="sw" style={{ background: c.color }} /> {c.name}
                          </span>
                        )}
                        {r.tags.map((t) => (
                          <span className="tag" key={t}>
                            #{t}
                          </span>
                        ))}
                        {r.renameTo && <span className="muted" style={{ fontSize: 12 }}>rename → {r.renameTo}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="mini-btn" disabled={i === 0} onClick={() => reorder(rules, i, -1, updateRule)} title="Move up">
                          ↑
                        </button>
                        <button className="mini-btn" disabled={i === rules.length - 1} onClick={() => reorder(rules, i, 1, updateRule)} title="Move down">
                          ↓
                        </button>
                        <button className="mini-btn" onClick={() => setEditing(r)}>
                          <Pencil size={13} />
                        </button>
                        <button className="mini-btn danger" onClick={() => confirmDelete(`rule “${r.name}”`) && deleteRule(r.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RuleModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            if (editing === 'new') addRule(r)
            else updateRule(editing.id, r)
            setEditing(null)
          }}
        />
      )}
    </Card>
  )
}

function reorder(rules: Rule[], i: number, dir: -1 | 1, update: (id: string, p: Partial<Rule>) => void) {
  // swap contents of two rule records (ids stay in place, so order is preserved by array position)
  const a = rules[i]!
  const b = rules[i + dir]!
  const { id: _ai, ...aRest } = a
  const { id: _bi, ...bRest } = b
  void _ai
  void _bi
  update(a.id, bRest)
  update(b.id, aRest)
}

function RuleModal({ initial, onClose, onSave }: { initial: Rule | null; onClose: () => void; onSave: (r: Omit<Rule, 'id'>) => void }) {
  const { categories, transactions } = useStore()
  const { accounts } = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [field, setField] = useState<Rule['field']>(initial?.field ?? 'payee')
  const [match, setMatch] = useState<Rule['match']>(initial?.match ?? 'contains')
  const [pattern, setPattern] = useState(initial?.pattern ?? '')
  const [pattern2, setPattern2] = useState(initial?.pattern2 ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [renameTo, setRenameTo] = useState(initial?.renameTo ?? '')
  const test: Rule = { id: 'x', name, field, match, pattern, pattern2, categoryId: categoryId || null, tags: parseTags(tags), renameTo, enabled: true }
  const matches = pattern ? transactions.filter((t) => t.type !== 'transfer' && applyRules([test], t).rule).length : 0

  return (
    <Modal title={initial ? 'Edit rule' : 'New rule'} onClose={onClose}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!pattern.trim()) return
          onSave({ name: name.trim() || pattern, field, match, pattern: pattern.trim(), pattern2: pattern2.trim(), categoryId: categoryId || null, tags: parseTags(tags), renameTo: renameTo.trim(), enabled: initial?.enabled ?? true })
        }}
      >
        <div className="form-grid">
          <div className="field full">
            <label>Rule name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Streaming services" autoFocus />
          </div>
          <div className="field">
            <label>If</label>
            <select className="select" value={field} onChange={(e) => setField(e.target.value as Rule['field'])}>
              <option value="payee">Payee</option>
              <option value="note">Note</option>
              <option value="any">Payee or note</option>
              <option value="amount">Amount</option>
              <option value="account">Account</option>
              <option value="weekday">Weekday</option>
            </select>
          </div>
          <div className="field">
            <label>Condition</label>
            <select className="select" value={match} onChange={(e) => setMatch(e.target.value as Rule['match'])}>
              {(field === 'amount'
                ? [
                    { value: 'between', label: 'is between' },
                    { value: 'equals', label: 'equals' },
                    { value: 'starts', label: 'is at least' },
                  ]
                : field === 'account'
                  ? [
                      { value: 'is', label: 'is' },
                      { value: 'starts', label: 'is not' },
                    ]
                  : field === 'weekday'
                    ? [{ value: 'contains', label: 'is one of' }]
                    : [
                        { value: 'contains', label: 'contains' },
                        { value: 'starts', label: 'starts with' },
                        { value: 'equals', label: 'equals' },
                        { value: 'regex', label: 'matches regex' },
                      ]
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {field === 'amount' && match === 'between' ? (
            <div className="field full">
              <label>Amount between</label>
              <div className="flex">
                <input className="input" type="number" step="0.01" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="min" />
                <input className="input" type="number" step="0.01" value={pattern2} onChange={(e) => setPattern2(e.target.value)} placeholder="max" />
              </div>
            </div>
          ) : field === 'account' ? (
            <div className="field full">
              <label>Account</label>
              <select className="select" value={pattern} onChange={(e) => setPattern(e.target.value)}>
                <option value="">— choose —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : field === 'weekday' ? (
            <div className="field full">
              <label>Weekdays (comma separated)</label>
              <input className="input" value={pattern2} onChange={(e) => setPattern2(e.target.value)} placeholder="monday, saturday" />
            </div>
          ) : (
            <div className="field full">
              <label>Pattern</label>
              <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder={match === 'regex' ? 'netflix|spotify|hulu' : 'netflix'} />
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5, marginTop: -6 }}>
            Matches {matches} existing transaction{matches === 1 ? '' : 's'} · rules run top to bottom, first match wins
          </div>
          <div className="field">
            <label>Set category</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— keep as is —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Add tags</label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="fixed, streaming" />
          </div>
          <div className="field full">
            <label>Rename payee to (optional)</label>
            <input className="input" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} placeholder="Clean name, e.g. Amazon" />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {initial ? 'Save' : 'Create rule'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
