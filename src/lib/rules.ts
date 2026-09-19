import type { Rule, Transaction } from './types'

type Matchable = Pick<Transaction, 'payee' | 'note' | 'accountId' | 'amount' | 'date' | 'type'>

const weekdayName = (date: string) => new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

export const ruleMatches = (rule: Rule, t: Matchable): boolean => {
  const p = rule.pattern.trim()
  if (!p) return false
  switch (rule.field) {
    case 'amount': {
      const v = Number(t.amount) || 0
      if (rule.match === 'between') {
        const a = Number(p)
        const b = Number(rule.pattern2 ?? '')
        if (Number.isNaN(a) || Number.isNaN(b)) return false
        return v >= Math.min(a, b) && v <= Math.max(a, b)
      }
      if (rule.match === 'equals') return Math.abs(v - Number(p)) < 0.005
      return v >= Number(p)
    }
    case 'account':
      return rule.match === 'is' ? t.accountId === p : t.accountId !== p
    case 'weekday': {
      const day = weekdayName(t.date)
      const list = (rule.pattern2 || rule.pattern).split(/[,\s]+/).map((s) => s.toLowerCase().slice(0, 3))
      return list.some((d) => d && day.startsWith(d))
    }
    default: {
      const targets = rule.field === 'payee' ? [t.payee] : rule.field === 'note' ? [t.note] : [t.payee, t.note]
      const low = p.toLowerCase()
      return targets.some((raw) => {
        const s = (raw ?? '').toLowerCase()
        switch (rule.match) {
          case 'contains':
            return s.includes(low)
          case 'starts':
            return s.startsWith(low)
          case 'equals':
            return s === low
          case 'regex':
            try {
              return new RegExp(rule.pattern, 'i').test(raw ?? '')
            } catch {
              return false
            }
          default:
            return s.includes(low)
        }
      })
    }
  }
}

/** Human-readable description of a rule (used in the rules table and the "why?" trace). */
export const describeRule = (r: Rule) => {
  const op =
    r.field === 'amount'
      ? r.match === 'between'
        ? `is between ${r.pattern} and ${r.pattern2 ?? ''}`
        : `${r.match === 'equals' ? 'is' : 'is at least'} ${r.pattern}`
      : r.field === 'account'
        ? `${r.match === 'is' ? 'is' : 'is not'} ${r.pattern}`
        : r.field === 'weekday'
          ? `falls on ${r.pattern2 || r.pattern}`
          : `${r.field} ${r.match} “${r.pattern}”`
  return `If ${op}`
}

/** Apply the first matching enabled rule. Returns the patched transaction and the rule used. */
export const applyRules = <T extends Matchable & { categoryId: string | null; tags?: string[] }>(
  rules: Rule[],
  t: T,
): { tx: T; rule: Rule | null } => {
  if (t.type === 'transfer') return { tx: t, rule: null }
  for (const r of rules) {
    if (!r.enabled) continue
    if (ruleMatches(r, t)) {
      const tags = [...new Set([...(t.tags ?? []), ...r.tags])]
      return {
        tx: { ...t, categoryId: r.categoryId ?? t.categoryId, tags, payee: r.renameTo.trim() || t.payee },
        rule: r,
      }
    }
  }
  return { tx: t, rule: null }
}

/** Explain why a transaction is categorised the way it is (rules trace). */
export const explainCategorisation = (rules: Rule[], t: Transaction) => {
  const candidates = rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.enabled && ruleMatches(r, t))
  return { applied: candidates[0] ?? null, wouldAlsoMatch: candidates.slice(1) }
}
