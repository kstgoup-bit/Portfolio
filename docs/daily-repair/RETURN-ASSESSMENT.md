# Read-only daily return assessment

The new `has/return-assessment.js` separates numerical calculation, provenance,
economic scope, and benchmark comparability. It is a pure CommonJS/browser module
(`HASReturnAssessment`) with no storage, network, credentials, provider selection,
or write path. `has/snapshot-policy.js` remains the authoritative, unchanged
snapshot validator and recorder. This module neither rewrites historical rows
nor changes `quality: "unconfirmed"` / `signalHold: true`.

## Public API and rendering contract

```js
const base = HASReturnAssessment.assess({
  key: 'gen',                   // dom | ov | pen | gen | all
  records: savedRows,           // caller-owned original snapshots
  targetTs: requestedStart,
  endTs: current.snapshot.ts,   // same captured clock, not a second Date.now()
  currentCandidate: current.snapshot,
  flows: originalDepositRows,
  flowAccounts: originalRowAccounts, // parallel context from actual containers
  evidence: []                  // optional exact user-declared transitions
});
const result = HASReturnAssessment.applyBenchmark(base, {
  valuePct: 4,
  fromTs: base.interval.fromTs,
  toTs: base.interval.toTs,
  currency: 'KRW',              // KRW | USD | mixed
  status: 'unverified',         // available | unverified | hold
  reasons: [],
  warnings: []
});
```

`assessReturnInterval` aliases `assess`. Passing `benchmark` to `assess` is also
supported. `applyBenchmark` reuses an already assessed portfolio result without
rescanning history. It does not mutate that result. Call it only with the original base
result issued by this module, and handle `interval === null` before selecting a
benchmark. Issued results are deeply frozen and admitted through a private
identity set: copied, forged, deserialized or mutated calculation payloads cannot
be passed back as trusted bases. Add UI-only details in a separate presentation
wrapper after assessment, not onto the issued result. Additional exports are `modifiedDietz`, `validateFlows`,
`validateEvidence`, `MAX_ROWS` and `MAX_TOTAL`.

Each result contains `interval`, `raw`, `dietz`, `benchmark`, `alpha`, `scope`,
`warnings`, `signalHold: true`, and `quality: "unconfirmed"`. Every metric has:

- `status`: `available`, `unverified`, or `hold`.
- `computable`: whether a bounded finite diagnostic numerical value exists.
- `valuePct`: that value, or `null`. Alpha is **percentage points**, not percent.
- `reasons`: blocking reason codes. `warnings`: nonblocking limitations.

**Render by `status`, not by `computable` or the presence of a number.** In
particular a scope-uncertain Dietz or currency-incomparable alpha can retain a
numerically computable value while `status` is `hold`. That diagnostic number
must not be presented as a usable investment return. `unverified` values may be
shown with their visible warnings. The module never certifies trading signals,
final closes, cash completeness, independent reconciliation, or whole-account
performance. Supplying benchmark `status: "available"` cannot certify those facts.

`raw` means **stored asset-value change**, not investment return. It remains
visible when flows, transition evidence or benchmarks fail. A benchmark failure
holds benchmark/alpha only, never raw/Dietz. Actual malformed snapshot/current
inputs still hold portfolio calculations. A zero starting value cannot form a
percentage; a valid zero historical ending value may show -100%.

### Endpoint selection

The selected start is the latest actual preserved observation at or before
`targetTs`. The current candidate, when supplied, is the endpoint and must be a
complete schema-v1 point with `currentCandidate.ts === endTs`. Explicit `null`
or `undefined` current input means incomplete current data, not permission to
use a saved/stale value. If `currentCandidate` is omitted, historical end is the
latest stored observation at or before `endTs`.

Preserved `dailyHistory.entries[].point` observations participate in selection.
A later active daily revision cannot hide an earlier preserved observation that
fits the requested boundary. At equal recording timestamps, the latest preserved
revision is selected; no elapsed time is invented. A selected start at or after
the endpoint is held. Two standalone records with the same timestamp are invalid.
A changed saved/current endpoint at an identical timestamp is ambiguous and held.
A matching saved/current endpoint is counted once.

`interval` discloses `requestedFromTs`, `requestedToTs`, actual `fromTs`, `toTs`,
`actualDays`, earlier-boundary flags, `startValue`, `endValue`, currency `KRW`, and
endpoint kind. Both Dietz weighting and benchmark/alpha comparison use these
actual boundaries. No `targetTs` substitution, interpolation, current-price
backfill, average-price substitution, historical cost filling or stored row
rewrite occurs. Missing legacy cost only warns; raw and Dietz do not use cost.
Malformed history is conservatively held globally, including outside-range rows;
this is not a permission to delete, repair or silently quarantine it.

## Flow schema: preserve legacy rows, classify only new rows

