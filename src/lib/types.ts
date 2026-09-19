export type TxType = 'expense' | 'income' | 'transfer'

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  kind: 'expense' | 'income'
  parentId?: string | null // category group (Housing → Rent, Utilities…)
}

export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment'

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: number // opening balance in account currency; current balance is derived
  currency: string
  color: string
  last4?: string
  network?: 'VISA' | 'MC' | 'AMEX' | ''
  expiry?: string // MM/YY
  archived?: boolean // hidden from pickers, history kept
  includeInTotal?: boolean // defaults to true; archived accounts excluded from totals by default
}

export interface Split {
  categoryId: string
  amount: number
  note: string
}

export interface Investment {
  holdingId: string
  side: 'buy' | 'sell'
  qty: number
  price: number
}

export type TxStatus = 'pending' | 'cleared' | 'reconciled'

export interface Transaction {
  id: string
  type: TxType
  amount: number // always positive, in the account's currency
  date: string // YYYY-MM-DD
  categoryId: string | null
  accountId: string
  toAccountId?: string | null // for transfers
  /** Destination amount for cross-currency transfers (in the destination account's currency). */
  toAmount?: number | null
  /** Exchange rate used when the transaction was converted (auditability). */
  rateUsed?: number | null
  note: string
  payee: string
  tags?: string[]
  splits?: Split[] // optional split of an expense across categories (sum == amount)
  recurringId?: string | null
  importHash?: string | null
  importBatchId?: string | null // lets an import be rolled back as a group
  status?: TxStatus
  /** Id of the expense this transaction refunds (net out category totals). */
  refundOf?: string | null
  /** Person or party that still owes you this money (reimbursements). */
  owedBy?: string | null
  /** Receipt / attachment file name served by the API. */
  attachmentId?: string | null
  /** Buy/sell of a holding: moves cash and keeps the portfolio in sync. */
  investment?: Investment | null
  createdAt?: string
  updatedAt?: string
}

export interface Budget {
  id: string
  categoryId: string
  limit: number // monthly limit in base currency
  period?: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  rollover?: boolean // unused budget carries to the next period
  rolloverAmount?: number
}

export interface Goal {
  id: string
  name: string
  target: number
  saved: number
  deadline: string | null
  color: string
  icon: string
  accountId?: string | null // when linked, `saved` is derived from the account balance
  monthlyContribution?: number
}

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Recurring {
  id: string
  name: string
  type: TxType
  amount: number
  categoryId: string | null
  accountId: string
  toAccountId?: string | null
  payee: string
  note: string
  frequency: Frequency
  nextDate: string
  endDate: string | null
  autoPost: boolean
  active: boolean
  remindDays: number
  tags?: string[]
  /** Amount varies each cycle (electricity, phone): the estimate is the average of the last posts. */
  variable?: boolean
  /** When true, a matching incoming transaction settles this bill instead of double-counting. */
  autoMatch?: boolean
}

export type AssetClass = 'stocks' | 'etf' | 'crypto' | 'bonds' | 'cash' | 'real_estate' | 'other'

export interface Lot {
  date: string
  qty: number
  price: number // per unit, in the holding currency
}

export interface Holding {
  id: string
  symbol: string
  name: string
  assetClass: AssetClass
  quantity: number
  avgCost: number // per unit, in `currency`
  price: number // current price per unit, manual
  currency: string
  updatedAt: string
  color: string
  lots?: Lot[] // FIFO tax lots, enables realised P&L
  targetPct?: number | null // target allocation for rebalancing suggestions
  dividends?: number // dividends received to date (in `currency`)
  realizedPnl?: number // realised P&L from sells (in `currency`)
}

export interface Debt {
  id: string
  name: string
  kind: 'credit_card' | 'loan' | 'mortgage' | 'student' | 'personal' | 'other'
  principal: number
  balance: number
  apr: number // % per year
  minPayment: number
  dueDay: number // day of month
  color: string
  accountId?: string | null // linked account to also record payments from
  lastInterestAt?: string | null // last month interest was accrued (YYYY-MM-DD)
  accrueInterest?: boolean // defaults to true when apr > 0
  interestPaid?: number
}

export interface DebtPayment {
  id: string
  debtId: string
  date: string
  amount: number
  note: string
  kind?: 'payment' | 'interest'
  principal?: number
  interest?: number
}

export type RuleField = 'payee' | 'note' | 'any' | 'amount' | 'account' | 'weekday'
export type RuleMatch = 'contains' | 'starts' | 'equals' | 'regex' | 'between' | 'is' | 'in'

export interface Rule {
  id: string
  name: string
  field: RuleField
  match: RuleMatch
  pattern: string
  /** Second operand for `between` (amount) and `in` (weekday list). */
  pattern2?: string
  categoryId: string | null
  tags: string[]
  renameTo: string
  enabled: boolean
  accountId?: string | null
  note?: string
}

/** Learned merchant normalisation: AMZN*MKTP US*2K4 → Amazon. */
export interface Alias {
  id: string
  from: string // raw payee fragment (lowercased)
  to: string // display name
}

/** A named saved filter on the Transactions page. */
export interface SavedView {
  id: string
  name: string
  query: string
  type: 'all' | TxType
  categoryId: string
  accountId: string
  month: string
  tag: string
}

/** A dismissed/snoozed entry in the persistent notification centre. */
export interface NotificationRecord {
  id: string
  kind: 'bill' | 'budget' | 'debt' | 'goal' | 'anomaly' | 'subscription' | 'forecast'
  ref: string // stable id of the thing it is about (recurring id, budget id…)
  title: string
  body: string
  createdAt: string
  read: boolean
  snoozedUntil: string | null
}

export interface Settings {
  name: string
  currency: string // base currency
  locale: string
  theme: 'dark' | 'light'
  monthStartDay: number
  rates: Record<string, number> // units of currency per 1 base currency
  lastRecurringRun: string | null
  ratesUpdatedAt?: string | null
  safeToSpend?: boolean
  onboarded?: boolean
  hideArchived?: boolean
  weekStart?: 0 | 1
  pushEnabled?: boolean
  autoLockMinutes?: number
  aliases?: Alias[]
  savedViews?: SavedView[]
  notifications?: NotificationRecord[]
}

export interface AppData {
  version: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  goals: Goal[]
  recurring: Recurring[]
  holdings: Holding[]
  debts: Debt[]
  debtPayments: DebtPayment[]
  rules: Rule[]
  settings: Settings
}
