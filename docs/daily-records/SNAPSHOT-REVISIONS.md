# Daily valuation revisions

## Scope and limits of the record

These are **unconfirmed portfolio valuations**, not verified market closes, a
trade ledger, or investment-return evidence. Every new point retains
`quality: "unconfirmed"` and `signalHold: true`. No quote source, request, manual
price feature, storage key, deployment, or actual user-data operation is added.
The user's reported asset removal is not treated as verification of actual
holdings or silently applied to any saved data.

`ts` and `recordedAt` describe recording time. `receivedAt` describes quote receipt
only. None is copied into `priceAsOf`. Missing actual source time remains `null`
in new complete points, and missing fields remain absent in preserved legacy
points. A price change with unknown market time may be recorded as a changed,
unconfirmed valuation. It is never called newer market evidence or a final close.

## Pure appendDaily contract

`appendDaily(records, candidate)` performs no storage or network action and never
mutates either input. The caller may persist its complete returned `records` only
when `ok && changed`, after its existing restore/write guards pass.

- A new local date adds a complete point; all older daily rows stay intact.
- A changed, complete same-local-day candidate becomes the active daily point,
  with the prior canonical point preserved in a flat revision log.
- Receipt/recording-time-only changes return `ok: true`, `changed: false`,
  `action: "unchanged"`, and the original records reference. No additional
  revision is written, including at the revision cap.
- Added/removed holdings, changed quantities or recorded cost basis are explicit
  scope events, not investment gains or losses.
- A legacy same-day `{ts, val}` point can be revised automatically under the
  explicit `legacy-provenance-unverified` policy. Its exact JSON payload is kept;
  no cost, source time, components, or quality is backfilled into it. The new
  complete point carries an unknown-scope comparison hold.
- Multiple existing rows on the same local date are ambiguous and held unchanged.
- Recording-clock regression is held. Known `priceAsOf` moving backward or being
  replaced with unknown time is held for corresponding components and FX,
  including previously preserved evidence for an asset removed and re-added.
  A later receipt cannot override that hold. Equal recording timestamps can
  contain genuinely different evidence; they are not claimed to be later prices.
- Candidate provenance must be complete, internally coherent, and bounded. The
  validator checks component identities, currency/unit, positive quantities and
  prices, source clocks, manual metadata already supported by the baseline,
  required FX, aggregate value, and available component cost evidence. It rejects
  partial or corrupt metadata instead of treating it as an old legacy point.

Success returns `{ok, changed, action, reason, records}`, where action is
`appended`, `revised`, or `unchanged`. Failure returns
`{ok: false, changed: false, code, reason}` without modifying or truncating data.

## Flat preservation schema

The active row still exposes the ordinary snapshot fields for existing readers.
On the first same-day revision it additionally contains:

```json
{
  "dailyHistory": {
    "version": 1,
    "localDay": "2026-11-10",
    "entries": [
      {"point": "complete original snapshot object", "utcOffsetMinutes": -540},
      {
        "point": "complete accepted current snapshot object",
        "utcOffsetMinutes": -540,
        "reason": "price-change",
        "priceTime": "unknown"
      }
    ]
  }
}
```

The two quoted point descriptions above are explanatory placeholders; real
`point` values are JSON objects. The final `entries[].point` must exactly match
the active row with only `dailyHistory` omitted. Each earlier canonical point is
stored unchanged, including unknown extension fields and absent-field semantics.
Entries **never contain `dailyHistory`**. Further updates append the next complete
point, not a recursive copy of the prior wrapper. Thus the original point is kept
verbatim and subsequent canonical point payloads remain verbatim; the accumulated
wrapper is a projection and log container, not another price observation.

The first entry has no invented revision reason. Subsequent reasons are
`price-change`, `price-time-change`, `valuation-input-change`, `scope-change`, or
`legacy-provenance-unverified`. `priceTime` is `unknown`, `mixed`, or `known`; it
describes timestamp coverage, never trust, freshness, or exchange finality.

