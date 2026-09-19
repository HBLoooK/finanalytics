# Gamification & in-app explanations — design

The plan behind v1.1.0. Two problems, one release:

1. **A finance app is only useful if you keep the books current**, and "keep the books current" is a
   habit, not a feature. Nothing in the app rewarded the habit.
2. **Every number in the app is a decision**, and most of them were unexplained. "Safe to spend: £2,500"
   is only actionable if you know what was subtracted to get there.

Both are solved without turning the app into a game show: progression rewards the *habits that make the
numbers correct* — never spending less — and every explanation is one click from the figure it explains.

---

## 1 · Design rules

- **Never reward spending less.** XP comes from logging, categorising, splitting, attaching receipts,
  reconciling, posting bills, paying debt, funding goals, updating prices, checking in and reviewing.
  A month where you legitimately spent more must not read as failure.
- **Caps beat intensity.** Per-event daily caps, two per-event weekly caps, and a hard **200 XP/day**
  ceiling. A bulk import cannot level you overnight; consistency is worth more than a burst.
- **Grace, not punishment.** Streaks survive a missed day via *earned* grace tokens (one per seven
  consecutive days, max two). Nothing is ever taken away. A broken streak reports your record.
- **Deterministic.** Badges and quests are pure functions of the data and the date. No randomness at
  read time, no timers, no server. The same books always produce the same shelf, so nothing can be
  gamed and nothing can expire behind your back.
- **One switch.** `settings.gamification.enabled === false` makes every progression action a no-op.
  Nothing already earned is deleted.
- **Explanations live in one file.** `src/lib/help.ts` is the single source of truth. Pages never
  hand-roll explanation copy, so a concept cannot drift into two contradictory descriptions.
- **Respect the system.** `prefers-reduced-motion` disables the confetti canvas and all animation.
  `@media print` hides every progression surface.
- **Palette.** Indigo `#6270f2`, magenta `#e05be0`, yellow `#f2cf3a`, green `#3ec97a`, orange
  `#f28a2c`. No purple/violet anywhere.

---

## 2 · XP economy

18 events, each with a base award:

| Event | XP | Event | XP |
|---|---|---|---|
| `tx.add` | 10 | `debt.pay` | 12 |
| `tx.transfer` | 5 | `goal.contribute` | 15 |
| `tx.categorise` | 6 | `holding.price` | 6 |
| `tx.split` | 8 | `setup.budget` / `setup.rule` / `setup.recurring` | 15 each |
| `tx.receipt` | 6 | `checkin` | 25 |
| `tx.import` | 20 | `review` | 120 |
| `health.fix` | 8 | `quest` | 1 per XP of reward |
| `account.reconcile` | 40 | `bill.post` | 10 |

Caps, applied **in this order** — one-shot key → daily per-event cap → weekly per-event cap → daily
total cap:

- 12 events have a daily cap (e.g. `tx.add` 60, `tx.categorise` 60, `account.reconcile` is capped
  weekly instead, `review` 120).
- 2 events have a trailing-7-day cap: `tx.import` 40, `account.reconcile` 120.
- `DAILY_TOTAL_CAP = 200`.

The ledger (`progress.xpLog`) stores three key shapes: `YYYY-MM-DD` (day total), `YYYY-MM-DD#event`
(per-event per-day), and `once#event#key` (one-shot markers). Rows older than 30 days are pruned on
write; one-shot markers are kept forever so a re-import cannot re-award them.

**Levels.** `xpForLevel(n) = round(60 · n^1.45)` — fast early, long later. `xpToReach(n)` is the sum of
every level below `n`; `levelFromXp` walks it, capped at 99. Titles at levels 1 / 3 / 6 / 10 / 15 / 20 /
30 / 40: *Newcomer · Tracker · Bookkeeper · Analyst · Controller · Treasurer · CFO · Chief of Coin*.
A pinned title in Settings overrides the display without touching the level.

---

## 3 · Streaks

`{ current, longest, lastDay, freezes }`. Marking a day is idempotent within the day; a one-day gap
continues the chain; a two-day gap spends a grace token if one is banked; anything else restarts at 1.
`longest` never decreases. Every 7th consecutive day banks a token, to a maximum of two.

The weekly review keeps its own chain (`reviewStreak`) with a 10-day tolerance, because a week is the
cadence and a Monday/Tuesday slip should not erase it.

---

## 4 · Badges

`BadgeDef = { id, name, icon, family, desc, tiers: number[], value: (ctx) => number, unit? }`.

