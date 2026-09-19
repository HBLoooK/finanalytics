// Finanalytics service worker: app-shell cache for offline use.
// Data is never cached here — the sync layer owns /api/* (network first, localStorage fallback).
const VERSION = 'finanalytics-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // API: network first, never cache (the app keeps its own offline copy).
  if (url.pathname.startsWith('/api/')) return

  // Hashed assets: cache first.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {})
            return res
          }),
      ),
    )
    return
  }

  // Navigation and shell: network first, fall back to the cached shell when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html')).then((r) => r ?? Response.error())),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})
