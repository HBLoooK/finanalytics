import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { HELP_GROUPS, helpById, type HelpEntry } from '../lib/help'

function Entry({ entry, maths }: { entry: HelpEntry; maths?: ReactNode }) {
  const navigate = useNavigate()
  const [openMaths, setOpenMaths] = useState(false)
  return (
    <div className="infotip-entry">
      <div className="infotip-title">{entry.title}</div>
      <p className="infotip-what">{entry.what}</p>
      <p className="infotip-how">{entry.how}</p>
      {entry.formula && <code className="infotip-formula">{entry.formula}</code>}
      {maths && (
        <>
          <button className="infotip-maths-toggle" onClick={() => setOpenMaths((v) => !v)}>
            {openMaths ? 'Hide the maths' : 'Show the maths'}
          </button>
          {openMaths && <div className="infotip-maths">{maths}</div>}
        </>
      )}
      <p className="infotip-why">
        <b>Why it matters.</b> {entry.why}
      </p>
      {entry.example && <p className="infotip-example">{entry.example}</p>}
      {entry.seeAlso?.length ? (
        <div className="infotip-seealso">
          {entry.seeAlso.map((id) => {
            const other = helpById.get(id)
            if (!other) return null
            return (
              <button
                key={id}
                className="chip"
                onClick={() => {
                  navigate('/help')
                  setTimeout(() => document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'center' }), 60)
                }}
              >
                {other.title}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The `?` beside every KPI, chart title and setting. Hidden entirely when the
 * user has switched tips off, so the interface can be kept completely clean.
 */
export function InfoTip({ id, maths }: { id: string; maths?: ReactNode }) {
  const showTips = useStore((s) => s.settings.gamification?.showTips !== false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const entry = helpById.get(id)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!showTips || !entry) return null

  return (
    <div className="infotip" ref={ref}>
      <button
        className="infotip-btn"
        aria-label={`What is ${entry.title}?`}
        aria-expanded={open}
        title={`What is ${entry.title}?`}
        onClick={() => setOpen((v) => !v)}
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <div className="infotip-pop" role="dialog" aria-label={entry.title}>
          <button className="icon-btn infotip-close" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={13} />
          </button>
          <Entry entry={entry} maths={maths} />
        </div>
      )}
    </div>
  )
}

/** A label with its `?` already attached, so call sites stay one line. */
export function Labeled({ label, id, maths, children }: { label: string; id: string; maths?: ReactNode; children?: ReactNode }) {
  return (
    <span className="labeled">
      <span className="labeled-text">
        {label}
        <InfoTip id={id} maths={maths} />
      </span>
      {children}
    </span>
  )
}

/** "About this page": the explanations that belong to the route you are on. */
export function HelpPanel({ ids, title = 'About this page' }: { ids: string[]; title?: string }) {
  const showTips = useStore((s) => s.settings.gamification?.showTips !== false)
  const [open, setOpen] = useState(false)
  const entries = ids.map((id) => helpById.get(id)).filter(Boolean) as HelpEntry[]
  if (!showTips || !entries.length) return null
  return (
    <section className="help-panel">
      <button className="help-panel-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <HelpCircle size={14} />
        {title}
        <span className="help-panel-count">{entries.length}</span>
      </button>
      {open && (
        <div className="help-panel-body">
          {entries.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Group names, for pages that want to link straight into a section. */
export const helpGroupNames = () => HELP_GROUPS.map((g) => g.group)
