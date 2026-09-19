import { useMemo } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  Account,
  AppData,
  Category,
  Debt,
  DebtPayment,
  Goal,
  Holding,
  Recurring,
  Rule,
  SavedView,
  Settings,
  Transaction,
} from './lib/types'
import { DATA_VERSION, defaultSettings, demoData, emptyData } from './lib/seed'
import { nextOccurrence, round2, today, uid } from './lib/utils'
import { applyRules } from './lib/rules'
import { CACHE_KEY, applyOpsToState, consumeInitialPush, diffStates, onRemoteChange, sqliteStorage, withRemoteGuard } from './lib/sync'
import { repair } from './lib/migrate'
import { pushUndo } from './lib/undo'

type Omitted<T> = Omit<T, 'id'>

interface Store extends AppData {
  addTransaction: (t: Omitted<Transaction>, useRules?: boolean) => string
  addTransactions: (ts: Omitted<Transaction>[]) => string[]
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  deleteTransaction: (id: string) => void
  deleteTransactions: (ids: string[]) => void

  addAccount: (a: Omitted<Account>) => void
  updateAccount: (id: string, patch: Partial<Account>) => void
  deleteAccount: (id: string) => void
  archiveAccount: (id: string, archived: boolean) => void

  addCategory: (c: Omitted<Category>) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string, mergeInto?: string | null) => void

  setBudget: (categoryId: string, limit: number, patch?: Partial<import('./lib/types').Budget>) => void
  deleteBudget: (id: string) => void

  addGoal: (g: Omitted<Goal>) => void
  updateGoal: (id: string, patch: Partial<Goal>) => void
  deleteGoal: (id: string) => void

  addRecurring: (r: Omitted<Recurring>) => void
  updateRecurring: (id: string, patch: Partial<Recurring>) => void
  deleteRecurring: (id: string) => void
  postRecurring: (id: string, date?: string) => void
  skipRecurring: (id: string) => void
  runAutoPost: () => number

  addHolding: (h: Omitted<Holding>) => void
  updateHolding: (id: string, patch: Partial<Holding>) => void
  deleteHolding: (id: string) => void
  tradeHolding: (id: string, side: 'buy' | 'sell', qty: number, price: number, accountId?: string | null) => void

  addDebt: (d: Omitted<Debt>) => void
  updateDebt: (id: string, patch: Partial<Debt>) => void
  deleteDebt: (id: string) => void
  payDebt: (debtId: string, amount: number, date: string, note: string, recordTx: boolean) => void
  accrueInterest: () => number

  addRule: (r: Omitted<Rule>) => void
  updateRule: (id: string, patch: Partial<Rule>) => void
  deleteRule: (id: string) => void
  applyRulesToExisting: (onlyUncategorised: boolean) => number

  addAlias: (from: string, to: string) => void
  deleteAlias: (id: string) => void
  addSavedView: (v: Omitted<SavedView>) => void
  deleteSavedView: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  setRate: (currency: string, rate: number) => void
  replaceAll: (data: AppData) => void
  resetDemo: () => void
  resetEmpty: () => void
  clearAll: () => void
  applyRemoteState: () => void
}

const initial = demoData()

const money = (v: number) => round2(Number(v) || 0)

