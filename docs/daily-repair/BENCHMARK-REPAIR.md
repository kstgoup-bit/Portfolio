# Benchmark history repair: pure, local candidate

Scope: `has/benchmark-history-policy.js`, `tests/benchmark-repair.test.cjs`. Synthetic offline tests only. No provider requests, credentials, actual user storage, restore, cloud configuration, main update, push, deploy, orders or automatic trading. The parent implementation owns HTML transport, consumers and backup integration.

## Preserved baseline and date-native sidecar

The original `v5_benchHist` string remains unchanged. Inert old point fields are preserved but cannot establish source identity or receipt. The optional `v5_benchHistV2` sidecar has this strict schema:

```js
{
  version: 2,
  legacyFingerprint: 'sha256-utf16be-v1:<64 lowercase hexadecimal characters>',
  series: {
    QQQ: {
      symbol: 'QQQ', currency: 'USD', market: 'US',
      timezone: 'America/New_York',
      observations: [
        {
          id: 'o:sha256-utf16be-v1:<digest>',
          d: '2026-11-10', close: 102,
          source: 'alpha-vantage-daily',
          receivedAt: '2026-11-10T22:00:00.000Z',
          providerBarTs: null,
          dateKind: 'exchange-date-only',
          adjustment: 'unverified', finality: 'provisional'
        }
      ],
      conflicts: [
        // {d, existing: preservedPoint, alternative: observation,
        //  status: 'pending-review' | 'provisional-successor'}
      ]
    }
  }
}
```

Missing groups and explicit empty groups are supported. The same identity fields apply to SPY (USD, US) and KS200 (`069500.KS`, KRW, KR). KS200 is an ETF surrogate, not a direct index feed.

Legacy points contain genuine stored `ts` values, but their provenance is unknown: a timestamp is not claimed to be supplied by a provider or to represent a close. Yahoo observations retain actual supplied bar timestamps in `providerBarTs`, explicitly not confirmed closing instants. AV observations have `providerBarTs:null` and no `ts`. No timestamp is fabricated from a date, receipt, market close convention or metadata's last-refresh clock.

The raw legacy fingerprint uses SHA-256 over UTF-16BE code units of `S` plus the exact raw string, or `N` for a missing key. Whitespace, key order and null versus empty cache are distinct. It is a deterministic equality binding, not source authentication. A reference test compares the implementation with Node's SHA-256 implementation. Runtime committers must still reread both raw keys and compare exact expected values immediately before writing. LocalStorage does not provide atomic cross-tab compare-and-swap; the policy module does not pretend to solve that limitation.

## Conflict-local preservation

For an unequal overlap, including a price difference of 0.0001, the old active point stays unchanged and the new alternative is retained with its source and receipt. Unrelated dates later than the previous latest date append in the same successful result. No generic tolerance, old-value overwrite, gap backfill or pruning occurs. Repeated identical alternative/source/timestamp evidence is deduplicated without refreshing its receipt. Ordinary conflicts remain pending review.

A stored point explicitly marked provisional may receive a successor on a later exchange date, from the same source, provided that date has no pending conflict. Both originals are retained, including their original references in a pure merge. The successor can have the same or different price. It is still `unverified`, never finalized. `readStore` derives the active view from the retained successor evidence; it does not rewrite the original observation. Further unequal changes to that unverified successor become ordinary pending conflicts. A source switch is not enough to supersede provisional evidence. Merely becoming an older date does not establish finality: an unchanged provisional observation retains that status.

Limits are 2,000 active dates per symbol, 256 alternatives per symbol and 2,000,000 string code units per store/raw input. The byte-named bound is a conservative JavaScript storage/string-length guard, not an assertion about a browser's byte quota. Bound failures leave the complete input store untouched and do not append even unrelated dates in that failed operation. Actual storage quota failure remains the committer's responsibility.

## Isolation and legacy compatibility

`readCache` and `readStore` distinguish envelope validity from individual series validity. An invalid QQQ group does not hide valid KS200 or SPY groups. Each consumer must check `result.series[id].ok`; top-level `ok:true` is not permission to use a quarantined series. The original object/string remains available and is never relabelled as valid source evidence.

Two legacy points with strictly increasing timestamps but the same exchange date are an explicit compatibility case: `validateSeries(rows,id,now,{allowDuplicateDates:true,legacyOnly:true})` reports a read-only quarantined result and the duplicate dates. `readCache` keeps that group's original point reference but sets its `ok:false`. There is no automatic deletion, merging or replacement. Other symbols can still append. This resolves the prior runtime/backup validator mismatch without silently rewriting existing backups.

Legacy raw JSON rejects duplicate keys at any depth instead of silently accepting JSON.parse's last duplicate value. Public data boundaries reject getters without invoking them, unexpected prototypes, cycles, sparse arrays, hidden fields, nested undefined, nonfinite numbers, excessive nesting and oversized strings. Existing harmless enumerable JSON metadata on legacy points stays intact.

## Public API for consumers and backup

