import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { fmtMoney } from '../lib/utils'

export function Card({
  title,
  sub,
  action,
  children,
  className = '',
  style,
}: {
  title?: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal>
        <div className="flex between" style={{ marginBottom: 18 }}>
          <h2>{title}</h2>
          <button className="mini-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Formats a value already expressed in the base currency (or in `currency` if given). */
export function Money({
  value,
  currency,
  compact,
  signed,
  className = '',
  digits,
}: {
  value: number
  currency?: string
  compact?: boolean
  signed?: boolean
  className?: string
  digits?: number
}) {
  const s = useStore((st) => st.settings)
  const abs = Math.abs(value)
  const opts: Intl.NumberFormatOptions = compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}
  if (digits !== undefined) opts.maximumFractionDigits = digits
  const txt = fmtMoney(abs, currency ?? s.currency, s.locale, opts)
  const prefix = signed ? (value < 0 ? '−' : '+') : value < 0 ? '−' : ''
  return (
    <span className={`mono ${className}`}>
      {prefix}
      {txt}
    </span>
  )
}

/** Smoothly tweens a number towards its latest value (used for headline figures). */
export function useCountUp(target: number, duration = 700) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  const raf = useRef(0)
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setV(target)
      return
    }
    const start = performance.now()
    const a = from.current
    const b = target
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const e = 1 - Math.pow(1 - t, 3)
      setV(a + (b - a) * e)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else from.current = b
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return v
}

export function useMoney() {
  const { currency, locale } = useStore((s) => s.settings)
  return (v: number, opts?: Intl.NumberFormatOptions & { currency?: string }) => {
    const { currency: c, ...rest } = opts ?? {}
    return fmtMoney(v, c ?? currency, locale, rest)
  }
}

export function Gauge({
  pct,
  color,
  size = 84,
  stroke = 7,
  label,
  children,
}: {
  pct: number
  color: string
  size?: number
  stroke?: number
  label?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const p = mounted ? Math.max(0, Math.min(100, pct)) : 0
  return (
    <div style={{ position: 'relative', width: size, height: size }} aria-label={label}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--panel-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * p) / 100}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600 }}>
        {children ?? `${Math.round(pct)}%`}
      </div>
    </div>
  )
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }>
  label?: string | number
  formatter?: (v: number) => string
  labelFormatter?: (l: string | number) => string
}) {
  const money = useMoney()
  if (!active || !payload?.length) return null
  const f = formatter ?? ((v: number) => money(v))
  return (
    <div className="chart-tooltip">
      {label !== undefined && <div className="t">{labelFormatter ? labelFormatter(label) : String(label)}</div>}
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p, i) => (
          <div className="r" key={i}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />
              {p.name}
            </span>
            <b>{f(Number(p.value ?? 0))}</b>
          </div>
        ))}
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <div>{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs no-print">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  )
}

export function confirmDelete(what: string) {
  return window.confirm(`Delete ${what}? This can't be undone.`)
}

export const axisProps = { tickLine: false, axisLine: false, tick: { fill: 'var(--muted)', fontSize: 11 } }
