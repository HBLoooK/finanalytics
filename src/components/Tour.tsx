import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store'
import { tourFor } from '../lib/tours'

/**
 * Module-level constant so the selector below returns the *same* reference on
 * every call. Returning a fresh `[]` inline makes Zustand's snapshot change on
 * every render, which is the "getSnapshot should be cached" infinite loop this
 * hook used to cause.
 */
const NO_SEEN: string[] = []

interface Spot {
  top: number
  left: number
  width: number
  height: number
}

/** Three spotlights per page, shown once, skippable with Esc. */
export function Tour() {
  const { pathname } = useLocation()
  const seen = useStore((s) => s.settings.tourSeen ?? NO_SEEN)
  const updateSettings = useStore((s) => s.updateSettings)
  const enabled = useStore((s) => s.settings.gamification?.enabled !== false)
  const tour = enabled ? tourFor(pathname) : null
  const active = !!tour && !seen.includes(tour!.id)

  const [step, setStep] = useState(0)
  const [spot, setSpot] = useState<Spot | null>(null)

  const finish = useCallback(
    (id: string) => {
      updateSettings({ tourSeen: [...seen, id] })
      setSpot(null)
    },
    [seen, updateSettings],
  )

  useEffect(() => {
    setStep(0)
  }, [pathname])

  useEffect(() => {
    if (!active || !tour) {
      setSpot(null)
      return
    }
    const current = tour.steps[step]
    if (!current) {
      finish(tour.id)
      return
    }
    const place = () => {
      const el = document.querySelector(current.el)
      if (!el) {
        setSpot(null)
        return
      }
      const r = el.getBoundingClientRect()
      setSpot({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height })
    }
    place()
    const t = window.setTimeout(place, 220) // layout may still be settling
    window.addEventListener('resize', place)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', place)
    }
  }, [active, tour, step, finish])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tour) finish(tour.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, tour, finish])

  if (!active || !tour) return null
  const current = tour.steps[step]
  if (!current) return null

  const next = () => {
    if (step + 1 >= tour.steps.length) finish(tour.id)
    else setStep(step + 1)
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Guided tour: ${current.title}`}>
      {spot && (
        <div
          className="tour-spot"
          style={{
            top: spot.top - 6,
            left: spot.left - 6,
            width: spot.width + 12,
            height: spot.height + 12,
          }}
        />
      )}
      <div className="tour-card" style={spot ? { top: spot.top + spot.height + 18, left: spot.left } : undefined}>
        <div className="tour-step">
          Step {step + 1} of {tour.steps.length}
        </div>
        <div className="tour-title">{current.title}</div>
        <p className="tour-body">{current.body}</p>
        <div className="tour-actions">
          <button className="btn small ghost" onClick={() => finish(tour.id)}>
            Skip tour
          </button>
          <button className="btn small primary" onClick={next}>
            {step + 1 >= tour.steps.length ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
