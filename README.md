# Finanalytics

A personal finance dashboard for **single-user, local use**. The look closely follows
[this Behance concept](https://www.behance.net/gallery/178183953/Dashboard-Finance-uiux-dashbord):
near-black background, dark cards, indigo / magenta / yellow / green / orange accents, pill navigation,
thin ring gauges and a dark bank card.

Single user, no accounts, no tracking. Your data is stored in a **SQLite database file on your
machine** (`data/finanalytics.db`) by a tiny built-in Node server, so it survives clearing the
browser, switching browsers and reinstalls. The browser keeps a cache so the app still opens
if the server is down, and syncs back when it returns.

## Features

**Dashboard** (mirrors the reference layout) — greeting header, Total balance & Total expenses with
sparklines, "Dissection" income/expense bars, Active card, Categories donut, Spending parameters gauges
(budgets with month-over-month delta), Transactions, Investments allocation, Income & expenses weekly wave.

| Area | What you can do |
|---|---|
| **Transactions** | Add / edit / delete, transfers, **tags**, **split** one expense across categories, filters (month / type / category / account / tag), `#tag` search, bulk re-categorise & delete, CSV export |
| **Wallet** | Multi-currency accounts (checking, savings, credit, cash, investment) with computed balances, card visuals, assets vs liabilities |
| **Bills & recurring** | Weekly → yearly schedules, **auto-posting** on due date or manual "mark paid", skip, pause, upcoming list, calendar view, monthly commitment totals, reminders in Notifications |
| **Budgets** | Monthly limits per category, month navigation, pace marker, inline edit |
| **Goals** | Savings targets with deadlines, "save X / month" hint, quick contributions |
| **Investments** | Holdings (stocks / ETF / crypto / bonds / …), manual prices, buy / sell with average-cost tracking, allocation donut, P&L, weights |
| **Debts** | Loans & cards with APR, minimums and due days; payment log (optionally records the expense); **avalanche vs snowball** planner with extra-payment slider, payoff timeline and interest saved |
| **Import** | Drag-and-drop **bank CSV** with auto column detection & remapping, day-first dates, sign flip, debit/credit columns, **duplicate detection**, review table, auto-categorisation |
| **Rules** | `payee/note contains / starts / equals / regex` → category, tags, rename. Applied on import, on typing a payee, or retroactively |
| **Reports** | Monthly report vs previous month (summary, categories, income, budgets, largest expenses, top payees, tags, balances), CSV export, **print / save as PDF** |
| **Multi-currency** | Base currency + manual rates; every total is converted, per-account balances stay native |
| **Compare** | Any two periods side by side — month, quarter, year or custom ranges; presets for *previous period* and *same period last year*; income/expenses/net/savings-rate/daily-pace deltas, cumulative-spend overlay, "what changed" drivers by category, category & weekday & income-source comparison, payees that went up/down/new/gone |
| **Analytics** | Cash-flow, savings rate, daily pace vs last month, net worth, stacked categories, weekday pattern, top payees, income sources, tags |
| **Settings** | Name, base currency, number format, dark / light theme, categories, exchange rates, JSON backup / restore, demo reset, start from scratch |
| **Notifications** | Overdue & upcoming bills, budgets near limit, debt due dates, goals almost funded |

Keyboard: `N` new transaction · `⌘K` / `Ctrl K` search · `Esc` close dialogs.

## Getting started

Requires **Node 22.5+** (uses the built-in `node:sqlite` — no native modules to compile).

```bash
npm install
npm run dev        # http://localhost:5173  (Vite + SQLite API in one process)
```

Everyday use — build once, then run the small production server:

```bash
npm run build
npm start          # http://localhost:8787  serves dist/ + the database API
```

| Env var | Default | Purpose |
|---|---|---|
| `FINANALYTICS_DB` | `./data/finanalytics.db` | Where the SQLite file lives (put it in a synced/backed-up folder if you like) |
| `PORT` | `8787` | Port for `npm start` |
| `HOST` | `0.0.0.0` | Bind address |

The app ships with 12 months of realistic demo data so every screen is populated on first run.
Go to **Settings → Portable backups & reset → Start from scratch** to wipe it and track your own money.

## Storage & backups

- **Database:** `data/finanalytics.db` (WAL mode). Tables: `accounts`, `categories`, `transactions`,
  `budgets`, `goals`, `recurring`, `holdings`, `debts`, `debt_payments`, `rules`, `settings`, `meta`.
  Rows hold JSON in `data`; `transactions` also exposes `date`, `type`, `amount`, `account_id`,
  `category_id`, `payee` as indexed generated columns, so you can query it with any SQLite client.
- **Automatic snapshots:** once per day (on the first save of the day) the server writes a consistent
  copy to `data/backups/`, keeping the newest 14.
- **Settings → Database:** live sync status, record counts, size, "Snapshot now", and "Download .db".
- **Restore a snapshot:** stop the server and copy the snapshot over `data/finanalytics.db`
  (delete any `-wal` / `-shm` files next to it first).
- **JSON export / import** is still there for portable, human-readable backups.
- **Migration:** if you used an earlier version that stored data in `localStorage`, it is picked up
  automatically the first time the app starts against an empty database.
- The sidebar shows a small indicator: *Saved to database*, *Saving…*, or *Database offline — cached in browser*.
  Writes are debounced (~0.4 s) and retried with backoff; the local cache is always written synchronously first.

## Tech

React 19 · TypeScript · Vite · Zustand (persisted) · Recharts · react-router · lucide-react · Node `node:sqlite`

## Project layout

```
src/
  components/   Layout (sidebar/topbar), UI primitives, TransactionModal, Notifications
  lib/          types, analytics + compare (pure functions), rules engine, CSV parser, seed/demo data, utils
  pages/        Dashboard, Wallet, Transactions, Recurring, Budgets, Goals, Investments,
                Debts, Import (+Rules), Reports, Analytics, Compare, Settings
  lib/sync.ts   Zustand storage adapter: SQLite API ⇄ localStorage cache, retry queue, status
  store.ts      Zustand store (persist middleware)
server/
  db.mjs        SQLite schema, atomic writes, snapshots (node:sqlite)
  api.mjs       /api/data, /api/status, /api/backup, /api/backup/download (framework-free handler)
  index.mjs     production server: static dist/ + API (`npm start`)
vite.config.ts  mounts the same API into the dev server
data/           your database + backups (git-ignored)
```