Local-day grouping follows the device's current local calendar, as before.
Recorded local dates and per-entry UTC offsets make existing logs independently
validatable after backup in another time zone. Inconsistent local-day metadata
is rejected. A same-day update whose current local date disagrees with its
existing log's date is held rather than regrouping or rewriting history.

## Explicit comparison holds

A new point whose scope cannot be compared safely contains:

```json
{
  "comparisonHold": true,
  "scopeChange": {
    "types": ["holdings"],
    "previousTs": 1794272400000,
    "changedAt": "2026-11-10T03:00:01.000Z",
    "returnComparable": false
  }
}
```

Types are `holdings`, `cost-basis`, `cost-basis-unknown`, and `legacy-unknown`.
The marker is produced for same-day **and across-day** transitions. Later
same-day price-only updates carry the same marker. The revision validator rejects
stripping or altering that carried marker. A later scope change records a new
explicit event; the earlier event remains in the flat history.

New evaluated components retain the entered `avgPrice`, allowing a real basis
edit to be distinguished from ordinary FX revaluation. This is historical evidence,
not permission to fill old missing costs. If an old complete point lacks
component basis evidence and total cost changes, the policy marks
`cost-basis-unknown` rather than guessing what changed.

`comparisonStatus(records, fromTs, toTs, currentCandidate?)` returns
`{hold, reasons}`. It holds insufficient/invalid history, legacy provenance,
explicit scope markers, component/quantity/basis mismatch, and optional live
candidate scope or known-source-time regression. It does **not** certify prices,
complete cash-flow coverage, or investment performance when `hold` is false.
Return/alpha/chart callers retain their other validity gates. Raw stored valuation
movement may be displayed with an explicit warning; it must not be relabelled an
investment return after an asset is removed or its quantity changes.

## Bounds and fail-closed behavior

- At most 50,000 daily rows per group.
- At most 64 prior revisions per day, i.e. 65 complete entries including current.
- At most 10,000 components per complete snapshot.
- JSON depth 30, total nodes 500,000, and serialized UTF-8 size 20 MiB.
- No sparse arrays, cycles, accessors, non-finite numbers, or non-JSON properties.

A long active session, including separate account/FX callbacks, can reach the daily
cap. Changed same-day values then remain on hold until another local date can be
appended, subject to the overall resource limits. The app must show the hold, not
claim a successful update. A full day can still receive an unchanged-evidence no-op. A genuine new revision
at its cap is rejected; it does not evict older entries. The same is true for
byte/node/depth/row limits. Resource checks apply to the full proposed history,
not only the new point. Invalid old rows or revision logs hold the operation.
There is no silent pruning, reset, clear, delete, or automatic repair path.

This is preservation and consistency checking, not a cryptographically signed
or tamper-proof audit log. No source timestamp or user holding is independently
verified by this policy.

## Backup v6 compatibility

No backup envelope version or storage allowlist changes. `v5_snap` carries the
new optional fields. The core uses the same pure record validator for provenance
and revision metadata; browser script order must load `has/snapshot-policy.js`
before `backup/core.js`. A missing policy blocks provenance-bearing records
rather than accepting unvalidated revisions.

The existing backup parser's duplicate-key, secret/HTML, structure, byte/node,
and restore-journal protections continue to apply. Full snapshot histories,
unknown safe extension fields, and legacy missing fields round-trip unchanged.
Absent snapshot groups still mean unknown/preserve current; an explicitly
supplied empty group retains the existing explicit-replacement behavior.
All verification here uses synthetic in-memory storage only.

## Focused verification

- `tests/daily-snapshot-revisions.test.cjs`: repeat/cap handling, flat complete
  preservation, legacy upgrade, source-clock/FX regression, scope changes,
  quantity and basis effects, comparison holds, invalid/partial metadata,
  non-JSON/resource refusal, and v6 round-trip/rejection without writes.
- Updated existing same-day expectations in `tests/snapshot-policy.test.cjs`
  and `tests/recording-independent.test.cjs` assert preserved payloads and active
  changed values rather than the retired first-write-wins behavior.
- Existing backup tests remain exercised with the no-network guard. Browser
  launches and aggregate suites requiring prohibited listeners are not retried.
