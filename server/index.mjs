#!/usr/bin/env node
// Standalone production server: serves the built app from dist/ and the SQLite API.
//   npm run build && npm start          → http://localhost:8787
//
// Env: PORT (default 8787), HOST (default 127.0.0.1 — your machine only),
//      FINANALYTICS_DB (default ./data/finanalytics.db), FINANALYTICS_TOKEN (optional).
//
// Security: when HOST is anything other than loopback, a bearer token is REQUIRED for all API
// access. It is generated on first start, printed to the console and stored in data/.token.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { extname, join, normalize, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './db.mjs'
import { createApiHandler, isLoopback } from './api.mjs'
import { startScheduler } from './scheduler.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
const dbPath = resolve(process.env.FINANALYTICS_DB ?? join(root, 'data', 'finanalytics.db'))
const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '127.0.0.1'

const log = (m) => console.log(`[finanalytics] ${new Date().toLocaleTimeString()} ${m}`)
const store = openDatabase(dbPath)

// --- access token (only enforced when not bound to loopback) ---
let token = null
if (!isLoopback(host)) {
  const tokenFile = join(dirname(dbPath), '.token')
  if (process.env.FINANALYTICS_TOKEN) {
    token = process.env.FINANALYTICS_TOKEN
  } else {
    try {
      token = readFileSync(tokenFile, 'utf8').trim()
    } catch {
      token = randomBytes(24).toString('base64url')
      writeFileSync(tokenFile, `${token}\n`)
      try {
        chmodSync(tokenFile, 0o600)
      } catch {
        /* ignore */
      }
    }
  }
  log(`⚠ bound to ${host} — API requires an access token`)
  log(`  token: ${token}`)
  log(`  (also stored in ${tokenFile}; set FINANALYTICS_TOKEN to override)`)
}

const api = createApiHandler(store, { log, token })
const stopScheduler = startScheduler(store, log)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
}

const serveStatic = (req, res) => {
  if (!existsSync(dist)) {
    res.writeHead(503, { 'content-type': 'text/plain' })
    return res.end('dist/ not found — run `npm run build` first.')
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  let file = join(dist, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''))
  if (!file.startsWith(dist)) file = join(dist, 'index.html')
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
  const ext = extname(file)
  const immutable = file.includes(`${join('dist', 'assets')}`)
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(file).pipe(res)
}

const server = createServer((req, res) => api(req, res, () => serveStatic(req, res)))

server.listen(port, host, () => {
  log(`database  ${dbPath}`)
  log(`serving   http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${token ? '  (token required)' : ''}`)
})

const shutdown = () => {
  log('shutting down')
  stopScheduler()
  server.close()
  try {
    store.close()
  } catch {
    /* ignore */
  }
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
