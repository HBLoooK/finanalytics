import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Trophy } from 'lucide-react'
import { useStore } from '../store'
import { levelProgress, streakValue, titleForLevel } from '../lib/gamification'

/**
 * Header chip: level, title, streak and a live progress bar. The `+XP` float
 * fires on the transition only, so it never re-triggers on an unrelated render.
 */
export function XPBar() {
  const enabled = useStore((s) => s.settings.gamification?.enabled !== false)
  const xp = useStore((s) => s.progress?.xp ?? 0)
  const streak = useStore((s) => s.progress?.streak ?? null)
  const pinned = useStore((s) => s.settings.gamification?.pinnedTitle ?? null)
  const navigate = useNavigate()
  const [float, setFloat] = useState<number | null>(null)
  const prev = useRef(xp)

  useEffect(() => {
    const delta = xp - prev.current
    prev.current = xp
    if (delta <= 0) return
    setFloat(delta)
    const t = window.setTimeout(() => setFloat(null), 1500)
    return () => window.clearTimeout(t)
  }, [xp])

  if (!enabled) return null
  const p = levelProgress(xp)
  const live = streak ? streakValue(streak) : 0
  const title = pinned?.trim() || titleForLevel(p.level)

  return (
    <button
      className="xp-chip"
      onClick={() => navigate('/progress')}
      title={`Level ${p.level} — ${title} · ${xp} XP`}
      aria-label={`Level ${p.level}, ${title}, ${Math.round(p.pct)}% to level ${p.level + 1}`}
    >
      <span className="xp-level">{p.level}</span>
      <span className="xp-meta">
        <span className="xp-title">{title}</span>
        <span className="xp-bar" aria-hidden>
          <i style={{ width: `${Math.max(2, Math.min(100, p.pct))}%` }} />
        </span>
        <span className="xp-nums">
          {p.into} / {p.need} XP
        </span>
      </span>
      {live > 0 && (
        <span className="xp-streak" title={`${live}-day streak`}>
          <Flame size={12} /> {live}
        </span>
      )}
      <Trophy size={13} className="xp-trophy" />
      {float !== null && <span className="xp-float">+{float} XP</span>}
    </button>
  )
}
