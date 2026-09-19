// Data health: every condition that quietly skews every number on every page, with a fix button.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ShieldCheck, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import { checkHealth, type HealthIssue } from '../lib/health'
import { fetchDbStatus } from '../lib/sync'
import { Card, Empty } from '../components/ui'
import { useToast } from '../components/Toasts'

export function DataHealth() {
  const state = useStore()
  const toast = useToast()
  const [db, setDb] = useState<Awaited<ReturnType<typeof fetchDbStatus>>>(null)
  const [lastFix, setLastFix] = useState('')

  useEffect(() => {
    fetchDbStatus().then(setDb)
  }, [])

  const issues = useMemo<HealthIssue[]>(() => {
    const base = checkHealth({
      accounts: state.accounts,
      categories: state.categories,
      transactions: state.transactions,
      recurring: state.recurring,
      holdings: state.holdings,
      debts: state.debts,
      rules: state.rules,
      goals: state.goals,
      settings: state.settings,
      lastBackupAt: db?.lastBackupAt ?? null,
      dbIntegrity: db?.lastBackupOk ?? true,
    })
    return base.map((issue) => {
      // Wire up the fixes that can be done safely in the browser.
      if (issue.id === 'uncategorised')
        return {
          ...issue,
          fixLabel: 'Auto-categorise with rules',
          link: '/import',
          fix: () => {
            const n = state.applyRulesToExisting(true)
            return `Categorised ${n} transaction${n === 1 ? '' : 's'}`
          },
        }
      if (issue.id === 'missing-category')
        return {
          ...issue,
          fixLabel: 'Clear dead category links',
          fix: () => {
            let n = 0
            for (const t of state.transactions)
              if (t.categoryId && !state.categories.some((c) => c.id === t.categoryId)) {
                state.updateTransaction(t.id, { categoryId: null })
                n++
              }
            return `Cleared ${n} link${n === 1 ? '' : 's'}`
          },
        }
      if (issue.id === 'bad-splits')
        return {
          ...issue,
          fixLabel: 'Drop broken splits',
          fix: () => {
            let n = 0
            for (const t of state.transactions)
              if (t.splits?.length && Math.abs(t.splits.reduce((s, x) => s + x.amount, 0) - t.amount) > 0.02) {
                state.updateTransaction(t.id, { splits: undefined })
                n++
              }
            return `Dropped ${n} split group${n === 1 ? '' : 's'}`
          },
        }
      if (issue.id === 'orphan-account')
        return {
          ...issue,
          fixLabel: 'Delete orphaned transactions',
          fix: () => {
            const ids = state.transactions.filter((t) => !state.accounts.some((a) => a.id === t.accountId)).map((t) => t.id)
            state.deleteTransactions(ids)
            return `Deleted ${ids.length} transaction${ids.length === 1 ? '' : 's'} (undo available)`
          },
        }
      if (issue.id === 'backup-age')
        return {
          ...issue,
          fixLabel: 'Snapshot now',
          fix: () => {
            void fetch('/api/backup', { method: 'POST' }).then(() => fetchDbStatus().then(setDb))
            return 'Snapshot started'
          },
        }
      return issue
    })
  }, [state, db])

  const errors = issues.filter((i) => i.severity === 'error').length
  const warns = issues.filter((i) => i.severity === 'warn').length

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpi-inline">
        <div>
          <div className="l">Checks</div>
          <div className="v">{issues.filter((i) => i.id !== 'ok').length || 0}</div>
        </div>
        <div>
          <div className="l">Errors</div>
          <div className="v" style={{ color: errors ? 'var(--red)' : 'var(--green)' }}>
            {errors}
          </div>
        </div>
        <div>
          <div className="l">Warnings</div>
          <div className="v" style={{ color: warns ? 'var(--orange)' : 'var(--green)' }}>
            {warns}
          </div>
        </div>
        <div>
          <div className="l">Database</div>
          <div className="v" style={{ fontSize: 13, marginTop: 4 }}>
            {db ? `${Object.values(db.counts).reduce((a, b) => a + b, 0)} records · rev ${db.rev}` : 'offline'}
          </div>
        </div>
      </div>

      <Card
        title="Findings"
        sub="Computed live from your data"
        action={
          lastFix ? (
            <span className="pill" style={{ color: 'var(--green)' }}>
              <CheckCircle2 size={12} /> {lastFix}
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} /> Local only
            </span>
          )
        }
      >
        {issues.length === 1 && issues[0]!.id === 'ok' ? (
          <Empty title="Everything checks out" hint="No uncategorised transactions, no orphans, backups current." />
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {issues.map((i) => (
              <div key={i.id} className={`health-row ${i.severity}`}>
                <span className="sev" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i.title}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {i.detail}
                  </div>
                </div>
                <div className="flex" style={{ gap: 6 }}>
                  {i.fix && (
                    <button
                      className="btn sm"
                      onClick={() => {
                        const msg = i.fix!()
                        setLastFix(msg)
                        toast(msg)
                      }}
                    >
                      <Wand2 size={13} /> {i.fixLabel ?? 'Fix'}
                    </button>
                  )}
                  {i.link && (
                    <Link to={i.link} className="btn sm ghost">
                      Open
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
