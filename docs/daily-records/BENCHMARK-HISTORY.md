# Benchmark history: local candidate boundary

Scope: local source and synthetic validation only, 2026-11-10. No provider request, credential access, deployment, production enablement, or real user storage/restore was performed for this change.

## What the numbers represent

- `KS200` is the existing storage key for **KODEX 200 ETF, Yahoo symbol `069500.KS`, KRW**. It is not a direct KOSPI 200 index feed. Both ISA (`dom`) and general (`gen`) use this ETF surrogate.
- `QQQ` (runtime `NDX`) is **QQQ ETF, USD**, a Nasdaq-100 surrogate, not the index itself. Overseas and pension use it. The overseas chart also shows **SPY ETF, USD**, an S&P 500 surrogate.
- The total-account comparator remains the existing fixed 20% KODEX 200 / 80% QQQ blend, not measured portfolio weights. ETF fees, distributions, currency effects and provider adjustment conventions can differ from the portfolio/index. The UI now says so.
- Source identity, exchange, symbol, currency, timezone, ETF instrument type, daily interval, numeric price domain, bar timestamp and strict exchange dates are checked before using a Yahoo response. This checks the supplied response contract; it does not independently authenticate Yahoo, certify final close, or validate adjustment/rights.
- Yahoo's daily-bar timestamp is retained as provided and explicitly is **not confirmed closing time**. `regularMarketTime` is the latest quote timestamp, not a per-bar close proof. Response receipt time is kept separate.

## Latestness and holiday handling

The prior three-day warning/four-day acceptance shortcut has been removed. A later receipt, today's legacy `fetchedAt`, or an unchanged last bar cannot establish latestness. The UI separately shows each ETF's last observed exchange date, available session-only receipt for newly appended observations, source and the statement **“최신성 미확인 · 거래일 달력·종가 확정 근거 없음.”**

Existing modules were reviewed rather than replaced:

- `has/quote-model.js`: reused its strict date/timestamp validation and market timezone conversion. Its legacy calendar-age `classify` shortcut is deliberately not used for benchmark latestness.
- `has/market-data.js`: its history-analysis contract requires OHLCV, explicit adjustment, complete session dates, close/publication time and rights declarations. A date-only GAS response cannot truthfully be promoted to that contract. This module is left unchanged.
- `has/close-evidence-sources.js`: curated negative evidence for a limited 2026 KR closure period; it is not a complete official calendar and grants no provider finality. It is not used to declare benchmarks current.
- `gas/has-history-request.gs`: the existing date-only `type=history` response deliberately states unverified adjustment and does not promise close finality. It is unchanged.

Weekend bars are rejected for these supported KR/US equity ETFs. No holiday, exceptional-session or finalized-close schedule is fabricated. A holiday stretch may leave the last observation several days old without proving either freshness or staleness.

## Preservation and concurrency

`has/benchmark-history-policy.js` is a pure policy module: no fetch, keys, storage or timers. `readCache`, `parseYahoo`, `parseGasHistory`, `mergeSeries` and `describe` are independently testable.

The persisted shape stays exactly the legacy allowlist: `KS200`, `QQQ`, `SPY` arrays of existing `{ts, close}` records, plus existing optional `fetchedAt`/`fetchedAtISO`. No key, migration, backup shape or snapshot format is added. Valid old point objects (including inert extra metadata) are retained unchanged.

- Malformed envelopes, mismatched identity/currency, null/invalid bars, partial parallel arrays, duplicate/unsorted exchange dates, future timestamps and invalid prices are rejected as a whole response.
- A response older than the stored latest observation is rejected. Equal latest date with no new observation causes no write and no new saved receipt. Differing prices on any overlapping date are held for a separately reviewed correction rather than silently overwriting history.
- Valid compact responses can only append dates later than the stored latest date. They cannot truncate, backfill or replace existing observations. Missing or failed symbols retain their original arrays.
- The application rereads and validates storage immediately before append. Existing invalid storage is not “repaired” or overwritten. A quota/write failure leaves runtime and saved history intact.
- Invalidated/stale request runs cannot complete after restore or a superseding request. A watchdog also invalidates its timed-out run.
- Source and receipt evidence is session-only, tied to the exact serialized saved series. A changed cache or reload cannot inherit that claim. A prefix from earlier cache remains explicitly source-unknown even if new observations have a validated Yahoo identity.
- Legacy global `fetchedAt` fields are preserved, never refreshed to make failed/stale/same data look new, and not relied upon as current per-symbol provenance.

## Disabled date-only integration

`parseGasHistory(payload, id, receivedAt, {mode: 'synthetic'})` consumes an explicit synthetic fixture matching the existing GAS contract. It returns strict `{d, c}` bars and source/currency/symbol information with `points: null`, `synthetic: true`, finality unverified and latestness unconfirmed. The adapter accepts neither an omitted mode nor a live mode. `liveGasEnabled` is a frozen `false`. There is no new GAS request URL, transport, UI activation setting, storage write or live-chart connection.

`mergeSeries` rejects synthetic/date-only results. This prevents inventing midnight, 14:30 UTC, or any other bar/close time to fit the old `{ts, close}` cache.

**Explicit local behavior change:** the old Alpha Vantage history branch is no longer called by this local candidate. It returned only dates, fabricated 14:30 UTC timestamps, and spent the saved key's quota. The unrelated Alpha Vantage financial-data feature is unchanged. The candidate retains existing Yahoo direct/proxy history transport but does not execute it in tests. If those legacy paths fail, existing history remains and latestness stays unconfirmed. Nothing here changes the currently deployed app.

Before any live GAS history use: obtain authorization for that exact transport/enablement; design and approve a date-only cache/backup migration or other explicitly dated representation; verify deployed response identity, source/rights, adjustment, coverage and correction policy; and add trustworthy calendar/finality evidence before making stronger claims. Do not simply flip a flag or synthesize a timestamp.

## UI and verification

Benchmark provenance/legend labels are at least 12px; the refresh target is at least 44px in both dimensions. The general-account chart is included in benchmark refreshes. Other chart math and snapshot provenance changes are documented separately.

Focused local check:

`NODE_PATH=/workspace/scratch/a69a663b2cde/dabi-lab-closure/node_modules node --require ./tests/lib/no-network.cjs --test tests/benchmark-history-policy.test.cjs`

Tests cover identity/currency/timezone, strict dates and price bounds, null/partial/older/conflicting responses, no mutation, compact append, source/receipt isolation, synthetic GAS disablement, receipt fingerprint changes, HTML script parse, age-shortcut removal and touch-target declarations. Independent application tests additionally exercise actual HTML functions with synthetic storage and mocked responses. Focused offline tests are not a live API, browser-layout, official-calendar, full-suite or production-readiness pass. Previously denied browser/socket and full runner checks were not retried.
