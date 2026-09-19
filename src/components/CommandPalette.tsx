// ⌘K command palette: navigate, quick-add, go to a month, run backups.
// Also understands natural-language-ish money entry: "add 12.50 coffee", "12.50 coffee".
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react'
import { useStore } from '../store'
import { addMonths, monthKey, monthLabel, parseTags, round2, today } from '../lib/utils'
import { applyRules } from '../lib/rules'

interface Action {
  id: string
  label: string
  hint?: string
  group: string
  run: () => void
}

const NAV: [string, string][] = [
  ['/', 'Dashboard'],
  ['/wallet', 'Wallet'],
  ['/transactions', 'Transactions'],
  ['/analytics', 'Analytics'],
  ['/compare', 'Compare periods'],
  ['/recurring', 'Bills & recurring'],
  ['/budgets', 'Budgets'],
  ['/goals', 'Goals'],
  ['/investments', 'Investments'],
  ['/debts', 'Debts'],
  ['/import', 'Import'],
  ['/reports', 'Reports'],
  ['/health', 'Data health'],
  ['/review', 'Year in review'],
  ['/settings', 'Settings'],
]

/** Parse "12.50 coffee", "add 120 rent", "expense 40 uber". */
export function parseQuickAdd(raw: string) {
  const s = raw.trim().replace(/^(add|new|spent|spend|paid?)\s+/i, '')
  const m = s.match(/^(-?\d+(?:[.,]\d{1,2})?)\s*(?:([a-z]{3})\s+)?(.*)$/i)
  if (!m) return null
  const amount = Math.abs(Number(m[1]!.replace(',', '.')))
  if (!(amount > 0)) return null
  return { amount: round2(amount), payee: (m[3] ?? '').trim() || 'Quick add', currency: (m[2] ?? '').toUpperCase() }
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { accounts, categories, rules, addTransaction, updateSettings } = useStore()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const actions = useMemo<Action[]>(() => {
    const out: Action[] = []
    for (const [to, label] of NAV) out.push({ id: `nav:${to}`, group: 'Go to', label, run: () => navigate(to) })

    out.push({ id: 'act:new', group: 'Actions', label: 'Add transaction…', hint: 'N', run: () => navigate('/transactions') })

    for (let i = 0; i < 6; i++) {
      const key = addMonths(monthKey(today()), -i)
      out.push({ id: `month:${key}`, group: 'Go to month', label: monthLabel(key, false), run: () => navigate(`/reports?m=${key}`) })
    }

    out.push({
      id: 'act:theme',
      group: 'Actions',
      label: 'Toggle theme',
      run: () => updateSettings({ theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }),
    })
    out.push({ id: 'act:backup', group: 'Actions', label: 'Create database snapshot', run: () => void fetch('/api/backup', { method: 'POST' }) })
    return out
  }, [navigate, updateSettings])

  const quick = parseQuickAdd(query)

  const addAction: Action | null = quick
    ? {
        id: 'quickadd',
        group: 'Quick add',
        label: `Add ${quick.amount} ${quick.payee}`,
        hint: 'Enter',
        run: () => {
          const payee = quick.payee
          const lower = payee.toLowerCase()
          const account =
            accounts.find((a) => quick.currency && a.currency === quick.currency) ??
            accounts.find((a) => !a.archived) ??
            accounts[0]
          if (!account) return
          const { tx } = applyRules(rules, {
            payee,
            note: '',
            categoryId: null,
            tags: parseTags(lower),
            type: 'expense',
            amount: quick.amount,
            date: today(),
            accountId: account.id,
          })
          addTransaction({
            type: 'expense',
            amount: quick.amount,
            date: today(),
            accountId: account.id,
            toAccountId: null,
            categoryId: tx.categoryId ?? categories.find((c) => c.kind === 'expense')?.id ?? null,
            payee: payee.charAt(0).toUpperCase() + payee.slice(1),
            note: '',
            tags: tx.tags ?? [],
            status: 'cleared',
          })
          onClose()
        },
      }
    : null

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = addAction ? [addAction, ...actions] : actions
    if (!q) return all.slice(0, 12)
    return all
      .filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || (a.hint ?? '').toLowerCase().includes(q))
      .slice(0, 12)
  }, [actions, query, addAction])

  useEffect(() => setSel(0), [query])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(results.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const a = results[sel]
      if (a) {
        a.run()
        if (a.id !== 'quickadd') onClose()
      }
    }
  }

  let lastGroup = ''
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div className="modal palette" role="dialog" aria-modal aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search pages, or type “12.50 coffee” to add an expense…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list">
          {results.length === 0 && <div className="empty">No matches</div>}
          {results.map((a, i) => {
            const header = a.group !== lastGroup ? a.group : null
            lastGroup = a.group
            return (
              <div key={a.id}>
                {header && <div className="palette-group">{header}</div>}
                <button className={`palette-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => (a.run(), a.id !== 'quickadd' && onClose())}>
                  <span>{a.label}</span>
                  {a.hint && <span className="muted">{a.hint}</span>}
                  {i === sel && <CornerDownLeft size={13} />}
                  {i !== sel && <ArrowRight size={13} style={{ opacity: 0.25 }} />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
