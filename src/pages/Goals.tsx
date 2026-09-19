import { useState } from 'react'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useStore } from '../store'
import type { Goal } from '../lib/types'
import { CATEGORY_COLORS } from '../lib/seed'
import { fmtDateLong, parseISODate, sum } from '../lib/utils'
import { Card, Empty, Gauge, Modal, Money, confirmDelete, useMoney } from '../components/ui'

const GOAL_ICONS = ['🎯', '🛡️', '✈️', '🏠', '🚗', '💻', '🎓', '💍', '🏖️', '🐶', '🎸', '📷', '🧘', '👶']

export function Goals() {
  const { goals, addGoal, updateGoal, deleteGoal } = useStore()
  const money = useMoney()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [contrib, setContrib] = useState<Goal | null>(null)

  const totalSaved = sum(goals.map((g) => g.saved))
  const totalTarget = sum(goals.map((g) => g.target))

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="flex between wrap">
        <div className="kpi-inline" style={{ flex: 1, minWidth: 300 }}>
          <div>
            <div className="l">Saved</div>
            <div className="v" style={{ color: 'var(--green)' }}>
              <Money value={totalSaved} />
            </div>
          </div>
          <div>
            <div className="l">Targets</div>
            <div className="v">
              <Money value={totalTarget} />
            </div>
          </div>
          <div>
            <div className="l">Overall</div>
            <div className="v">{totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0}%</div>
          </div>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> New goal
        </button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <Empty
            title="No goals yet"
            hint="Create a savings goal and log contributions as you go."
            action={
              <button className="btn primary" onClick={() => setEditing('new')}>
                <Plus size={14} /> New goal
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {goals.map((g) => {
            const p = g.target ? (g.saved / g.target) * 100 : 0
            const done = g.saved >= g.target
            const left = Math.max(0, g.target - g.saved)
            let perMonth: number | null = null
            if (g.deadline && !done) {
              const months = Math.max(
                1,
                (parseISODate(g.deadline).getFullYear() - new Date().getFullYear()) * 12 +
                  (parseISODate(g.deadline).getMonth() - new Date().getMonth()),
              )
              perMonth = left / months
            }
            return (
              <Card key={g.id}>
                <div className="flex between" style={{ alignItems: 'flex-start' }}>
                  <div className="flex" style={{ gap: 14 }}>
                    <Gauge pct={p} color={g.color} size={72} stroke={7}>
                      <span style={{ fontSize: 20 }}>{g.icon}</span>
                    </Gauge>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {g.deadline ? `Due ${fmtDateLong(g.deadline)}` : 'No deadline'}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13 }}>
                        <b style={{ color: g.color }}>{Math.round(p)}%</b> <span className="muted">funded</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex" style={{ gap: 6 }}>
                    <button className="mini-btn" onClick={() => setEditing(g)} aria-label="Edit">
                      <Pencil size={14} />
                    </button>
                    <button className="mini-btn danger" onClick={() => confirmDelete(`“${g.name}”`) && deleteGoal(g.id)} aria-label="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="progress" style={{ margin: '16px 0 8px' }}>
                  <span style={{ width: `${Math.min(100, p)}%`, background: g.color }} />
                </div>
                <div className="flex between" style={{ fontSize: 13 }}>
                  <span>
                    <b>{money(g.saved)}</b> <span className="muted">of {money(g.target)}</span>
                  </span>
                  <span className="muted">{done ? '🎉 Reached!' : `${money(left)} to go`}</span>
                </div>
                {perMonth !== null && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Save about <b style={{ color: 'var(--text)' }}>{money(perMonth)}</b> / month to make it
                  </div>
                )}
                <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => setContrib(g)} disabled={done}>
                  <Wallet size={15} /> Add contribution
                </button>
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <GoalModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(g) => {
            if (editing === 'new') addGoal(g)
            else updateGoal(editing.id, g)
            setEditing(null)
          }}
        />
      )}
      {contrib && (
        <ContributeModal
          goal={contrib}
          onClose={() => setContrib(null)}
          onSave={(amt) => {
            updateGoal(contrib.id, { saved: Math.round((contrib.saved + amt) * 100) / 100 })
            setContrib(null)
          }}
        />
      )}
    </div>
  )
}

function GoalModal({ initial, onClose, onSave }: { initial: Goal | null; onClose: () => void; onSave: (g: Omit<Goal, 'id'>) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [target, setTarget] = useState(initial ? String(initial.target) : '')
  const [saved, setSaved] = useState(initial ? String(initial.saved) : '0')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? GOAL_ICONS[0]!)
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]!)
  return (
    <Modal title={initial ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || !(Number(target) > 0)) return
          onSave({ name: name.trim(), target: Number(target), saved: Number(saved) || 0, deadline: deadline || null, icon, color })
        }}
      >
        <div className="form-grid">
          <div className="field full">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" autoFocus />
          </div>
          <div className="field">
            <label>Target amount</label>
            <input className="input" type="number" min="1" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field">
            <label>Already saved</label>
            <input className="input" type="number" min="0" step="0.01" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </div>
          <div className="field full">
            <label>Deadline (optional)</label>
            <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="field full">
            <label>Icon</label>
            <div className="flex wrap" style={{ gap: 6 }}>
              {GOAL_ICONS.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setIcon(i)}
                  className="tx-icon"
                  style={{ background: icon === i ? 'var(--panel-3)' : 'var(--panel-2)', outline: icon === i ? '2px solid var(--primary)' : 'none', width: 36, height: 36, borderRadius: 10 }}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="field full">
            <label>Colour</label>
            <div className="flex wrap" style={{ gap: 8 }}>
              {CATEGORY_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ width: 26, height: 26, borderRadius: 8, background: c, outline: color === c ? '2px solid var(--text)' : 'none', outlineOffset: 2 }}
                  aria-label="Colour"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {initial ? 'Save' : 'Create goal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ContributeModal({ goal, onClose, onSave }: { goal: Goal; onClose: () => void; onSave: (amt: number) => void }) {
  const [amt, setAmt] = useState('')
  const money = useMoney()
  const left = Math.max(0, goal.target - goal.saved)
  return (
    <Modal title={`Contribute to ${goal.name}`} onClose={onClose} width={400}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (Number(amt) > 0) onSave(Number(amt))
        }}
      >
        <div className="field">
          <label>Amount ({money(left)} remaining)</label>
          <input className="input" type="number" min="0.01" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus style={{ fontSize: 18, fontWeight: 600 }} />
        </div>
        <div className="flex wrap" style={{ gap: 6 }}>
          {[50, 100, 250, 500].map((v) => (
            <button type="button" key={v} className="btn sm" onClick={() => setAmt(String(v))}>
              +{money(v, { maximumFractionDigits: 0 })}
            </button>
          ))}
          <button type="button" className="btn sm" onClick={() => setAmt(String(left))}>
            Finish it
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add
          </button>
        </div>
      </form>
    </Modal>
  )
}
