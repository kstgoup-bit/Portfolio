# Offline GAS + KIS evidence comparison contract

This additive module does not replace GAS, change quote selection, or integrate with records, valuation, recommendations or signal generation. It contains no HTTP client, raw KIS response adapter, credential fields, storage, cloud provisioning, deployment, or order implementation. All examples are synthetic. An official-source label is not independent verification.

## Boundary and API

`HASKISComparison.compareJSON(text)` (CommonJS: `require('../has/kis-comparison')`) accepts only primitive JSON text, at most 8,192 UTF-8 bytes. Objects, coercion hooks, unknown members, duplicate members (including escaped equivalents), malformed JSON and invalid values are rejected. Output reflects neither raw values nor exceptions. All output fields are scalars in a frozen object, making output deeply frozen.

Envelope: `{ "version": 1, "gas": quoteOrNull, "kis": quoteOrNull }`.

Quote fields:

- `ticker`: uppercase alphanumeric identifier with optional dot/hyphen, 1–15 characters. Matching is exact; this is not a security-master lookup.
- `market`: `KR` or `US`.
- `exchange`: `KRX`, `NXT`, `NASDAQ`, `NYSE` or `AMEX`.
- `currency`: `KRW` for KR, `USD` for US.
- `priceKind`: `realtime`, `delayed` or `close`. These are supplied declarations, never freshness certification.
- `adjustment`: `raw`, `split-adjusted` or `total-return`.
- `exchangeTimestamp`: canonical UTC ISO time including milliseconds, for example `2026-11-09T06:00:00.000Z`. Must be a real calendar timestamp. Both sides must have the exact same string and instant.
- `price`: finite JSON number in `[1e-9, 1e12]`. Numeric strings are rejected.
- `delaySeconds`: integer 0–86,400, strictly positive and equal on both sides for delayed quotes (zero withholds as inconsistent). Absent/null or zero allowed for other kinds; positive delay with a non-delayed kind withholds comparison.
- `upstreamOrigin`: optional declaration `unknown`, `exchange`, `kis`, `yahoo` or `google`. Missing/null means unknown. Different labels are only distinct declarations, never proof of independence.

Any required metadata missing or null withholds comparison. Unknown enum values, unsupported venues or extra members reject the input. Equal unknown values cannot produce agreement. KR only permits KRX/NXT; US only permits NASDAQ/NYSE/AMEX. Integrated and daytime venues are not silently mapped to supported exchanges.

The contract deliberately does not normalize clocks, infer market calendars/timezones, substitute receipt time, guess real-time/delayed status, fetch instrument mappings, or manufacture raw KIS field mappings. If a supplied KIS price lacks a documented exchange timestamp, use null and the result is incomparable. A raw `stck_prpr` field alone is not acceptable evidence of same-time comparison.

## Results

- `status`: `agree`, `conflict`, `incomparable` or `invalid`.
- `reason`: fixed machine-readable code, such as `missing-exchangeTimestamp`, `different-exchange`, `missing-delaySeconds`, `price-disagreement` or `invalid-input`.
- `spreadPct`: null when withheld/rejected, otherwise `(max(price) - min(price)) / min(price) * 100`.
- `tolerancePct`: fixed 0.5 percent. Full-precision spread, not rounded display text, determines the threshold.
- `originRelationship`: `shared`, `distinct-declared` or `unknown`.
- Always `verification: "unverified"`, `independenceVerified: false`, `freshnessVerified: false`, `usableForSignals: false`, `liveConnection: "unavailable"`.

This is an offline historical/supplied same-time comparison, not a live adapter or a freshness/current-market check. Agreement means only that the supplied matching metadata and prices are within the fixed tolerance. Even identical historical or future timestamps do not certify freshness, current market status or authentic evidence. No reference clock is accepted in this version. Shared origin stays explicitly visible even if prices agree. Distinct origin declarations do not prove upstream independence. The result is informational, not an investment recommendation.

## Synthetic fixtures and focused verification

`HASKISComparisonFixtures.create(scenario)` supports `agree`, `conflict`, `shared-origin`, `missing-time`, `different-venue` and `missing-source`. It returns a new synthetic envelope each time.

Focused offline check:

```
node --require ./tests/lib/no-network.cjs --test tests/kis-comparison.test.cjs
```

Nine focused cases pass, covering trust flags, required matching dimensions, clock validation, receipt-clock refusal, delayed quotes, US venue comparison, JSON/secret boundaries, threshold precision, finite numeric bounds and duplicate keys. This is not a full-suite or browser validation claim. No live credentials, live calls, cloud changes or deployment were used. Actual order and auto-trading functionality are excluded.