Existing rows are read exactly as supplied. Only an **own `activityVersion` field**
opts a row into the new schema. Old inert `version`, `id`, `kind`, `currency`,
`account`, or other metadata never reclassifies it. A legacy `{ts, amount}` (or
that shape with inert extensions) contributes its signed amount as previously
recorded and emits `legacy-flow-classification-unverified` and
`legacy-flow-time-unverified`. It is not asserted to be a reconciled external
flow. Read-only deterministic references are derived; IDs are not written back.

New precise-time rows:

```json
{
  "activityVersion": 1,
  "id": "flow-example-1",
  "account": "gen",
  "kind": "external-in",
  "ts": 1794232800000,
  "amount": 500,
  "currency": "KRW",
  "recordedAt": "2026-11-10T03:00:00Z",
  "timeCertainty": "instant"
}
```

Required kinds are `external-in`, `external-out`, `internal-buy`, `internal-sell`.
All new amounts are positive and denominated in **KRW**, including the recorded
KRW value of any overseas cash flow. USD is not silently accepted or converted
with today's FX. External outflows are negated in calculation; internal buys and
sells have **zero external capital effect**. An internal-trade kind alone is not
evidence that an observed holding disappearance was a sale or a normal rebalance.
Stable IDs are limited to 128 ASCII letters/digits/`_.:-`, starting alphanumeric.
Only the documented fields are accepted for new rows. `recordedAt` must be a
strict ISO timestamp no earlier than `ts`; it is not a market/source timestamp.

For new date-only entry, use `timeCertainty: "date-only"` and:

- `effectiveDate`: `YYYY-MM-DD`.
- `utcOffsetMinutes`: the offset at that local date's starting midnight, in the
  JavaScript `Date.getTimezoneOffset()` convention (KST = -540).
- `dateEndTs`: the actual next local calendar midnight captured by the device.
- `endUtcOffsetMinutes`: the offset at that next local midnight.

Capture next midnight by advancing the device's local **calendar date**, not
by adding 24 hours. The module verifies that `dateEndTs` is the next calendar
midnight expressed using the declared end offset, and that the declared span is
positive and at most 52 hours (the full mathematical range of allowed ±14-hour
offsets). This supports 23-hour and 25-hour days without guessing a timezone.
These are **device/user-declared calendar bounds**, not independently verified
zone rules. No claim of runtime coverage across all timezones is made. The
representative `ts` must lie in `[start,end)` and be no later than `recordedAt`;
it is not evidence of actual cash timing. For an entry recorded today, next
midnight can legitimately be later than `recordedAt`, because it is a calendar
uncertainty bound rather than a claimed future event.

Older typed date-only rows missing **both** new fields remain byte-preserved and
readable. Without the retained next-midnight boundary, their possible range is
conservatively widened to `[effectiveDate UTC midnight−14h, next calendar date
UTC midnight+14h)`, a 52-hour uncertainty envelope. It is not labelled an actual
local day. Exactly one new field, contradictory boundary/offset data, invalid
spans, or any date fields on a precise `instant` row are rejected. No missing
fields are synthesized into stored data.

A date-only external flow whose possible range intersects `(fromTs,toTs]` holds
Dietz with `flow-time-uncertain`, even if its representative timestamp lies
outside that interval. No midpoint weighting estimate is presented. A declared
range entirely outside the interval does not contaminate it. Internal date-only
activities still have zero capital effect.

`validateFlows(rows, key, flowAccounts)` returns `{ok:true, flows:[normalizedReadOnlyViews]}` or
`{ok:false, code}`. It rejects malformed/partial new metadata, account mismatch,
invalid dates, zero/nonfinite amounts, duplicate IDs and ambiguous duplicate
capital rows. It neither silently deduplicates nor rewrites any row. The key is
`all` by default. Optional `flowAccounts` is an out-of-band array parallel to the
original rows, supplied from their actual account containers, not copied from
legacy row metadata. Its length must match, each entry must be `dom`, `ov`, `pen`
or `gen`, a single-account key must match every entry, and a typed row's declared
account must match its container context. `assess` and `modifiedDietz` accept the
same optional input field. Identical timestamps and amounts from two different
account containers remain two flows; within-account duplicates remain held.
Without context, a flat `all` list of legacy rows cannot establish their original
account from inert metadata and ambiguous identical flows are held. Backups may
preserve such historical rows even when a requested calculation needs review.

### Dietz math

`modifiedDietz({key,startTs,endTs,startVal,endVal,flows,flowAccounts})` returns the same metric
shape, plus `netFlow`, `weightedFlow`, and `denominator` when calculable:

```text
flows: startTs < flow.ts <= endTs
weight = (endTs - flow.ts) / (endTs - startTs)
Dietz percent = 100 * (endVal - startVal - sum(externalFlow))
                    / (startVal + sum(weight * externalFlow))
```

Bounded finite intermediate sums, the numerator, denominator and result are
checked. Nonpositive weighted capital, overflow, malformed flows or uncertain
new date-only flow timing cannot produce an apparently usable return. This math
helper does not assess economic scope; use `assess` for user-facing performance.

