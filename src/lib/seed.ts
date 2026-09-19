import type {
  Account,
  AppData,
  Budget,
  Category,
  Debt,
  DebtPayment,
  Goal,
  Holding,
  Recurring,
  Rule,
  Settings,
  Transaction,
} from './types'
import { addDays, pad, toISODate, today, uid } from './utils'
import { emptyProgress, seedProgressFromHistory } from './gamification'
import type { GamificationSettings } from './types'

export const DATA_VERSION = 4

// Palette lifted from the reference: indigo, magenta, yellow, green, orange + supporting tones
export const CATEGORY_COLORS = [
  '#6270f2',
  '#e05be0',
  '#f2cf3a',
  '#3ec97a',
  '#f28a2c',
  '#38bdf8',
  '#f0607a',
  '#a78bfa',
  '#2dd4bf',
  '#c2e04a',
  '#fb923c',
  '#94a3b8',
]

export const ICONS = ['🛒', '🍔', '🏠', '🚗', '🎬', '💊', '👕', '✈️', '📱', '🎓', '🎁', '💼', '💰', '📈', '🐾', '⚡', '☕', '🏋️', '🎮', '📚', '💳', '🔧', '🧾', '🎯']

export const defaultCategories: Category[] = [
  { id: 'c_groceries', name: 'Food', icon: '🛒', color: '#6270f2', kind: 'expense' },
  { id: 'c_dining', name: 'Dining', icon: '🍔', color: '#e05be0', kind: 'expense' },
  { id: 'c_housing', name: 'Housing', icon: '🏠', color: '#f2cf3a', kind: 'expense' },
  { id: 'c_transport', name: 'Car', icon: '🚗', color: '#3ec97a', kind: 'expense' },
  { id: 'c_entertainment', name: 'Entertainment', icon: '🎬', color: '#f28a2c', kind: 'expense' },
  { id: 'c_health', name: 'Health', icon: '💊', color: '#38bdf8', kind: 'expense' },
  { id: 'c_shopping', name: 'Goods', icon: '👕', color: '#f0607a', kind: 'expense' },
  { id: 'c_travel', name: 'Holiday', icon: '✈️', color: '#fb923c', kind: 'expense' },
  { id: 'c_utilities', name: 'Utilities', icon: '⚡', color: '#2dd4bf', kind: 'expense' },
  { id: 'c_subscriptions', name: 'Subscriptions', icon: '📱', color: '#a78bfa', kind: 'expense' },
  { id: 'c_debt', name: 'Debt payments', icon: '💳', color: '#94a3b8', kind: 'expense' },
  { id: 'c_salary', name: 'Salary', icon: '💼', color: '#3ec97a', kind: 'income' },
  { id: 'c_freelance', name: 'Freelance', icon: '💻', color: '#38bdf8', kind: 'income' },
  { id: 'c_investments', name: 'Dividends', icon: '📈', color: '#c2e04a', kind: 'income' },
  { id: 'c_other_income', name: 'Other income', icon: '🎁', color: '#e05be0', kind: 'income' },
]

export const CARD_STYLES = [
  'linear-gradient(135deg,#2b2f4a,#15161f)',
  'linear-gradient(135deg,#3b3f8f,#1b1c3a)',
  'linear-gradient(135deg,#7a2c8f,#2b1440)',
  'linear-gradient(135deg,#1f5f5a,#0f2a2a)',
  'linear-gradient(135deg,#8a5a1c,#2e1d0c)',
  'linear-gradient(135deg,#1e3a8a,#0b1a3a)',
  'linear-gradient(135deg,#4a1d3f,#1a0c18)',
  'linear-gradient(135deg,#374151,#0f1115)',
]

export const defaultAccounts: Account[] = [
  {
    id: 'a_checking',
    name: 'Everyday checking',
    type: 'checking',
    balance: 1250,
    currency: 'USD',
    color: CARD_STYLES[1]!,
    last4: '4821',
    network: 'VISA',
    expiry: '09/28',
  },
  {
    id: 'a_savings',
    name: 'High-yield savings',
    type: 'savings',
    balance: 9800,
    currency: 'USD',
    color: CARD_STYLES[3]!,
    last4: '9034',
    network: 'MC',
    expiry: '03/27',
  },
  {
    id: 'a_credit',
    name: 'Rewards credit card',
    type: 'credit',
    balance: -650,
    currency: 'USD',
    color: CARD_STYLES[0]!,
    last4: '1177',
    network: 'AMEX',
    expiry: '11/29',
  },
  {
    id: 'a_eur',
    name: 'Euro travel account',
    type: 'checking',
    balance: 1400,
    currency: 'EUR',
    color: CARD_STYLES[2]!,
    last4: '2210',
    network: 'VISA',
    expiry: '05/28',
  },
  {
    id: 'a_invest',
    name: 'Brokerage cash',
    type: 'investment',
    balance: 2400,
    currency: 'USD',
    color: CARD_STYLES[5]!,
    last4: '',
    network: '',
  },
]

