// Server-side scheduled work, run hourly from the standalone server (and once at boot).
// Keeps the books moving even when no browser tab is open:
//   1. auto-posts due recurring transactions (with correct historical dates, idempotent)
//   2. accrues monthly interest on debts that carry an APR
// All writes go through the incremental ops API so open clients just merge them in.
import { randomUUID } from 'node:crypto'

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}
const today = () => toISO(new Date())
const round2 = (v) => Math.round(v * 100) / 100

const nextOccurrence = (date, freq) => {
  const d = parseISO(date)
  if (freq === 'weekly') d.setDate(d.getDate() + 7)
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14)
  else {
    const months = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + months)
    const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, max))
  }
  return toISO(d)
}

const recToTx = (r, date) => ({
  id: randomUUID(),
  type: r.type,
  amount: r.amount,
  date,
  categoryId: r.type === 'transfer' ? null : r.categoryId,
  accountId: r.accountId,
  toAccountId: r.type === 'transfer' ? (r.toAccountId ?? null) : null,
  note: r.note ?? '',
  payee: r.payee || r.name,
  tags: r.tags ?? [],
  recurringId: r.id,
})

/** Pure core: takes state, returns ops. Exported for tests. */
export function scheduledOps(state, now = today()) {
  const ops = {}
  let touched = false

  // 1) recurring auto-post
  const txUpsert = []
  const recUpsert = []
  for (const r of state.recurring ?? []) {
    if (!r.active || !r.autoPost) continue
    let next = r.nextDate
    let guard = 0
    let cur = r
    let changed = false
    while (next <= now && guard++ < 120) {
      if (r.endDate && next > r.endDate) {
        cur = { ...cur, active: false }
        changed = true
        break
      }
      const already = (state.transactions ?? []).some((x) => x.recurringId === r.id && x.date === next)
      if (!already) txUpsert.push(recToTx(r, next))
      next = nextOccurrence(next, r.frequency)
      cur = { ...cur, nextDate: next }
      changed = true
    }
    if (changed) recUpsert.push(cur)
  }
  if (txUpsert.length) {
    ops.transactions = { upsert: txUpsert }
    touched = true
  }
  if (recUpsert.length) {
    ops.recurring = { upsert: recUpsert }
    touched = true
  }

  // 2) debt interest accrual (simple monthly interest on the current balance)
  const debtUpsert = []
  const payUpsert = []
  for (const d of state.debts ?? []) {
    if (!(d.apr > 0) || !(d.balance > 0)) continue
    const last = d.lastInterestAt ?? `${now.slice(0, 7)}-01`
    let due = parseISO(last)
    due.setMonth(due.getMonth() + 1)
    let guard = 0
    let cur = d
    while (toISO(due) <= now && guard++ < 60) {
      const interest = round2((cur.balance * cur.apr) / 100 / 12)
      if (interest > 0) {
        cur = { ...cur, balance: round2(cur.balance + interest), lastInterestAt: toISO(due) }
        payUpsert.push({ id: randomUUID(), debtId: d.id, date: toISO(due), amount: interest, note: 'Interest accrued', kind: 'interest' })
      } else {
        cur = { ...cur, lastInterestAt: toISO(due) }
      }
      due.setMonth(due.getMonth() + 1)
    }
    if (cur !== d) {
      debtUpsert.push(cur)
      touched = true
    }
  }
  if (debtUpsert.length) ops.debts = { upsert: debtUpsert }
  if (payUpsert.length) ops.debtPayments = { upsert: payUpsert }

  return { ops, touched, posted: txUpsert.length, interestAccrued: payUpsert.length }
}

/** Run against a live store. Returns a summary. */
export function runScheduledWork(store, log = () => {}) {
  if (store.isEmpty()) return { touched: false }
  const state = store.readAll()
  const { ops, touched, posted, interestAccrued } = scheduledOps(state)
  if (!touched) return { touched: false }
  const { rev } = store.applyOps(ops)
  if (posted) log(`scheduler: auto-posted ${posted} recurring transaction(s)`)
  if (interestAccrued) log(`scheduler: accrued interest on ${interestAccrued} debt period(s)`)
  return { touched: true, posted, interestAccrued, rev }
}

/** Start an hourly interval. Returns a stop function. */
export function startScheduler(store, log = () => {}) {
  const tick = () => {
    try {
      runScheduledWork(store, log)
      store.maybeDailyBackup()
    } catch (e) {
      log(`scheduler error: ${e?.message ?? e}`)
    }
  }
  tick()
  const iv = setInterval(tick, 3600_000)
  return () => clearInterval(iv)
}