const recToTx = (r: Recurring, date: string): Omitted<Transaction> => ({
  type: r.type,
  amount: money(r.amount),
  date,
  categoryId: r.type === 'transfer' ? null : r.categoryId,
  accountId: r.accountId,
  toAccountId: r.type === 'transfer' ? r.toAccountId : null,
  note: r.note,
  payee: r.payee || r.name,
  tags: r.tags ?? [],
  recurringId: r.id,
  status: 'cleared',
  createdAt: today(),
})

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initial,

      addTransaction: (t, useRules = false) => {
        const id = uid()
        set((s) => {
          const tx = useRules ? applyRules(s.rules, t).tx : t
          return {
            transactions: [{ ...tx, id, amount: money(tx.amount), status: tx.status ?? 'cleared', createdAt: today() }, ...s.transactions],
          }
        })
        return id
      },
      addTransactions: (ts) => {
        const rows = ts.map((t) => ({ ...t, id: uid(), amount: money(t.amount), status: t.status ?? 'cleared', createdAt: today() }))
        set((s) => ({
          transactions: [...rows, ...s.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
        }))
        return rows.map((r) => r.id)
      },
      updateTransaction: (id, patch) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id ? { ...t, ...patch, ...(patch.amount !== undefined ? { amount: money(patch.amount) } : {}), updatedAt: today() } : t,
          ),
        })),
      deleteTransaction: (id) => {
        const gone = get().transactions.find((t) => t.id === id)
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
        if (gone) pushUndo(`Deleted “${gone.payee}”`, () => set((s) => ({ transactions: [gone, ...s.transactions.filter((t) => t.id !== id)].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) })))
      },
      deleteTransactions: (ids) => {
        const del = new Set(ids)
        const gone = get().transactions.filter((t) => del.has(t.id))
        set((s) => ({ transactions: s.transactions.filter((t) => !del.has(t.id)) }))
        if (gone.length)
          pushUndo(`Deleted ${gone.length} transaction${gone.length === 1 ? '' : 's'}`, () =>
            set((s) => ({
              transactions: [...gone, ...s.transactions.filter((t) => !del.has(t.id))].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
            })),
          )
      },

      addAccount: (a) => set((s) => ({ accounts: [...s.accounts, { ...a, balance: money(a.balance), id: uid() }] })),
      updateAccount: (id, patch) =>
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch, ...(patch.balance !== undefined ? { balance: money(patch.balance) } : {}) } : a)),
        })),
      /** Archiving keeps every transaction; hard delete only when the account has none. */
      deleteAccount: (id) => {
        const s0 = get()
        const acc = s0.accounts.find((a) => a.id === id)
        if (!acc) return
        const used = s0.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length
        if (used > 0) {
          set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived: true, includeInTotal: false } : a)) }))
          pushUndo(`Archived “${acc.name}” (${used} transactions kept)`, () => set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived: false, includeInTotal: true } : a)) })))
          return
        }
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          recurring: s.recurring.filter((r) => r.accountId !== id && r.toAccountId !== id),
        }))
        pushUndo(`Deleted “${acc.name}”`, () =>
          set((s) => ({
            accounts: [...s.accounts, acc],
            recurring: [...s.recurring, ...s0.recurring.filter((r) => r.accountId === id || r.toAccountId === id)],
          })),
        )
      },
      archiveAccount: (id, archived) => set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived, includeInTotal: !archived } : a)) })),

      addCategory: (c) => set((s) => ({ categories: [...s.categories, { ...c, id: uid() }] })),
      updateCategory: (id, patch) => set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCategory: (id, mergeInto = null) =>
        set((s) => {
          const target = s.categories.find((c) => c.id === id)
          const keep = mergeInto && s.categories.some((c) => c.id === mergeInto) ? mergeInto : null
          const snapshot = s.transactions
            .filter((t) => t.categoryId === id || t.splits?.some((x) => x.categoryId === id))
            .map((t) => ({ id: t.id, categoryId: t.categoryId, splits: t.splits }))
          if (target)
            pushUndo(`Deleted “${target.name}”`, () =>
              set((st) => ({
                categories: [...st.categories, target],
                transactions: st.transactions.map((t) => {
                  const was = snapshot.find((x) => x.id === t.id)
                  return was ? { ...t, categoryId: was.categoryId, splits: was.splits } : t
                }),
              })),
            )
          return {
            categories: s.categories.filter((c) => c.id !== id),
            budgets: s.budgets.filter((b) => b.categoryId !== id),
            transactions: s.transactions.map((t) => {
              if (t.categoryId !== id && !t.splits?.some((x) => x.categoryId === id)) return t
              const splits = t.splits?.map((sp) => (sp.categoryId === id ? { ...sp, categoryId: keep ?? sp.categoryId } : sp))
              return { ...t, categoryId: t.categoryId === id ? keep : t.categoryId, splits: t.splits ? splits : undefined }
            }),
            rules: s.rules.map((r) => (r.categoryId === id ? { ...r, categoryId: keep } : r)),
            recurring: s.recurring.map((r) => (r.categoryId === id ? { ...r, categoryId: keep } : r)),
          }
        }),

      setBudget: (categoryId, limit, patch) =>
        set((s) => {
          const next = { limit: money(limit), ...patch }
          if (s.budgets.some((b) => b.categoryId === categoryId)) return { budgets: s.budgets.map((b) => (b.categoryId === categoryId ? { ...b, ...next } : b)) }
          return { budgets: [...s.budgets, { id: uid(), categoryId, period: 'monthly', rollover: false, rolloverAmount: 0, ...next }] }
        }),
      deleteBudget: (id) => {
        const gone = get().budgets.find((b) => b.id === id)
        set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) }))
        if (gone) pushUndo('Removed budget', () => set((s) => ({ budgets: [...s.budgets, gone] })))
      },

      addGoal: (g) => set((s) => ({ goals: [...s.goals, { ...g, id: uid() }] })),
      updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      deleteGoal: (id) => {
        const gone = get().goals.find((g) => g.id === id)
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }))
        if (gone) pushUndo(`Deleted goal “${gone.name}”`, () => set((s) => ({ goals: [...s.goals, gone] })))
      },

      addRecurring: (r) => set((s) => ({ recurring: [...s.recurring, { ...r, amount: money(r.amount), id: uid() }] })),
      updateRecurring: (id, patch) =>
        set((s) => ({
          recurring: s.recurring.map((r) => (r.id === id ? { ...r, ...patch, ...(patch.amount !== undefined ? { amount: money(patch.amount) } : {}) } : r)),
        })),
      deleteRecurring: (id) => {
        const gone = get().recurring.find((r) => r.id === id)
        set((s) => ({ recurring: s.recurring.filter((r) => r.id !== id) }))
        if (gone) pushUndo(`Deleted “${gone.name}”`, () => set((s) => ({ recurring: [...s.recurring, gone] })))
      },
      postRecurring: (id, date) =>
        set((s) => {
          const r = s.recurring.find((x) => x.id === id)
          if (!r) return {}
          const tx = { ...recToTx(r, date ?? r.nextDate), id: uid() }
          const next = nextOccurrence(r.nextDate, r.frequency)
          return {
            transactions: [tx, ...s.transactions],
            recurring: s.recurring.map((x) => (x.id === id ? { ...x, nextDate: next, active: x.endDate && next > x.endDate ? false : x.active } : x)),
          }
        }),
      skipRecurring: (id) =>
        set((s) => ({
          recurring: s.recurring.map((x) => (x.id === id ? { ...x, nextDate: nextOccurrence(x.nextDate, x.frequency) } : x)),
        })),
      runAutoPost: () => {
        const s = get()
        const t = today()
        const newTx: Transaction[] = []
        const recurring = s.recurring.map((r) => {
          if (!r.active || !r.autoPost) return r
          let next = r.nextDate
          let guard = 0
          let cur = r
          while (next <= t && guard++ < 120) {
            if (r.endDate && next > r.endDate) {
              cur = { ...cur, active: false }
              break
            }
            const already = s.transactions.some((x) => x.recurringId === r.id && x.date === next)
            if (!already) newTx.push({ ...recToTx(r, next), id: uid() })
            next = nextOccurrence(next, r.frequency)
            cur = { ...cur, nextDate: next }
          }
          return cur
        })
        set({
          recurring,
          transactions: newTx.length ? [...newTx, ...s.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)) : s.transactions,
          settings: { ...s.settings, lastRecurringRun: t },
        })
        return newTx.length
      },

      addHolding: (h) => set((s) => ({ holdings: [...s.holdings, { ...h, id: uid() }] })),
      updateHolding: (id, patch) => set((s) => ({ holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: today() } : h)) })),
      deleteHolding: (id) => {
        const gone = get().holdings.find((h) => h.id === id)
        set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) }))
        if (gone) pushUndo(`Deleted ${gone.symbol}`, () => set((s) => ({ holdings: [...s.holdings, gone] })))
      },
      /** Buy/sell. Passing an account moves cash too, so net worth no longer double-counts. */
      tradeHolding: (id, side, qty, price, accountId = null) =>
        set((s) => {
          const h = s.holdings.find((x) => x.id === id)
          if (!h) return {}
          const total = money(qty * price)
          let realized = 0
          let lots = h.lots?.length ? [...h.lots] : h.quantity > 0 && h.avgCost > 0 ? [{ date: today(), qty: h.quantity, price: h.avgCost }] : []
          if (side === 'buy') {
            const totalCost = h.quantity * h.avgCost + qty * price
            const q = h.quantity + qty
            lots = [...lots, { date: today(), qty, price }]
            return {
              holdings: s.holdings.map((x) => (x.id === id ? { ...x, quantity: q, avgCost: q ? round2(totalCost / q) : 0, price, lots, updatedAt: today() } : x)),
              ...(accountId
                ? {
                    transactions: [
                      {
                        id: uid(),
                        type: 'transfer' as const,
                        amount: total,
                        date: today(),
                        accountId,
                        toAccountId: null,
                        categoryId: null,
                        payee: `Buy ${h.symbol}`,
                        note: `${qty} × ${price} ${h.currency}`,
                        tags: ['investing'],
                        status: 'cleared' as const,
                        investment: { holdingId: id, side: 'buy' as const, qty, price },
                        createdAt: today(),
                      },
                      ...s.transactions,
                    ],
                  }
                : {}),
            }
          }
          let remaining = qty
          const kept: typeof lots = []
          for (const lot of lots) {
            if (remaining <= 0) {
              kept.push(lot)
              continue
            }
            const take = Math.min(lot.qty, remaining)
            realized += take * (price - lot.price)
            remaining -= take
            const left = lot.qty - take
            if (left > 1e-9) kept.push({ ...lot, qty: left })
          }
          const q2 = Math.max(0, h.quantity - qty)
          return {
            holdings: s.holdings
              .map((x) => (x.id === id ? { ...x, quantity: q2, price, lots: kept, realizedPnl: round2((x.realizedPnl ?? 0) + realized), updatedAt: today() } : x))
              .filter((x) => x.quantity > 1e-9),
            ...(accountId
              ? {
                  transactions: [
                    {
                      id: uid(),
                      type: 'transfer' as const,
                      amount: total,
                      date: today(),
                      accountId,
                      toAccountId: null,
                      categoryId: null,
                      payee: `Sell ${h.symbol}`,
                      note: `${qty} × ${price} ${h.currency}`,
                      tags: ['investing'],
                      status: 'cleared' as const,
                      investment: { holdingId: id, side: 'sell' as const, qty, price },
                      createdAt: today(),
                    },
                    ...s.transactions,
                  ],
                }
              : {}),
          }
        }),

      addDebt: (d) => set((s) => ({ debts: [...s.debts, { ...d, id: uid() }] })),
      updateDebt: (id, patch) => set((s) => ({ debts: s.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
      deleteDebt: (id) => {
        const gone = get().debts.find((d) => d.id === id)
        const pays = get().debtPayments.filter((p) => p.debtId === id)
        set((s) => ({ debts: s.debts.filter((d) => d.id !== id), debtPayments: s.debtPayments.filter((p) => p.debtId !== id) }))
        if (gone) pushUndo(`Deleted debt “${gone.name}”`, () => set((s) => ({ debts: [...s.debts, gone], debtPayments: [...s.debtPayments, ...pays] })))
      },
      payDebt: (debtId, amount, date, note, recordTx) =>
        set((s) => {
          const d = s.debts.find((x) => x.id === debtId)
          if (!d) return {}
          const amt = money(amount)
          // Split the payment into interest (accrued since the last accrual) and principal.
          const months = d.lastInterestAt ? Math.max(0, (Number(date.slice(0, 7).replace('-', '')) - Number(d.lastInterestAt.slice(0, 7).replace('-', ''))) ) : 0
          const rate = d.apr / 100 / 12
          const accrued = months > 0 ? money(d.balance * ((1 + rate) ** months - 1)) : 0
          const interest = Math.min(amt, Math.max(0, accrued))
          const principal = money(amt - interest)
          const payment: DebtPayment = { id: uid(), debtId, date, amount: amt, note, kind: 'payment', interest, principal }
          const patch: Partial<Store> = {
            debts: s.debts.map((x) => (x.id === debtId ? { ...x, balance: Math.max(0, round2(x.balance - principal)), interestPaid: round2((x.interestPaid ?? 0) + interest), lastInterestAt: date } : x)),
            debtPayments: [payment, ...s.debtPayments],
          }
          if (recordTx && d.accountId) {
            const cat = s.categories.find((c) => c.id === 'c_debt') ?? s.categories.find((c) => c.kind === 'expense')
            patch.transactions = [
              { id: uid(), type: 'expense', amount: amt, date, categoryId: cat?.id ?? null, accountId: d.accountId, note: note || `Payment — ${d.name}`, payee: d.name, tags: ['debt'], status: 'cleared', createdAt: today() },
              ...s.transactions,
            ]
          }
          return patch
        }),
      /** Accrue monthly interest on every debt that carries an APR. Idempotent per calendar month. */
      accrueInterest: () => {
        const s = get()
        const now = today()
        let n = 0
        const debtUpsert: Debt[] = []
        const payments: DebtPayment[] = []
        for (const d of s.debts) {
          if (!(d.apr > 0) || !(d.balance > 0) || d.accrueInterest === false) continue
          const last = d.lastInterestAt ?? `${now.slice(0, 7)}-01`
          const [ly, lm] = last.split('-').map(Number)
          const [ny, nm] = now.split('-').map(Number)
          const months = (ny! - ly!) * 12 + (nm! - lm!)
          if (months <= 0) continue
          const interest = money(d.balance * (d.apr / 100 / 12) * months)
          if (interest <= 0) {
            debtUpsert.push({ ...d, lastInterestAt: `${now.slice(0, 7)}-01` })
            continue
          }
          debtUpsert.push({ ...d, balance: round2(d.balance + interest), interestPaid: round2((d.interestPaid ?? 0) + interest), lastInterestAt: `${now.slice(0, 7)}-01` })
          payments.push({ id: uid(), debtId: d.id, date: `${now.slice(0, 7)}-01`, amount: interest, note: 'Interest accrued', kind: 'interest', interest, principal: 0 })
          n++
        }
        if (!debtUpsert.length) return 0
        set({
          debts: s.debts.map((d) => debtUpsert.find((x) => x.id === d.id) ?? d),
          debtPayments: [...payments, ...s.debtPayments],
        })
        return n
      },

      addRule: (r) => set((s) => ({ rules: [...s.rules, { ...r, id: uid() }] })),
      updateRule: (id, patch) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      deleteRule: (id) => {
        const gone = get().rules.find((r) => r.id === id)
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }))
        if (gone) pushUndo(`Deleted rule “${gone.name}”`, () => set((s) => ({ rules: [...s.rules, gone] })))
      },
      applyRulesToExisting: (onlyUncategorised) => {
        const s = get()
        let n = 0
        const transactions = s.transactions.map((t) => {
          if (onlyUncategorised && t.categoryId) return t
          const { tx, rule } = applyRules(s.rules, t)
          if (rule) n++
          return rule ? tx : t
        })
        set({ transactions })
        return n
      },

      addAlias: (from, to) =>
        set((s) => {
          const f = from.trim().toLowerCase()
          const t = to.trim()
          if (!f || !t) return {}
          const aliases = (s.settings.aliases ?? []).filter((a) => a.from !== f)
          return { settings: { ...s.settings, aliases: [...aliases, { id: uid(), from: f, to: t }] } }
        }),
      deleteAlias: (id) => set((s) => ({ settings: { ...s.settings, aliases: (s.settings.aliases ?? []).filter((a) => a.id !== id) } })),
      addSavedView: (v) => set((s) => ({ settings: { ...s.settings, savedViews: [...(s.settings.savedViews ?? []), { ...v, id: uid() }] } })),
      deleteSavedView: (id) => set((s) => ({ settings: { ...s.settings, savedViews: (s.settings.savedViews ?? []).filter((v) => v.id !== id) } })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setRate: (currency, rate) =>
        set((s) => ({
          settings: { ...s.settings, rates: { ...s.settings.rates, [currency]: rate }, ratesUpdatedAt: today() },
        })),
      replaceAll: (data) =>
        set(() => ({
          version: DATA_VERSION,
          accounts: data.accounts ?? [],
          categories: data.categories ?? [],
          transactions: data.transactions ?? [],
          budgets: data.budgets ?? [],
          goals: data.goals ?? [],
          recurring: data.recurring ?? [],
          holdings: data.holdings ?? [],
          debts: data.debts ?? [],
          debtPayments: data.debtPayments ?? [],
          rules: data.rules ?? [],
          settings: { ...defaultSettings, ...(data.settings ?? {}), rates: { ...defaultSettings.rates, ...(data.settings?.rates ?? {}) } },
        })),
      // Explicit user actions: never send them back through the first-run wizard.
      resetDemo: () => set(() => ({ ...demoData(), settings: { ...demoData().settings, onboarded: true } })),
      resetEmpty: () => set(() => ({ ...emptyData(), settings: { ...emptyData().settings, onboarded: true } })),
      clearAll: () => {
        const snapshot = get()
        set((s) => ({
          transactions: [],
          budgets: [],
          goals: [],
          recurring: [],
          holdings: [],
          debts: [],
          debtPayments: [],
          accounts: s.accounts.map((a) => ({ ...a, balance: 0 })),
        }))
        pushUndo('Cleared all data', () =>
          set(() => ({
            transactions: snapshot.transactions,
            budgets: snapshot.budgets,
            goals: snapshot.goals,
            recurring: snapshot.recurring,
            holdings: snapshot.holdings,
            debts: snapshot.debts,
            debtPayments: snapshot.debtPayments,
            accounts: snapshot.accounts,
          })),
        )
      },
      /** Re-read the (already fetched) server state into this tab — used after remote changes. */
      applyRemoteState: () => {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return
        try {
          const state = JSON.parse(raw).state as AppData
          withRemoteGuard(() => {
            set(() => ({
              version: DATA_VERSION,
              accounts: state.accounts ?? [],
              categories: state.categories ?? [],
              transactions: state.transactions ?? [],
              budgets: state.budgets ?? [],
              goals: state.goals ?? [],
              recurring: state.recurring ?? [],
              holdings: state.holdings ?? [],
              debts: state.debts ?? [],
              debtPayments: state.debtPayments ?? [],
              rules: state.rules ?? [],
              settings: { ...defaultSettings, ...(state.settings ?? {}), rates: { ...defaultSettings.rates, ...(state.settings?.rates ?? {}) } },
            }))
          })
        } catch {
          /* ignore malformed cache */
        }
      },
    }),
    {
      name: CACHE_KEY,
      version: DATA_VERSION,
      storage: createJSONStorage(() => sqliteStorage),
      onRehydrateStorage: () => (state) => {
        // Brand-new database: persist the initial (demo) state right away instead of waiting for the first edit.
        if (consumeInitialPush()) setTimeout(() => useStore.setState({}), 0)
        if (state) {
          const repaired = repair(state as unknown as AppData)
          const { ops, changed } = diffStates(state as unknown as Record<string, any>, repaired as unknown as Record<string, any>)
          if (changed) setTimeout(() => useStore.setState(repaired as Partial<Store>), 0), void ops
        }
      },
      partialize: (s) => ({
        version: s.version,
        accounts: s.accounts,
        categories: s.categories,
        transactions: s.transactions,
        budgets: s.budgets,
        goals: s.goals,
        recurring: s.recurring,
        holdings: s.holdings,
        debts: s.debts,
        debtPayments: s.debtPayments,
        rules: s.rules,
        settings: s.settings,
      }),
      merge: (persisted, current) => {
        if (!persisted) return current
        const p = persisted as Partial<AppData>
        const merged = {
          ...current,
          ...p,
          recurring: p.recurring ?? [],
          holdings: p.holdings ?? [],
          debts: p.debts ?? [],
          debtPayments: p.debtPayments ?? [],
          rules: p.rules ?? current.rules,
          settings: { ...defaultSettings, ...(p.settings ?? {}), rates: { ...defaultSettings.rates, ...(p.settings?.rates ?? {}) } },
        } as Store
        return repair(merged as unknown as AppData) as unknown as Store
      },
    },
  ),
)