/** Progression defaults: everything on, but never intrusive. */
export const defaultGamification: GamificationSettings = {
  enabled: true,
  celebrations: true,
  coach: true,
  quietHours: [21, 8],
  pinnedTitle: null,
  showTips: true,
}

export const defaultSettings: Settings = {
  name: 'Alex Morgan',
  currency: 'USD',
  locale: 'en-US',
  theme: 'dark',
  monthStartDay: 1,
  rates: { USD: 1, EUR: 0.92, GBP: 0.78, MAD: 9.9, CAD: 1.36, JPY: 149, CHF: 0.88 },
  lastRecurringRun: null,
  ratesUpdatedAt: null,
  safeToSpend: true,
  onboarded: true,
  hideArchived: true,
  weekStart: 1,
  pushEnabled: false,
  autoLockMinutes: 0,
  aliases: [],
  savedViews: [],
  gamification: { ...defaultGamification },
  tourSeen: [],
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const payees: Record<string, string[]> = {
  c_groceries: ['Whole Foods', "Trader Joe's", 'Costco', 'Aldi', 'Local market'],
  c_dining: ['Chipotle', 'Sushi Roku', 'Blue Bottle Coffee', 'Pizzeria Uno', 'Thai Basil', 'Starbucks'],
  c_housing: ['Rent — Maple Apartments'],
  c_transport: ['Uber', 'Shell', 'Metro card', 'Lyft', 'Parking'],
  c_entertainment: ['AMC Theatres', 'Steam', 'Concert tickets', 'Bowling night'],
  c_health: ['CVS Pharmacy', 'Dental clinic', 'Optometrist'],
  c_shopping: ['Amazon', 'Zara', 'Apple Store', 'IKEA', 'Nike'],
  c_travel: ['Delta Airlines', 'Airbnb', 'Marriott', 'Hertz'],
}

export function generateDemoTransactions(months = 12): Transaction[] {
  const rnd = mulberry32(20240921)
  const out: Transaction[] = []
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!
  const money = (min: number, max: number) => Math.round((min + rnd() * (max - min)) * 100) / 100

  for (let m = 0; m < months; m++) {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + m, 1)
    const dim = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const isCurrent = monthDate.getMonth() === now.getMonth() && monthDate.getFullYear() === now.getFullYear()
    const lastDay = isCurrent ? now.getDate() : dim
    const d = (day: number) => `${monthDate.getFullYear()}-${pad(monthDate.getMonth() + 1)}-${pad(Math.min(day, lastDay))}`
    const tx = (t: Omit<Transaction, 'id'>) => out.push({ id: uid(), ...t })

    tx({ type: 'income', amount: 3200, date: d(1), categoryId: 'c_salary', accountId: 'a_checking', note: 'Monthly salary', payee: 'Northwind Studio', recurringId: 'r_salary', tags: ['work'] })
    if (lastDay >= 15) tx({ type: 'income', amount: 3200, date: d(15), categoryId: 'c_salary', accountId: 'a_checking', note: 'Monthly salary', payee: 'Northwind Studio', recurringId: 'r_salary2', tags: ['work'] })
    if (rnd() > 0.35 && lastDay >= 20) tx({ type: 'income', amount: money(600, 2200), date: d(Math.ceil(rnd() * 20)), categoryId: 'c_freelance', accountId: 'a_checking', note: 'Design contract', payee: pick(['Acme Co', 'Lumen Labs', 'Orbit Media']), tags: ['work', 'side-hustle'] })
    if (rnd() > 0.5) tx({ type: 'income', amount: money(40, 180), date: d(Math.ceil(rnd() * lastDay)), categoryId: 'c_investments', accountId: 'a_invest', note: 'Dividends', payee: 'Vanguard', tags: ['investing'] })

    tx({ type: 'expense', amount: 1850, date: d(2), categoryId: 'c_housing', accountId: 'a_checking', note: 'Rent', payee: payees.c_housing![0]!, recurringId: 'r_rent', tags: ['fixed'] })
    for (const [payee, amt, day, rid] of [
      ['Netflix', 15.49, 4, 'r_netflix'],
      ['Spotify', 10.99, 6, 'r_spotify'],
      ['iCloud', 2.99, 9, 'r_icloud'],
      ['Notion', 8, 12, 'r_notion'],
    ] as const) {
      if (day <= lastDay) tx({ type: 'expense', amount: amt, date: d(day), categoryId: 'c_subscriptions', accountId: 'a_credit', note: '', payee, recurringId: rid, tags: ['fixed'] })
    }
    for (const [payee, min, max, day] of [
      ['Electric company', 70, 140, 8],
      ['Internet — Comcast', 65, 65, 10],
      ['Water utility', 25, 45, 14],
    ] as const) {
      if (day <= lastDay) tx({ type: 'expense', amount: money(min, max), date: d(day), categoryId: 'c_utilities', accountId: 'a_checking', note: '', payee, tags: ['fixed'] })
    }
    if (lastDay >= 3) tx({ type: 'expense', amount: 49, date: d(3), categoryId: 'c_health', accountId: 'a_credit', note: '', payee: 'Gym membership', recurringId: 'r_gym', tags: ['fixed', 'fitness'] })
    if (lastDay >= 18) tx({ type: 'expense', amount: 420, date: d(18), categoryId: 'c_debt', accountId: 'a_checking', note: 'Car loan payment', payee: 'Auto Finance Co', recurringId: 'r_carloan', tags: ['fixed', 'debt'] })

    const variable: [string, number, number, number][] = [
      ['c_groceries', 9, 35, 150],
      ['c_dining', 8, 9, 80],
      ['c_transport', 6, 8, 60],
      ['c_entertainment', 2, 15, 90],
      ['c_shopping', 3, 25, 260],
      ['c_health', 1, 20, 120],
    ]
    for (const [cat, count, min, max] of variable) {
      const n = Math.round(count * (0.7 + rnd() * 0.6))
      for (let i = 0; i < n; i++) {
        const day = Math.ceil(rnd() * lastDay)
        const tags = cat === 'c_dining' && rnd() > 0.6 ? ['friends'] : cat === 'c_shopping' && rnd() > 0.7 ? ['gift'] : []
        tx({ type: 'expense', amount: money(min, max), date: d(day), categoryId: cat, accountId: rnd() > 0.45 ? 'a_credit' : 'a_checking', note: '', payee: pick(payees[cat]!), tags })
      }
    }
    if (rnd() > 0.6) tx({ type: 'expense', amount: money(220, 900), date: d(Math.ceil(rnd() * lastDay)), categoryId: 'c_travel', accountId: 'a_credit', note: 'Weekend trip', payee: pick(payees.c_travel!), tags: ['travel'] })
    if (rnd() > 0.5) tx({ type: 'expense', amount: money(30, 160), date: d(Math.ceil(rnd() * lastDay)), categoryId: 'c_dining', accountId: 'a_eur', note: 'Paris', payee: pick(['Café de Flore', 'Le Relais', 'Boulangerie']), tags: ['travel'] })

    if (lastDay >= 16) tx({ type: 'transfer', amount: 1000, date: d(16), categoryId: null, accountId: 'a_checking', toAccountId: 'a_savings', note: 'Auto-save', payee: 'Transfer to savings', recurringId: 'r_save' })
    if (lastDay >= 25) tx({ type: 'transfer', amount: money(1200, 1700), date: d(25), categoryId: null, accountId: 'a_checking', toAccountId: 'a_credit', note: 'Card payment', payee: 'Credit card payment' })
    if (rnd() > 0.5 && lastDay >= 20) tx({ type: 'transfer', amount: 500, date: d(20), categoryId: null, accountId: 'a_checking', toAccountId: 'a_invest', note: 'Index fund buy', payee: 'Transfer to brokerage', tags: ['investing'] })
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export const defaultBudgets: Budget[] = [
  { id: 'b1', categoryId: 'c_groceries', limit: 700 },
  { id: 'b2', categoryId: 'c_dining', limit: 350 },
  { id: 'b3', categoryId: 'c_transport', limit: 250 },
  { id: 'b4', categoryId: 'c_entertainment', limit: 150 },
  { id: 'b5', categoryId: 'c_shopping', limit: 400 },
  { id: 'b6', categoryId: 'c_travel', limit: 500 },
]

export const defaultGoals: Goal[] = [
  { id: 'g1', name: 'Emergency fund', target: 15000, saved: 11200, deadline: null, color: '#6270f2', icon: '🛡️' },
  { id: 'g2', name: 'Japan trip', target: 4500, saved: 2150, deadline: toISODate(new Date(new Date().getFullYear() + 1, 3, 1)), color: '#e05be0', icon: '🗾' },
  { id: 'g3', name: 'New laptop', target: 2400, saved: 1900, deadline: toISODate(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1)), color: '#f2cf3a', icon: '💻' },
]

const nextDom = (day: number) => {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth()
  const thisMonth = new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
  if (thisMonth.getDate() >= n.getDate()) return toISODate(thisMonth)
  const nm = new Date(y, m + 1, 1)
  return toISODate(new Date(nm.getFullYear(), nm.getMonth(), Math.min(day, new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate())))
}

export function defaultRecurring(): Recurring[] {
  const base = { note: '', endDate: null, active: true, remindDays: 3, tags: ['fixed'] }
  return [
    { ...base, id: 'r_salary', name: 'Salary (1st)', type: 'income', amount: 3200, categoryId: 'c_salary', accountId: 'a_checking', payee: 'Northwind Studio', frequency: 'monthly', nextDate: nextDom(1), autoPost: true, tags: ['work'] },
    { ...base, id: 'r_salary2', name: 'Salary (15th)', type: 'income', amount: 3200, categoryId: 'c_salary', accountId: 'a_checking', payee: 'Northwind Studio', frequency: 'monthly', nextDate: nextDom(15), autoPost: true, tags: ['work'] },
    { ...base, id: 'r_rent', name: 'Rent', type: 'expense', amount: 1850, categoryId: 'c_housing', accountId: 'a_checking', payee: 'Rent — Maple Apartments', frequency: 'monthly', nextDate: nextDom(2), autoPost: true, remindDays: 5 },
    { ...base, id: 'r_netflix', name: 'Netflix', type: 'expense', amount: 15.49, categoryId: 'c_subscriptions', accountId: 'a_credit', payee: 'Netflix', frequency: 'monthly', nextDate: nextDom(4), autoPost: true },
    { ...base, id: 'r_spotify', name: 'Spotify', type: 'expense', amount: 10.99, categoryId: 'c_subscriptions', accountId: 'a_credit', payee: 'Spotify', frequency: 'monthly', nextDate: nextDom(6), autoPost: true },
    { ...base, id: 'r_icloud', name: 'iCloud', type: 'expense', amount: 2.99, categoryId: 'c_subscriptions', accountId: 'a_credit', payee: 'iCloud', frequency: 'monthly', nextDate: nextDom(9), autoPost: true },
    { ...base, id: 'r_notion', name: 'Notion', type: 'expense', amount: 8, categoryId: 'c_subscriptions', accountId: 'a_credit', payee: 'Notion', frequency: 'monthly', nextDate: nextDom(12), autoPost: true },
    { ...base, id: 'r_gym', name: 'Gym membership', type: 'expense', amount: 49, categoryId: 'c_health', accountId: 'a_credit', payee: 'Gym membership', frequency: 'monthly', nextDate: nextDom(3), autoPost: true, tags: ['fixed', 'fitness'] },
    { ...base, id: 'r_carloan', name: 'Car loan', type: 'expense', amount: 420, categoryId: 'c_debt', accountId: 'a_checking', payee: 'Auto Finance Co', frequency: 'monthly', nextDate: nextDom(18), autoPost: false, remindDays: 5, tags: ['fixed', 'debt'] },
    { ...base, id: 'r_save', name: 'Auto-save', type: 'transfer', amount: 1000, categoryId: null, accountId: 'a_checking', toAccountId: 'a_savings', payee: 'Transfer to savings', frequency: 'monthly', nextDate: nextDom(16), autoPost: true, tags: [] },
    { ...base, id: 'r_insurance', name: 'Car insurance', type: 'expense', amount: 610, categoryId: 'c_transport', accountId: 'a_checking', payee: 'Geico', frequency: 'quarterly', nextDate: addDays(today(), 11), autoPost: false, remindDays: 7 },
    { ...base, id: 'r_domain', name: 'Domain renewal', type: 'expense', amount: 14, categoryId: 'c_subscriptions', accountId: 'a_credit', payee: 'Namecheap', frequency: 'yearly', nextDate: addDays(today(), 40), autoPost: false, remindDays: 7 },
  ]
}

export function defaultHoldings(): Holding[] {
  const t = today()
  return [
    { id: 'h1', symbol: 'VTI', name: 'Vanguard Total Market ETF', assetClass: 'etf', quantity: 42, avgCost: 218.4, price: 271.3, currency: 'USD', updatedAt: t, color: '#6270f2' },
    { id: 'h2', symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stocks', quantity: 15, avgCost: 164.2, price: 228.5, currency: 'USD', updatedAt: t, color: '#e05be0' },
    { id: 'h3', symbol: 'MSFT', name: 'Microsoft', assetClass: 'stocks', quantity: 8, avgCost: 312, price: 421.7, currency: 'USD', updatedAt: t, color: '#f2cf3a' },
    { id: 'h4', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', quantity: 0.12, avgCost: 41000, price: 63500, currency: 'USD', updatedAt: t, color: '#f28a2c' },
    { id: 'h5', symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', quantity: 1.5, avgCost: 2600, price: 2450, currency: 'USD', updatedAt: t, color: '#38bdf8' },
    { id: 'h6', symbol: 'BND', name: 'Total Bond Market ETF', assetClass: 'bonds', quantity: 60, avgCost: 72.1, price: 74.8, currency: 'USD', updatedAt: t, color: '#3ec97a' },
  ]
}

export function defaultDebts(): Debt[] {
  return [
    { id: 'd1', name: 'Car loan', kind: 'loan', principal: 18000, balance: 9860, apr: 6.4, minPayment: 420, dueDay: 18, color: '#6270f2', accountId: 'a_checking' },
    { id: 'd2', name: 'Student loan', kind: 'student', principal: 24000, balance: 12400, apr: 4.5, minPayment: 260, dueDay: 25, color: '#e05be0', accountId: 'a_checking' },
    { id: 'd3', name: 'Rewards credit card', kind: 'credit_card', principal: 3500, balance: 2150, apr: 22.9, minPayment: 75, dueDay: 25, color: '#f28a2c', accountId: 'a_checking' },
  ]
}

export function defaultDebtPayments(): DebtPayment[] {
  const out: DebtPayment[] = []
  const now = new Date()
  for (let i = 5; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 18)
    out.push({ id: uid(), debtId: 'd1', date: toISODate(d), amount: 420, note: 'Monthly payment' })
    out.push({ id: uid(), debtId: 'd2', date: toISODate(new Date(now.getFullYear(), now.getMonth() - i, 25)), amount: 260, note: 'Monthly payment' })
  }
  return out
}

export const defaultRules: Rule[] = [
  { id: 'ru1', name: 'Streaming', field: 'payee', match: 'regex', pattern: 'netflix|spotify|hulu|disney', categoryId: 'c_subscriptions', tags: ['fixed'], renameTo: '', enabled: true },
  { id: 'ru2', name: 'Ride sharing', field: 'payee', match: 'regex', pattern: '^(uber|lyft)', categoryId: 'c_transport', tags: [], renameTo: '', enabled: true },
  { id: 'ru3', name: 'Amazon', field: 'payee', match: 'contains', pattern: 'amzn', categoryId: 'c_shopping', tags: [], renameTo: 'Amazon', enabled: true },
  { id: 'ru4', name: 'Groceries', field: 'payee', match: 'regex', pattern: 'whole foods|trader joe|costco|aldi', categoryId: 'c_groceries', tags: [], renameTo: '', enabled: true },
  { id: 'ru5', name: 'Coffee', field: 'payee', match: 'regex', pattern: 'starbucks|blue bottle|coffee', categoryId: 'c_dining', tags: ['coffee'], renameTo: '', enabled: true },
]

export function demoData(): AppData {
  const base: AppData = {
    version: DATA_VERSION,
    accounts: structuredClone(defaultAccounts),
    categories: structuredClone(defaultCategories),
    transactions: generateDemoTransactions(),
    budgets: structuredClone(defaultBudgets),
    goals: structuredClone(defaultGoals),
    recurring: defaultRecurring(),
    holdings: defaultHoldings(),
    debts: defaultDebts(),
    debtPayments: defaultDebtPayments(),
    rules: structuredClone(defaultRules),
    settings: { ...structuredClone(defaultSettings), lastRecurringRun: today(), onboarded: false },
  }
  // The demo ships with a history, so it ships with the progression that history implies.
  const { version: _version, ...ctx } = base
  return { ...base, progress: seedProgressFromHistory(ctx) }
}

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    accounts: [{ id: 'a_main', name: 'Main account', type: 'checking', balance: 0, currency: 'USD', color: CARD_STYLES[1]!, last4: '', network: '' }],
    categories: structuredClone(defaultCategories),
    transactions: [],
    budgets: [],
    goals: [],
    recurring: [],
    holdings: [],
    debts: [],
    debtPayments: [],
    rules: structuredClone(defaultRules),
    settings: { ...structuredClone(defaultSettings), name: 'You', lastRecurringRun: today(), onboarded: false },
    progress: emptyProgress(),
  }
}
