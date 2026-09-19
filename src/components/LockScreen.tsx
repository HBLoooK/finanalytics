import { useState } from 'react'
import { Lock } from 'lucide-react'
import { unlock } from '../lib/lock'
import { useStore } from '../store'

export function LockScreen({ onUnlocked }: { onUnlocked?: () => void }) {
  const name = useStore((s) => s.settings.name)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  return (
    <div className="modal-backdrop" style={{ zIndex: 95, background: 'rgba(5,6,10,0.92)' }}>
      <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }} role="dialog" aria-modal aria-label="Locked">
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10 }}>
          <span className="brand-logo" style={{ width: 44, height: 44, borderRadius: 14 }}>
            <Lock size={20} />
          </span>
        </div>
        <h2>Locked</h2>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Enter your passcode to continue, {name.split(' ')[0]}.
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (unlock(code)) {
              setError('')
              window.dispatchEvent(new Event('mousemove'))
              onUnlocked?.()
              window.location.reload()
            } else setError('Wrong passcode')
          }}
        >
          <input className="input" type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" style={{ textAlign: 'center', fontSize: 18, letterSpacing: 4 }} />
          {error && (
            <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }} role="alert">
              {error}
            </div>
          )}
          <button className="btn primary" type="submit" style={{ width: '100%', marginTop: 14 }}>
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
