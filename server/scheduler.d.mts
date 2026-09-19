import type { Store } from './db.mjs'
export function scheduledOps(state: Record<string, any>, now?: string): { ops: Record<string, unknown>; touched: boolean; posted: number; interestAccrued: number }
export function runScheduledWork(store: Store, log?: (m: string) => void): { touched: boolean; posted?: number; interestAccrued?: number; rev?: number }
export function startScheduler(store: Store, log?: (m: string) => void): () => void
