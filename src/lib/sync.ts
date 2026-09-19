// Persistence bridge: Zustand persist ⇄ SQLite API (server/) with a localStorage cache.
//
// Read:  GET /api/data. If the server is empty (first run) we fall back to the browser cache so an
//        existing localStorage-only installation is migrated transparently. If both exist, the newer
//        one wins and, if that was the local cache, it is pushed to the server.
// Write: every state change is written synchronously to localStorage (crash safety) and pushed to
//        the server as INCREMENTAL OPS (upserts/deletes per collection) computed against the last
//        pushed state. Ops are commutative, so two tabs or two devices editing at once merge
//        instead of overwriting each other; a full PUT is only the fallback.
// Tabs:  a BroadcastChannel shares ops between tabs of this browser and applies them to each
//        other's store, so every tab stays live.
// Auth:  if the server demands a token (non-loopback bind) we surface `authRequired` and let the
//        user paste it once; it is kept in localStorage.
import { createStore, useStore as useZustand } from 'zustand'
import type { StateStorage } from 'zustand/middleware'

export const CACHE_KEY = 'finanalytics:v2'
const STAMP_KEY = 'finanalytics:v2:updatedAt'
const TOKEN_KEY = 'finanalytics:v2:token'

export type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'error'

interface SyncState {
  status: SyncStatus
  engine: 'sqlite' | 'browser'
  lastSavedAt: string | null
  error: string | null
  pendingBytes: number
  authRequired: boolean
  rev: number
}

export const syncStore = createStore<SyncState>(() => ({
  status: 'loading',
  engine: 'browser',
  lastSavedAt: null,
  error: null,
  pendingBytes: 0,
  authRequired: false,
  rev: 0,
}))

export const useSync = <T = SyncState>(sel?: (s: SyncState) => T) => useZustand(syncStore, sel ?? ((s) => s as unknown as T))

const patch = (p: Partial<SyncState>) => syncStore.setState(p)

interface ServerData {
  empty: boolean
  state: Record<string, unknown> | null
  updatedAt: number
  savedAt: string | null
  rev: number
}

const localStamp = () => Number(localStorage.getItem(STAMP_KEY) ?? 0)

