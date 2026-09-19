// Guided tours: three spotlights per page, shown once, skippable with Esc.
// Selectors are plain CSS strings resolved at step time, so a tour never holds
// a stale element reference across a re-render.

export interface TourStep {
  /** CSS selector for the element to spotlight. */
  el: string
  title: string
  body: string
}

export interface TourDef {
  id: string
  path: string
  steps: TourStep[]
}

export const TOURS: TourDef[] = [
  {
    id: 'dashboard',
    path: '/',
    steps: [
      { el: '.kpi-grid, .grid', title: 'Your money at a glance', body: 'Every figure here is explained — press the ? beside any of them to see what it is, how it is calculated and why it matters.' },
      { el: '.checkin-card, .coach-card', title: 'Check in, then take the hint', body: 'The daily check-in clears the small stuff in a few taps. The coach card below it is the one thing worth doing today, derived from your own data.' },
      { el: '.safe-card, .card', title: 'Safe to spend', body: 'This is the number to spend against, not your balance. It has already reserved bills, unused budget and planned goal contributions.' },
    ],
  },
  {
    id: 'transactions',
    path: '/transactions',
    steps: [
      { el: '.search, .filters, .toolbar', title: 'Search like a query language', body: 'Try >100, cat:food, payee:"whole foods", is:uncategorised or -coffee to exclude. Operators combine.' },
      { el: '.tx-row, tbody tr, .list-row', title: 'Every row is a record', body: 'Open one to see its splits, status, receipt and which rule categorised it.' },
      { el: '.saved-views, .btn', title: 'Save what you repeat', body: 'Any query you run every month can be saved as a view and reopened in one click.' },
    ],
  },
  {
    id: 'budgets',
    path: '/budgets',
    steps: [
      { el: '.budget-row, .card', title: 'Limits per category', body: 'Set a monthly limit and watch the bar. Splits count against every category they touch.' },
      { el: '.burn-down, .progress', title: 'Burn-down', body: 'Remaining budget divided by days left, compared with your pace so far. This is what turns a limit into feedback.' },
      { el: '.btn', title: 'Rollover and templates', body: 'Let unused budget carry forward, or start from the 50/30/20 templates and adjust from there.' },
    ],
  },
  {
    id: 'progress',
    path: '/progress',
    steps: [
      { el: '.progress-hero, .level-ring', title: 'Your trophy room', body: 'Level, title and streak at the top. XP rewards keeping the books correct — never spending less.' },
      { el: '.tabs-row, .quest-board', title: 'Quests', body: 'Three daily challenges and one weekly mission, generated from your own averages so they stretch without being arbitrary.' },
      { el: '.badge-shelf, .badge', title: 'Badges', body: 'Locked badges tell you exactly what is left. They are rules over your real data, so they cannot be gamed.' },
    ],
  },
  {
    id: 'investments',
    path: '/investments',
    steps: [
      { el: '.portfolio, .card', title: 'What you own', body: 'Value is quantity times the last price you entered — so stale prices quietly misreport everything downstream.' },
      { el: '.allocation, .chart', title: 'Allocation and rebalancing', body: 'Set target percentages and the app suggests the trades that move you back to them.' },
      { el: '.returns, .metric', title: 'XIRR vs TWR', body: 'Money-weighted versus time-weighted. Together they tell you whether your timing helped or hurt.' },
    ],
  },
]

export const tourFor = (path: string) => TOURS.find((t) => t.path === path) ?? null
