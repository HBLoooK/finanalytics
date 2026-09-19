# Finanalytics

![CI](https://github.com/HBLoooK/finanalytics/actions/workflows/ci.yml/badge.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.5-3ec97a)
![Version](https://img.shields.io/badge/version-1.1.0-6270f2)
![Data](https://img.shields.io/badge/data-local%20SQLite-f2cf3a)
![Stack](https://img.shields.io/badge/stack-React%2019%20%C2%B7%20TS%20%C2%B7%20Vite%20%C2%B7%20Node-e05be0)

A **local-first personal finance dashboard**: one user, no accounts, no tracking, and a SQLite file
on your own machine as the single source of truth. It covers the whole loop — capture, categorise,
budget, invest, borrow, import, analyse — then explains every number it shows and nudges you once a
day towards the one thing worth doing.

## Contents

- [Features](#features)
- [Running it](#running-it)
- [Getting started](#getting-started)
- [Environment](#environment)
- [Storage, safety & backups](#storage-safety--backups)
- [Mobile & installability](#mobile--installability)
- [Running it as a service](#running-it-as-a-service)
- [Tests](#tests)
- [Tech](#tech)
- [Project layout](#project-layout)
- [Roadmap](#roadmap)

The look closely follows
[this Behance concept](https://www.behance.net/gallery/178183953/Dashboard-Finance-uiux-dashbord):
near-black background, dark cards, indigo / magenta / yellow / green / orange accents, pill navigation,
thin ring gauges and a dark bank card.

Single user, no accounts, no tracking. Your data is stored in a **SQLite database file on your
machine** (`data/finanalytics.db`) by a tiny built-in Node server, so it survives clearing the
browser, switching browsers and reinstalls. The browser keeps a cache so the app still opens
if the server is down, and syncs back when it returns.

## Features

**Dashboard** (mirrors the reference layout) — greeting header, **Safe to spend** with a 30-day
projection, Total balance & Total expenses with sparklines, "Dissection" income/expense bars, Active card,
Categories donut, Spending parameters gauges, **This week so far** digest, Transactions, Investments
allocation, Income & expenses weekly wave.

| Area | What you can do |
|---|---|
| **Transactions** | Add / edit / delete, transfers (incl. **cross-currency with the destination amount**), tags, split an expense across categories, **search operators** (`>100 cat:food before:2026-03 is:uncategorised has:split -coffee`) and **saved views**, filters, bulk re-categorise / mark cleared / delete, CSV export, receipt attachments, refunds & "owed by", **undo** any delete, `J`/`K` keyboard navigation, card layout on phones |
| **Wallet** | Multi-currency accounts with computed balances, card visuals, **archive instead of delete**, **reconciliation** against a statement balance with cleared/uncleared state |
| **Bills & recurring** | Weekly → yearly schedules, auto-posting or manual, skip, pause, upcoming list, calendar, monthly commitments, **variable bills** (estimated from the last amounts), **auto-match** an existing transaction to its bill, **"looks like a bill"** detection from your history |
| **Budgets** | Limits per category, **rollover** of what is left over, **50/30/20** and average-based templates, **burn-down** chart vs ideal pace, pace marker, inline edit |
| **Goals** | Targets with deadlines, **linked accounts** (the account balance *is* the progress), planned contribution and on-track / behind pacing, contributions that move real money |
| **Investments** | Holdings, manual prices, **FIFO lots** with realised P&L, **buy / sell that moves cash** so net worth stays correct, dividends, **rebalancing** targets and drift, **money-weighted return (XIRR)**, allocation donut |
| **Debts** | APR, minimums, due days, payment log, **monthly interest accrual** (client and server), **amortisation schedule**, "what if I pay X extra" shortcuts, avalanche vs snowball planner |
| **Import** | **CSV / OFX / QFX / QIF**, column auto-detection that is **remembered per bank**, day-first dates, sign flip, debit/credit columns, duplicate detection, review table, auto-categorisation, **import batches with one-click rollback** |
| **Rules** | `payee` / `note` / `amount between` / `account is` / `weekday` → category, tags, rename, priority order, live match count and a **"why this category?"** trace |
| **Reports** | **Month / quarter / year / custom range** vs the previous period (summary, categories, income, budgets, largest expenses, top payees, tags, balances, **tax-deductible** total), CSV export, print / save as PDF |
| **Analytics** | Cash flow **Sankey**, **365-day spending heat-map**, savings rate, daily pace, net worth, stacked categories, weekday pattern, top payees, income sources, tags — **click any chart element to drill into the transactions behind it** |
| **Compare** | Any two periods side by side, presets for *previous period* and *same period last year*, deltas on every metric, cumulative overlay, "what changed" drivers, category / weekday / income-source / payee comparison |
| **Year in review** | Wrapped-style summary: totals, best & worst month, top category and payee, biggest purchase, busiest day, longest no-spend streak, savings trend |
| **Data health** | Live checks (uncategorised, orphaned, broken splits, duplicates, stale rates, missing rates, backup age, integrity) each with a **fix button** |
| **Multi-currency** | Base currency + manual rates (optional **one-click fetch**), per-account balances stay native, rate used is stored per transaction |
| **Settings** | Name, base currency, number format, theme, **month start day**, week start, categories (incl. tax-deductible), aliases, saved views, **merchant aliases**, exchange rates, **desktop notifications**, **passcode lock**, **SQL console** (read-only), **snapshot / restore / upload .db**, JSON backup, demo reset |
| **Notifications** | Overdue & upcoming bills, budgets near limit, debts (with correct month-wrap), goals, **anomalies**, **subscription creep**, **negative-balance forecast** — with read/unread and snooze |
| **Progress** | **XP, levels & titles** for the habits that make the numbers correct (never for spending less), **streaks with earned grace tokens**, **47 badges** in three tiers, **quests** generated from your own averages, **seasons** against your past months, **celebrations** that respect reduced motion — all behind **one master switch** |
| **Coach** | **One contextual nudge a day** built from your data (uncategorised, bills due, safe-to-spend pace, budget breaches, detected recurring, anomalies, debt maths, goals, streaks, savings rate), **quiet hours**, **sticky dismissal**, never a modal |
| **Help** | A **`?`** beside every KPI, chart and setting with a **"Show the maths"** expander, **"About this page"** panels on all 18 routes, a searchable **help centre** with recipes and shortcuts, and skippable **guided tours** |

Keyboard: `N` new transaction · `⌘K` / `Ctrl K` command palette (also `12.50 coffee`) · `/` search ·
`?` help centre · `J` / `K` move · `Enter` edit · `X` select · `Esc` close.

## Running it

| Mode | Command | Notes |
|---|---|---|
| **Development** | `npm run dev` | Vite dev server + SQLite API + scheduler in one process, `http://localhost:5173` |
| **Production** | `npm run build && npm start` | Serves `dist/` plus the database API on `http://localhost:8787` |
| **Docker** | `docker build -t finanalytics . && docker run -p 8787:8787 -v $PWD/data:/app/data finanalytics` | Mount `./data` so the database survives the container |
| **systemd** | `sudo systemctl enable --now finanalytics` | Copy `finanalytics.service`, adjust the paths, enable |

## Getting started

Requires **Node 22.5+** (uses the built-in `node:sqlite` — no native modules to compile).

```bash
npm install
npm run dev        # http://localhost:5173  (Vite + SQLite API + scheduler in one process)
```

Everyday use — build once, then run the small production server:

```bash
npm run build
npm start          # http://localhost:8787  serves dist/ + the database API
```

The first run shows a short wizard (name → currency → first account → demo or empty data).

## Environment

| Env var | Default | Purpose |
|---|---|---|
| `FINANALYTICS_DB` | `./data/finanalytics.db` | Where the SQLite file lives (a second file = a second profile) |
| `PORT` | `8787` | Port for `npm start` |
| `HOST` | `127.0.0.1` | Bind address. **Anything other than loopback requires a token** (generated into `data/.token`, or set `FINANALYTICS_TOKEN`) |
| `FINANALYTICS_TOKEN` | — | Access token; also accepted as `?token=` in a URL |
| `FINANALYTICS_BACKUP_CMD` | — | Shell command run after each snapshot, e.g. `rclone copyto {} remote:finanalytics.db` |

## Storage, safety & backups

- **Database:** `data/finanalytics.db` (WAL mode). Tables: `accounts`, `categories`, `transactions`,
  `budgets`, `goals`, `recurring`, `holdings`, `debts`, `debt_payments`, `rules`, `settings`, `meta`.
  Rows hold JSON in `data`; `transactions` also exposes `date`, `type`, `amount`, `account_id`,
  `category_id`, `payee` as indexed generated columns, so you can query it with any SQLite client.
- **Snapshots:** once per day the server writes a consistent copy to `data/backups/` (newest 14 kept).
  Each snapshot is verified with `PRAGMA integrity_check` and gets a SHA-256 sidecar.
- **Restore without leaving the app:** Settings → Database → *Restore latest snapshot* / *Restore from
  .db file*. The current data is snapshotted first, then the file is swapped atomically.
- **Restore by hand:** stop the server, copy the snapshot over `data/finanalytics.db`, delete `-wal`/`-shm`.
- **Sync is incremental and multi-device safe:** every edit is sent as commutative upsert/delete ops
  against a server revision, so two tabs or two machines merge instead of overwriting each other.
  A `BroadcastChannel` keeps tabs of one browser live; the server scheduler runs hourly even with no
  browser open (auto-posting bills and accruing interest), and open tabs pick the changes up.
- **Nothing destructive is final:** deleting an account **archives** it (history kept); deleting a
  transaction, budget, goal, rule, holding or debt offers a 9-second **Undo**.
- **JSON export / import** is still there for portable, human-readable backups.
- **Migration:** data from an earlier `localStorage`-only version is picked up automatically the
  first time the app starts against an empty database; state is then migrated and repaired.
- The sidebar shows *Saved to database*, *Saving…*, or *Database offline — cached in browser*.
  Writes are debounced (~0.4 s), retried with backoff, and the local cache is written synchronously first.

## Mobile & installability

The app is a **PWA**: `manifest.webmanifest` plus a small service worker that caches the app shell,
so it installs to your home screen and opens offline. On phones you get a bottom tab bar, a **quick-add
sheet** with a numeric keypad and your most-used payees/accounts/categories, card rows instead of tables
(with swipe to edit/delete), 44 px touch targets and safe-area insets.

## Running it as a service

```bash
docker build -t finanalytics .
docker run -p 8787:8787 -v finanalytics-data:/app/data finanalytics     # set FINANALYTICS_TOKEN
```
or with systemd — copy `finanalytics.service`, adjust the paths, then
`sudo systemctl enable --now finanalytics`.

## Tests

```bash
npm test           # vitest: 62 tests — analytics, forecast, matching, search, health, gamification + SQLite store & scheduler
npm run typecheck  # tsc -b
npm run lint       # oxlint
```

## Tech

React 19 · TypeScript · Vite · Zustand (persisted) · Recharts · react-router · lucide-react · Node `node:sqlite` · Vitest

## Project layout

```
src/
  components/   Layout, MobileNav, CommandPalette, QuickAdd, DrillDown, PayeeDetails,
                WeekDigest, Notifications, LockScreen, TokenGate, Toasts, TransactionModal, ui,
                XPBar, Celebration, CoachCard, DailyCheckIn, InfoTip, Tour
  lib/          types, analytics, compare, forecast, matching, search, health, year, rules,
                csv (+OFX/QIF), seed/demo data, migrate, sync, undo, lock, notifications, utils,
                gamification (XP/streaks/quests/seasons), badges (47 rules), coach, help,
                celebrate, tours
  pages/        Dashboard, Wallet, Transactions, Recurring, Budgets, Goals, Investments,
                Debts, Import (+Rules+history), Reports, Analytics, Compare,
                DataHealth, YearInReview, Settings, Progress, WeeklyReview, Help
  store.ts      Zustand store (persist middleware, incremental sync, undo, migrations,
                progression actions: recordEvent, check-in, review, quests, badges, coach)
server/
  db.mjs        SQLite schema, atomic writes, incremental ops, verified snapshots, restore
  api.mjs       /api/data · /api/patch · /api/status · /api/backup[/download] · /api/restore[/upload]
                · /api/query (read-only) · /api/attachments — with token + origin checks
  scheduler.mjs hourly auto-post & interest accrual (idempotent)
  index.mjs     production server: static dist/ + API + scheduler
data/           your database, backups and attachments (git-ignored)
```

## Roadmap

[ROADMAP.md](ROADMAP.md) is the full improvement plan with a per-item status table; the design behind
the progression system and the in-app explanations lives in [GAMIFICATION.md](GAMIFICATION.md).
User-facing changes are summarised in [CHANGELOG.md](CHANGELOG.md).