/* ---------- auth ---------- */
export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? ''
export const setToken = (t: string) => {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

const apiHeaders = (extra: Record<string, string> = {}) => {
  const t = getToken()
  return t ? { ...extra, authorization: `Bearer ${t}` } : { ...extra }
}

const apiFetch = async (url: string, init: RequestInit = {}) => {
  const res = await fetch(url, { ...init, headers: apiHeaders(init.headers as Record<string, string>) })
  if (res.status === 401) patch({ authRequired: true })
  return res
}

/* ---------- diff & ops ---------- */
const COLLECTIONS = ['accounts', 'categories', 'transactions', 'budgets', 'goals', 'recurring', 'holdings', 'debts', 'debtPayments', 'rules'] as const

export type Ops = {
  [c in (typeof COLLECTIONS)[number]]?: { upsert?: { id: string }[]; delete?: string[] }
} & { settings?: { set?: Record<string, unknown>; delete?: string[] }; version?: number }

/** Compute commutative upsert/delete ops turning `from` into `to`. */
export function diffStates(from: Record<string, any> | null, to: Record<string, any>): { ops: Ops; changed: boolean } {
  const ops: Ops = {}
  let changed = false
  for (const c of COLLECTIONS) {
    const oldRows: { id: string }[] = from?.[c] ?? []
    const newRows: { id: string }[] = to[c] ?? []
    const oldMap = new Map(oldRows.map((r) => [r.id, JSON.stringify(r)]))
    const upsert: { id: string }[] = []
    for (const r of newRows) {
      const j = JSON.stringify(r)
      if (oldMap.get(r.id) !== j) upsert.push(r)
    }
    const newIds = new Set(newRows.map((r) => r.id))
    const del = oldRows.map((r) => r.id).filter((id) => !newIds.has(id))
    if (upsert.length || del.length) {
      ops[c] = {}
      if (upsert.length) ops[c]!.upsert = upsert
      if (del.length) ops[c]!.delete = del
      changed = true
    }
  }
  const oldSettings: Record<string, unknown> = from?.settings ?? {}
  const newSettings: Record<string, unknown> = to.settings ?? {}
  const set: Record<string, unknown> = {}
  const del: string[] = []
  for (const [k, v] of Object.entries(newSettings)) if (JSON.stringify(oldSettings[k]) !== JSON.stringify(v)) set[k] = v
  for (const k of Object.keys(oldSettings)) if (!(k in newSettings)) del.push(k)
  if (Object.keys(set).length || del.length) {
    ops.settings = {}
    if (Object.keys(set).length) ops.settings.set = set
    if (del.length) ops.settings.delete = del
    changed = true
  }
  if ((from?.version ?? 0) !== (to.version ?? 0)) {
    ops.version = to.version ?? 0
    changed = true
  }
  return { ops, changed }
}

/** Apply ops to a state object (mutates a copy). Used for cross-tab merges. */
export function applyOpsToState(state: Record<string, any>, ops: Ops): Record<string, any> {
  const out = { ...state }
  for (const c of COLLECTIONS) {
    const o = ops[c]
    if (!o) continue
    let rows: { id: string }[] = out[c] ?? []
    if (o.delete?.length) {
      const del = new Set(o.delete)
      rows = rows.filter((r) => !del.has(r.id))
    }
    if (o.upsert?.length) {
      const byId = new Map(rows.map((r) => [r.id, r]))
      for (const r of o.upsert) byId.set(r.id, r)
      rows = [...byId.values()]
    }
    out[c] = rows
  }
  if (ops.settings) {
    const settings = { ...(out.settings ?? {}) }
    for (const k of ops.settings.delete ?? []) delete settings[k]
    for (const [k, v] of Object.entries(ops.settings.set ?? {})) settings[k] = v
    out.settings = settings
  }
  if (ops.version !== undefined) out.version = ops.version
  return out
}

/* ---------- cross-tab channel ---------- */
type RemoteHandler = { ops?: (ops: Ops) => void; state?: () => void }
const remoteHandlers: RemoteHandler[] = []
export const onRemoteChange = (h: RemoteHandler) => {
  remoteHandlers.push(h)
  return () => {
    const i = remoteHandlers.indexOf(h)
    if (i >= 0) remoteHandlers.splice(i, 1)
  }
}

let channel: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('finanalytics:sync')
  channel.onmessage = (ev) => {
    const msg = ev.data ?? {}
    if (msg.kind === 'ops') {
      baselineState = msg.state ?? baselineState
      patch({ rev: Math.max(syncStore.getState().rev, msg.rev ?? 0), status: 'saved', engine: 'sqlite' })
      for (const h of remoteHandlers) h.ops?.(msg.ops)
    } else if (msg.kind === 'reload') {
      patch({ rev: msg.rev ?? 0 })
      for (const h of remoteHandlers) h.state?.()
    }
  }
}

/* ---------- write queue ---------- */
let timer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null
let queued: { value: string; stamp: number } | null = null
let attempt = 0
let serverAvailable = true

/** Guard: while applying changes that came from another tab we must not re-push them. */
let applyingRemote = false
export const withRemoteGuard = <T>(fn: () => T): T => {
  applyingRemote = true
  try {
    return fn()
  } finally {
    applyingRemote = false
  }
}

/** The last state known to be on the server (as pushed / as loaded). */
let baselineState: Record<string, any> | null = null
export const resetBaseline = (state: Record<string, any> | null) => {
  baselineState = state
}
export const getBaseline = () => baselineState

const DEBOUNCE_MS = 400
/** Writes issued before the initial read completes are ignored: they would only contain seed data. */
let hydrated = false
/** Set when the server had nothing to return; the store must push its (seed) state once after hydration. */
let needsInitialPush = false
export const consumeInitialPush = () => {
  const v = needsInitialPush
  needsInitialPush = false
  return v
}

