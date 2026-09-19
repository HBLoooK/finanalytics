import { useMemo, useState } from 'react'
import { Archive, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useConverter, useStore } from '../store'
import type { Account, AccountType } from '../lib/types'
import { CARD_STYLES } from '../lib/seed'
import { accountBalance } from '../lib/analytics'
import { fmtDate, today } from '../lib/utils'
import { Card, Empty, Modal, Money, confirmDelete, useMoney } from '../components/ui'
import { useToast } from '../components/Toasts'

const TYPES: AccountType[] = ['checking', 'savings', 'credit', 'cash', 'investment']

export function BankCard({ account, balance, holder, onClick }: { account: Account; balance: number; holder?: string; onClick?: () => void }) {
  const money = useMoney()
  return (
    <div className="bank-card" style={{ background: account.color, cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <div className="row">
        <span className="tier">{account.type === 'credit' ? 'Credit' : account.type === 'savings' ? 'Savings' : 'Premium'}</span>
        {account.network === 'MC' ? (
          <span className="mc">
            <i style={{ background: '#eb001b' }} />
            <i style={{ background: '#f79e1b', opacity: 0.9 }} />
          </span>
        ) : (
          <span className="net">{account.network || account.currency}</span>
        )}
      </div>
      <div>
        <div className="row">
          <span className="holder">{holder ?? account.name}</span>
          {account.network === 'MC' && <span className="net">{account.currency}</span>}
        </div>
        <div className="bal">{money(balance, { currency: account.currency })}</div>
      </div>
      <div className="row">
        <div>
          <div className="lbl">Card number</div>
          <div className="number">•••• •••• •••• {account.last4 || '0000'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="lbl">Date</div>
          <div className="number" style={{ letterSpacing: '0.05em' }}>
            {account.expiry || '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Wallet() {
  const { accounts, transactions, settings, addAccount, updateAccount, deleteAccount, archiveAccount, updateTransaction } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const toast = useToast()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [recon, setRecon] = useState<Account | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const hideArchived = settings.hideArchived !== false
  const visible = useMemo(() => accounts.filter((a) => showArchived || !a.archived || !hideArchived), [accounts, showArchived, hideArchived])
  const balances = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, accountBalance(a, transactions)])), [accounts, transactions])
  const base = (a: Account) => conv(balances[a.id] ?? 0, a.currency)
  const total = visible.filter((a) => !a.archived || showArchived).reduce((s, a) => s + base(a), 0)
  const assets = visible.filter((a) => base(a) > 0).reduce((s, a) => s + base(a), 0)
  const debts = visible.filter((a) => base(a) < 0).reduce((s, a) => s + base(a), 0)
  const byCur = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of visible) m.set(a.currency, (m.get(a.currency) ?? 0) + (balances[a.id] ?? 0))
    return [...m.entries()]
  }, [visible, balances])

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpi-inline">
        <div>
          <div className="l">Cash & accounts ({settings.currency})</div>
          <div className="v">
            <Money value={total} />
          </div>
        </div>
        <div>
          <div className="l">Assets</div>
          <div className="v" style={{ color: 'var(--green)' }}>
            <Money value={assets} />
          </div>
        </div>
        <div>
          <div className="l">Liabilities</div>
          <div className="v" style={{ color: 'var(--red)' }}>
            <Money value={debts} />
          </div>
        </div>
        {byCur
          .filter(([c]) => c !== settings.currency)
          .map(([c, v]) => (
            <div key={c}>
              <div className="l">Held in {c}</div>
              <div className="v">
                <Money value={v} currency={c} /> <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>≈ {money(conv(v, c))}</span>
              </div>
            </div>
          ))}
      </div>

      <Card
        title="Cards & accounts"
        sub="Balances are computed from the opening balance plus every transaction"
        action={
          <div className="flex">
            <button className="btn sm ghost" onClick={() => setShowArchived((v) => !v)}>
              <Archive size={13} /> {showArchived ? 'Hide archived' : `Show archived (${accounts.filter((a) => a.archived).length})`}
            </button>
            <button className="btn primary sm" onClick={() => setEditing('new')}>
              <Plus size={14} /> Add account
            </button>
          </div>
        }
      >
        {visible.length === 0 ? (
          <Empty title="No accounts" hint="Add a bank account, card or cash wallet." />
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
            {visible.map((a) => {
              const txCount = transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length
              const pending = transactions.filter((t) => (t.accountId === a.id || t.toAccountId === a.id) && t.status === 'pending')
              return (
                <div key={a.id} className="stack" style={{ gap: 8, opacity: a.archived ? 0.62 : 1 }}>
                  <BankCard account={a} balance={balances[a.id] ?? 0} holder={settings.name} onClick={() => setEditing(a)} />
                  <div className="flex between" style={{ padding: '0 4px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {a.name}
                        {a.archived && <span className="tag" style={{ marginLeft: 6 }}>archived</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {txCount} transactions{a.currency !== settings.currency ? ` · ≈ ${money(base(a))}` : ''}
                        {pending.length > 0 && ` · ${pending.length} pending`}
                      </div>
                    </div>
                    <div className="flex" style={{ gap: 6 }}>
                      <button className="mini-btn" onClick={() => setRecon(a)} title="Reconcile with your statement" aria-label="Reconcile">
                        <CheckCircle2 size={14} />
                      </button>
                      <button className="mini-btn" onClick={() => setEditing(a)} aria-label="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="mini-btn" onClick={() => archiveAccount(a.id, !a.archived)} title={a.archived ? 'Restore' : 'Archive (keeps every transaction)'} aria-label="Archive">
                        {a.archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                      </button>
                      <button
                        className="mini-btn danger"
                        aria-label="Delete"
                        disabled={a.archived}
                        title={a.archived ? 'Restore it first' : 'Delete'}
                        onClick={() => confirmDelete(`“${a.name}”${txCount ? ` and its ${txCount} transactions` : ''}`) && deleteAccount(a.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {recon && (
        <ReconcileModal
          account={recon}
          balance={balances[recon.id] ?? 0}
          onClose={() => setRecon(null)}
          onClearAll={() => {
            const ids = transactions.filter((t) => (t.accountId === recon.id || t.toAccountId === recon.id) && t.status !== 'cleared').map((t) => t.id)
            for (const id of ids) updateTransaction(id, { status: 'cleared' })
            toast(`Marked ${ids.length} transactions as cleared`)
            setRecon(null)
          }}
        />
      )}
      {editing && (
        <AccountModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(a) => {
            if (editing === 'new') addAccount(a)
            else updateAccount(editing.id, a)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ReconcileModal({ account, balance, onClose, onClearAll }: { account: Account; balance: number; onClose: () => void; onClearAll: () => void }) {
  const { transactions, updateTransaction } = useStore()
  const money = useMoney()
  const [statement, setStatement] = useState('')
  const [date, setDate] = useState(today())
  const rows = transactions.filter((t) => (t.accountId === account.id || t.toAccountId === account.id) && t.status !== 'cleared')
  const clearedBalance = balance - rows.reduce((s, t) => s + (t.accountId === account.id ? (t.type === 'income' ? -t.amount : t.amount) : -(t.amount * (t.toAmount && t.toAmount > 0 ? t.toAmount / t.amount : 1))), 0)
  const target = Number(statement)
  const diff = Number.isFinite(target) && statement !== '' ? target - clearedBalance : null

  return (
    <Modal title={`Reconcile ${account.name}`} onClose={onClose} width={520}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="form-grid">
          <div className="field">
            <label>Statement closing balance ({account.currency})</label>
            <input className="input" type="number" step="0.01" value={statement} onChange={(e) => setStatement(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Statement date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="kpi-inline" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div>
            <div className="l">Cleared balance</div>
            <div className="v">{money(clearedBalance, { currency: account.currency })}</div>
          </div>
          <div>
            <div className="l">App balance</div>
            <div className="v">{money(balance, { currency: account.currency })}</div>
          </div>
          <div>
            <div className="l">Difference</div>
            <div className="v recon-diff" style={{ color: diff === null ? undefined : Math.abs(diff) < 0.01 ? 'var(--green)' : 'var(--red)' }}>
              {diff === null ? '—' : money(diff, { currency: account.currency })}
            </div>
          </div>
        </div>
        {rows.length > 0 && (
          <>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {rows.length} uncleared transaction{rows.length === 1 ? '' : 's'} — tick the ones that appear on the statement.
            </div>
            <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th>Date</th>
                    <th>Payee</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <input type="checkbox" onChange={() => updateTransaction(t.id, { status: 'cleared' })} style={{ accentColor: 'var(--primary)' }} />
                      </td>
                      <td className="muted">{fmtDate(t.date)}</td>
                      <td>{t.payee}</td>
                      <td className="num">{money(t.type === 'expense' ? -t.amount : t.amount, { currency: account.currency })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClearAll} disabled={!rows.length}>
            Clear all {rows.length}
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AccountModal({ initial, onClose, onSave }: { initial: Account | null; onClose: () => void; onSave: (a: Omit<Account, 'id'>) => void }) {
  const settings = useStore((s) => s.settings)
  const currencies = Object.keys(settings.rates)
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<AccountType>(initial?.type ?? 'checking')
  const [balance, setBalance] = useState(String(initial?.balance ?? 0))
  const [last4, setLast4] = useState(initial?.last4 ?? '')
  const [expiry, setExpiry] = useState(initial?.expiry ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? settings.currency)
  const [network, setNetwork] = useState<Account['network']>(initial?.network ?? '')
  const [color, setColor] = useState(initial?.color ?? CARD_STYLES[1]!)

  return (
    <Modal title={initial ? 'Edit account' : 'New account'} onClose={onClose}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onSave({ name: name.trim(), type, balance: Number(balance) || 0, last4: last4.slice(-4), expiry, network, color, currency })
        }}
      >
        <div className="form-grid">
          <div className="field full">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Everyday checking" autoFocus />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Currency</label>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Opening balance ({currency})</label>
            <input className="input" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div className="field">
            <label>Network</label>
            <select className="select" value={network} onChange={(e) => setNetwork(e.target.value as Account['network'])}>
              <option value="">None</option>
              <option value="VISA">VISA</option>
              <option value="MC">Mastercard</option>
              <option value="AMEX">AMEX</option>
            </select>
          </div>
          <div className="field">
            <label>Last 4 digits</label>
            <input className="input" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} placeholder="1234" />
          </div>
          <div className="field">
            <label>Expiry (MM/YY)</label>
            <input className="input" maxLength={5} value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="09/28" />
          </div>
          <div className="field full">
            <label>Card style</label>
            <div className="flex wrap" style={{ gap: 8 }}>
              {CARD_STYLES.map((g) => (
                <button type="button" key={g} onClick={() => setColor(g)} style={{ width: 44, height: 30, borderRadius: 8, background: g, outline: color === g ? '2px solid var(--text)' : '2px solid transparent', outlineOffset: 2 }} aria-label="Card colour" />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {initial ? 'Save' : 'Add account'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
