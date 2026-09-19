// HTTP API for the SQLite store. Framework-free: a connect-style (req, res, next) handler
// so the same code runs inside Vite's dev server and in the standalone production server.
//
// Security model:
//  - When the server only listens on loopback (the default) no token is needed.
//  - When bound to another interface a bearer token (Authorization: Bearer …) is required for
//    every request except GET /api/health. The token is generated on first start and stored in
//    data/.token; override with FINANALYTICS_TOKEN.
//  - Browser requests that carry an Origin header must match the request Host (CSF defence).
import { createReadStream, statSync, unlinkSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { COLLECTIONS } from './db.mjs'

const MAX_BODY = 64 * 1024 * 1024 // 64 MB — years of transactions are still well below this
const MAX_ATTACHMENT = 8 * 1024 * 1024

const json = (res, status, body) => {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

const readBody = (req, limit = MAX_BODY, binary = false) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const validateState = (state) => {
  if (!state || typeof state !== 'object') return 'state must be an object'
  for (const c of COLLECTIONS) if (state[c] !== undefined && !Array.isArray(state[c])) return `${c} must be an array`
  if (state.settings !== undefined && (typeof state.settings !== 'object' || state.settings === null)) return 'settings must be an object'
  return null
}

const validateOps = (ops) => {
  if (!ops || typeof ops !== 'object') return 'ops must be an object'
  for (const c of COLLECTIONS) {
    const o = ops[c]
    if (o === undefined) continue
    if (typeof o !== 'object' || o === null) return `${c} ops must be an object`
    if (o.upsert !== undefined && !Array.isArray(o.upsert)) return `${c}.upsert must be an array`
    if (o.delete !== undefined && !Array.isArray(o.delete)) return `${c}.delete must be an array`
  }
  if (ops.settings !== undefined) {
    if (typeof ops.settings !== 'object' || ops.settings === null) return 'settings ops must be an object'
    if (ops.settings.set !== undefined && (typeof ops.settings.set !== 'object' || ops.settings.set === null)) return 'settings.set must be an object'
    if (ops.settings.delete !== undefined && !Array.isArray(ops.settings.delete)) return 'settings.delete must be an array'
  }
  return null
}

const isLoopback = (host) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)

/**
 * @param {ReturnType<import('./db.mjs').openDatabase>} store
 * @param {{ log?: (m: string) => void, token?: string | null, attachmentsDir?: string }} opts
 */
export function createApiHandler(store, { log = () => {}, token = null, attachmentsDir } = {}) {
  const attachmentsRoot = attachmentsDir ?? join(store.backupDir, '..', 'attachments')

  return async function apiHandler(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next ? next() : json(res, 404, { error: 'Not found' })
    const route = `${req.method} ${url.pathname}`
    try {
      /* ---- auth & origin checks ---- */
      if (token) {
        const given =
          (req.headers.authorization ?? '').startsWith('Bearer ')
            ? req.headers.authorization.slice(7)
            : url.searchParams.get('token')
        if (!(route === 'GET /api/health' && !given)) {
          if (given !== token) return json(res, 401, { error: 'Invalid or missing access token', authRequired: true })
        } else if (!given) {
          // health without token: report that auth is on so the client can ask for it
          return json(res, 200, { ok: true, engine: 'sqlite', savedAt: store.status().savedAt, rev: store.rev(), authRequired: true })
        }
      }
      const origin = req.headers.origin
      if (origin && ['PUT', 'POST', 'DELETE', 'PATCH'].includes(req.method ?? '')) {
        let oHost = ''
        try {
          oHost = new URL(origin).host
        } catch {
          /* ignore */
        }
        if (oHost !== req.headers.host) return json(res, 403, { error: 'Cross-origin request rejected' })
      }

      const authedQuery = token ? (url.searchParams.get('token') ? `?token=${url.searchParams.get('token')}` : '') : ''

      switch (route) {
        case 'GET /api/health':
          return json(res, 200, { ok: true, engine: 'sqlite', savedAt: store.status().savedAt, rev: store.rev() })

        case 'GET /api/data': {
          if (store.isEmpty()) return json(res, 200, { empty: true, state: null, updatedAt: 0, savedAt: null, rev: store.rev() })
          const state = store.readAll()
          const updatedAt = Number(store.db().prepare("SELECT value FROM meta WHERE key='updatedAt'").get()?.value ?? 0)
          const st = store.status()
          return json(res, 200, { empty: false, state, updatedAt, savedAt: st.savedAt, rev: st.rev })
        }

        case 'PUT /api/data': {
          const raw = await readBody(req)
          let body
          try {
            body = JSON.parse(raw)
          } catch {
            return json(res, 400, { error: 'Invalid JSON' })
          }
          const state = body?.state ?? body
          const err = validateState(state)
          if (err) return json(res, 400, { error: err })
          const { savedAt, rev } = store.write(state)
          const updatedAt = Number(body?.updatedAt) || Date.now()
          store.db().prepare("INSERT INTO meta(key, value) VALUES ('updatedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(updatedAt))
          const backedUp = store.maybeDailyBackup()
          if (backedUp) log(`daily backup → ${backedUp}`)
          return json(res, 200, { ok: true, savedAt, updatedAt, rev })
        }

        case 'POST /api/patch': {
          const raw = await readBody(req)
          let body
          try {
            body = JSON.parse(raw)
          } catch {
            return json(res, 400, { error: 'Invalid JSON' })
          }
          const err = validateOps(body?.ops)
          if (err) return json(res, 400, { error: err })
          const { savedAt, rev } = store.applyOps(body.ops)
          if (body.updatedAt) store.db().prepare("INSERT INTO meta(key, value) VALUES ('updatedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(body.updatedAt))
          const backedUp = store.maybeDailyBackup()
          if (backedUp) log(`daily backup → ${backedUp}`)
          return json(res, 200, { ok: true, savedAt, rev })
        }

        case 'GET /api/status':
          return json(res, 200, store.status())

        case 'POST /api/backup': {
          const name = store.backup()
          log(`manual backup → ${name}`)
          return json(res, 200, { ok: true, name, backups: store.listBackups() })
        }

        case 'GET /api/backup/download': {
          const stamp = new Date().toISOString().slice(0, 10)
          const tmp = join(tmpdir(), `finanalytics-${process.pid}-${Date.now()}.db`)
          store.snapshotTo(tmp)
          const size = statSync(tmp).size
          res.writeHead(200, {
            'content-type': 'application/vnd.sqlite3',
            'content-length': size,
            'content-disposition': `attachment; filename="finanalytics-${stamp}.db"`,
            'cache-control': 'no-store',
          })
          const stream = createReadStream(tmp)
          stream.on('close', () => {
            try {
              unlinkSync(tmp)
            } catch {
              /* ignore */
            }
          })
          stream.pipe(res)
          return
        }

        case 'POST /api/restore': {
          const raw = await readBody(req)
          let body
          try {
            body = JSON.parse(raw)
          } catch {
            return json(res, 400, { error: 'Invalid JSON' })
          }
          const name = basename(String(body?.name ?? ''))
          const file = join(store.backupDir, name)
          if (!name.endsWith('.db') || !store.listBackups().some((b) => b.name === name)) return json(res, 404, { error: 'Snapshot not found' })
          const { preRestoreBackup } = store.restoreFrom(file)
          log(`restored from ${name} (pre-restore snapshot: ${preRestoreBackup ?? 'none'})`)
          return json(res, 200, { ok: true, preRestoreBackup, rev: store.rev() })
        }

        case 'POST /api/restore/upload': {
          const buf = await readBody(req, MAX_BODY, true)
          const tmp = join(tmpdir(), `finanalytics-upload-${process.pid}-${Date.now()}.db`)
          writeFileSync(tmp, buf)
          try {
            const { preRestoreBackup } = store.restoreFrom(tmp)
            log(`restored from uploaded database (pre-restore snapshot: ${preRestoreBackup ?? 'none'})`)
            return json(res, 200, { ok: true, preRestoreBackup, rev: store.rev() })
          } finally {
            try {
              unlinkSync(tmp)
            } catch {
              /* ignore */
            }
          }
        }

        case 'POST /api/query': {
          // Read-only SQL console: exactly one SELECT/WITH/PRAGMA/EXPLAIN statement.
          const raw = await readBody(req)
          let body
          try {
            body = JSON.parse(raw)
          } catch {
            return json(res, 400, { error: 'Invalid JSON' })
          }
          const sql = String(body?.sql ?? '').trim().replace(/;+\s*$/, '')
          if (!sql) return json(res, 400, { error: 'Empty query' })
          if (sql.includes(';')) return json(res, 400, { error: 'Only one statement at a time' })
          if (!/^(select|with|pragma|explain)\b/i.test(sql)) return json(res, 403, { error: 'Only read-only queries (SELECT/WITH/PRAGMA/EXPLAIN) are allowed' })
          try {
            const rows = store.db().prepare(sql).all().slice(0, 1000)
            return json(res, 200, { ok: true, rows, truncated: rows.length === 1000 })
          } catch (e) {
            return json(res, 400, { error: e?.message ?? 'Query failed' })
          }
        }

        case 'POST /api/attachments': {
          const buf = await readBody(req, MAX_ATTACHMENT, true)
          if (!buf.length) return json(res, 400, { error: 'Empty file' })
          const id = randomUUID()
          const ext = String(url.searchParams.get('ext') ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 8)
          const file = join(attachmentsRoot, ext ? `${id}.${ext}` : id)
          writeFileSync(file, buf)
          log(`attachment stored → ${basename(file)} (${buf.length} bytes)`)
          return json(res, 200, { ok: true, id, name: basename(file), size: buf.length })
        }

        case `GET /api/attachments/list`: {
          let files = []
          try {
            files = readdirSync(attachmentsRoot).map((f) => {
              const st = statSync(join(attachmentsRoot, f))
              return { name: f, size: st.size, createdAt: st.mtime.toISOString() }
            })
          } catch {
            /* dir missing */
          }
          return json(res, 200, { files })
        }

        default: {
          const m = url.pathname.match(/^\/api\/attachments\/([A-Za-z0-9.-]+)$/)
          if (req.method === 'GET' && m) {
            const file = join(attachmentsRoot, basename(m[1] ?? ""))
            try {
              const st = statSync(file)
              res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' })
              createReadStream(file).pipe(res)
            } catch {
              return json(res, 404, { error: 'Attachment not found' })
            }
            return
          }
          void authedQuery
          return json(res, 404, { error: 'Not found' })
        }
      }
    } catch (e) {
      log(`error on ${route}: ${e?.message ?? e}`)
      return json(res, e?.status ?? 500, { error: e?.message ?? 'Server error' })
    }
  }
}

export { isLoopback }