async function push(value: string, stamp: number): Promise<void> {
  const state = JSON.parse(value).state
  patch({ status: 'saving', pendingBytes: value.length })

  const { ops, changed } = diffStates(baselineState, state)
  if (changed) {
    const res = await apiFetch('/api/patch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops, updatedAt: stamp }),
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string; authRequired?: boolean }
      if (res.status !== 401) {
        // fall back to a full replace
        await pushFull(state, stamp)
        baselineState = state
        channel?.postMessage({ kind: 'ops', ops: diffStates(baselineState, state).ops, state, rev: syncStore.getState().rev })
        return
      }
      throw new Error(j.error ?? `HTTP ${res.status}`)
    }
    const j = (await res.json()) as { savedAt: string; rev: number }
    baselineState = state
    attempt = 0
    patch({ status: 'saved', engine: 'sqlite', lastSavedAt: j.savedAt, error: null, pendingBytes: 0, rev: j.rev })
    channel?.postMessage({ kind: 'ops', ops, state, rev: j.rev })
    return
  }
  patch({ status: 'saved', engine: 'sqlite', pendingBytes: 0 })
}

async function pushFull(state: Record<string, any>, stamp: number) {
  const body = JSON.stringify({ state, updatedAt: stamp })
  const res = await apiFetch('/api/data', { method: 'PUT', headers: { 'content-type': 'application/json' }, body })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  const j = (await res.json()) as { savedAt: string; rev: number }
  attempt = 0
  patch({ status: 'saved', engine: 'sqlite', lastSavedAt: j.savedAt, error: null, pendingBytes: 0, rev: j.rev })
}

function drain() {
  if (inflight || !queued) return
  const job = queued
  queued = null
  inflight = push(job.value, job.stamp)
    .catch((e: Error) => {
      // Keep the newest value and retry with backoff. The localStorage cache already has it.
      if (!queued) queued = job
      attempt++
      patch({ status: serverAvailable ? 'error' : 'offline', error: e.message })
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))
      timer = setTimeout(drain, delay)
    })
    .finally(() => {
      inflight = null
      if (queued && !timer) drain()
    })
}

function schedule(value: string, stamp: number) {
  queued = { value, stamp }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    drain()
  }, DEBOUNCE_MS)
}

/** Best-effort flush when the tab is hidden/closed. */
export function flushNow() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!queued || inflight) return
  const job = queued
  queued = null
  const state = JSON.parse(job.value).state
  const body = JSON.stringify({ state, updatedAt: job.stamp })
  // keepalive requests are limited to ~64 KB; larger payloads are recovered on next launch
  // because the local cache carries a newer `updatedAt` than the server.
  if (body.length < 60_000) {
    fetch('/api/data', { method: 'PUT', headers: apiHeaders({ 'content-type': 'application/json' }), body, keepalive: true }).catch(() => {})
    baselineState = state
  } else {
    queued = job
    drain()
  }
}

/* ---------- remote-change polling (scheduler writes, other devices) ---------- */
let pollTimer: ReturnType<typeof setInterval> | null = null
async function pollRemote() {
  try {
    const res = await apiFetch('/api/health', { cache: 'no-store' })
    if (!res.ok) return
    const j = (await res.json()) as { ok: boolean; rev?: number; authRequired?: boolean }
    if (j.authRequired && !getToken()) return
    const myRev = syncStore.getState().rev
    if ((j.rev ?? 0) > myRev) {
      const r = await apiFetch('/api/data', { cache: 'no-store' })
      if (!r.ok) return
      const data = (await r.json()) as ServerData
      if (!data.empty && data.state) {
        const value = JSON.stringify({ state: data.state, version: (data.state.version as number) ?? 0 })
        localStorage.setItem(CACHE_KEY, value)
        localStorage.setItem(STAMP_KEY, String(data.updatedAt))
        baselineState = data.state as Record<string, any>
        patch({ rev: data.rev, lastSavedAt: data.savedAt })
        withRemoteGuard(() => {
          for (const h of remoteHandlers) h.state?.()
        })
      }
    }
  } catch {
    /* offline */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
    else void pollRemote()
  })
  window.addEventListener('focus', () => void pollRemote())
  window.addEventListener('online', () => {
    serverAvailable = true
    if (queued) drain()
  })
  pollTimer = setInterval(() => void pollRemote(), 60_000)
}

