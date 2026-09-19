// Undo toasts + an "action happened" toast. Renders in the Layout so every page gets it.
import { useEffect } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { undoStore, useUndo } from '../lib/undo'

const LIFETIME_MS = 9000

export function UndoToasts() {
  const entries = useUndo((s) => s.entries)
  const latest = entries[entries.length - 1]

  useEffect(() => {
    if (!latest) return
    const t = setTimeout(() => undoStore.getState().dismiss(latest.id), LIFETIME_MS)
    return () => clearTimeout(t)
  }, [latest])

  if (!latest) return null
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="t">{latest.label}</span>
      <button
        className="btn sm"
        onClick={() => {
          undoStore.getState().undo(latest.id)
        }}
      >
        <RotateCcw size={13} /> Undo
      </button>
      <button className="mini-btn" aria-label="Dismiss" onClick={() => undoStore.getState().dismiss(latest.id)}>
        <X size={14} />
      </button>
    </div>
  )
}

/** Transient message toast (replaces the ad-hoc `toast` state on several pages). */
export function useToast() {
  return (message: string) => {
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = message
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 2600)
  }
}