## Minimal optional transition evidence

No historical trade ledger is reconstructed. No reconciliation UI or persistent
evidence store is implied by this module. Root integration may pass an empty
array and correctly leave unexplained historical scope transitions on hold.

The exact optional row is:

```js
{
  version: 1,
  id: 'event-example-1',
  account: 'gen',
  kind: 'internal-trade',
  fromTs: previousObservation.ts,
  toTs: nextObservation.ts,
  effectiveTs: actualDeclaredEventTime,
  recordedAt: '2026-11-10T03:00:00Z',
  timeCertainty: 'instant',
  source: 'user-entered',
  changes: [
    { componentId: 'gen:id:1', before: {
        ticker: 'SYNTH', quantity: 10, currency: 'KRW', unit: 'per-held-unit'
      }, after: null },
    { componentId: 'gen:id:2', before: null, after: {
        ticker: 'NEW', quantity: 10, currency: 'KRW', unit: 'per-held-unit'
      } }
  ],
  flowIds: [],
  externalAmount: 0,
  cashIncluded: true
}
```

`componentId` follows the snapshot identity, `account:id:<stockId>` or
`account:ticker:<ticker>` if historical stock ID is absent. `before`/`after`
contain exactly ticker, quantity, currency and unit, or `null` for absent assets.
The account's complete changed-component set and all before/after values must
match the exact adjacent observations at `fromTs`/`toTs`. An event must fall in
`(fromTs,toTs]`, with a recording time at or after its effective time. Multiple
competing events for the same account/observation pair are ambiguous and rejected.

Kinds: `internal-trade`, `external-flow`, `tracking-change`, `cost-correction`,
`unclassified`. Only the first two can explain economic scope, and only with
explicit `cashIncluded: true`. This is a **user declaration** that relevant cash
and proceeds are represented in the compared values, not independent proof.
Internal trades require empty `flowIds` and zero `externalAmount`. External-flow
evidence requires stable typed external flow IDs with the same account, exact
effective timestamp, and matching signed aggregate `externalAmount`. Legacy or
date-only flows cannot supply those exact links. A nearby deposit, partial
component list, wrong account, unknown source or alleged independently verified
source cannot remove a hold. Tracking exclusions and unclassified events remain
investment-interpretation holds. Cost-only corrections require no quantity/scope
changes and do not block raw/Dietz.

An original scope marker at or before the selected start does not contaminate a
wholly post-event interval. Intraday preserved transition points are considered.
Unexplained changes *inside* the interval still hold Dietz/alpha while displaying
raw stored-value change. Legacy scope is unavailable evidence and warns rather
than globally suppressing numerically computable history.

## Benchmark, units and FX

Benchmark input requires actual requested portfolio `fromTs`/`toTs`, finite
`valuePct`, `currency`, and metric `status`; optional string-array `reasons` and
`warnings` may disclose provider/date/conflict lag details. Wrong intervals hold
benchmark/alpha. Caller must retain the benchmark selector's actual dates and
lag warnings in its visible description; matching requested timestamps is not
proof that a date-only close was available intraday. This module does not select
prices or manufacture availability times.

HAS snapshot values are KRW, with overseas values translated using each recorded
point's FX. Raw/Dietz therefore include FX movement. A USD or mixed-currency
benchmark can be displayed separately with its units, but **alpha holds** with
`benchmark-currency-mismatch`. No current FX backfill, automatic FX conversion,
or assumption that fixed comparator weights measure actual allocation is made.

## Verification and limits

Synthetic focused tests cover the 1000 + 500 -> 1500 case (old requested interval
50%, actual snapshot interval 0%), legacy missing cost, one saved + current,
source-time regression, preserved intraday endpoints, starting-marker locality,
cost correction, exact declared rebalance, unexplained removal, wrong/partial
flow evidence, actual interval/currency alpha gates, date-only boundaries,
23-hour/25-hour DST boundaries, conservative older 52-hour date envelopes,
duplicate/malformed flows, getters/cycles, arithmetic bounds, no input mutation,
and no persistence/network dependencies.

Run locally with the existing no-network guard:

```sh
TZ=Etc/UTC node --require ./tests/lib/no-network.cjs --test tests/daily-return-assessment.test.cjs
TZ=Asia/Seoul node --require ./tests/lib/no-network.cjs --test tests/daily-return-assessment.test.cjs
TZ=America/New_York node --require ./tests/lib/no-network.cjs --test tests/daily-return-assessment.test.cjs
```

The same 74 focused cases passed in each timezone at this checkpoint, not 222
distinct cases. This is not browser, production, real-data, full-suite or live
provider verification. No real storage, network, keys, GAS/KIS, orders, main or
deployment was accessed. Existing recording policy remained unchanged. HTML,
backup versioning and consumers are owned and verified by the integration work.