- `validatePoint(point,id,now)` and `validateSeries(rows,id,now,options)` share numeric, date, order, identity and bounds checks. `legacyOnly:true` disallows v2 observations in a v1 container. Default date duplicates are invalid. The compatibility option does not authorize writes.
- `readCache(legacyObject,now)` returns the original cache, per-ID series and diagnostics. Missing IDs are empty. A broken group remains quarantined.
- `fingerprint(rawStringOrNull)` computes the exact baseline identity.
- `readStore(storeOrNull,legacyRawStringOrNull,now)` validates baseline binding, builds per-ID union views, validates conflict targets, applies explicit provisional successors and isolates bad series. Results include `points`, `byDate`, `conflicts` and `pendingConflicts` for valid series. Reading a null store creates only an in-memory empty proposal; it performs no migration/write.
- `validateStore(store)` performs strict offline sidecar shape validation without clock or baseline data, returning `bindingChecked:false`. `validateStore(store,legacyRaw,nowOptional)` additionally checks the baseline and full union, and rejects any invalid series. An export preserving quarantined legacy groups must distinguish structural sidecar validity from runtime union usability rather than discard old data.
- `parseTransportJSON(raw)` accepts bounded JSON text before any provider parser or proxy extraction, rejects duplicate decoded keys (including escaped duplicates), forbidden keys, excessive nesting, nonfinite/unsafe numeric values and other non-data values. Apply it separately to the outer response and any proxy `contents` string; ordinary JSON.parse first would irreversibly flatten conflicting identity fields.
- `parseYahoo(payload,id,receivedAt)` requires matching symbol, ETF, currency, timezone, supported exchange and daily interval. It rejects invalid/partial arrays, future timestamps, bad dates and weekend dates.
- `parseAlphaVantage(payload,id,receivedAt)` supports QQQ/SPY daily responses only. It validates metadata symbol/timezone/information/output shape, last-refresh date, dates, complete OHLCV rows, OHLC consistency and finite positive decimal prices. Rate/error payloads are rejected. Metadata does not independently prove source authenticity, adjustment, finality, access rights or availability.
- `admitCandidate(candidate,id,now)` accepts only the immutable candidate returned in this module instance by a supported parser. Copying flags, cloning, changing IDs or modifying nested bars does not create an admissible transport result. This is an internal admission guard, not a cryptographic provider signature.
- `mergeHistoryStore(store,legacyRaw,candidate,id,now)` returns a new store proposal with `acceptedDates`, `unchangedDates`, `pendingConflicts` and `failures`. Gap-backfill failures are separate from accepted new dates. `changed` includes new immutable alternative evidence, not just new dates.
- `mergeSeries(existing,candidate,id,now)` is a timestamp-only compatibility helper. It returns per-date conflicts and retains exact old point references, but cannot durably store alternatives. Production consumers should persist the v2 store result rather than discard its conflict evidence or write new observations into the legacy key.
- `observedDate(point,id)` is a read-only exchange-date helper. `selectPointAtOrBefore(rows,id,targetTs,{now,conflicts})` returns a validated result, not a raw point. A result can fail only the relevant benchmark/alpha calculation; it is not an account-value/Dietz hold.

## Conservative selection and disclosure

All daily values, including unknown legacy timestamps and Yahoo bar-start timestamps, use a **strictly earlier exchange date** for an intraday bound. A date-only value is never treated as available from midnight or the market open. The selection identifies `availability:'retrospective-prior-exchange-date'`, `lagged:true`, the actual selected date and unconfirmed quality. It is a retrospective display assumption, not point-in-time tradability proof. Unknown publication timing remains unknown even for a prior date.

If the selected boundary date has a pending conflict, selection fails with `benchmark-date-conflict` rather than silently choosing an older date. Conflicts outside that selected date do not suppress an unrelated boundary. Conflict evidence must itself pass full validation; a fabricated `provisional-successor` status cannot bypass a hold. The UI must disclose actual benchmark boundary dates and the lag alongside the actual snapshot period.

The module always keeps signal eligibility held and latestness unconfirmed. It provides no official calendar, verified final close or “latest” certification. Fixed 20/80 blend and USD/KRW comparison limitations remain separate parent/UI concerns.

## GAS remains closed

`liveGasEnabled` remains frozen false. `parseGasHistory` still requires `{mode:'synthetic'}` and returns a synthetic candidate with no fabricated timestamp. It cannot pass either persistent merge admission. There is no GAS transport, URL builder, activation setting or real-provider coverage claim. Neither AV nor Yahoo was actually called for these tests.

## Verification and expected old assertions

Focused command:

```sh
node --require ./tests/lib/no-network.cjs --test tests/benchmark-repair.test.cjs
```

All 15 focused tests pass. They cover strict source identity, AV date-only representation, conflict-local append, 0.0001 conflicts, immutable evidence, provisional successor lifecycle, conflict-specific selection holds, no gaps/pruning, quota-independent bounds, SHA-256 binding, changed raw bytes, malformed serialized keys, hostile objects, strict timezone offsets, duplicate identities in both transport/proxy JSON layers, prototype/non-string benchmark-ID rejection, legacy compatibility and source-metadata laundering prevention. Independent benchmark checks also pass under the network guard. No full-suite, browser, live API or production claim follows from these results.

The old benchmark tests intentionally expected whole-cache failure and whole-response conflict rejection. Those assertions need desired-policy updates by the parent. Their fixtures also mutate parser results, now intentionally frozen; modify the synthetic source payload before parsing, or clone a legacy fixture, instead. Do not remove negative identity, invalid-data or preservation assertions to obtain a pass.
