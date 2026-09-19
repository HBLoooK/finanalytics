// SQLite persistence for Finanalytics (uses Node's built-in node:sqlite, Node >= 22.5).
// Each collection is a table of (id, data JSON). Transactions get generated columns so
// the database stays queryable with any SQLite client.
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, copyFileSync, renameSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, basename } from 'node:path'

export const COLLECTIONS = ['accounts', 'categories', 'transactions', 'budgets', 'goals', 'recurring', 'holdings', 'debts', 'debtPayments', 'rules']

const TABLE = Object.fromEntries(COLLECTIONS.map((c) => [c, c.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())]))

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  date TEXT GENERATED ALWAYS AS (json_extract(data, '$.date')) VIRTUAL,
  type TEXT GENERATED ALWAYS AS (json_extract(data, '$.type')) VIRTUAL,
  amount REAL GENERATED ALWAYS AS (json_extract(data, '$.amount')) VIRTUAL,
  account_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.accountId')) VIRTUAL,
  category_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.categoryId')) VIRTUAL,
  payee TEXT GENERATED ALWAYS AS (json_extract(data, '$.payee')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE TABLE IF NOT EXISTS budgets (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recurring (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS holdings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS debts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS debt_payments (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`

/** Sanity-check a SQLite file. Returns null when healthy, an error string otherwise. */
export function checkIntegrity(file) {
  let probe
  try {
    probe = new DatabaseSync(file, { readOnly: true })
  } catch (e) {
    return `not a SQLite database (${e?.message ?? e})`
  }
  try {
    const row = probe.prepare('PRAGMA integrity_check').get()
    const ok = row && Object.values(row)[0] === 'ok'
    return ok ? null : `integrity_check failed: ${JSON.stringify(row)}`
  } catch (e) {
    return `integrity_check error: ${e?.message ?? e}`
  } finally {
    try {
      probe.close()
    } catch {
      /* ignore */
    }
  }
}

const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true })
  let db = new DatabaseSync(path)
  db.exec(SCHEMA)

  // Prepared statements are re-created whenever the underlying connection is re-opened (restore).
  let stmts = {}
  const prepare = () => {
    db.exec(SCHEMA)
    stmts = {
      getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      upserts: Object.fromEntries(
        COLLECTIONS.map((c) => [c, db.prepare(`INSERT INTO ${TABLE[c]}(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)]),
      ),
      selectAll: Object.fromEntries(COLLECTIONS.map((c) => [c, db.prepare(`SELECT data FROM ${TABLE[c]}`)])),
      selectOne: Object.fromEntries(COLLECTIONS.map((c) => [c, db.prepare(`SELECT data FROM ${TABLE[c]} WHERE id = ?`)])),
      deleteOne: Object.fromEntries(COLLECTIONS.map((c) => [c, db.prepare(`DELETE FROM ${TABLE[c]} WHERE id = ?`)])),
      countRows: Object.fromEntries(COLLECTIONS.map((c) => [c, db.prepare(`SELECT COUNT(*) AS n FROM ${TABLE[c]}`)])),
      selectSettings: db.prepare('SELECT key, value FROM settings'),
      upsertSetting: db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      deleteSetting: db.prepare('DELETE FROM settings WHERE key = ?'),
    }
  }
  prepare()

  const meta = (k) => stmts.getMeta.get(k)?.value ?? null
  const setMeta = (k, v) => stmts.setMeta.run(k, String(v))

  /** Monotonic revision counter: bumped by every write so clients can detect change. */
  const rev = () => Number(meta('rev') ?? 0)
  const bumpRev = () => {
    const r = rev() + 1
    setMeta('rev', r)
    return r
  }

  const isEmpty = () => meta('savedAt') === null

  const readAll = () => {
    const data = {}
    for (const c of COLLECTIONS) data[c] = stmts.selectAll[c].all().map((r) => JSON.parse(r.data))
    const settings = {}
    for (const r of stmts.selectSettings.all()) settings[r.key] = JSON.parse(r.value)
    data.settings = settings
    data.version = Number(meta('version') ?? 0)
    return data
  }

  /** Replace the given collections (and/or settings) atomically. Only keys present in `patch` are touched. */
  const write = (patch) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const c of COLLECTIONS) {
        const rows = patch[c]
        if (!Array.isArray(rows)) continue
        const keep = new Set()
        for (const row of rows) {
          if (!row || typeof row.id !== 'string') continue
          keep.add(row.id)
          stmts.upserts[c].run(row.id, JSON.stringify(row))
        }
        for (const r of db.prepare(`SELECT id FROM ${TABLE[c]}`).all()) if (!keep.has(r.id)) stmts.deleteOne[c].run(r.id)
      }
      if (patch.settings && typeof patch.settings === 'object') {
        const keep = new Set(Object.keys(patch.settings))
        for (const [k, v] of Object.entries(patch.settings)) stmts.upsertSetting.run(k, JSON.stringify(v ?? null))
        for (const r of stmts.selectSettings.all()) if (!keep.has(r.key)) stmts.deleteSetting.run(r.key)
      }
      if (patch.version !== undefined) setMeta('version', String(patch.version))
      const now = new Date().toISOString()
      setMeta('savedAt', now)
      const newRev = bumpRev()
      db.exec('COMMIT')
      return { savedAt: now, rev: newRev }
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  /**
   * Apply incremental ops: { [collection]: { upsert: [rows], delete: [ids] }, settings?: { set: {}, delete: [keys] }, version? }.
   * Ops are commutative, which is what makes multi-tab / multi-device sync safe.
   */
  const applyOps = (ops) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const c of COLLECTIONS) {
        const o = ops?.[c]
        if (!o) continue
        for (const row of o.upsert ?? []) {
          if (!row || typeof row.id !== 'string') continue
          stmts.upserts[c].run(row.id, JSON.stringify(row))
        }
        for (const id of o.delete ?? []) if (typeof id === 'string') stmts.deleteOne[c].run(id)
      }
      if (ops?.settings && typeof ops.settings === 'object') {
        for (const [k, v] of Object.entries(ops.settings.set ?? {})) stmts.upsertSetting.run(k, JSON.stringify(v ?? null))
        for (const k of ops.settings.delete ?? []) stmts.deleteSetting.run(k)
      }
      if (ops?.version !== undefined) setMeta('version', String(ops.version))
      const now = new Date().toISOString()
      setMeta('savedAt', now)
      const newRev = bumpRev()
      db.exec('COMMIT')
      return { savedAt: now, rev: newRev }
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  const backupDir = join(dirname(path), 'backups')

  const listBackups = () => {
    if (!existsSync(backupDir)) return []
    return readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = statSync(join(backupDir, f))
        let sha = null
        const side = join(backupDir, `${f}.sha256`)
        if (existsSync(side)) sha = readFileSync(side, 'utf8').trim().split(/\s/)[0]
        return { name: f, size: st.size, createdAt: st.mtime.toISOString(), sha256: sha }
      })
      .sort((a, b) => (a.name < b.name ? 1 : -1))
  }

  /**
   * Consistent snapshot of the database file (VACUUM INTO), verified with integrity_check +
   * SHA-256 sidecar. Keeps the newest `keep` files. Optional FINANALYTICS_BACKUP_CMD hook
   * receives the snapshot path (e.g. an rclone/rsync command).
   */
  const backup = (keep = 14) => {
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const file = join(backupDir, `finanalytics-${stamp}.db`)
    if (existsSync(file)) unlinkSync(file)
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    // Verify the snapshot before trusting it.
    const problem = checkIntegrity(file)
    if (problem) {
      setMeta('lastBackupOk', 'false')
      throw new Error(`backup failed verification: ${problem}`)
    }
    writeFileSync(`${file}.sha256`, `${sha256File(file)}  ${basename(file)}\n`)
    for (const b of listBackups().slice(keep)) {
      unlinkSync(join(backupDir, b.name))
      try {
        unlinkSync(join(backupDir, `${b.name}.sha256`))
      } catch {
        /* ignore */
      }
    }
    setMeta('lastBackupAt', new Date().toISOString())
    setMeta('lastBackupOk', 'true')
    const hook = process.env.FINANALYTICS_BACKUP_CMD
    if (hook) {
      spawn(hook, [file], { shell: true, stdio: 'ignore' }).on('error', () => {})
    }
    return basename(file)
  }

  /** Run a daily backup if the last one is older than a day and there is data. */
  const maybeDailyBackup = () => {
    if (isEmpty()) return null
    const last = meta('lastBackupAt')
    if (last && Date.now() - Date.parse(last) < 24 * 3600 * 1000) return null
    return backup()
  }

  const status = () => {
    const counts = {}
    for (const c of COLLECTIONS) counts[c] = stmts.countRows[c].get().n
    let size = 0
    try {
      size = statSync(path).size
      const wal = path + '-wal'
      if (existsSync(wal)) size += statSync(wal).size
    } catch {
      /* ignore */
    }
    return {
      engine: 'sqlite',
      path,
      size,
      rev: rev(),
      savedAt: meta('savedAt'),
      lastBackupAt: meta('lastBackupAt'),
      lastBackupOk: meta('lastBackupOk') !== 'false',
      version: Number(meta('version') ?? 0),
      counts,
      backups: listBackups(),
      backupDir,
    }
  }

  const snapshotTo = (file) => {
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  }

  /**
   * Replace the live database with the given SQLite file. A pre-restore snapshot is taken first,
   * the swap is atomic (rename), and the connection is re-opened.
   */
  const restoreFrom = (file) => {
    const problem = checkIntegrity(file)
    if (problem) throw Object.assign(new Error(`cannot restore: ${problem}`), { status: 400 })
    let pre = null
    try {
      pre = backup()
    } catch {
      /* if backups are broken, still allow restore but flag it */
    }
    db.close()
    const tmp = `${path}.restore-tmp`
    copyFileSync(file, tmp)
    renameSync(tmp, path)
    for (const suffix of ['-wal', '-shm']) {
      try {
        unlinkSync(path + suffix)
      } catch {
        /* ignore */
      }
    }
    db = new DatabaseSync(path)
    prepare()
    setMeta('restoredAt', new Date().toISOString())
    bumpRev()
    return { preRestoreBackup: pre }
  }

  return {
    db: () => db,
    path,
    isEmpty,
    readAll,
    write,
    applyOps,
    rev,
    backup,
    maybeDailyBackup,
    listBackups,
    backupDir,
    status,
    snapshotTo,
    restoreFrom,
    close: () => db.close(),
  }
}