/* ---------- cross-tab & cross-device merge ---------- */
onRemoteChange({
  state: () => useStore.getState().applyRemoteState(),
  ops: (ops) => {
    const state = useStore.getState()
    const current = {
      version: DATA_VERSION,
      accounts: state.accounts,
      categories: state.categories,
      transactions: state.transactions,
      budgets: state.budgets,
      goals: state.goals,
      recurring: state.recurring,
      holdings: state.holdings,
      debts: state.debts,
      debtPayments: state.debtPayments,
      rules: state.rules,
      settings: state.settings,
    } as unknown as Record<string, any>
    // Only merge records this tab has not itself modified since the last push.
    const next = applyOpsToState(current, ops)
    withRemoteGuard(() => useStore.setState(next as unknown as Partial<Store>))
  },
})

export const exportData = (): AppData => {
  const s = useStore.getState()
  return {
    version: s.version,
    accounts: s.accounts,
    categories: s.categories,
    transactions: s.transactions,
    budgets: s.budgets,
    goals: s.goals,
    recurring: s.recurring,
    holdings: s.holdings,
    debts: s.debts,
    debtPayments: s.debtPayments,
    rules: s.rules,
    settings: s.settings,
  }
}

export const applyTheme = (theme: Settings['theme']) => {
  document.documentElement.dataset.theme = theme
}

/** Converter to the base currency, memoised on the values it actually depends on. */
export function useConverter() {
  const currency = useStore((s) => s.settings.currency)
  const ratesKey = useStore((s) => JSON.stringify(s.settings.rates))
  return useMemo(() => {
    const rates = JSON.parse(ratesKey) as Record<string, number>
    return (amount: number, from: string) => {
      if (!from || from === currency) return amount
      const r = rates[from]
      return r && r > 0 ? amount / r : amount
    }
    // ratesKey already encodes `rates`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, ratesKey])
}

/** Selector helpers — subscribe to one slice instead of the whole store. */
export const useTransactions = () => useStore((s) => s.transactions)
export const useAccounts = () => useStore((s) => s.accounts)
export const useCategories = () => useStore((s) => s.categories)
export const useSettings = () => useStore((s) => s.settings)
