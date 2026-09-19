// Idle auto-lock: hides the data behind a passcode after N minutes of inactivity.
// The passcode is a convenience lock (the database itself is not encrypted) — it stops
// shoulder-surfing, not a determined attacker with the file.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

const CODE_KEY = 'finanalytics:lockCode'

export const hasLockCode = () => Boolean(localStorage.getItem(CODE_KEY))
export const setLockCode = (code: string) => (code ? localStorage.setItem(CODE_KEY, code) : localStorage.removeItem(CODE_KEY))

/** True when the app should be locked. */
export function useAutoLock() {
  const minutes = useStore((s) => s.settings.autoLockMinutes ?? 0)
  const [locked, setLocked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!minutes || !hasLockCode()) {
      setLocked(false)
      return
    }
    const arm = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setLocked(true), minutes * 60_000)
    }
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    for (const e of events) window.addEventListener(e, arm, { passive: true })
    arm()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      for (const e of events) window.removeEventListener(e, arm)
    }
  }, [minutes])

  return locked
}

export const unlock = (code: string) => code === localStorage.getItem(CODE_KEY)
