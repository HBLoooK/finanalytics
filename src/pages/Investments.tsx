import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, RefreshCw, Scale, Trash2 } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useConverter, useStore } from '../store'
import type { AssetClass, Holding } from '../lib/types'
import { CATEGORY_COLORS } from '../lib/seed'
import { portfolio, rebalancePlan, xirr } from '../lib/analytics'
import { fmtNum, today } from '../lib/utils'
import { Card, ChartTooltip, Empty, Modal, Money, confirmDelete, useMoney } from '../components/ui'
import { useToast } from '../components/Toasts'

const CLASSES: AssetClass[] = ['stocks', 'etf', 'crypto', 'bonds', 'cash', 'real_estate', 'other']
const label = (c: string) => c.replace('_', ' ').replace(/^\w/, (m) => m.toUpperCase())

export function Investments() {
  const { holdings, settings, accounts, transactions, addHolding, updateHolding, deleteHolding, tradeHolding, addTransaction } = useStore()
  const conv = useConverter()
  const money = useMoney()
  const toast = useToast()
  const pf = useMemo(() => portfolio(holdings, conv), [holdings, conv])
  const [editing, setEditing] = useState<Holding | 'new' | null>(null)
  const [trade, setTrade] = useState<Holding | null>(null)
  const [dividend, setDividend] = useState<Holding | null>(null)
  const [priceEdit, setPriceEdit] = useState<string | null>(null)
  const [priceVal, setPriceVal] = useState('')
  const classColors = Object.fromEntries(CLASSES.map((c, i) => [c, CATEGORY_COLORS[i % CATEGORY_COLORS.length]!]))
  const best = pf.rows.slice().sort((a, b) => b.pnlPct - a.pnlPct)[0]
  const worst = pf.rows.slice().sort((a, b) => a.pnlPct - b.pnlPct)[0]

  /** Money-weighted return across all holdings: buys out, sells in, current value in. */
  const moneyWeighted = useMemo(() => {
    const flows: { date: string; amount: number }[] = []
    for (const h of holdings) {
      const rate = settings.rates[h.currency] ?? 1
      for (const lot of h.lots ?? []) flows.push({ date: lot.date, amount: -(lot.qty * lot.price) / rate })
    }
    for (const t of transactions)
      if (t.investment) {
        const acc = accounts.find((a) => a.id === t.accountId)?.currency ?? settings.currency
        const rate = settings.rates[acc] ?? 1
        if (t.investment.side === 'sell') flows.push({ date: t.date, amount: t.amount / rate })
      }
    const now = today()
    if (pf.value > 0) flows.push({ date: now, amount: pf.value })
    return flows.length >= 2 ? xirr(flows) : null
  }, [holdings, transactions, pf.value, settings.rates, accounts])

  const plan = useMemo(() => rebalancePlan(holdings, conv), [holdings, conv])
  const hasTargets = holdings.some((h) => h.targetPct != null)

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpi-inline">
        <div>
          <div className="l">Portfolio value</div>
          <div className="v">
            <Money value={pf.value} />
          </div>
        </div>
        <div>
          <div className="l">Cost basis</div>
          <div className="v muted">
            <Money value={pf.cost} />
          </div>
        </div>
        <div>
          <div className="l">Unrealised P&L</div>
          <div className="v" style={{ color: pf.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            <Money value={pf.pnl} signed />{' '}
            <span style={{ fontSize: 12 }}>
              ({pf.pnlPct >= 0 ? '+' : ''}
              {pf.pnlPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div>
          <div className="l">Realised & dividends</div>
          <div className="v" style={{ fontSize: 15 }}>
            <Money value={pf.realized} signed /> <span className="muted" style={{ fontSize: 12 }}>realised</span> · <Money value={pf.dividends} />{' '}
            <span className="muted" style={{ fontSize: 12 }}>div</span>
          </div>
        </div>
        {best && (
          <div>
            <div className="l">Best / worst</div>
            <div className="v" style={{ fontSize: 14 }}>
              <span style={{ color: 'var(--green)' }}>
                {best.symbol} {best.pnlPct >= 0 ? '+' : ''}
                {best.pnlPct.toFixed(1)}%
              </span>
              {' · '}
              <span style={{ color: 'var(--red)' }}>
                {worst!.symbol} {worst!.pnlPct >= 0 ? '+' : ''}
                {worst!.pnlPct.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
        {moneyWeighted !== null && (
          <div>
            <div className="l">Money-weighted return</div>
            <div className="v" style={{ color: moneyWeighted >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {moneyWeighted >= 0 ? '+' : ''}
              {(moneyWeighted * 100).toFixed(1)}% <span className="muted" style={{ fontSize: 11 }}>p.a.</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid dash-grid">
        <Card className="col-4" title="Allocation" sub="By asset class">
          {pf.allocation.length === 0 ? (
            <Empty title="No holdings yet" />
          ) : (
            <>
              <div style={{ height: 190, position: 'relative' }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pf.allocation} dataKey="value" nameKey="assetClass" innerRadius={60} outerRadius={78} paddingAngle={4} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270}>
                      {pf.allocation.map((a) => (
                        <Cell key={a.assetClass} fill={classColors[a.assetClass]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{money(pf.value, { maximumFractionDigits: 0 })}</div>
                    <div className="muted" style={{ fontSize: 10.5 }}>
                      {holdings.length} holdings
                    </div>
                  </div>
                </div>
              </div>
              <div className="legend">
                {pf.allocation.map((a) => (
                  <div className="legend-item" key={a.assetClass}>
                    <span className="sw" style={{ background: classColors[a.assetClass] }} />
                    <span className="n">{label(a.assetClass)}</span>
                    <span className="v">{money(a.value, { maximumFractionDigits: 0 })}</span>
                    <span className="p">{a.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card
          className="col-8"
          title="Holdings"
          sub="Prices are entered manually — click a price to update it"
          action={
            <div className="flex">
              <button className="btn sm" onClick={() => setEditing('new')}>
                <Plus size={14} /> Add holding
              </button>
            </div>
          }
        >
          {pf.rows.length === 0 ? (
            <Empty title="Nothing here yet" hint="Track stocks, ETFs, crypto, bonds or property." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="num">Qty</th>
                    <th className="num">Avg cost</th>
                    <th className="num">Price</th>
                    <th className="num">Value</th>
                    <th className="num">P&L</th>
                    <th className="num">Weight</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pf.rows.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <div className="flex">
                          <span className="tx-icon" style={{ width: 32, height: 32, fontSize: 11, fontWeight: 600, background: `${h.color}22`, borderColor: `${h.color}55`, color: h.color }}>
                            {h.symbol.slice(0, 4)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                            <div className="muted" style={{ fontSize: 11 }}>
                              {h.name} · {label(h.assetClass)}
                              {h.realizedPnl ? ` · realised ${money(h.realizedPnl, { currency: h.currency })}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{fmtNum(h.quantity, settings.locale, 6)}</td>
                      <td className="num muted">{money(h.avgCost, { currency: h.currency })}</td>
                      <td className="num">
                        {priceEdit === h.id ? (
                          <input
                            className="input"
                            type="number"
                            step="any"
                            autoFocus
                            value={priceVal}
                            onChange={(e) => setPriceVal(e.target.value)}
                            onBlur={() => {
                              if (Number(priceVal) > 0) updateHolding(h.id, { price: Number(priceVal) })
                              setPriceEdit(null)
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            style={{ width: 100, padding: '4px 8px', textAlign: 'right' }}
                          />
                        ) : (
                          <button
                            className="link"
                            style={{ color: 'var(--text)', fontWeight: 600 }}
                            title={`Updated ${h.updatedAt}`}
                            onClick={() => {
                              setPriceEdit(h.id)
                              setPriceVal(String(h.price))
                            }}
                          >
                            {money(h.price, { currency: h.currency })} <RefreshCw size={11} style={{ opacity: 0.5 }} />
                          </button>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {money(h.value)}
                      </td>
                      <td className="num" style={{ color: h.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          {h.pnl >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {money(Math.abs(h.pnl))}{' '}
                          <span style={{ fontSize: 11 }}>
                            ({h.pnlPct >= 0 ? '+' : ''}
                            {h.pnlPct.toFixed(1)}%)
                          </span>
                        </span>
                      </td>
                      <td className="num">
                        <div className="flex" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <div className="progress" style={{ width: 50, height: 5 }}>
                            <span style={{ width: `${h.weight}%`, background: h.color }} />
                          </div>
                          <span style={{ fontSize: 12 }}>{h.weight.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn sm" onClick={() => setTrade(h)}>
                            Trade
                          </button>
                          <button className="btn sm ghost" onClick={() => setDividend(h)} title="Record a dividend">
                            Div
                          </button>
                          <button className="mini-btn" onClick={() => setEditing(h)}>
                            <Pencil size={13} />
                          </button>
                          <button className="mini-btn danger" onClick={() => confirmDelete(h.symbol) && deleteHolding(h.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="col-12" title="Rebalancing" sub="Set a target percentage per holding to see what to buy or sell">
          {pf.rows.length === 0 ? (
            <Empty title="Nothing to rebalance" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th className="num">Value</th>
                    <th className="num">Current</th>
                    <th style={{ width: 110 }}>Target %</th>
                    <th className="num">Target value</th>
                    <th className="num">Drift</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.symbol}</td>
                      <td className="num">{money(r.value, { maximumFractionDigits: 0 })}</td>
                      <td className="num muted">{r.weight.toFixed(1)}%</td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          style={{ width: 78, padding: '4px 8px', textAlign: 'right' }}
                          value={r.target ?? ''}
                          placeholder="—"
                          onChange={(e) => updateHolding(r.id, { targetPct: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </td>
                      <td className="num">{r.target == null ? '—' : money(r.targetValue, { maximumFractionDigits: 0 })}</td>
                      <td className="num" style={{ color: r.target == null ? undefined : Math.abs(r.drift) < plan.total * 0.01 ? 'var(--green)' : 'var(--orange)' }}>
                        {r.target == null ? '—' : `${r.drift > 0 ? 'sell ' : 'buy '}${money(Math.abs(r.drift), { maximumFractionDigits: 0 })}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasTargets && (
                <div className="muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Scale size={13} /> Anything within 1% of its target is considered balanced.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <HoldingModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(h) => {
            if (editing === 'new') addHolding(h)
            else updateHolding(editing.id, h)
            setEditing(null)
          }}
        />
      )}
      {trade && (
        <TradeModal
          holding={trade}
          onClose={() => setTrade(null)}
          onSave={(side, qty, price, accountId) => {
            tradeHolding(trade.id, side, qty, price, accountId)
            setTrade(null)
          }}
        />
      )}
      {dividend && (
        <DividendModal
          holding={dividend}
          onClose={() => setDividend(null)}
          onSave={(amount, accountId, date) => {
            updateHolding(dividend.id, { dividends: (dividend.dividends ?? 0) + amount })
            if (accountId)
              addTransaction({
                type: 'income',
                amount,
                date,
                accountId,
                toAccountId: null,
                categoryId: 'c_investments',
                payee: `${dividend.symbol} dividend`,
                note: '',
                tags: ['investing'],
                status: 'cleared',
              })
            setDividend(null)
            toast('Dividend recorded')
          }}
        />
      )}
    </div>
  )
}

function HoldingModal({ initial, onClose, onSave }: { initial: Holding | null; onClose: () => void; onSave: (h: Omit<Holding, 'id'>) => void }) {
  const settings = useStore((s) => s.settings)
  const [symbol, setSymbol] = useState(initial?.symbol ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [assetClass, setAssetClass] = useState<AssetClass>(initial?.assetClass ?? 'stocks')
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '')
  const [avgCost, setAvgCost] = useState(initial ? String(initial.avgCost) : '')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? settings.currency)
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]!)
  return (
    <Modal title={initial ? 'Edit holding' : 'Add holding'} onClose={onClose}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!symbol.trim() || !(Number(quantity) > 0)) return
          const qty = Number(quantity)
          const cost = Number(avgCost) || 0
          onSave({
            symbol: symbol.trim().toUpperCase(),
            name: name.trim() || symbol.trim().toUpperCase(),
            assetClass,
            quantity: qty,
            avgCost: cost,
            price: Number(price) || cost,
            currency,
            updatedAt: today(),
            color,
            lots: initial?.lots?.length ? initial.lots : qty > 0 && cost > 0 ? [{ date: today(), qty, price: cost }] : [],
            targetPct: initial?.targetPct ?? null,
            dividends: initial?.dividends ?? 0,
            realizedPnl: initial?.realizedPnl ?? 0,
          })
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label>Symbol / ticker</label>
            <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="VTI" autoFocus />
          </div>
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vanguard Total Market" />
          </div>
          <div className="field">
            <label>Asset class</label>
            <select className="select" value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Currency</label>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {Object.keys(settings.rates).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Quantity</label>
            <input className="input" type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="field">
            <label>Average cost / unit</label>
            <input className="input" type="number" step="any" min="0" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} />
          </div>
          <div className="field">
            <label>Current price / unit</label>
            <input className="input" type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="field">
            <label>Colour</label>
            <div className="flex wrap" style={{ gap: 6 }}>
              {CATEGORY_COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, outline: color === c ? '2px solid var(--text)' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {initial ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function TradeModal({ holding, onClose, onSave }: { holding: Holding; onClose: () => void; onSave: (side: 'buy' | 'sell', qty: number, price: number, accountId: string | null) => void }) {
  const { accounts } = useStore()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState(String(holding.price))
  const [accountId, setAccountId] = useState(
    accounts.find((a) => !a.archived && (a.type === 'investment' || a.currency === holding.currency))?.id ?? accounts[0]?.id ?? '',
  )
  const [moveCash, setMoveCash] = useState(true)
  const money = useMoney()
  const total = (Number(qty) || 0) * (Number(price) || 0)
  return (
    <Modal title={`Trade ${holding.symbol}`} onClose={onClose} width={460}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (Number(qty) > 0 && Number(price) > 0) onSave(side, Number(qty), Number(price), moveCash ? accountId || null : null)
        }}
      >
        <div className="type-toggle" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className={`income ${side === 'buy' ? 'active' : ''}`} onClick={() => setSide('buy')}>
            Buy
          </button>
          <button type="button" className={`expense ${side === 'sell' ? 'active' : ''}`} onClick={() => setSide('sell')}>
            Sell
          </button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Quantity {side === 'sell' && `(max ${holding.quantity})`}</label>
            <input className="input" type="number" step="any" min="0" max={side === 'sell' ? holding.quantity : undefined} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Price ({holding.currency})</label>
            <input className="input" type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <label className="check full">
            <input type="checkbox" checked={moveCash} onChange={(e) => setMoveCash(e.target.checked)} />
            Move the cash too (keeps balances and net worth correct)
          </label>
          {moveCash && (
            <div className="field full">
              <label>{side === 'buy' ? 'Pay from account' : 'Deposit into account'}</label>
              <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Total {money(total, { currency: holding.currency })}. {side === 'buy' ? 'Average cost is recalculated and a lot is added.' : 'Lots are consumed FIFO and the realised gain is recorded.'}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`btn ${side === 'buy' ? 'primary' : 'accent'}`}>
            {side === 'buy' ? 'Buy' : 'Sell'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DividendModal({ holding, onClose, onSave }: { holding: Holding; onClose: () => void; onSave: (amount: number, accountId: string | null, date: string) => void }) {
  const { accounts } = useStore()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [accountId, setAccountId] = useState(accounts.find((a) => !a.archived)?.id ?? '')
  const [record, setRecord] = useState(true)
  return (
    <Modal title={`Dividend — ${holding.symbol}`} onClose={onClose} width={420}>
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (Number(amount) > 0) onSave(Number(amount), record ? accountId || null : null, date)
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label>Amount ({holding.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <label className="check full">
            <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
            Also record it as income
          </label>
          {record && (
            <div className="field full">
              <label>Account</label>
              <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Record dividend
          </button>
        </div>
      </form>
    </Modal>
  )
}
