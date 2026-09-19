// Browser notifications while the app is open.
// True push (when the tab is closed) would need a service worker subscription against the local
// server's VAPID keys; this covers the common case: you are working in another tab.
import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { useNotificationItems } from '../components/Notifications'

const SEEN_KEY = 'finanalytics:notified'

export function useDesktopNotifications() {
  const enabled = useStore((s) => s.settings.pushEnabled)
  const items = useNotificationItems()
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
      seen.current = new Set(stored)
    } catch {
      seen.current = new Set()
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const fresh = items.filter((i) => !seen.current.has(i.key)).slice(0, 3)
    if (!fresh.length) return
    for (const i of fresh) {
      seen.current.add(i.key)
      try {
        new Notification(i.title, { body: i.body, icon: '/icon-192.png', tag: i.key })
      } catch {
        /* some browsers require a service worker */
      }
    }
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current].slice(-200)))
  }, [enabled, items])
}

/** Ask for permission; returns the resulting permission state. */
export const requestNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}
