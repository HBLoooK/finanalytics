// Search operators and saved views for the Transactions page.
// Supported: free text, #tag, >100, <20, >=, <=, before:2026-03, after:2026-01-01,
//            account:visa, cat:food, category:food, is:uncategorised|split|recurring|transfer|pending|cleared,
//            has:split|note|attachment, amount:12.50, payee:"whole foods", note:rent, -term (exclude)
import type { Account, Category, Transaction } from './types'
import { monthKey } from './utils'

export interface ParsedQuery {
  text: string[]
  exclude: string[]
  tags: string[]
  min: number | null
  max: number | null
  before: string | null
  after: string | null
  account: string | null
  category: string | null
  payee: string | null
  note: string | null
  flags: Set<string>
  amount: number | null
}

const TOKEN = /(-?)([a-z]+):("[^"]+"|\S+)/gi

export function parseQuery(raw: string): ParsedQuery {
  const q: ParsedQuery = { text: [], exclude: [], tags: [], min: null, max: null, before: null, after: null, account: null, category: null, payee: null, note: null, flags: new Set(), amount: null }
  let rest = raw ?? ''
  rest = rest.replace(TOKEN, (m, neg: string, key: string, value: string) => {
    const v = value.replace(/^"|"$/g, '')
    const k = key.toLowerCase()
    const no = neg === '-'
    switch (k) {
      case 'tag':
        if (!no) q.tags.push(v.toLowerCase())
        break
      case 'account':
        if (!no) q.account = v
        break
      case 'cat':
      case 'category':
        if (!no) q.category = v
        break
      case 'payee':
        if (!no) q.payee = v
        break
      case 'note':
        if (!no) q.note = v
        break
      case 'before':
        if (!no) q.before = v
        break
      case 'after':
        if (!no) q.after = v
        break
      case 'amount':
        if (!no) q.amount = Number(v)
        break
      case 'is':
        if (!no) q.flags.add(v.toLowerCase())
        break
      case 'has':
        if (!no) q.flags.add('has-' + v.toLowerCase())
        break
      default:
        return m
    }
    return ' '
  })
  // #tag and comparison operators
  for (const tok of rest.split(/\s+/)) {
    if (!tok) continue
    if (tok.startsWith('#')) {
      q.tags.push(tok.slice(1).toLowerCase())
      continue
    }
    if (tok.startsWith('-') && tok.length > 1) {
      q.exclude.push(tok.slice(1).toLowerCase())
      continue
    }
    const cmp = tok.match(/^(>=|<=|>|<)(-?\d+(\.\d+)?)$/)
    if (cmp) {
      const n = Number(cmp[2])
      if (cmp[1] === '>' || cmp[1] === '>=') q.min = n
      else q.max = n
      continue
    }
    q.text.push(tok.toLowerCase())
  }
  return q
}

export function matchQuery(t: Transaction, q: ParsedQuery, categories: Category[], accounts: Account[]): boolean {
  const cat = categories.find((c) => c.id === t.categoryId)
  const acc = accounts.find((a) => a.id === t.accountId)
  const hay = [t.payee, t.note, cat?.name ?? '', acc?.name ?? '', ...(t.tags ?? [])].join(' ').toLowerCase()

  if (q.text.length && !q.text.every((w) => hay.includes(w) || String(t.amount).includes(w))) return false
  if (q.exclude.some((w) => hay.includes(w))) return false
  if (q.tags.length && !q.tags.every((tag) => (t.tags ?? []).some((x) => x.includes(tag)))) return false
  if (q.min !== null && t.amount < q.min) return false
  if (q.max !== null && t.amount > q.max) return false
  if (q.amount !== null && Math.abs(t.amount - q.amount) > 0.005) return false
  if (q.before && t.date >= q.before) return false
  if (q.after && t.date <= q.after) return false
  if (q.payee && !t.payee.toLowerCase().includes(q.payee.toLowerCase())) return false
  if (q.note && !t.note.toLowerCase().includes(q.note.toLowerCase())) return false
  if (q.account && !(acc?.name.toLowerCase().includes(q.account.toLowerCase()) || acc?.currency.toLowerCase() === q.account.toLowerCase())) return false
  if (q.category && !(cat?.name.toLowerCase().includes(q.category.toLowerCase()) || (q.category === 'none' && !t.categoryId))) return false
  for (const f of q.flags) {
    if (f === 'uncategorised' && t.categoryId) return false
    if (f === 'split' && !t.splits?.length) return false
    if (f === 'recurring' && !t.recurringId) return false
    if (f === 'transfer' && t.type !== 'transfer') return false
    if (f === 'pending' && t.status !== 'pending') return false
    if (f === 'cleared' && t.status === 'pending') return false
    if (f === 'has-split' && !t.splits?.length) return false
    if (f === 'has-note' && !t.note) return false
    if (f === 'has-attachment' && !t.attachmentId) return false
    if (f === 'has-tag' && !t.tags?.length) return false
  }
  return true
}

export const OPERATOR_HELP: [string, string][] = [
  ['>100 / <20', 'amount above / below'],
  ['amount:12.50', 'exact amount'],
  ['before:2026-03', 'date before'],
  ['after:2026-01-15', 'date after'],
  ['account:visa', 'account name or currency'],
  ['cat:food', 'category name (cat:none for uncategorised)'],
  ['payee:"whole foods"', 'payee contains'],
  ['note:rent', 'note contains'],
  ['#travel', 'tag'],
  ['is:uncategorised', 'no category'],
  ['is:split · is:recurring · is:transfer', 'kind'],
  ['is:pending · is:cleared', 'status'],
  ['has:split · has:note · has:attachment', 'has field'],
  ['-coffee', 'exclude a term'],
]

export const monthKeyOf = monthKey
