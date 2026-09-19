# Changelog

All notable changes to Finanalytics are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-19

The engagement and comprehension release: a full progression system, and an explanation for
every number in the app. Data version 4 (progress is stored next to your data, migrated automatically).

### Added — gamification

- **XP, levels & titles** — XP for the habits that make the numbers correct (logging 10, categorising 6,
  splits 8, receipts 6, reconciliation 40, goal contributions 15, weekly review 120…), hard caps per event
  and **200 XP/day**, levels on a `60·n^1.45` curve with titles from *Newcomer* to *Chief of Coin*.
- **Streaks with grace** — a missed day spends an *earned* grace token (one per 7 days) before the streak
  restarts; nothing is ever taken away, and a broken streak reports your record instead of scolding.
- **47 badges** across Foundations / Discipline / Mastery / Outcomes / Insight / Seasons, in bronze, silver
  and gold tiers, computed deterministically from your data. Locked badges show exactly what is left
  ("Reconcile 6 accounts — 4 / 6").
- **Quests** — three daily challenges and one weekly mission, generated from your own trailing averages
  (~70–85 % difficulty) so they stretch without being arbitrary.
- **Daily check-in** (25 XP) on the dashboard and a guided **weekly review** (120 XP, five skippable steps:
  uncategorised → bills → budgets → new recurring → summary).
- **The coach** — one contextual nudge per day, built from data health, safe-to-spend, budget pace,
  detected bills, anomalies, debt maths, goals and streaks; quiet hours, sticky dismissal, never a modal.
- **Seasons** — monthly challenges where you compete with your own past months on four fair metrics.
- **`/progress`** page: level ring, quest board, badge shelf, 7-week streak grid, XP history, personal bests.
- **Celebrations** — a small canvas burst for level-ups, badges and quests, skipped when the system asks
  for reduced motion. Everything can be switched off in **Settings → Progress**.

### Added — explanations

- **`src/lib/help.ts`**: ~60 entries (what / how / formula / so / example / see-also) covering safe-to-spend,
  forecast, savings rate, rollover, burn-down, FIFO lots, XIRR vs TWR, rebalancing, amortisation,
  reconciliation, refunds, rules, import batches, Sankey, heat-map, drill-down, base currency, stored rates,
  sync, backup and the progression system itself.
- **`?` tips everywhere** — a help button next to KPIs, chart titles and settings rows, each with an optional
  **"Show the maths"** expander that prints the live numbers behind that figure.
- **Page intros** — every route gets an expandable "About this page" panel.
- **`/help`** — a searchable help centre with a "How do I…?" recipe list, the keyboard map and restartable tours.
- **Guided tours** — three-step spotlights per page, shown once, skippable with `Esc`.

### Changed

- Data version 3 → 4; existing installations get their **XP, streaks and badges back-computed from history**
  (capped like live XP), so nobody starts at zero.
- Settings gained a **Progress & tips** tab (master switch, celebrations, coach, quiet hours, pinned title,
  recompute-from-history, replay tours).
- Command palette, sidebar and mobile menu list the three new pages; `?` opens the help centre from anywhere.

### Fixed

- An infinite render loop from an unstable Zustand selector in the guided-tour hook
  (`getSnapshot should be cached`).

### Tests

- New `src/lib/gamification.test.ts`: 31 tests for the level curve, every XP cap, once-per-object events,
  streak grace tokens, badge evaluation and tiering, quest generation and expiry, coach ordering/quiet
  hours/dismissals, history seeding and help-catalogue completeness. Suite total: **62 tests**.

## [Unreleased]

No unreleased changes.

[unreleased]: https://github.com/HBLoooK/finanalytics/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/HBLoooK/finanalytics/compare/v1.0.0...v1.1.0
