// Every number in the app, explained in the same place.
// One entry per concept; `InfoTip` renders `what` / `how` / `formula` and the
// `HelpPanel` groups them by page. This file is the single source of truth —
// pages never hand-roll their own explanation copy.

export interface HelpEntry {
  id: string
  title: string
  /** What the thing is, in one plain sentence. */
  what: string
  /** How the app arrives at it, or how to use it. */
  how: string
  /** The actual arithmetic, when there is any. */
  formula?: string
  /** Why it matters — the mistake it prevents. */
  why: string
  example?: string
  seeAlso?: string[]
}

const e = (entry: HelpEntry) => entry

export const HELP: HelpEntry[] = [
  /* -------------------------------------------------- Dashboard & money --- */
  e({
    id: 'safe-to-spend',
    title: 'Safe to spend',
    what: 'The money you can spend today without touching money that is already spoken for.',
    how: 'It takes your liquid balance and removes everything that will claim it before your next income arrives: bills due in that window, budget room you have not used yet, goal contributions you planned, and pending transactions.',
    formula: 'liquid − bills due before next income − unused budget − goal contributions − pending out',
    why: 'A raw balance says what you *have*; this says what you can *use*. Spending the difference is how people accidentally eat next month’s rent.',
    example: '£4,200 liquid − £900 bills − £600 unused budget − £200 goals = £2,500 safe to spend.',
    seeAlso: ['safe-to-spend-perday', 'safe-to-spend-buffer', 'forecast'],
  }),
  e({
    id: 'safe-to-spend-perday',
    title: 'Safe to spend per day',
    what: 'Your safe-to-spend figure spread evenly across the days until your next income lands.',
    how: 'Divide safe to spend by the number of days to the horizon date, which is your next scheduled income or 30 days out if you have none.',
    formula: 'max(0, safe to spend) ÷ days until next income',
    why: 'A lump sum invites a splurge on day one. A daily number turns the same total into a pace you can actually hold.',
    seeAlso: ['safe-to-spend', 'forecast'],
  }),
  e({
    id: 'safe-to-spend-buffer',
    title: 'Why it can look pessimistic',
    what: 'Safe to spend is a guardrail, not a prediction, so it deliberately over-reserves.',
    how: 'It reserves the *entire* remaining budget for every category, even ones you will not use, and every bill inside the window, even ones you might skip.',
    why: 'Under-reserving is the expensive error. If the number feels too cautious, that is the dial to look at — not a bug.',
    seeAlso: ['safe-to-spend', 'budget'],
  }),
  e({
    id: 'forecast',
    title: 'Cash-flow forecast',
    what: 'A day-by-day projection of your balance for the next 90 days.',
    how: 'Known recurring items are placed on their real dates; everything else is spread using your average discretionary spend from the last 60 days.',
    formula: 'balance(d+1) = balance(d) + scheduled income − scheduled bills − average daily burn',
    why: 'It shows the *minimum* point, which is where overdrafts happen — usually weeks before the balance actually turns negative.',
    seeAlso: ['safe-to-spend', 'recurring'],
  }),
  e({
    id: 'liquid-balance',
    title: 'Liquid balance',
    what: 'The money you could realistically use today: cash, checking and savings accounts.',
    how: 'Opening balance of every non-archived, non-investment account plus all its transactions, converted to your base currency. Credit cards count as negative.',
    why: 'Investment accounts are excluded on purpose — you cannot buy groceries with unvested stock, and including it makes the number unusable.',
    seeAlso: ['net-worth', 'account-balance'],
  }),
  e({
    id: 'net-worth',
    title: 'Net worth',
    what: 'Everything you own minus everything you owe, at today’s values.',
    how: 'Liquid balance plus the market value of your holdings minus total debt balances, all converted to your base currency.',
    formula: 'accounts + holdings − debts',
    why: 'It is the only number that improves both when you save and when you pay down debt, so it is the honest long-run scoreboard.',
    seeAlso: ['liquid-balance', 'holdings-value'],
  }),
  e({
    id: 'savings-rate',
    title: 'Savings rate',
    what: 'The share of this month’s income you did not spend.',
    how: 'Income minus expenses (refunds netted out) for the month, divided by income. Months with no income show 0 rather than a misleading figure.',
    formula: '(income − expenses) ÷ income × 100',
    why: 'It is normalised for income, so a raise does not flatter you and a slow month does not punish you unfairly.',
    example: 'Income £3,000, expenses £2,250 → 25% savings rate.',
    seeAlso: ['fifty-thirty-twenty', 'goal-pacing'],
  }),

  /* --------------------------------------------------------- Transactions --- */
  e({
    id: 'transaction',
    title: 'Transactions',
    what: 'Every movement of money: expenses, income and transfers between your own accounts.',
    how: 'Add one with the button or the quick-add sheet. Transfers never count as spending; they move a balance from one account to another.',
    why: 'Keeping transfers separate from expenses is what stops a card payment from doubling your spending for the month.',
    seeAlso: ['splits', 'status', 'search-operators'],
  }),
  e({
    id: 'splits',
    title: 'Split transactions',
    what: 'One payment spread across several categories — the supermarket run that was half groceries, half household.',
    how: 'Add splits inside the transaction. The parts must add up to the total; a split that does not balance is discarded on load so it cannot skew reports.',
    why: 'Without splits, mixed receipts get filed entirely under one category and every budget built on it drifts.',
    seeAlso: ['transaction', 'budget'],
  }),
  e({
    id: 'status',
    title: 'Transaction status',
    what: 'Where a transaction is in its lifecycle: pending, cleared or reconciled.',
    how: 'Pending means not yet settled; cleared means it has moved; reconciled means you checked it against a real statement.',
    why: 'Pending rows are reserved against safe-to-spend, so marking them correctly keeps the guardrail honest.',
    seeAlso: ['reconciliation'],
  }),
  e({
    id: 'refund',
    title: 'Refunds',
    what: 'A repayment linked to the original purchase, so category totals net out.',
    how: 'Set “refund of” on the incoming row. The original category total is reduced instead of the refund being counted as income.',
    why: 'Counting a refund as income inflates both your income and your spending for the month, which distorts the savings rate.',
    seeAlso: ['transaction', 'savings-rate'],
  }),
  e({
    id: 'owed-by',
    title: 'Owed by',
    what: 'Money other people owe you — shared bills, expenses, loans to friends.',
    how: 'Set the person on the transaction. They appear in your totals as an asset-like receivable rather than as spending.',
    why: 'It separates “I spent this” from “I fronted this”, which is the difference between a budget problem and a memory problem.',
    seeAlso: ['transaction'],
  }),
  e({
    id: 'attachment',
    title: 'Receipts and attachments',
    what: 'A photo or file attached to a transaction, served back by the local API.',
    how: 'Attach it from the transaction modal. The file is stored server-side and referenced by id, never inlined into your data.',
    why: 'Warranties, disputes and tax questions all eventually need the receipt. Attaching it at the time costs seconds.',
    seeAlso: ['transaction', 'tax-deductible'],
  }),
  e({
    id: 'tags',
    title: 'Tags',
    what: 'Free-form labels that cut across categories — #holiday, #business, #fixed.',
    how: 'Type them on a transaction or let a rule add them automatically. Search with #tag.',
    why: 'Categories answer “what was it for”; tags answer “which project or trip was it part of”. You need both.',
    seeAlso: ['search-operators', 'rules'],
  }),
  e({
    id: 'search-operators',
    title: 'Search operators',
    what: 'A small query language for finding transactions precisely instead of scrolling.',
    how: 'Combine free text with operators: >100, <20, amount:12.50, before:2026-03, after:2026-01-15, account:visa, cat:food, payee:"whole foods", note:rent, #tag, is:uncategorised, has:attachment, and -term to exclude.',
    why: 'The difference between “I think I spent a lot on coffee” and a number you can act on.',
    example: 'cat:food >50 after:2026-01 -coffee',
    seeAlso: ['saved-view', 'tags'],
  }),
  e({
    id: 'saved-view',
    title: 'Saved views',
    what: 'A search you keep, with its filters and period, one click away.',
    how: 'Build a query on the Transactions page and save it. Saved views live in settings and survive export.',
    why: 'The queries worth running are the ones you run every month; saving them turns a chore into a click.',
    seeAlso: ['search-operators'],
  }),

  /* --------------------------------------------------------------- Wallet --- */
  e({
    id: 'account-balance',
    title: 'Account balance',
    what: 'What an account holds right now: its opening balance plus everything that has happened in it.',
    how: 'Opening balance, plus income, minus expenses, plus transfers in, minus transfers out. Credit cards run negative.',
    formula: 'opening + income − expenses + transfers in − transfers out',
    why: 'The opening balance is the anchor. Get it wrong once and every derived number is wrong forever.',
    seeAlso: ['liquid-balance', 'reconciliation'],
  }),
  e({
    id: 'reconciliation',
    title: 'Reconciliation',
    what: 'Checking your books against a real statement and marking what matches.',
    how: 'Enter the closing balance for a date; the app shows the difference and lists the unreconciled transactions. Marking them cleared sets the status to reconciled.',
    why: 'It is the only mechanism that catches a missed or duplicated transaction. Without it, drift accumulates silently.',
    seeAlso: ['status', 'data-health'],
  }),
  e({
    id: 'archive-account',
    title: 'Archiving an account',
    what: 'Hiding a closed account while keeping every transaction it ever held.',
    how: 'Archive instead of delete. Archived accounts are excluded from balances and pickers but remain fully searchable.',
    why: 'Deleting an account with history takes its transactions with it. Archiving keeps your year in review intact.',
    seeAlso: ['account-balance'],
  }),

  /* ---------------------------------------------------- Budgets & periods --- */
  e({
    id: 'budget',
    title: 'Budgets',
    what: 'A limit per category for a period, with progress and remaining shown live.',
    how: 'Set a limit, choose weekly, monthly, quarterly or yearly, and optionally let unused money roll over. Split transactions count against every category they touch.',
    why: 'A budget you can see the pace of is a budget you keep. A limit with no feedback is just a wish.',
    seeAlso: ['rollover', 'burn-down', 'fifty-thirty-twenty'],
  }),
  e({
    id: 'rollover',
    title: 'Rollover',
    what: 'Unused budget carrying into the next period instead of resetting to zero.',
    how: 'Turn it on per budget. The carried amount is added to next period’s limit and shown separately so you can see what is genuinely new.',
    why: 'Annual costs like car maintenance do not arrive monthly. Rollover lets you save budget the way you save money.',
    seeAlso: ['budget', 'burn-down'],
  }),
  e({
    id: 'burn-down',
    title: 'Burn-down',
    what: 'How today’s spending compares with the pace the period allows.',
    how: 'Remaining budget divided by remaining days in the period, compared with your actual average for the period so far.',
    formula: 'remaining ÷ days left vs spent ÷ days elapsed',
    why: 'Being at 60% of a budget is fine on day 25 and alarming on day 8. Burn-down is what tells the two apart.',
    seeAlso: ['budget', 'period'],
  }),
  e({
    id: 'fifty-thirty-twenty',
    title: 'The 50/30/20 split',
    what: 'A starting point for budget limits: 50% needs, 30% wants, 20% saving and debt.',
    how: 'The budget templates use either this split or the average of your last three months, whichever suits your history better.',
    why: 'It is a default, not a rule. Its value is giving you a number to argue with instead of a blank field.',
    seeAlso: ['budget', 'savings-rate'],
  }),
  e({
    id: 'period',
    title: 'Periods and month start',
    what: 'The window budgets and reports measure against, which need not be the calendar month.',
    how: 'Set the month start day in settings — day 25 makes the period run from the 25th to the 24th, matching a payday cycle.',
    why: 'Budgets measured on the wrong window show phantom overspend on the day your salary lands.',
    seeAlso: ['budget', 'compare'],
  }),

  /* ---------------------------------------------------------------- Goals --- */
  e({
    id: 'goal',
    title: 'Goals',
    what: 'A target amount with a deadline, optionally linked to a real account.',
    how: 'Set the target and deadline. Linking an account derives “saved” from the account balance, so the goal tracks reality instead of a number you must remember to update.',
    why: 'An unlinked goal is a manual bookkeeping task you will eventually forget. A linked one cannot drift.',
    seeAlso: ['goal-pacing', 'savings-rate'],
  }),
  e({
    id: 'goal-pacing',
    title: 'Goal pacing',
    what: 'What a goal actually requires per day or month from here to its deadline.',
    how: 'Remaining amount divided by the days left, compared with the monthly contribution you set.',
    formula: '(target − saved) ÷ days remaining',
    why: 'It converts a distant number into a monthly commitment you can compare against safe to spend.',
    seeAlso: ['goal', 'safe-to-spend'],
  }),

  /* --------------------------------------------------------- Bills & rules --- */
  e({
    id: 'recurring',
    title: 'Recurring bills',
    what: 'Anything that repeats: rent, subscriptions, salary, insurance.',
    how: 'Set amount, frequency and next date. Auto-post creates the transaction on the day; otherwise you get a reminder and post it yourself.',
    why: 'Bills are the biggest claim on future cash. Tracking them is what makes safe to spend meaningful.',
    seeAlso: ['variable-bill', 'auto-match', 'forecast'],
  }),
  e({
    id: 'variable-bill',
    title: 'Variable bills',
    what: 'A recurring bill whose amount changes each cycle — electricity, phone, heating.',
    how: 'Mark it variable and the app estimates the next charge from the average of recent posts instead of using a fixed amount.',
    why: 'A fixed estimate for a seasonal bill understates winter and overstates summer, which wrecks the forecast exactly when it matters.',
    seeAlso: ['recurring', 'forecast'],
  }),
  e({
    id: 'auto-match',
    title: 'Auto-matching bills',
    what: 'An incoming or outgoing transaction that settles a bill, recognised instead of double-counted.',
    how: 'Within a few days and a small tolerance of the scheduled amount, a matching transaction settles the bill rather than creating a second row.',
    why: 'Without matching, every manually paid bill appears twice — once scheduled, once real — and your spending doubles.',
    seeAlso: ['recurring', 'transaction'],
  }),
  e({
    id: 'detected-recurring',
    title: 'Detected recurring',
    what: 'Payees that repeat on a steady cadence but are not tracked as bills yet.',
    how: 'The detector needs three or more charges, a median gap of at least five days and a reasonably consistent amount; it reports a confidence with each suggestion.',
    why: 'Forgotten subscriptions are the classic slow leak. Detection finds them without you having to remember to look.',
    seeAlso: ['recurring', 'subscription-creep'],
  }),
  e({
    id: 'rules',
    title: 'Categorisation rules',
    what: 'If-this-then-that for transactions: match a payee, amount, weekday or note and set category, tags or a renamed payee.',
    how: 'Rules run on new transactions, or in bulk over existing ones. They are evaluated in order and the first match wins.',
    why: 'Rules remove the repetitive part of categorising, which is the part that makes people stop.',
    seeAlso: ['why-category', 'alias', 'tags'],
  }),
  e({
    id: 'why-category',
    title: 'Why this category?',
    what: 'An explanation of which rule put a transaction in its category.',
    how: 'The transaction modal shows the matching rule and the field it matched on, so you can edit or disable it.',
    why: 'A category you cannot explain is a category you cannot trust, and rules quietly drift as merchants rename themselves.',
    seeAlso: ['rules', 'alias'],
  }),
  e({
    id: 'alias',
    title: 'Merchant aliases',
    what: 'A mapping from a raw statement name to the name you actually recognise.',
    how: 'AMZN*MKTP US*2K4 becomes Amazon. Aliases are applied during matching and detection so the same merchant groups together.',
    why: 'Statement descriptors are designed for banks, not humans. Without aliases the same shop appears as four payees.',
    seeAlso: ['rules', 'detected-recurring'],
  }),

  /* ---------------------------------------------------------- Investments --- */
  e({
    id: 'lot',
    title: 'Tax lots (FIFO)',
    what: 'Each purchase recorded separately, so a sale knows which units it is selling.',
    how: 'Lots are consumed oldest-first when you sell, which determines the cost basis of the sale.',
    formula: 'realised P&L = sale proceeds − cost of the oldest lots consumed',
    why: 'Without lots, selling part of a position produces an arbitrary gain figure that will not match your broker.',
    seeAlso: ['realised-pnl', 'holdings-value'],
  }),
  e({
    id: 'realised-pnl',
    title: 'Realised P&L',
    what: 'Profit or loss locked in by sales you have already made.',
    how: 'Sum of proceeds minus the FIFO cost basis of the lots consumed by each sale.',
    why: 'It separates what you have actually banked from what the market is currently offering you.',
    seeAlso: ['lot', 'xirr'],
  }),
  e({
    id: 'xirr',
    title: 'XIRR (money-weighted return)',
    what: 'The annualised return of a portfolio that accounts for *when* you put money in.',
    how: 'Solves for the rate that makes every cash flow — buys, sells, dividends — net to zero at today’s value.',
    why: 'It answers the question you actually have: what did my decisions earn? A big deposit just before a rise does not flatter you.',
    seeAlso: ['twr', 'realised-pnl'],
  }),
  e({
    id: 'twr',
    title: 'TWR (time-weighted return)',
    what: 'The return of the underlying investments, ignoring your deposits and withdrawals.',
    how: 'Compounds the return of each sub-period between cash flows, so contributions cannot distort the result.',
    why: 'It is the number to compare against a benchmark index. XIRR vs TWR together tell you whether your timing helped or hurt.',
    seeAlso: ['xirr'],
  }),
  e({
    id: 'rebalance',
    title: 'Rebalancing',
    what: 'Trades that move your allocation back to the targets you set.',
    how: 'Set a target percentage per holding; the app compares current weights with targets and suggests the trades that close the gap.',
    why: 'Winners grow into an oversized share of risk. Rebalancing is how a plan survives a good year.',
    seeAlso: ['holdings-value', 'lot'],
  }),
  e({
    id: 'holdings-value',
    title: 'Holdings value',
    what: 'What your portfolio is worth at the last prices you entered.',
    how: 'Quantity times price per holding, converted to your base currency. Prices are manual, so staleness is on you.',
    why: 'A stale price quietly misreports net worth, allocation and every rebalancing suggestion built on it.',
    seeAlso: ['net-worth', 'rebalance'],
  }),
  e({
    id: 'dividend',
    title: 'Dividends',
    what: 'Income a holding has paid you, tracked against the holding rather than as generic income.',
    how: 'Record dividends on the holding; they appear in portfolio income and feed the XIRR cash flows.',
    why: 'Treating dividends as ordinary income hides your actual yield and understates total return.',
    seeAlso: ['xirr', 'holdings-value'],
  }),

  /* ---------------------------------------------------------------- Debts --- */
  e({
    id: 'apr',
    title: 'APR',
    what: 'The yearly interest rate on a debt, applied monthly to the outstanding balance.',
    how: 'Interest accrues once a month on the current balance using one twelfth of the annual rate.',
    formula: 'monthly interest = balance × (APR ÷ 100 ÷ 12)',
    why: 'Minimum payments on high-APR debt can go almost entirely to interest, which feels like paying and is barely paying.',
    seeAlso: ['amortisation', 'avalanche'],
  }),
  e({
    id: 'amortisation',
    title: 'Amortisation schedule',
    what: 'The month-by-month breakdown of interest, principal and remaining balance.',
    how: 'Each month: interest is charged, the payment covers it first, and whatever is left reduces the balance.',
    why: 'It shows how long a payment level really takes and how much of it is going nowhere.',
    seeAlso: ['apr', 'avalanche'],
  }),
  e({
    id: 'avalanche',
    title: 'Avalanche vs snowball',
    what: 'Two strategies for paying several debts at once: cheapest rate first, or smallest balance first.',
    how: 'Avalanche sorts by APR and minimises total interest. Snowball sorts by balance and clears accounts fastest.',
    why: 'Avalanche is mathematically cheaper; snowball is often more sustainable. Knowing the cost of the choice lets you make it deliberately.',
    seeAlso: ['amortisation', 'apr'],
  }),

  /* ------------------------------------------------------------- Analysis --- */
  e({
    id: 'sankey',
    title: 'Sankey diagram',
    what: 'A flow view of where money went: income into categories, categories into totals.',
    how: 'Widths are proportional to amounts in the selected period, with refunds netted out of their category.',
    why: 'It shows relative size and structure at once, which a list of numbers makes you reconstruct mentally.',
    seeAlso: ['drill-down', 'compare'],
  }),
  e({
    id: 'heatmap',
    title: 'Spending heat-map',
    what: 'A 365-day grid where each cell is one day’s spending, shaded by size.',
    how: 'Click any cell to drill into that day. The pattern of light and dark days matters more than any single one.',
    why: 'Spending is rhythmic. The grid reveals payday spikes, weekend habits and quiet stretches that averages erase.',
    seeAlso: ['drill-down', 'anomaly'],
  }),
  e({
    id: 'drill-down',
    title: 'Drill-down',
    what: 'Going from an aggregate to the individual transactions behind it.',
    how: 'Click a category, a chart segment or a heat-map cell to see the rows that produced the number.',
    why: 'Every aggregate hides its causes. The click from “Dining is up 40%” to the five restaurants is the useful part.',
    seeAlso: ['heatmap', 'sankey'],
  }),
  e({
    id: 'anomaly',
    title: 'Anomalies',
    what: 'Expenses far outside their own history for that payee or category.',
    how: 'Mean plus two standard deviations over previous occurrences, needing at least three data points and 120 days of lookback.',
    why: 'It catches duplicates, card errors and one-off mistakes — the transactions you would never find by scrolling.',
    seeAlso: ['heatmap', 'data-health'],
  }),
  e({
    id: 'subscription-creep',
    title: 'Subscription creep',
    what: 'Subscriptions whose price rose, or that stopped being used.',
    how: 'Monthly cost now versus the monthly average of earlier cycles, plus how many cycles have passed with no transaction.',
    why: 'Each increase is small enough to ignore and large enough to matter annually. Unused ones are pure loss.',
    seeAlso: ['detected-recurring', 'recurring'],
  }),
  e({
    id: 'compare',
    title: 'Comparing periods',
    what: 'Two months, quarters, years or custom ranges side by side, with the differences named.',
    how: 'Category and payee differences are ranked, and the largest movers are called out as the drivers of the change.',
    why: 'A total that moved 12% tells you nothing. The two categories responsible tell you what to do.',
    seeAlso: ['period', 'drill-down'],
  }),
  e({
    id: 'year-in-review',
    title: 'Year in review',
    what: 'A narrative of one year: totals, biggest categories, longest no-spend streak and standout months.',
    how: 'Computed from your transactions for the selected year, with refunds netted and transfers excluded.',
    why: 'It turns a year of rows into a story you can actually remember and compare with next year.',
    seeAlso: ['compare', 'savings-rate'],
  }),
  e({
    id: 'tax-deductible',
    title: 'Tax-deductible categories',
    what: 'Categories flagged so their spending can be exported for a tax return.',
    how: 'Mark categories as deductible; the Reports page totals and exports only those.',
    why: 'Reconstructing a year of deductible spend in April is miserable. Flagging as you go costs nothing.',
    seeAlso: ['attachment', 'tags'],
  }),
  e({
    id: 'data-health',
    title: 'Data health',
    what: 'The problems that quietly make every number on every page wrong.',
    how: 'Checks for uncategorised rows, orphan transactions, unbalanced splits, stale prices, missing rates and more, each with a one-click fix where one exists.',
    why: 'A dashboard is only as trustworthy as its inputs. This page is where you earn that trust back.',
    seeAlso: ['reconciliation', 'anomaly'],
  }),

  /* --------------------------------------------------------- System & data --- */
  e({
    id: 'base-currency',
    title: 'Base currency',
    what: 'The single currency every total in the app is expressed in.',
    how: 'Set it in settings. Each account keeps its own currency, and amounts are converted for display and totals.',
    why: 'Without one base currency, summing a dollar account and a euro account produces a meaningless number.',
    seeAlso: ['rate-used', 'to-amount'],
  }),
  e({
    id: 'rate-used',
    title: 'Rate used',
    what: 'The exchange rate recorded on a cross-currency transaction at the time it was converted.',
    how: 'Stored per transaction so an old transfer still shows the rate it actually used, not today’s rate.',
    why: 'Auditing a past figure with today’s rate gives a different answer, which looks like a bug and is not one.',
    seeAlso: ['to-amount', 'base-currency'],
  }),
  e({
    id: 'to-amount',
    title: 'Destination amount',
    what: 'What the receiving account actually got in a cross-currency transfer.',
    how: 'Enter the amount that landed in the destination account; the app derives and stores the implied rate.',
    why: 'Transfers between currencies are not one amount — recording both sides keeps each account’s balance true.',
    seeAlso: ['rate-used', 'base-currency'],
  }),
  e({
    id: 'import',
    title: 'Importing statements',
    what: 'Bringing bank data in from CSV, OFX or QIF instead of typing it.',
    how: 'Map the columns once (or accept the guess), preview the rows, then import. Dates and amounts are parsed loosely to cope with regional formats.',
    why: 'Manual entry is where data entry stops. Import makes keeping the books current cheap enough to keep doing.',
    seeAlso: ['import-batch', 'rules'],
  }),
  e({
    id: 'import-batch',
    title: 'Import batches',
    what: 'A group of imported rows that can be reviewed or rolled back together.',
    how: 'Every imported row carries its batch id. Undo removes exactly the rows from that import and nothing else.',
    why: 'A bad mapping should be a two-second mistake, not an afternoon of finding and deleting rows by hand.',
    seeAlso: ['import'],
  }),
  e({
    id: 'backup',
    title: 'Backups and restore',
    what: 'A full export of your data, and a verified path back from it.',
    how: 'Export to JSON, and restore by loading the file. Backups are verified so a truncated file is rejected rather than silently applied.',
    why: 'Local-first means the file *is* your data. An untested backup is not a backup.',
    seeAlso: ['sync', 'sql-console'],
  }),
  e({
    id: 'sql-console',
    title: 'SQL console',
    what: 'Direct read access to the underlying SQLite database.',
    how: 'Write a SELECT and run it against the live database. Use it for questions the interface does not have a screen for.',
    why: 'Your data should never be locked behind someone else’s idea of what you want to ask.',
    seeAlso: ['backup'],
  }),
  e({
    id: 'passcode-lock',
    title: 'Passcode lock',
    what: 'An automatic lock after a period of inactivity.',
    how: 'Set the minutes in settings; the app locks itself when idle and asks for the passcode on return.',
    why: 'A finance app left open on a shared machine is an invitation. Auto-lock closes it without you remembering.',
    seeAlso: ['backup'],
  }),
  e({
    id: 'pwa',
    title: 'Installable app',
    what: 'The dashboard installed to your home screen or desktop, running offline.',
    how: 'Install from the browser menu. A service worker caches the shell so it opens without a network.',
    why: 'It starts instantly and works on a train, which is most of the value of an app over a browser tab.',
    seeAlso: ['sync'],
  }),
  e({
    id: 'sync',
    title: 'Sync and multi-tab',
    what: 'How changes reach the database and how open tabs stay consistent.',
    how: 'Writes are incremental operations pushed to the server; other tabs and devices apply those operations through a broadcast channel and remote-change events.',
    why: 'Two tabs open with the same data is the classic way to lose an edit. This is what prevents it.',
    seeAlso: ['backup', 'pwa'],
  }),

  /* ------------------------------------------------------------- Progress --- */
  e({
    id: 'xp',
    title: 'XP and levels',
    what: 'Points for the habits that make your numbers correct — never for spending less.',
    how: 'Logging earns 10, categorising 6, a split 8, a receipt 6, reconciliation 40, a goal contribution 15, the weekly review 120. Each event has a daily cap and everything is bounded by 200 XP a day.',
    formula: 'level n requires 60 × n^1.45 XP to clear',
    why: 'Caps stop a bulk import from levelling you overnight, and the daily ceiling means consistency beats intensity.',
    seeAlso: ['streak', 'badges', 'quests'],
  }),
  e({
    id: 'streak',
    title: 'Streaks and grace tokens',
    what: 'Consecutive days of activity, with earned grace instead of punishment.',
    how: 'One day keeps the chain; two days spends a grace token if you have one. Every seventh consecutive day earns a token, up to two.',
    why: 'A streak that dies the first time life happens teaches you to stop caring. Grace keeps it worth keeping.',
    seeAlso: ['xp', 'quests', 'weekly-review'],
  }),
  e({
    id: 'badges',
    title: 'Badges',
    what: 'Milestones computed deterministically from your data, in bronze, silver and gold.',
    how: 'Every badge is a rule with thresholds; locked badges show exactly what is left (“Reconcile 6 accounts — 4 / 6”).',
    why: 'Because they are rules over your real data, they cannot be gamed and they never expire or get taken away.',
    seeAlso: ['xp', 'seasons'],
  }),
  e({
    id: 'quests',
    title: 'Quests',
    what: 'Three daily challenges and one weekly mission, generated from your own averages.',
    how: 'Targets come from your trailing data — your typical daily count, your uncategorised backlog, the bills due this week — and the same date always produces the same board.',
    why: 'Difficulty that tracks your own baseline stretches you without being arbitrary or impossible.',
    seeAlso: ['xp', 'weekly-review'],
  }),
  e({
    id: 'weekly-review',
    title: 'Weekly review',
    what: 'Five short steps that leave the books correct and earn 120 XP.',
    how: 'Uncategorised, then bills, then budgets, then newly detected recurring, then a summary. Every step can be skipped.',
    why: 'Small errors compound silently. One structured pass a week catches them while they are still cheap.',
    seeAlso: ['search-operators', 'data-health', 'quests'],
  }),
  e({
    id: 'coach',
    title: 'The coach',
    what: 'One data-driven nudge a day, never a modal and never a nag.',
    how: 'Candidates are ranked — uncategorised first, then cash risk, then optimisation — and the top one that is not dismissed is shown. Quiet hours suppress everything, and dismissals stick.',
    why: 'A dashboard shows you the state; the coach tells you the one thing worth doing about it today.',
    seeAlso: ['data-health', 'safe-to-spend', 'detected-recurring'],
  }),
  e({
    id: 'seasons',
    title: 'Seasons',
    what: 'Monthly records where you compete with your own past months, not with anyone else.',
    how: 'Each month is scored on four fair metrics — days logged, share categorised, reviews completed, savings rate — and the best month for each is marked.',
    why: 'Comparing against other people is demoralising and meaningless. Comparing against your own March is useful.',
    seeAlso: ['badges', 'savings-rate'],
  }),
]

