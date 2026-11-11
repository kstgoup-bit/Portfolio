# Safe daily snapshot policy

This is independent local development, tested only with synthetic data. It does not validate actual prices, connect a live API, migrate user records, restore a real backup, or publish the application.

## What changed

The existing portfolio model, account arrays, charts and snapshot storage key remain in use. Both the record button and automatic snapshots use `has/snapshot-policy.js`. Average purchase price is never a substitute for a missing current price. No instrument, including gold, has a hardcoded price or special bypass.

A missing quote still blocks its account and the overall snapshot. Other complete accounts may record independently. The UI identifies the blocked account, ticker and reason.

### Explicit manual prices

In each instrument's existing edit form, choose **수동 가격 사용(미확정)**, enter the price per unit of the holding, and enter the actual price timestamp. A holding measured in grams needs a per-gram price. Overseas accounts use USD; the other accounts use KRW.

The timestamp field is initially empty and labels the device's timezone. A valid user-entered local timestamp is converted to an ISO instant. Empty, invalid, future, rolled-over calendar dates and impossible local times are rejected. It is never initialized from the current clock or inferred from an old price.

Choose a maximum age of **1–4 days**, defaulting to 1 in the editor. This is a bounded user-input policy, **not a certification of market freshness**. The cutoff compares Korean calendar dates (Asia/Seoul), not elapsed 24-hour blocks. A price dated November 9 KST is allowed through November 10 KST with a one-day window. An expired manual price blocks recording until the user supplies an appropriate price/timestamp or changes the mode. The expiry window cannot be silently increased above four days.

Manual mode is an explicit per-instrument choice. Merely having a manual metadata object or failing a quote request does not enable it. Quote callbacks cannot overwrite a manual price. Switching back to quote mode removes the manual metadata and requires new quote evidence.

### Quote and FX evidence

A quoted price requires all of the following:

- A positive finite number within the numeric bound.
- An actual same-session receipt marker with a valid, nonfuture receipt timestamp no more than 24 hours old.
- Equality with the value captured at that receipt. A flag remaining after an edit is insufficient.

This only attests the value received by this app, not the upstream price's market timestamp, official origin or accuracy. GAS receipt timestamps are stored as `receivedAt`; unknown price timestamps stay `priceAsOf: null`.

Positive foreign exposure requires a positive finite USD/KRW rate actually received this session, bound to its captured value and receipt time. The snapshot path never calls the old display fallback `getRate()` and never invents 1370. Empty overseas accounts do not require FX. User-entered cash balances use `origin: entered-balance` with an unknown price timestamp; they are not market-verified cash quotes.

All new records remain **unconfirmed**, with **signalHold: true**, including all-manual records with a known timestamp. They must not be promoted to verified investment signals.

## Additive metadata

Existing stock fields are retained. Explicit manual configuration adds:

```json
{
  "pricingMode": "manual",
  "manualPrice": {
    "value": 125,
    "priceAsOf": "2026-11-10T10:00:00Z",
    "currency": "KRW",
    "unit": "per-held-unit",
    "maxAgeDays": 1
  }
}
```

New snapshot points preserve `ts`, `val`, `cost` and add:

- `schemaVersion: 1`, actual recording time `recordedAt`.
- `origin: manual-included | session-quote | entered-balance`.
- `quality: unconfirmed`, `signalHold: true`.
- `components`: account, stockId, ticker, quantity, price, currency, unit, origin, actual `priceAsOf` or null, actual `receivedAt` or null. Manual components also carry `maxAgeDays`.
- `manualComponents`: account, stockId, ticker, value, actual `priceAsOf`, currency, unit, `maxAgeDays`.
- `fx`: null, or the rate, USD/KRW pair, origin and separate timestamp fields.
- Top-level `priceAsOf`: oldest known component timestamp only if every contributing price timestamp is known and no unknown-timestamp FX is used; otherwise null.

No metadata is retrofilled on old rows. Backups must round-trip these additive fields without stripping provenance.

## Protection and failure behavior

- Every existing point on the current device-local day is preserved. Both recording paths refuse to overwrite it, even if the new value appears better. The status explains this behavior.
- Historical points are retained exactly, including old valid points that lack a cost field. No missing historical point is fabricated.
- Loading or reopening the app does not rename legacy pension deposit tickers/names (`DEP_PEN_계좌1`, `DEP_PEN_계좌2`) or rewrite their theme mappings. The previous automatic label migration was removed from `load()`, so a reviewed restore remains byte-for-byte intact and eligible for strict undo. Any future renaming requires a separate explicitly approved migration plan, not a startup side effect.
- Bad existing snapshot structures cause a refused write, never cleanup or replacement.
- Snapshot state is assigned in memory only after the single `v5_snap` storage write succeeds. Failure cannot report a successful recording or leave an in-memory-only new point.
- Evaluation is bounded to 10,000 input rows total across the selected accounts; duplicate or invalid stock IDs within an account are refused. Separate valid lots of the same ticker are retained with their distinct `stockId`. Existing daily lists are capped at 50,000 points without trimming or deletion.
- Prices and quantities are at most 1e12, FX at most 1e6, and totals at most `Number.MAX_SAFE_INTEGER`. Nonfinite values, negatives, unsupported modes and unit/currency mismatches are refused.
- Record module failure, missing FX evidence, and pending/malformed restore journals have no fallback to legacy recording.
- Quote callbacks capture the epoch and original instrument identity, ticker, quantity and mode. A stale response cannot update a replacement instrument, a changed holding or a manual-mode price.
- `invalidateSnapshotEvidence()` clears memory-only receipt evidence. `invalidateBackupRuntime()` also invalidates pending benchmark runs. The backup UI invokes these before explicit restore/undo work.
- Startup, load, save, guarded storage writes, quote requests/callbacks and benchmark fetch stages/merge stop while restore state is blocked. Before deferred backup code loads, the presence of any journal is conservatively blocked. A validated completed journal does not prevent normal operation.

This does not change the established display calculations outside the snapshot path, independently certify existing chart points, or provide a production-wide transaction lock across tabs. Further integration review must verify any other storage writers before deployment.

## Verification

Run the focused, network-blocked synthetic tests:

```sh
node --require ./tests/lib/no-network.cjs --test tests/snapshot-policy.test.cjs
```

The tests cover pure policy, bad and missing timestamps, calendar expiry, missing ordinary quotes, gold without a special rule, average-cost rejection, exact receipt binding, FX, zero holdings/cash, numeric limits, legacy/same-day preservation, storage failure, missing module/journal behavior, manual editor defaults/status, stale callback identity, and actual `load()` preserving legacy labels/theme bytes without writes.

The VM integration cases evaluate selected functions against synthetic in-memory storage and DOM stubs. They do not invoke app startup, migration, real user storage, network, Chromium or service workers. Browser/mobile visual QA and the previously denied full suite were not run as part of this work.
