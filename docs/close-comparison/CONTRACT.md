# Declared official-close comparison v1

This pure local, synthetic-development module adds a separate same-session path. It does not modify `kis-comparison.js` or replace GAS. KIS remains an additional declared source. No provider mappings, requests, credentials, persistence, execution, or operational connection exist here. FX is outside this contract.

## Entry point and output

`HASCloseComparison.compareJSON(text)` (CommonJS supported) accepts only primitive JSON text, at most 12,288 UTF-8 bytes. Object inputs are rejected without coercion/getter execution. Unknown keys at every schema level, duplicate keys including escaped equivalents, malformed dates, invalid enums, and nonfinite/out-of-range prices fail with `invalid-input`, without echoing input. Price range is 1e-9 through 1e12. No unbounded text fields are accepted.

Results are frozen scalar-only objects: status `agree`, `conflict`, `incomparable`, or `invalid`; fixed reason; `spreadPct` (null unless comparable); tolerance 0.5%. Spread uses the smaller price denominator and full-precision threshold. Agreement means only that two declarations fit this contract and numerical tolerance. Every result remains `verification: unverified`, `freshnessVerified: false`, `independenceVerified: false`, `finalityVerified: false`, `calendarVerified: false`, `latestSessionVerified: false`, `usableForSignals: false`, `liveConnection: unavailable`. The comparison basis is `declared-historical-session`. Declared distinct upstream names do not prove independence.

## JSON envelope

Use `has/close-comparison-fixtures.js` for an entirely invented example. Envelope fields: `version: 1`, `analysisAt`, `calendar`, `gas`, `kis`. Timestamps use exact UTC ISO milliseconds. Null/missing evidence is withheld, not filled from the wall clock.

Each source has `source` (matching its gas/kis slot), `ticker`, `market`, `exchange`, `currency`, `tradingDate`, `price`, `definition`, `session`, `completion`, `adjustment`, `upstreamOrigin`, `provenance`, `closeEvidence`, `retrievedAt`, and optional `publishedAt` and `observedAt`. Comparison requires definition `official-regular-close`, session `regular`, completion `final`, adjustment `raw`, matching instrument/market/venue/currency/date, and known upstream origin. Provenance is either `synthetic` or `normalized-declaration`, matching both sources and calendar. These are declarations, not authenticated evidence.

Adjusted values, even matching adjustment labels, are withheld because corporate-action versions cannot be certified. Preliminary, extended-session, indicative, last-trade, mixed-market/currency, and unmatched source slots are withheld.

Calendar has `market`, `exchange`, `tradingDate`, `sessionType`, `scheduledCloseAt`, `provenance`, `timeZone`, `reference`. Reference enum is `synthetic-calendar-v1` for synthetic provenance, otherwise `normalized-calendar-declaration-v1`. These labels describe supplied evidence type; they do not authenticate an exchange or calendar. Source/venue/date matching and explicit supplied schedule are required; a matching date alone never suffices.

## Conservative schedule gate

Only KRX regular close at 15:30 Asia/Seoul, and NASDAQ/NYSE/AMEX regular close at 16:00 America/New_York or explicitly declared early close at 13:00 are supported. The built-in timezone rules account for US DST. Weekend declarations, mismatched timezone/reference, unsupported KR early sessions, and NXT closing semantics are withheld. Missing runtime timezone support is withheld. Other special closures are not guessed. Existing market-level calendar code is not used or changed.

This plausibility check is **not** a verified exchange holiday calendar. A declared weekday holiday could pass, but can never become verified or latest-session evidence. A trusted calendar ingestion/provenance review is future work. Reference labels alone do not certify trading-date validity.

`scheduledCloseAt` is a schedule, never an exchange-observed timestamp. Require close <= retrieval <= explicit analysis time. Publication time is optional and never fabricated; if supplied require close <= publication <= retrieval. Optional observation evidence must satisfy close <= observedAt <= publication (or retrieval when publication is absent).

`closeEvidence` is mandatory and represents the supplied reference for both official-close definition and finality: `synthetic-official-final-v1` for synthetic provenance, otherwise `normalized-official-final-declaration-v1`. Unknown/missing evidence is withheld independently of publication time. No arbitrary grace interval is invented. These reference labels are declarations, not authenticated proof; `finalityVerified` is always false. Actual KIS adapter work remains blocked until documented provider official-close definition and finality evidence are known. The module never fabricates missing publication or observation timestamps.

Historical declared-session comparisons are allowed even when stale. No latest-session, current-price, freshness, investment recommendation, or signal claim follows. Existing exact-time comparison remains separate and unchanged. All fixtures and tests are invented.
