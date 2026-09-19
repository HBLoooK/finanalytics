import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
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

function Splash() {
  const status = useSync((s) => s.status)
  return (
    <div className="splash">
      <div className="brand-logo" />
      <div className="muted">{status === 'offline' ? 'Database unreachable — loading browser copy…' : 'Loading your data…'}</div>
    </div>
  )
}

function App() {
  const [search, setSearch] = useState('')
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated())
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setHydrated(true)
    return useStore.persist.onFinishHydration(() => setHydrated(true))
  }, [])
  if (!hydrated) return <Splash />
  return (
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
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}

export default App