Six families — **Foundations 9 · Discipline 8 · Mastery 12 · Outcomes 8 · Insight 8 · Seasons 3** —
**48 rules in total** (the v1.1.0 summary rounds this to "47 badges"; the enumerated rule list is 48 and
all 48 ship). Every rule has 1–3 ascending thresholds mapped to bronze / silver / gold. Every `value()`
must be safe on empty data and return a finite number; `evaluateBadges` skips a rule that throws rather
than crashing the app, and never re-awards or downgrades an existing badge.

Locked badges show exactly what is left — `badgeProgressLabel` renders `"4 / 6"` against the *next*
threshold — so a locked badge is an instruction, not a taunt.

---

## 5 · Quests

Three daily and one weekly, chosen from templates by a deterministic FNV-1a hash seeded on the date, so
the same day always produces the same board. Templates are filtered by `target(ctx) > 0`, which means
targets are drawn from *your* data:

- daily: `log` (your average daily count), `categorise` (your uncategorised backlog), `receipt`, `split`,
  `bill` (bills due in 7 days), `goal`, `price` (your holdings), `health`, `stayUnder`
- weekly: `review`, `logDays` (5 distinct days), `zeroUncat`, `budgets`, `debt`

Rewards are 30 XP daily (40 for `stayUnder`) and 150 XP weekly. Quests with `track: 'state'` recompute
their progress live from the data instead of counting events, so they cannot be inflated. Ids are
`daily-<key>-<date>` / `weekly-<key>-<weekKey>`; expiry is the same day or the end of the ISO week.

---

## 6 · The coach

One nudge a day, never a modal. `coachNudges()` returns every candidate the data justifies **in priority
order**, and `pickNudge()` shows the first one that is not dismissed:

1. `uncategorised` · 2. `bill-due` (≤2 days, not auto-post) · 3. `safe-low` (per-day below 60 % of the
usual burn) · 4. `budget-<cat>` (hottest ≥90 %) · 5. `recurring-<payee>` (confidence ≥0.6) ·
6. `anomaly-<txId>` · 7. `debt-<id>` (doubling the minimum saves >20) · 8. `streak-risk` (hour ≥18,
streak ≥3, nothing logged) · 9. `goal-<id>` (behind pace, <120 days) · 10. `review` (week unreviewed) ·
11. `savings-good` (≥20 %, tone `good`) — plus a **12th fallback**, `prices`, when holdings exist.

The ordering *is* the policy: correctness first, then cash risk, then optimisation, then something
genuinely good so the coach is not only a critic. Quiet hours wrap past midnight (`[21, 8]`), dismissals
stick permanently, and the chosen key stays pinned for the rest of the day so the card never shuffles
while you are reading it.

---

## 7 · Explanations

`HelpEntry = { id, title, what, how, formula?, why, example?, seeAlso? }` — **69 entries in 11 groups**
(the summary rounds this to "~60"). Each of `what`, `how` and `why` must be more than 20 characters, and
every `seeAlso` must resolve. Surfaced four ways:

- **`InfoTip`** — the `?` beside a KPI, chart title or setting, with a **"Show the maths"** expander that
  prints the *live* numbers behind that figure (safe to spend shows the actual subtraction).
- **`HelpPanel`** — an "About this page" panel on all 18 routes, driven by a `PAGE_HELP` map.
- **`/help`** — searchable centre with 12 "How do I…?" recipes, the grouped index, the keyboard map and
  restartable tours.
- **`Tour`** — three spotlights per page for five pages, shown once, skippable with `Esc`.

All four are suppressed when `showTips === false`.

---

## 8 · Data model & migration

`AppData` gains `progress?: Progress`; `Settings` gains `gamification?: GamificationSettings` and
`tourSeen?: string[]`. `DATA_VERSION` 3 → 4.

`toV4(s)` runs after `toV3` and is idempotent: it normalises every progress field, defaults the
gamification settings, and — when the installation has transactions but no XP ledger — calls
`seedProgressFromHistory`, which replays the last 30 days through the *same* capped XP rules, awards each
existing budget/rule/recurring once, then records personal bests. **Nobody starts at zero.**

Celebrations live in their own Zustand store (`lib/celebrate.ts`) so a burst of confetti can never be
persisted into the database.

---

## 9 · Verification

`npm test` · `npx tsc -b` · `npm run lint` · `npm run build`.

`src/lib/gamification.test.ts` adds 31 cases (suite total **62**) covering: the level curve and titles;
every cap including the daily ceiling across eight event types; once-per-object awards; ledger pruning;
streak grace tokens and record-keeping; badge unlocking, tiering, de-duplication, id uniqueness and
finiteness on empty data; quest determinism, completeness and expiry; coach ordering, quiet hours and
dismissals; history seeding; help-catalogue integrity; and ISO week boundaries.
