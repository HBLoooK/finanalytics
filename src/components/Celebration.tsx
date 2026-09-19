import { useEffect, useRef } from 'react'
import { useCelebrations } from '../lib/celebrate'
import { useStore } from '../store'

const COLORS = ['#6270f2', '#e05be0', '#f2cf3a', '#3ec97a', '#f28a2c']
const PARTICLES = 60
const DURATION = 3600

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 60 particles, one burst, then it is gone. Skipped entirely for reduced motion. */
function Burst() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || prefersReducedMotion()) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = 320
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)
    const cx = size / 2
    const cy = size / 2
    const parts = Array.from({ length: PARTICLES }, (_, i) => {
      const angle = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.4
      const speed = 1.6 + Math.random() * 3.4
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: 2 + Math.random() * 4,
        color: COLORS[i % COLORS.length]!,
        spin: (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI,
      }
    })
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const elapsed = now - start
      if (elapsed > DURATION) return
      ctx.clearRect(0, 0, size, size)
      const fade = Math.max(0, 1 - elapsed / DURATION)
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.09
        p.rot += p.spin
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  if (prefersReducedMotion()) return null
  return <canvas ref={ref} className="celebration-canvas" aria-hidden />
}

/** One card at a time from the celebration queue, auto-dismissed after 3.6 s. */
export function Celebrations() {
  const queue = useCelebrations((s) => s.queue)
  const shift = useCelebrations((s) => s.shift)
  const enabled = useStore((s) => s.settings.gamification?.celebrations !== false && s.settings.gamification?.enabled !== false)
  const head = queue[0]

  useEffect(() => {
    if (!head) return
    const t = window.setTimeout(shift, DURATION)
    return () => window.clearTimeout(t)
  }, [head, shift])

  if (!enabled || !head) return null

  return (
    <div className="celebration" role="status" aria-live="polite">
      <Burst />
      <div className={`celebration-card ${head.kind}`}>
        <span className="celebration-icon">{head.icon ?? '🎉'}</span>
        <div>
          <div className="celebration-title">{head.title}</div>
          {head.body && <div className="celebration-body">{head.body}</div>}
        </div>
      </div>
    </div>
  )
}
