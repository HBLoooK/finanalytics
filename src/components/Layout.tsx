import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  CalendarClock,
  FileText,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  LineChart,
  Menu,
  Moon,
  PiggyBank,
  Plus,
  Search,
  Settings,
  Sun,
  Target,
  Upload,
  Wallet,
} from 'lucide-react'
import { useStore, applyTheme, useConverter } from '../store'
import { initials, monthKey, today } from '../lib/utils'
import { TransactionModal } from './TransactionModal'
import { budgetProgress, upcoming } from '../lib/analytics'
import { NotificationsPanel } from './Notifications'
import { useSync } from '../lib/sync'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/compare', label: 'Compare', icon: GitCompareArrows },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/recurring', label: 'Bills & recurring', icon: CalendarClock },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/investments', label: 'Investments', icon: LineChart },
  { to: '/debts', label: 'Debts', icon: Landmark },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/reports', label: 'Reports', icon: FileText },
]

const titles: Record<string, [string, string]> = {
  '/wallet': ['Wallet', 'Cards, accounts and balances'],
  '/analytics': ['Analytics', 'Trends and breakdowns'],
  '/compare': ['Compare periods', 'Put two months, quarters, years or custom ranges side by side'],
  '/transactions': ['Transactions', 'Every movement, searchable'],
  '/recurring': ['Bills & recurring', 'Subscriptions, salary and scheduled payments'],
  '/budgets': ['Budgets', 'Monthly limits per category'],
  '/goals': ['Goals', 'What you are saving towards'],
  '/investments': ['Investments', 'Portfolio, allocation and P&L'],
  '/debts': ['Debts', 'Loans, cards and payoff plans'],
  '/import': ['Import', 'Bank statements and categorisation rules'],
  '/reports': ['Reports', 'Monthly summaries you can print'],
  '/settings': ['Settings', 'Profile, currencies and data'],
}

export function Layout({ children, search, onSearch }: { children: ReactNode; search: string; onSearch: (s: string) => void }) {
  const { settings, updateSettings, budgets, transactions, categories, accounts, recurring, runAutoPost } = useStore()
  const conv = useConverter()
  const [open, setOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const [posted, setPosted] = useState<number | null>(null)
  const loc = useLocation()
  const [title, sub] = titles[loc.pathname] ?? ['Finanalytics', '']

  useEffect(() => applyTheme(settings.theme), [settings.theme])

  // Auto-post due recurring transactions once per day
  useEffect(() => {
    if (settings.lastRecurringRun !== today() || recurring.some((r) => r.active && r.autoPost && r.nextDate <= today())) {
      const n = runAutoPost()
      if (n > 0) {
        setPosted(n)
        setTimeout(() => setPosted(null), 4000)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault()
          setShowAdd(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const alerts = useMemo(() => {
    const over = budgetProgress(budgets, transactions, categories, accounts, conv, monthKey(today())).filter((b) => b.pct >= 90).length
    const due = upcoming(recurring, 7).filter((u) => !u.rec.autoPost || u.daysAway < 0).length
    return over + due
  }, [budgets, transactions, categories, accounts, recurring, conv])

  const sync = useSync()
  const syncLabel =
    sync.status === 'saving'
      ? 'Saving to database…'
      : sync.status === 'offline'
        ? 'Database offline — cached in browser'
        : sync.status === 'error'
          ? `Save failed — retrying (${sync.error ?? ''})`
          : sync.status === 'loading'
            ? 'Loading…'
            : sync.engine === 'sqlite'
              ? 'Saved to database'
              : 'Saved in browser'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="app">
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 39 }} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">
            <Wallet size={17} />
          </div>
          <div>
            Finanalytics
            <small>PERSONAL FINANCE</small>
          </div>
        </div>
        {nav.map((n, i) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            style={{ '--i': i } as React.CSSProperties}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}
        <div className="nav-divider" />
        <NavLink to="/settings" onClick={() => setOpen(false)} style={{ '--i': nav.length } as React.CSSProperties} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Settings size={17} />
          Settings
        </NavLink>
        <button className="nav-link" style={{ '--i': nav.length + 1 } as React.CSSProperties} onClick={() => setShowNotif(true)}>
          <Bell size={17} />
          Notifications
          {alerts > 0 && <span className="badge" />}
        </button>

        <div className="sidebar-footer">
          <button className="btn primary" style={{ width: '100%' }} onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add transaction
          </button>
          <button className="theme-switch" onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })} style={{ marginTop: 10 }}>
            <Moon size={15} />
            <span className={`switch ${settings.theme === 'light' ? 'on' : ''}`} />
            <Sun size={15} />
          </button>
          <NavLink to="/settings" className={`sync ${sync.status}`} title={sync.lastSavedAt ? `Last saved ${new Date(sync.lastSavedAt).toLocaleString()}` : undefined}>
            <i />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{syncLabel}</span>
          </NavLink>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="flex">
            <button className="icon-btn mobile-nav-toggle" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu size={18} />
            </button>
            <div>
              <h1>{loc.pathname === '/' ? `Hello, ${settings.name.split(' ')[0]} welcome back` : title}</h1>
              <div className="sub">{loc.pathname === '/' ? `${greeting} — here is your money at a glance.` : sub}</div>
            </div>
          </div>
          <div className="topbar-right">
            <label className="search">
              <input id="global-search" placeholder="Search…" value={search} onChange={(e) => onSearch(e.target.value)} />
              <Search size={15} />
            </label>
            <button className="icon-btn" onClick={() => setShowNotif(true)} aria-label="Notifications">
              <Bell size={16} />
              {alerts > 0 && <span className="dot" />}
            </button>
            <NavLink to="/settings" className="user-chip">
              <div className="avatar">{initials(settings.name)}</div>
              <div className="txt">
                <div className="name">{settings.name}</div>
              </div>
            </NavLink>
          </div>
        </header>
        <div className="page" key={loc.pathname + (search ? ':search' : '')}>
          {children}
        </div>
      </main>

      {showAdd && <TransactionModal onClose={() => setShowAdd(false)} />}
      {showNotif && <NotificationsPanel onClose={() => setShowNotif(false)} />}
      {posted !== null && <div className="toast">Auto-posted {posted} recurring transaction{posted === 1 ? '' : 's'}</div>}
    </div>
  )
}
