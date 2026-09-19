// First-run wizard: name → base currency → first account → demo or empty start.
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Sparkles, Wallet } from 'lucide-react'
import { useStore } from '../store'
import { CARD_STYLES } from '../lib/seed'
import { today } from '../lib/utils'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'MAD', 'CAD', 'AUD', 'CHF', 'JPY', 'GBP', 'AED', 'SAR']
const BASE_RATES: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.78, MAD: 9.9, CAD: 1.36, AUD: 1.52, CHF: 0.88, JPY: 149, AED: 3.67, SAR: 3.75, INR: 83, BRL: 5.1, SEK: 10.4 }

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { updateSettings, addAccount, resetDemo, resetEmpty, settings } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(settings.name === 'Alex Morgan' ? '' : settings.name)
  const [currency, setCurrency] = useState(settings.currency)
  const [accountName, setAccountName] = useState('Main account')
  const [balance, setBalance] = useState('0')

  const createAccount = () => {
    addAccount({ name: accountName.trim() || 'Main account', type: 'checking', balance: Number(balance) || 0, currency, color: CARD_STYLES[1]!, last4: '', network: '', expiry: '' })
  }

  const finish = (mode: 'demo' | 'empty') => {
    if (name.trim()) updateSettings({ name: name.trim() })
    updateSettings({ currency, rates: { ...BASE_RATES, [currency]: 1 }, ratesUpdatedAt: today(), onboarded: true, lastRecurringRun: today() })
    if (mode === 'empty') {
      resetEmpty()
      createAccount()
    } else {
      resetDemo()
      if (currency !== 'USD') updateSettings({ currency, rates: { ...BASE_RATES, [currency]: 1 } })
      if (name.trim()) updateSettings({ name: name.trim() })
    }
    onDone()
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 90 }}>
      <div className="modal" style={{ maxWidth: 480 }} role="dialog" aria-modal aria-label="Welcome">
        <div className="flex" style={{ gap: 10, marginBottom: 6 }}>
          <span className="brand-logo">
            <Wallet size={17} />
          </span>
          <div>
            <h2>Welcome to Finanalytics</h2>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Everything stays on this machine, in a SQLite file.
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 14, marginTop: 16 }}>
          {step === 0 && (
            <div className="field">
              <label>What should we call you?</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
            </div>
          )}
          {step === 1 && (
            <div className="field">
              <label>Base currency (used for every total and report)</label>
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                You can add more currencies and their rates later in Settings.
              </div>
            </div>
          )}
          {step === 2 && (
            <>
              <div className="field">
                <label>Your first account</label>
                <input className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Everyday checking" />
              </div>
              <div className="field">
                <label>Current balance ({currency})</label>
                <input className="input" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>Used when you start empty — the demo data brings its own accounts.</div>
            </>
          )}
          {step === 3 && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="muted" style={{ fontSize: 13 }}>How would you like to start?</div>
              <button className="btn primary" style={{ justifyContent: 'flex-start', height: 62 }} onClick={() => finish('demo')}>
                <Sparkles size={16} />
                <span style={{ textAlign: 'left' }}>
                  <b>Load demo data</b>
                  <br />
                  <span style={{ fontSize: 11.5, opacity: 0.8 }}>A year of realistic transactions to explore — replace it any time</span>
                </span>
              </button>
              <button className="btn" style={{ justifyContent: 'flex-start', height: 62 }} onClick={() => finish('empty')}>
                <Wallet size={16} />
                <span style={{ textAlign: 'left' }}>
                  <b>Start empty</b>
                  <br />
                  <span style={{ fontSize: 11.5, opacity: 0.8 }}>Just your first account — enter or import your own transactions</span>
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => (step === 0 ? finish('demo') : setStep((s) => s - 1))}>
            {step === 0 ? 'Skip' : <><ArrowLeft size={14} /> Back</>}
          </button>
          {step < 3 ? (
            <button className="btn primary" onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>Step 4 of 4</span>
          )}
        </div>
      </div>
    </div>
  )
}
