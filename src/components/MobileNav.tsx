// Bottom tab bar on phones: Dashboard · Transactions · (FAB) · Budgets · More.
import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BarChart3, LayoutDashboard, MoreHorizontal, ArrowLeftRight, PiggyBank } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/analytics', label: 'Trends', icon: BarChart3 },
]

const MORE = [
  { to: '/wallet', label: 'Wallet' },
  { to: '/recurring', label: 'Bills & recurring' },
  { to: '/goals', label: 'Goals' },
  { to: '/investments', label: 'Investments' },
  { to: '/debts', label: 'Debts' },
  { to: '/compare', label: 'Compare periods' },
  { to: '/review', label: 'Year in review' },
  { to: '/import', label: 'Import' },
  { to: '/reports', label: 'Reports' },
  { to: '/health', label: 'Data health' },
  { to: '/progress', label: 'Progress' },
  { to: '/weekly', label: 'Weekly review' },
  { to: '/help', label: 'Help centre' },
  { to: '/settings', label: 'Settings' },
]

export function MobileNav({ onQuickAdd }: { onQuickAdd: () => void }) {
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const active = useMemo(() => loc.pathname, [loc.pathname])

  return (
    <>
      {more && (
        <div className="mobile-more" onClick={() => setMore(false)}>
          <div className="mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            {MORE.map((m) => (
              <NavLink key={m.to} to={m.to} onClick={() => setMore(false)} className={active === m.to ? 'on' : ''}>
                {m.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav className="mobile-tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'tab on' : 'tab')}>
            <t.icon size={19} />
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button className="tab" onClick={onQuickAdd} aria-label="Add">
          <span className="tab-fab">+</span>
        </button>
        <button className={`tab ${more ? 'on' : ''}`} onClick={() => setMore((v) => !v)} aria-label="More">
          <MoreHorizontal size={19} />
          <span>More</span>
        </button>
      </nav>
    </>
  )
}
