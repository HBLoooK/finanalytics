import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useStore } from './store'
import { useSync } from './lib/sync'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Wallet } from './pages/Wallet'
import { Budgets } from './pages/Budgets'
import { Goals } from './pages/Goals'
import { Analytics } from './pages/Analytics'
import { Compare } from './pages/Compare'
import { SettingsPage } from './pages/Settings'
import { RecurringPage } from './pages/Recurring'
import { Investments } from './pages/Investments'
import { Debts } from './pages/Debts'
import { ImportPage } from './pages/Import'
import { Reports } from './pages/Reports'
import { DataHealth } from './pages/DataHealth'
import { YearInReview } from './pages/YearInReview'
import { Onboarding } from './components/Onboarding'

function Splash() {
  const status = useSync((s) => s.status)
  return (
    <div className="splash">
      <div className="brand-logo" />
      <div className="muted">{status === 'offline' ? 'Database unreachable — loading browser copy…' : 'Loading your data…'}</div>
    </div>
  )
}

/** Keeps ?q= and ?m= query params available to pages that want them. */
function useQuery() {
  const loc = useLocation()
  return new URLSearchParams(loc.search)
}

function App() {
  const [search, setSearch] = useState('')
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated())
  const onboarded = useStore((s) => s.settings.onboarded)
  const query = useQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (useStore.persist.hasHydrated()) setHydrated(true)
    return useStore.persist.onFinishHydration(() => setHydrated(true))
  }, [])

  // Deep links: #/transactions?q=...  and  #/?quick=1 (PWA shortcut)
  useEffect(() => {
    const q = query.get('q')
    if (q) setSearch(q)
    if (query.get('quick')) {
      document.querySelector<HTMLButtonElement>('.mobile-fab')?.click()
      navigate('/', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hydrated) return <Splash />

  return (
    <>
      <HashRouter>
        <Layout search={search} onSearch={setSearch}>
          <Routes>
            <Route path="/" element={search ? <Transactions search={search} /> : <Dashboard />} />
            <Route path="/transactions" element={<Transactions search={search} />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/accounts" element={<Navigate to="/wallet" replace />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/investments" element={<Investments />} />
            <Route path="/debts" element={<Debts />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/health" element={<DataHealth />} />
            <Route path="/review" element={<YearInReview />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
      {onboarded === false && <Onboarding onDone={() => useStore.getState().updateSettings({ onboarded: true })} />}
    </>
  )
}

export default App
