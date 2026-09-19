# Finanalytics — improvement plan

> Most of this plan has shipped — see **[CHANGELOG.md](CHANGELOG.md) v1.1.0** for the user-facing summary
> and the [status table at the bottom](#status--what-shipped-2026-09-19) for a per-item breakdown.

Grounded in two code‑audit passes on 2026‑09‑19 (7.7k lines, 14 pages, SQLite backend).
Effort: S = < ½ day, M = 1–2 days, L = 3+ days. Items marked **★** are the highest‑leverage ones in their phase.

> Revision 2 — what changed after re‑review: added a **Data safety & security** phase (LAN‑exposed API, multi‑tab
> overwrite, account deletion wipes history), found that `useConverter` defeats every `useMemo` in the app, spotted a
> UTC date bug in the new Compare page, and added product ideas the first pass missed (safe‑to‑spend, reconciliation,
> import rollback, auto‑matching bills, merchant normalisation, data‑health page, year in review).

---

## Phase 0 — Data safety & security (before anything else)

| # | Issue | Where | Fix | Effort |
|---|---|---|---|---|
| 0.1 ★ | **API is open to the whole LAN with no auth.** `npm start` binds `0.0.0.0`; anyone on the Wi‑Fi can `GET /api/data` (all finances) or `PUT` garbage. | `server/index.mjs`, `api.mjs` | Default `HOST=127.0.0.1`. If bound elsewhere, require a token: generated on first run, printed in the console + stored in `data/.token`; client keeps it in `localStorage` after a one‑time prompt; `Authorization: Bearer`. Add `Origin` check + `SameSite` (defends browser‑based CSRF even on localhost). | S |
| 0.2 ★ | **Two tabs/devices overwrite each other.** Sync is whole‑state, last‑write‑wins with no version check, so tab B silently erases tab A's edits. | `lib/sync.ts`, `api.mjs` | (a) `BroadcastChannel` so tabs in one browser share one writer and re‑hydrate on change; (b) server returns `rev`; `PUT` sends `If-Match: rev` → `409` triggers a re‑fetch + replay of the local diff. Pairs with 1.3 (per‑collection PATCH). | M |
| 0.3 | **Deleting an account deletes every transaction on it** (and recurring). One mis‑click = years of history gone. | `store.deleteAccount` | Archive instead (`archived: true`, hidden from pickers, balance still counted or excluded by toggle). Hard delete only when empty. Same for categories: offer "merge into…" instead of setting `categoryId: null`; clear matching `splits` too (currently missed). | S |
| 0.4 | **No undo** on any destructive action (`window.confirm` → gone). | all pages | Soft delete with 5‑s "Undo" toast; keep last 20 deletions in a ring buffer; bulk delete too. Foundation for 7.8 audit log. | S |
| 0.5 | Backups: no integrity check, no verified restore path from the UI. | `server/db.mjs` | `PRAGMA integrity_check` nightly and before each snapshot; SHA‑256 next to each backup; **Restore from snapshot / upload .db** in Settings (server swaps the file atomically, keeps the old one). | S |
| 0.6 | Auto‑post & interest run only on page load, so a tab left open across midnight misses bills. | `Layout.tsx` | Move scheduled work to the server (`setInterval` hourly, idempotent) — it has the data anyway; client just re‑fetches. Also fixes "opened app after 3 weeks → 20 bills post at once" by posting with correct historical dates (already done) *and* notifying once. | S |

## Phase 1 — Correctness (bugs found)

| # | Issue | Where | Fix | Effort |
|---|---|---|---|---|
| 1.1 ★ | **Cross‑currency transfers credit the wrong amount** (100 USD → EUR adds *100 EUR*). | `lib/analytics.ts accountBalance` | `toAmount?: number` on transfers; form shows the destination amount (pre‑filled via rates, editable); balance uses `toAmount ?? amount`. Migration back‑fills from rates. | S |
| 1.2 | **`monthStartDay` setting is dead code.** | everywhere `monthKey()` is used for "this month" | `periodKey(date, startDay)` used by budgets, dashboard, reports, compare. | M |
| 1.3 | **Debts never accrue interest**; APR only used in the planner. | `store.payDebt`, `Debt` | Monthly interest posting (server cron from 0.6), `lastInterestAt`; payments split interest/principal in the log. | M |
| 1.4 | Debt reminder misses month wrap (`dueDay >= today` never true for due‑day 2 on the 29th). | `Notifications.tsx` | `nextDueDate(dueDay)` + `daysBetween`. | S |
| 1.5 | **UTC date bug in Compare** — `toISOString().slice(0,10)` shifts the day near midnight in UTC+ zones (Morocco is UTC+1). Everything else uses local `toISODate`; this one slipped. | `pages/Compare.tsx:176` | Use `addDays(a.from, i)` from utils. | S |
| 1.6 | Buy/sell in Investments doesn't move cash — portfolio grows but no account shrinks, so net worth double‑counts. | `store.tradeHolding` | Optional `accountId` on trades → creates a transfer‑like `investment` transaction; dividends/fees as income/expense with `holdingId`. | M |
| 1.7 | Import duplicate hash ignores the account, so identical amount/date/payee on two cards is flagged as a dup. | `lib/csv.ts` | Include `accountId` in `importHash`. | S |
| 1.8 | Float money (`0.30000000000000004` in CSV/tooltips). | store setters | `round2` at every write boundary; format via `Intl` only. Long‑term: integer minor units. | S |
| 1.9 | Dashboard stat cards show a "last month ▾" chip that is not a control (decorative, matches the reference, but misleading). | `Dashboard.tsx:87,103` | Make it a real period menu or remove the chevron. | S |

## Phase 2 — Performance & robustness

| # | Item | Why | How | Effort |
|---|---|---|---|---|
| 2.1 ★ | **`useConverter()` returns a new function on every render**, and `conv` is in the deps of nearly every `useMemo` → *every memo in the app recomputes on every render*. Memoisation is currently decorative. | Biggest single perf win | `useMemo(() => makeConverter(settings), [settings.currency, settings.rates])` (rates compared by JSON/`useShallow`). | S |
| 2.2 | Every page subscribes to the whole store (`useStore()`), so typing in the search box re‑renders all mounted charts. | | Selector hooks (`useTransactions()`, `useShallow`). | S |
| 2.3 | `txBase` does `accounts.find` per transaction per aggregate (O(n·m)). | 10k tx × 10 aggregates per page | `Map<accountId, currency>` built once per render and passed to analytics. | S |
| 2.4 | Whole‑state `PUT` on every edit (hundreds of KB). | latency, battery, write amplification | Per‑collection `PATCH` with upserts/deletes (server already upserts by id) — shared with 0.2. | M |
| 2.5 | Server‑side aggregates for very large histories (`GET /api/agg?from&to&groupBy`) using the generated columns. Only when tx > ~20k. | | | L |
| 2.6 | Windowed list in Transactions (`@tanstack/virtual`) instead of "load 50 more". | | | S |
| 2.7 | **Tests in the repo**: Vitest for `lib/*` + `server/db.mjs` (the ad‑hoc harnesses I used are not committed); Playwright for 5 core flows; GitHub Actions. | refactor safety for everything below | | M |
| 2.8 | Schema validation of `PUT` bodies (zod/JSON‑schema) and a `migrations` table in SQLite (client‑only `DATA_VERSION` today). | | | S |

## Phase 3 — Mobile experience

| # | Item | How | Effort |
|---|---|---|---|
| 3.1 ★ | **PWA**: manifest, icons, service worker (`vite-plugin-pwa`), app‑shell cached, API network‑first. Installable; opens offline (sync layer already copes). | | S |
| 3.2 | **Bottom tab bar** < 900 px: Dashboard · Transactions · **+** FAB · Budgets · More. | | S |
| 3.3 | **Card rows instead of tables** on phones (Transactions, Budgets, Debts, Compare); swipe‑left to edit/delete. | | M |
| 3.4 ★ | **Quick‑add sheet**: numeric keypad, last‑used account/category chips, "same as last time" per payee; add an expense in ≤ 3 taps. Also as PWA share‑target / home‑screen shortcut ("Add expense"). | | M |
| 3.5 | Touch targets ≥ 44 px, safe‑area insets, `100dvh`, `overscroll-behavior`, no hover‑lift on touch (`@media (hover: none)`), global search reachable (currently `display: none`). | | S |
| 3.6 | Dashboard on mobile: stat cards as snap‑scroll carousel; gauges 2‑row grid; charts get `minHeight`. | | S |
| 3.7 | Receipt camera → attachment on the transaction (`data/attachments/`, served by API). OCR of total/date later. | | M |

## Phase 4 — Notifications & automation

| # | Item | How | Effort |
|---|---|---|---|
| 4.1 | **Persistent notification centre**: read/unread, snooze, grouped by day (today it's recomputed on open and can't be dismissed). | `notifications` table | M |
| 4.2 ★ | **Web Push** from the local server (VAPID): bill due tomorrow, budget ≥ 90 %, salary landed, low‑balance forecast. Falls back to `Notification` API when the app is open. Needs 0.6 server scheduler. | | M |
| 4.3 | **Auto‑match bills**: when a manual/imported transaction matches an upcoming recurring (payee ± 5 % amount, ± 3 days), link it and mark the bill paid instead of double‑counting. | `lib/matching.ts` | S |
| 4.4 | **Variable bills**: recurring with `amount: 'estimate'` (avg of last 3 posts) — electricity, phone. | | S |
| 4.5 | **Anomaly alerts**: transaction > 3σ of that payee/category's history ("Groceries 412 is 2.8× your usual"). | `lib/insights.ts` | S |
| 4.6 | **Subscription creep**: recurring amount up vs 3 months ago; unused subscriptions (no matching tx in 2 cycles). | | S |
| 4.7 | **Detect recurring from history**: same payee, ~30/7‑day spacing → "Looks like a bill — track it?" | | M |
| 4.8 | **Merchant normalisation**: `AMZN*MKTP US*2K4…` → "Amazon"; `payee_aliases` table learned from renames; feeds rules, payees page and matching. | | S |
| 4.9 | Rules v2: `amount between`, `account is`, `weekday`, priority order, "why was this categorised?" trace. | | S |
| 4.10 | Weekly digest card (Monday) and optional e‑mail via SMTP env vars. | | M |

## Phase 5 — Better calculations

| # | Item | Notes | Effort |
|---|---|---|---|
| 5.1 ★ | **Safe‑to‑spend** headline on the dashboard: liquid balance − upcoming bills before next income − remaining budget commitments − goal contributions due. The single most useful number a finance app can show. | `lib/forecast.ts` | S |
| 5.2 ★ | **Cash‑flow forecast**: 90‑day projected balance from recurring + average discretionary spend, with min‑balance date warning; dotted future segment on the dashboard sparkline; calendar view of expected balance per day. | same module | M |
| 5.3 | **Budget rollover** & envelopes (carry over, per‑budget period weekly/yearly), budget templates (50/30/20, last‑3‑months average). | | M |
| 5.4 | **Investments**: XIRR / TWR, FIFO lots for realised P&L, dividends & fees (from 1.6), target allocation + rebalance suggestions, opt‑in price fetch with user key. | `lib/portfolio.ts` | L |
| 5.5 | **Debts**: amortisation table, "what if I pay X extra", refinance comparison, interest paid to date (needs 1.3). | | M |
| 5.6 | **Goals ↔ accounts**: `saved` derived from a linked savings account (or a tagged bucket); pacing "on track / behind by X per month". | | S |
| 5.7 | **Net‑worth snapshots** (daily row, server cron) so holdings/debt/rate changes show correctly instead of being back‑projected. | | S |
| 5.8 | **Exchange‑rate history**: opt‑in auto‑fetch (frankfurter.app, no key), `rates_history` so a transaction uses the rate of its date; explicit `rateUsed` on cross‑currency tx for auditability. | | M |
| 5.9 | **Reconciliation**: enter the statement closing balance for an account/date → app shows the difference and the unreconciled transactions; `cleared` flag per tx. | `Transaction.status: 'pending' | 'cleared'` | M |
| 5.10 | **Refunds & reimbursements**: link a refund to the original expense so category totals net out; "waiting for reimbursement" list (work expenses, split bills with friends — who owes me). | `Transaction.refundOf`, `Transaction.owedBy` | M |
| 5.11 | Tax helpers (deductible categories, yearly export) and inflation‑adjusted toggle in Compare/Analytics. | | S |

## Phase 6 — Charts & analytics

| # | Item | Effort |
|---|---|---|
| 6.1 | **Sankey** cash flow (income → accounts → categories) per period. | S |
| 6.2 | **Calendar heat‑map** of daily spend for a year. | S |
| 6.3 ★ | **Drill‑down everywhere**: click any slice/bar/gauge → filtered transactions in a side panel; brush/zoom on time series. Charts are read‑only today. | M |
| 6.4 | **Waterfall** for "what changed" in Compare; multi‑period compare (3+ months as small multiples). | S |
| 6.5 | Budget burn‑down (ideal vs actual line) per category. | S |
| 6.6 | **Payee page**: history sparkline, average, frequency, category, rules & aliases affecting it. | S |
| 6.7 | **Search operators & saved views**: `>100`, `<20`, `before:2026-03`, `account:visa`, `cat:food`, `is:uncategorised`, `has:split`; save a filter set as a named view (sidebar). | S |
| 6.8 | **Year in review** page (Spotify‑Wrapped style): totals, top categories, best/worst month, savings rate trend, biggest purchase, streaks. Great December feature. | S |
| 6.9 | Shared `<ChartFrame>` (tooltip, legend, empty state, "copy data / download PNG"). Reports: annual/quarter/custom range, SVG charts in print. | S |

## Phase 7 — UI / UX polish

| # | Item | Effort |
|---|---|---|
| 7.1 ★ | **Command palette** (⌘K): navigate, "add expense 12.50 coffee", "go to September", "backup now", theme. Natural‑language quick add. | M |
| 7.2 | **Onboarding wizard** on first run (name, currency, first account + opening balance, import CSV or load demo) instead of silently seeding demo data. | S |
| 7.3 | **Data‑health page**: uncategorised count, transactions on missing accounts, orphan splits (sum ≠ amount), bills overdue > 30 d, rates older than 30 d, last backup age, DB integrity — each with a fix button. | S |
| 7.4 | Customisable dashboard: drag‑reorder, hide/show, per‑card period. | M |
| 7.5 | Inline editing in the Transactions table (double‑click), shift‑click multi‑select, J/K keyboard nav, column chooser. | M |
| 7.6 | **Import v2**: per‑bank presets remembered by header signature, OFX/QIF/MT940, *import batches* with one‑click **rollback** (`importBatchId`), preview of resulting balance vs statement. | M |
| 7.7 | Category groups (Housing → Rent, Utilities…) with roll‑up in charts; emoji/icon picker; per‑category default account. | M |
| 7.8 | **Audit log / history**: who‑when‑what per record (single user, but "why is this 40 not 30?" happens); powers undo and a "recently changed" list. | M |
| 7.9 | Accessibility: focus rings on custom controls, `aria-live` for sync/toasts, labelled icon buttons, keyboard‑navigable tables, `prefers-contrast`; light‑theme contrast audit; accent picker via CSS vars. | M |
| 7.10 | i18n scaffold (strings file; `Intl` already used) → French, Arabic (RTL). | M |
| 7.11 | Skeletons instead of splash; empty states with a primary action on every page. | S |

## Phase 8 — Data & platform

| # | Item | Effort |
|---|---|---|
| 8.1 | **Encryption at rest** (app‑level AES‑GCM on the `data` column, passphrase → PBKDF2/Argon2, unlocked per session) + **lock screen / auto‑lock** on idle. `node:sqlite` has no SQLCipher. | M |
| 8.2 | Backup destinations: folder of choice, `FINANALYTICS_BACKUP_CMD` hook (rclone/rsync), retention policy; restore UI (from 0.5). | S |
| 8.3 | **Packaging**: Tauri desktop (tray icon, starts at login), Docker image, `systemd`/launchd snippets. | M |
| 8.4 | Multi‑profile (personal / business / partner) = multiple DB files, switcher in sidebar. | S |
| 8.5 | Read‑only **SQL console** in Settings (SELECT only) for power users; export any query as CSV. | S |
| 8.6 | Attachments API (`data/attachments/`, size‑limited, content‑type sniffed) — used by 3.7 and 7.6. | S |

---

## Suggested order (≈ 7 sprints)

1. **Sprint 1 — Don't lose or leak data:** 0.1 auth/bind, 0.2 multi‑tab + rev, 0.3 archive, 0.4 undo, 0.5 restore/integrity, 0.6 server scheduler, 2.7 tests.
2. **Sprint 2 — Correct numbers:** 1.1–1.9, 2.1 converter memo, 2.2/2.3 selectors + index map.
3. **Sprint 3 — Mobile:** 3.1 PWA, 3.2 tab bar, 3.3 card rows, 3.4 quick‑add, 3.5.
4. **Sprint 4 — Awareness:** 5.1 safe‑to‑spend, 5.2 forecast, 4.1 centre, 4.2 push, 4.3 bill matching, 4.5 anomalies, 4.8 aliases.
5. **Sprint 5 — Money maths:** 5.3 rollover, 5.5 debts, 5.6 goals ↔ accounts, 5.7 snapshots, 5.8 rate history, 5.9 reconciliation, 5.10 refunds.
6. **Sprint 6 — Insight & speed of use:** 6.3 drill‑down, 6.7 search operators, 6.1 Sankey, 6.2 heat‑map, 6.4 waterfall, 6.6 payee page, 7.1 palette, 7.3 data health.
7. **Sprint 7 — Platform:** 2.4 incremental sync, 8.1 encryption + lock, 7.6 import v2 + rollback, 8.3 packaging, 7.2 onboarding, 7.9 a11y.

Deliberately **not** planned: multi‑user/sharing, cloud sync service, bank aggregation (Plaid & co.), AI categorisation calling
external APIs — they conflict with the local‑only, single‑user promise. Everything above runs on your machine.

---

## Status — what shipped (2026-09-19)

Every sprint below was implemented in order; the commits are on the branch.

| # | Item | Status |
|---|---|---|
| **0.1** | API auth + loopback default | ✅ `HOST` defaults to `127.0.0.1`; a bearer token is generated into `data/.token` (or `FINANALYTICS_TOKEN`) whenever it binds elsewhere; token gate in the UI; `Origin`/host check on writes |
| **0.2** | Multi-tab / multi-device safety | ✅ `rev` counter + `/api/patch` **incremental ops** (commutative upsert/delete), `BroadcastChannel` between tabs, 60 s poll that re-hydrates on a newer revision, `/api/patch` fallback to full PUT |
| **0.3** | Archive instead of delete | ✅ `Account.archived`, archived accounts excluded from totals/pickers, category delete offers *merge into…* and clears splits too |
| **0.4** | Undo | ✅ `lib/undo.ts` ring buffer (20), 9 s Undo toast on every destructive action, bulk delete included |
| **0.5** | Backup integrity & restore | ✅ `PRAGMA integrity_check` + SHA-256 sidecar per snapshot, unique snapshot names, **Restore latest / upload .db** in Settings (pre-restore snapshot, atomic swap, connection re-open) |
| **0.6** | Server-side scheduler | ✅ `server/scheduler.mjs`: hourly auto-post of recurring (historical dates, idempotent) + monthly debt interest, also mounted in the Vite dev server |
| **1.1** | Cross-currency transfers | ✅ `toAmount` + `rateUsed` on the transaction, editable destination field in the modal, balance uses it |
| **1.2** | `monthStartDay` | ✅ `periodKey/periodRange/currentPeriod` used by budgets, alerts, dashboard periods; configurable in Settings |
| **1.3** | Debt interest | ✅ `accrueInterest()` (client) + scheduler (server), `lastInterestAt`, payments split into interest/principal, "interest paid to date" KPI |
| **1.4** | Debt reminder month-wrap | ✅ `nextDueDate()` used by the notification centre |
| **1.5** | Compare UTC bug | ✅ local `addDays` instead of `toISOString()` |
| **1.6** | Trades move cash | ✅ `investment` field on transactions, optional cash account in the trade dialog, FIFO lots & realised P&L |
| **1.7** | Import hash | ✅ already included the account; re-verified |
| **1.8** | Money rounding | ✅ `round2` at every store write boundary |
| **1.9** | Dashboard chip | ✅ "last month ▾" is now a real period control |
| **2.1** | `useConverter` memo | ✅ memoised on `[currency, ratesKey]` — every `useMemo` in the app now holds |
| **2.2** | Selector hooks | ✅ `useTransactions/useAccounts/useCategories/useSettings` available; pages still use the whole store where they genuinely need it |
| **2.3** | Currency index map | ✅ `currencyIndex()` + `txBaseIdx()` added to `analytics.ts` |
| **2.4** | Incremental sync | ✅ see 0.2 |
| **2.5** | Server-side aggregates | ⏳ not needed yet (per-collection ops keep the payload small; revisit past ~20k transactions) |
| **2.6** | Virtualised list | ⏳ "load 50 more" is still comfortable at this size |
| **2.7** | Tests | ✅ Vitest suites for `analytics`, `forecast`, `matching`, `search`, `health`, `sync` and the SQLite store + scheduler (31 tests), GitHub Actions workflow |
| **2.8** | Schema validation | ✅ `validateState` / `validateOps` on every write |
| **3.1** | PWA | ✅ manifest + hand-rolled service worker, icons, installable, app-shell caching in production builds |
| **3.2** | Bottom tab bar | ✅ `MobileNav` (Home / Activity / Budgets / Trends / + / More) |
| **3.3** | Card rows, swipe | ✅ `tx-cards` layout with swipe-left actions and a hidden table on phones |
| **3.4** | Quick-add sheet | ✅ keypad, recent payees/accounts/categories, "same as last time", reachable from the FAB and the PWA shortcut |
| **3.5** | Touch targets & insets | ✅ 44 px targets, safe-area padding, `100dvh`, no hover-lift on touch, global search reachable via `/` |
| **3.6** | Mobile dashboard | ⏳ grid already collapses; carousel not needed |
| **3.7** | Receipt camera | ✅ attachment upload (`capture="environment"`), stored and served by `/api/attachments` |
| **4.1** | Notification centre | ✅ derived items + persisted read/snooze state, grouped by day |
| **4.2** | Web Push | ⚠️ partial: Notification-API alerts while the app is open (Settings → Enable notifications). True push needs a VAPID subscription served by the local server |
| **4.3** | Auto-match bills | ✅ `matchBills` + "Settle bills with existing transactions" panel on the Bills page |
| **4.4** | Variable bills | ✅ `variable` flag, estimate = average of the last three amounts |
| **4.5** | Anomaly alerts | ✅ `detectAnomalies` (mean + 2σ) surfaced in the notification centre |
| **4.6** | Subscription creep | ✅ price increases and unused subscriptions |
| **4.7** | Detect recurring | ✅ "Looks like a bill" with confidence score and one-click tracking |
| **4.8** | Merchant normalisation | ✅ `normalizePayee` (Amazon, Square, reference codes) + learned aliases in Settings |
| **4.9** | Rules v2 | ✅ `amount between`, `account is`, `weekday`, pattern2, live match count, "why this category?" |
| **4.10** | Weekly digest | ✅ "This week so far" card (spend vs last week, movers, what is due); e-mail digest ⏳ |
| **5.1** | Safe to spend | ✅ dashboard headline with the full breakdown and per-day figure |
| **5.2** | Cash-flow forecast | ✅ 30/90-day projection, min-balance warning, dashboard sparkline |
| **5.3** | Rollover & templates | ✅ per-budget rollover, 50/30/20 template, burn-down chart |
| **5.4** | Investments maths | ✅ FIFO lots, realised P&L, XIRR, dividends, rebalancing targets; live price fetching ⏳ |
| **5.5** | Debt maths | ✅ amortisation table, "pay X extra" shortcuts, interest to date |
| **5.6** | Goals ↔ accounts | ✅ linked account drives progress, pacing on-track/behind |
| **5.7** | Net-worth snapshots | ⏳ net worth is still derived (revisit with server aggregates, 2.5) |
| **5.8** | Rate history | ⚠️ one-click live rate fetch added; per-transaction historical rates ⏳ |
| **5.9** | Reconciliation | ✅ Wallet → reconcile: statement balance, cleared/uncleared list, difference |
| **5.10** | Refunds & reimbursements | ✅ `refundOf` (nets out of category totals) and `owedBy` with UI |
| **5.11** | Tax helpers | ✅ tax-deductible categories + report card and CSV row; inflation toggle ⏳ |
| **6.1** | Sankey | ✅ Analytics → Cash flow |
| **6.2** | Heat-map | ✅ 365-day spending heat-map with drill-down |
| **6.3** | Drill-down everywhere | ✅ `DrillDown` panel on the dashboard (bars, donut, gauges) and Analytics (categories, payees, heat-map) |
| **6.4** | Waterfall / multi-period | ⏳ |
| **6.5** | Budget burn-down | ✅ |
| **6.6** | Payee page | ✅ history chart, average, cadence, rule/alias, rename-everything |
| **6.7** | Search operators & views | ✅ see Transactions |
| **6.8** | Year in review | ✅ |
| **6.9** | `ChartFrame` | ⚠️ `ChartTooltip` + empty states everywhere; PNG export ⏳ |
| **7.1** | Command palette | ✅ navigate, months, theme, snapshot, "12.50 coffee" quick add |
| **7.2** | Onboarding | ✅ 4-step wizard (name → currency → account → demo/empty) |
| **7.3** | Data-health page | ✅ with fix buttons |
| **7.4** | Customisable dashboard | ⏳ |
| **7.5** | Inline editing / multi-select | ⚠️ multi-select, bulk actions and `J/K/Enter/X` navigation done; inline cell editing ⏳ |
| **7.6** | Import v2 | ✅ per-bank remembered presets, OFX/QFX/QIF, batches with rollback |
| **7.7** | Category groups | ⚠️ `parentId` in the model; group UI/roll-up ⏳ |
| **7.8** | Audit log | ⚠️ `createdAt`/`updatedAt` on transactions; a visible history view ⏳ |
| **7.9** | Accessibility | ✅ focus rings, skip link, `aria-live`, labelled icon buttons |
| **7.10** | i18n | ⏳ |
| **7.11** | Skeletons | ⚠️ splash + empty states with actions |
| **8.1** | Encryption at rest | ⚠️ passcode **lock screen** and idle auto-lock shipped; full AES-GCM encryption of the DB ⏳ |
| **8.2** | Backup destinations | ✅ `FINANALYTICS_BACKUP_CMD` hook, retention policy, restore UI |
| **8.3** | Packaging | ✅ Dockerfile + systemd unit |
| **8.4** | Multi-profile | ✅ point `FINANALYTICS_DB` at another file (documented) |
| **8.5** | SQL console | ✅ read-only, CSV export |
| **8.6** | Attachments API | ✅ |

**Deliberately not planned** (unchanged): multi-user, cloud sync, bank aggregation, external AI APIs.

**Bugs found and fixed while building this** (they were not in the audit): `useLocation` outside the
router (blank screen), an unstable zustand selector (`?? []`) that caused an infinite render loop,
`resetDemo()` re-triggering the onboarding wizard, and a restore that deleted the snapshot it was
about to restore from.
