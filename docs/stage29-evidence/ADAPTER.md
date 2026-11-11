# Offline readonly evidence bridge

`has/advisor-evidence.js` exports `run(jsonText, nowISO)` (browser global `HASAdvisorEvidence`). It calls the existing `watch-engine.evaluateStock` and `advisor-core.analyze`; it does not implement a competing recommendation engine. The existing portfolio reader/advisor bridge and market-data workbench remain unchanged. This narrower bridge supplies evidence missing from their permissive external-object inputs and is not connected to the production app.

## Trust and operation boundary

- JSON text only, at most 200,000 UTF-8 bytes; no callbacks, object/getter inputs, network, storage, credentials, orders, or timestamp defaults.
- Root version is 1; mode is `synthetic` or `real`. Unknown keys, duplicate JSON keys (including escaped equivalents), and nesting beyond 20 levels are rejected. Optional malformed groups are withheld with issues; malformed root/quote yields invalid with no analysis.
- All outputs carry `trust: unverified`, `usableForSignals: false`, `realActiveCount: 0`. These are real-world applicability flags, not a prohibition on displaying clearly labeled synthetic test signals.
- `synthetic` invokes existing engines using their legacy verified flags solely for invented fixture simulation. Output basis and advice synthetic flags remain explicit. This does not authenticate a source or independently verify an investment assertion.
- `real` normalizes declarations but keeps quotes/financials unverified, weight basis unverified, and thesis/sell assertions unavailable to analysis. Existing engine returns hold/withheld and no active signals. Supplying KIS/GAS names, URLs, or invented enums cannot change this. Caller-supplied verification fields are not accepted. No KIS/GAS feature, login, source readiness or live activation is modified.
- This module cannot establish source authenticity, market holiday completeness, licensing, or real freshness from declarations alone. A future trusted-source integration requires separate design and verification, not toggling an input flag.

## Input contract

See `has/advisor-evidence-fixture.js` for a complete invented, executable example. No real securities or holdings are included.

Every evidence group carries an identity (`ticker`, US/KR `market`, USD/KRW `currency`, `venue`, `adjustment`) and provenance (`source`, `reference`, `asOfDate`). Adjustment is split-adjusted or total-return. Venues are NASDAQ/NYSE/AMEX for US and KRX for KR. Tickers use 1–32 uppercase letters/digits/dot/caret/hyphen (starting with a letter or digit). Positive price/revenue inputs are bounded to [1e-8, 1e12], monetary metrics to magnitude 1e15, and derived return/growth percentages to magnitude 1e6. Stock group identities must match exactly, including venue and adjustment. Provenance strings are labels, not proof. Dates are strict ISO dates; timestamps are explicit ISO timestamps. Future dates are rejected.

- `quote`: identity, provenance, positive finite price, asOfTime. Market date and provenance date agree. The source-labelled close is used only through the existing quote model.
- `high52w`: identity/provenance, startDate/endDate, `days`. Uses a rolling 365-calendar-date year-high approximation, not an authenticated official 52-week calendar. Requires exactly 365 consecutive calendar rows spanning 364 days through the quote date, at least 200 declared trading rows, and current close equal to quote. Each row has date and closed boolean; open rows require positive daily high and close with high >= close; closed rows contain no prices. Maximum is derived from daily highs, never the last quote or closes alone. Gaps, duplicates, reversed rows, shortened windows and inconsistent latest close are withheld. Daily session declarations remain unverified, particularly in real mode.
- `returns`: stock identity/provenance, startDate/endDate, startPrice/endPrice, and `benchmark` with its own identity/provenance and corresponding dates/prices. Benchmark ticker must differ and be explicit. Benchmark market/currency/adjustment and both period endpoints must match. The benchmark venue must also match in this conservative offline contract. Stock end price must match the quote. Returns are calculated from endpoints and are on a calendar-day basis. Existing watch engine separately limits euphoria review to 20–120 calendar days.
- `financials`: identity/provenance, currency, unit `currency-units`, current and previous periods. Each period has startDate/endDate, revenue, freeCashFlow, debtToEquity. Period lengths are 81–371 inclusive calendar dates, comparable within seven days and approximately one year apart. Periods cannot overlap or extend past provenance date. Revenue growth is calculated, not accepted as an asserted percent. Financial freshness uses period end, not an artificially recent publication date. Monetary scales other than explicit full currency units are withheld.
- `holding`: positive quantity/average cost, bounded weightPct/cashPct with sum <=100. This is fixture-only verified weight in synthetic mode; real declarations never become verified.
- `thesis`: explicit intact boolean and nonempty note, accepted for synthetic engine exercise only.
- `sellReviewEvidence`: matching stock identity, explicit periodStartDate/periodEndDate matching the current financial period, provenance; valuation overvalued boolean/note; competitiveThesis intact boolean/note; costs considered true, trimJustified boolean/note; holdAndReentryRisk considered true, trimJustified boolean/note. All are required for complete synthetic review and retain existing advisor freshness/gating rules. Costs must explicitly include a conclusion, not just an assertion they were considered.
- `settings`: optional reviewWeightPct in (0,100]. It is a review threshold, distinct from the existing buy target weight. A rise/threshold crossing alone is not a trim judgment.

## Checks

Run only this focused, network-blocked suite:

`node --require ./tests/lib/no-network.cjs --test tests/advisor-evidence.test.cjs`

Thirteen tests cover actual existing-engine synthetic analysis, unchanged input, real-mode nonactivation, unknown/verification/credential key rejection, text-size limits, window completeness/identity/adjustment, benchmark/period mismatch, financial periods/units/provenance, cost/hold/reentry/adjustable-weight withholding, review identity/period matching, duplicate-key rejection, known venue/ticker domains, and finite bounded derived values. No full npm suite or Chromium runs were performed for this deliverable.

Final integration verification: `node --require ./tests/lib/no-network.cjs --test tests/euphoria-stage29.test.cjs tests/advisor-evidence.test.cjs` passed 27/27. The bridge preserves the checked ticker/market/currency/venue/adjustment on both financial and sell-review engine records, including their synthetic mode and matching financial period. The positive synthetic trim test remains intact; no core gates were weakened to accommodate the adapter.

Malformed JSON/native exceptions return only a fixed safe input-error message; controlled validation failures use fixed diagnostic strings without raw input. Canary tests cover malformed roots, escaped keys/strings and nested malformed JSON. Tickers require actual string values. Returned results are deeply frozen, including applicability flags and nested analysis.

The adapter omits receipt/fetchedAt timestamps because no receipt evidence is provided. It never substitutes the analysis clock for a source receipt time.