export const helpById = new Map(HELP.map((h) => [h.id, h]))

export const HELP_IDS = HELP.map((h) => h.id)

export interface HelpGroup {
  group: string
  ids: string[]
}

export const HELP_GROUPS: HelpGroup[] = [
  { group: 'Dashboard & money', ids: ['safe-to-spend', 'safe-to-spend-perday', 'safe-to-spend-buffer', 'forecast', 'liquid-balance', 'net-worth', 'savings-rate'] },
  { group: 'Transactions', ids: ['transaction', 'splits', 'status', 'refund', 'owed-by', 'attachment', 'tags', 'search-operators', 'saved-view'] },
  { group: 'Wallet', ids: ['account-balance', 'reconciliation', 'archive-account'] },
  { group: 'Budgets & periods', ids: ['budget', 'rollover', 'burn-down', 'fifty-thirty-twenty', 'period'] },
  { group: 'Goals', ids: ['goal', 'goal-pacing'] },
  { group: 'Bills & rules', ids: ['recurring', 'variable-bill', 'auto-match', 'detected-recurring', 'rules', 'why-category', 'alias'] },
  { group: 'Investments', ids: ['lot', 'realised-pnl', 'xirr', 'twr', 'rebalance', 'holdings-value', 'dividend'] },
  { group: 'Debts', ids: ['apr', 'amortisation', 'avalanche'] },
  { group: 'Analysis', ids: ['sankey', 'heatmap', 'drill-down', 'anomaly', 'subscription-creep', 'compare', 'year-in-review', 'tax-deductible', 'data-health'] },
  { group: 'System & data', ids: ['base-currency', 'rate-used', 'to-amount', 'import', 'import-batch', 'backup', 'sql-console', 'passcode-lock', 'pwa', 'sync'] },
  { group: 'Progress', ids: ['xp', 'streak', 'badges', 'quests', 'weekly-review', 'coach', 'seasons'] },
]

/** Case-insensitive search over titles and every field of the explanation. */
export function searchHelp(q: string): HelpEntry[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return HELP
  const terms = needle.split(/\s+/)
  return HELP.filter((h) => {
    const haystack = [h.id, h.title, h.what, h.how, h.why, h.formula ?? '', h.example ?? '', ...(h.seeAlso ?? [])].join(' ').toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
}
