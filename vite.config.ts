import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'
import { openDatabase } from './server/db.mjs'
import { createApiHandler } from './server/api.mjs'
import { startScheduler } from './server/scheduler.mjs'

/** Mounts the same SQLite API used in production onto Vite's dev/preview server. */
function sqliteApi(): Plugin {
  const dbPath = resolve(process.env.FINANALYTICS_DB ?? resolve(import.meta.dirname, 'data', 'finanalytics.db'))
  const store = openDatabase(dbPath)
  const handler = createApiHandler(store, { log: (m: string) => console.log(`  [sqlite] ${m}`), token: process.env.FINANALYTICS_TOKEN ?? null })
  return {
    name: 'finanalytics-sqlite-api',
    configureServer(server) {
      server.middlewares.use(handler)
      server.config.logger.info(`  ➜  SQLite database: ${dbPath}`)
      startScheduler(store, (m) => console.log(`  [scheduler] ${m}`))
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sqliteApi()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