/* ---------- Zustand storage adapter ---------- */
export const sqliteStorage: StateStorage = {
  getItem: async (name) => {
    const local = localStorage.getItem(name)
    const lStamp = localStamp()
    try {
      const res = await apiFetch('/api/data', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ServerData
      serverAvailable = true
      patch({ engine: 'sqlite', status: 'saved', lastSavedAt: data.savedAt, error: null, rev: data.rev, authRequired: false })

      if (!data.empty && data.state && data.updatedAt >= lStamp) {
        // Server is authoritative: refresh the browser cache.
        const value = JSON.stringify({ state: data.state, version: (data.state.version as number) ?? 0 })
        localStorage.setItem(name, value)
        localStorage.setItem(STAMP_KEY, String(data.updatedAt))
        baselineState = data.state as Record<string, any>
        hydrated = true
        return value
      }
      hydrated = true
      if (local) {
        // Server empty (first run after upgrade) or older than the cache → migrate/push the cache.
        baselineState = (JSON.parse(local).state as Record<string, any>) ?? null
        schedule(local, lStamp || Date.now())
        return local
      }
      baselineState = null
      needsInitialPush = true
      return null
    } catch (e) {
      serverAvailable = false
      hydrated = true
      patch({ engine: 'browser', status: 'offline', error: (e as Error).message })
      if (local) baselineState = (JSON.parse(local).state as Record<string, any>) ?? null
      return local
    }
  },
  setItem: (name, value) => {
    if (applyingRemote) {
      // Another tab made this change: persist the cache but don't push it again.
      localStorage.setItem(name, value)
      return
    }
    if (!hydrated) return
    const stamp = Date.now()
    localStorage.setItem(name, value)
    localStorage.setItem(STAMP_KEY, String(stamp))
    schedule(value, stamp)
  },
  removeItem: (name) => {
    localStorage.removeItem(name)
    localStorage.removeItem(STAMP_KEY)
  },
}

void pollTimer

/* ---------- Server status helpers (Settings page) ---------- */
export interface DbStatus {
  engine: 'sqlite'
  path: string
  size: number
  rev: number
  savedAt: string | null
  lastBackupAt: string | null
  lastBackupOk: boolean
  version: number
  counts: Record<string, number>
  backups: { name: string; size: number; createdAt: string; sha256: string | null }[]
  backupDir: string
}

export const fetchDbStatus = async (): Promise<DbStatus | null> => {
  try {
    const r = await apiFetch('/api/status', { cache: 'no-store' })
    return r.ok ? ((await r.json()) as DbStatus) : null
  } catch {
    return null
  }
}

export const requestBackup = async (): Promise<DbStatus['backups'] | null> => {
  try {
    const r = await apiFetch('/api/backup', { method: 'POST' })
    if (!r.ok) return null
    return ((await r.json()) as { backups: DbStatus['backups'] }).backups
  } catch {
    return null
  }
}

export const restoreBackup = async (name: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const r = await apiFetch('/api/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    return r.ok ? { ok: true } : { ok: false, error: j.error ?? `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export const restoreUpload = async (file: File): Promise<{ ok: boolean; error?: string }> => {
  try {
    const r = await apiFetch('/api/restore/upload', { method: 'POST', headers: { 'content-type': 'application/vnd.sqlite3' }, body: file })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    return r.ok ? { ok: true } : { ok: false, error: j.error ?? `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export const runQuery = async (sql: string): Promise<{ rows?: Record<string, unknown>[]; truncated?: boolean; error?: string }> => {
  try {
    const r = await apiFetch('/api/query', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }) })
    return (await r.json()) as { rows?: Record<string, unknown>[]; truncated?: boolean; error?: string }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
