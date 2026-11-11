# HAS daily-record follow-up: independent regression inventory and next-fix design

Date: 2026-11-10. **Read-only review, not an implementation or release approval.**

The primary ongoing task is KIS authentication. Daily-record work remains separately unfinished. This review made no runtime source changes in the KIS checkout, the pre-daily checkout, main, GAS, or production. This portable documentation folder contains this review, a synthetic reproducer, result logs, a source manifest, and only the required exact historical function excerpts saved as `.txt`. It does not bundle the full historical HTML. The excerpts are not an app entry point and must not be loaded or rendered as a website.

## Outcome first

The prior reviewer already established legacy-return suppression, the intraday 670 → 672.5 freeze, and removal of Alpha Vantage/query2. This follow-up extends those findings rather than claiming those same examples as new work:

1. One saved snapshot plus a complete live valuation is incorrectly classified as insufficient history. There are two usable endpoints, but only saved rows are counted.
2. A scope-change marker on the *starting* snapshot suppresses an interval entirely after that change. The following clean interval eventually works, so this is boundary contamination, not an everlasting hold.
3. A recorded contribution producing exactly 0% Dietz, an equal-value in-account rebalance, and an unchanged-value cost-basis correction all still trigger holds. The current policy receives neither deposits nor transaction evidence.
4. A rounding difference of only `0.0001` rejects two unrelated newer benchmark dates. A material correction has the same whole-response effect. Original values survive, but update availability does not.
5. Date-only bars cannot be dropped into the current implementation: runtime validation rejects them, backup rejects them, and timestamp-based consumers return no point. A new top-level revisions field also fails both allowlists.
6. Backup accepts two strictly increasing timestamps on one exchange date, while runtime rejects that cache. A synthetic backup can therefore pass parse but be unusable on application load. No restore was performed.
7. An **inherited**, not daily-introduced, Dietz defect uses the requested period boundary rather than the actual earlier snapshot time. One synthetic deposit then yields 50% instead of 0%. Reopening the display without fixing this would reveal a separate pre-existing error.

The reproducer reports **24/24 matching expected current behavior**, including broken behavior, in UTC, Seoul and New York. These are the same 24 cases repeated across time zones, not 72 distinct cases. `PASS [REGRESSION]` means an unfixed defect was reproduced; it does **not** mean the proposed fix passes. No browser, full npm suite, network runner, API, real storage, credential, or deployment verification was attempted.

## Source identity and evidence

- Tested current runtime baseline: local HEAD `eba37f0dc231fb94382ee31e45b79260731197b7`, tree `31d9ce5ec99c3607d0eb881cddb1b00f52bcfd97`. The portable reproducer reads its containing repository at `../../..` by default, independent of the current working directory. Concurrent KIS-auth changes are outside this review; the relevant runtime hashes remain recorded.
- Source identity verification established that this tree equals remote `08fb2a537f29f97e4f8e35a8e626f5c76f27248f`. Remote commit history is not present locally; this review did not independently fetch/reverify it. Current-source links below use that verified remote commit.
- Tested pre-daily source came from checkout `has-recording-backup-20261110`, HEAD `e0a84925c4b32beed6f797cfd74aaa7dee2d4d18`, tree `2f3884f7a57667ecb4623fa25fcbe2501d47e8f7`. The original full HTML SHA-256 is `d5b2991ab28e289a3ad60c0659a148696425dddb221841e560e7ac32509a7c5a`; that whole file is not bundled. `historical-reference/portfolio_v5.functions.js.txt` contains only the exact needed `getDepositsForKey`, `calcModifiedDietz`, `findSnapAtOrBefore`, `returnRowHtml` excerpts and the `fetchBenchmarkHistory` block up to, but excluding, `findBenchAtOrBefore`. The excerpt SHA-256 `c7a946df8c755deb8ce45f455c37fb758a43feb4dd76859578ad242fbac5fb72` is checked by the reproducer. Original line ranges and per-excerpt hashes are in `SOURCE-MANIFEST.json`. Extraction excludes the final separator newline before `findBenchAtOrBefore`; function content is unchanged and the fragment ends with one newline. The old checkout is not needed to run this package.
- [Team review and requested corrections](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/docs/team/DAILY-RECORDS-REVIEW-20261110.md).
- [Original daily scope and restrictions](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/docs/daily-records/REPORT.md), [snapshot revisions](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/docs/daily-records/SNAPSHOT-REVISIONS.md), [benchmark contract](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/docs/daily-records/BENCHMARK-HISTORY.md).
- [GAS deployment report](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/docs/team/GAS-HISTORY-DEPLOYED-AND-RECORDING-ISSUES-20261110.md) reports QQQ 251 bars and 069500 245 bars with metadata. It does not contain the full raw bar arrays. This review uses explicitly synthetic fixtures, not invented representations of those purported real responses. The document's old proposal to synthesize a near-close timestamp must not be revived.

## Defects versus deliberate restrictions

### Return assessment

[snapshot-policy.js:235–248,307–329](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/has/snapshot-policy.js#L235-L329) computes scope from component identities, tickers, quantity and cost. It treats absence of schema-v1 provenance as a hold, counts only saved rows, and treats every selected row's `comparisonHold` as a period-wide hold. It cannot distinguish a normal trade from an unexplained tracking-scope deletion because neither transaction events nor cash flows are inputs.

[portfolio_v5.html:2969–3028](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/portfolio_v5.html#L2969-L3028) uses that single boolean before raw, Dietz and alpha. [Chart code:4563–4577](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/portfolio_v5.html#L4563-L4577) also removes benchmark lines globally. These are display regressions relative to the stated next requirements, even though the previous daily tests intentionally assert this policy.

Retain these safety properties:

- A legacy `{ts,val}` without cost is not corrupt merely because provenance/cost is absent. Raw and Dietz do not mathematically require cost. Missing cost must still prevent a fabricated historical cost curve.
- A partially populated schema-v1 point is **not** legacy. An invalid component sum, bad timestamp, missing current quote/FX, or malformed revision remains invalid/incomplete.
- Do not substitute average price, a stale saved quote, a partial account total, or today's cost to make a current valuation complete.
- Missing current quotes remain `current-incomplete`; no new record is invented. Chart points remain actual stored observations.
- Global rejection of malformed history for writes is deliberately protective. Whether an out-of-range malformed row should block a read-only clean-interval display is a separate isolation policy, not permission to repair/delete that row.

### Historical benchmarks

[benchmark-history-policy.js:72–81](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/has/benchmark-history-policy.js#L72-L81) refuses the entire candidate on the first unequal overlapping price. Preservation is deliberate; failing to append unrelated valid newer dates is the liveness defect. Never use a generic 0.5% threshold as proof that two prices are equivalent or a bar is final.

The following are currently explicit policy choices, not fresh regressions: no historical gap backfill, no automatic older-value replacement, no verified-finality/latestness claim without evidence, no storage of synthetic GAS fixtures, and bounded retention without automatic pruning. A malformed QQQ group causing all KS200 metadata to disappear is avoidable cross-symbol coupling, but isolation must preserve the invalid bytes rather than silently overwrite them.

[backup/core.js:93–97](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/backup/core.js#L93-L97) only checks increasing timestamps; [runtime:13–30](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/has/benchmark-history-policy.js#L13-L30) adds exchange-date uniqueness and stricter bounds. This validator mismatch needs a shared contract or a visibly read-only legacy/quarantine path. Do not retroactively discard old backups to hide the mismatch.

### Inherited flow model defects

[Dietz function:2932–2949](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/portfolio_v5.html#L2932-L2949) supports signed flows mathematically; [deposit UI:2856–2901](https://github.com/kstgoup-bit/Portfolio/blob/08fb2a537f29f97e4f8e35a8e626f5c76f27248f/portfolio_v5.html#L2856-L2901) only accepts positive input and labels it “입금(매수)”. That label conflates money entering an account with purchases using money already inside it. Existing deposits must remain verbatim; do not retroactively label them all reconciled external flows.

Both tested HTML baselines call Dietz with `targetTs` despite selecting `snap.ts <= targetTs`. The minimally correct interval is `snap.ts` through the actual endpoint time, using the same interval for benchmark comparison. The displayed label should disclose the actual selected start if it predates the requested boundary. This is an inherited defect discovered here, not attributable to the daily patch.

## Minimal coherent next-fix design

Implement separately from the KIS-auth branch. Avoid a broad rewrite or simply deleting all holds. The smallest coherent change has three local units, with a separate later decision for any live provider enablement.

### 1. Separate computability, provenance, and economic scope

Add a pure read-only assessment (for example `assessReturnInterval`) rather than weakening `validateRecord` or editing historical flags. Return per-metric status: `raw`, `dietz`, `benchmark`, `alpha`, provenance warnings and interval-scoped reasons. Keep `signalHold:true` and `quality:'unconfirmed'`; a displayed calculation is not verified market evidence or a trading signal.

- Raw finite positive-base endpoint change can be displayed as **asset-value change**, marked “출처 미검증” for legacy. It must not be labelled market profit when the interval contains an unexplained tracking-scope change.
- Dietz needs valid endpoints, an actual common interval, bounded/valid flows and positive denominator. Cost is not an input. Legacy evidence remains unverified rather than blanking all numbers.
- Alpha additionally requires usable benchmark observations for matching boundaries/currencies and carries its own benchmark-quality limitation. Benchmark failure must not suppress raw/Dietz.
- Count the valid live candidate as an endpoint when it is actually later than the start. Do not persist it merely to compute a display, count a duplicate timestamp as a second observation, or relabel it a market close.
- Events outside `(start,end]` must not taint the interval. For a persisted transition whose timing is uncertain between `previousTs` and `changedAt`, block only intervals crossing that transition span; a comparison starting at the post-event snapshot is a new baseline. Same-day histories must be considered when locating transitions.
- Preserve the exact old record/revision payload and existing validation invariants. The v1 persisted `comparisonHold` is historical evidence to interpret, not a field to delete just to make validation pass. Do not treat `legacy-unknown` alone as proof of an asset removal.

### 2. Distinguish account activity from tracking-scope changes

Component differences alone are insufficient. Add a small, explicit transition-evidence contract tied to stable account/holding IDs and snapshot boundaries, rather than a generic “ignore scope changes” switch. Keep this external to preserved v1 rows, in a bounded versioned activity record included in the next backup contract.

Required kinds: recorded in-account trade/rebalance, external contribution/withdrawal, tracking-scope inclusion/exclusion, correction of cost basis, and unclassified. Link external flows by stable flow ID and trade events by stable event ID. Existing rows lacking IDs get read-only deterministic references for comparison; do not silently rewrite them. New recorded activities should carry an explicit account, recording time, effective-date/time certainty, kind, linked components, and declared cash effect. Validation must distinguish user-entered evidence from independently reconciled evidence.

- A normal in-account trade is not an external flow and is not itself a scope exclusion. Include cash balances/proceeds if total account returns are claimed. If cash is absent, do not certify the tracked-securities subtotal as whole-account return.
- A recorded external contribution can explain capital addition for Dietz. Merely finding *some* deposit nearby cannot explain every added/deleted holding or make an unrelated scope deletion safe. Require matching account/time/evidence and expose uncertainty.
- A basis-only correction does not block raw/Dietz when valuation scope is unchanged; it affects cost-derived figures and should be annotated there.
- A deliberate removal from tracking, or an unclassified disappearance without matching sale/cash/flow evidence, blocks investment-return interpretation only across that transition. Values and revisions remain visible.
- Historical ordinary trades cannot be reliably reconstructed from these files alone. Show those computable periods as unverified with a clear scope caveat until evidence exists; do not fabricate trade records or silently conclude “normal trade”. This is the unavoidable limit of the minimal fix.

This is a local schema/UI design step, not authority to edit actual user transactions or replay deleted assets.

### 3. Make benchmark merging date-native and conflict-local

First restore query2 as a bounded transport fallback in the local candidate, feeding the same strict Yahoo parser and existing cancellation/restore guards. This needs no timestamp schema change because Yahoo supplies a bar timestamp. Do not copy the old wholesale overwrite logic or freshness shortcut.

For AV/GAS support, introduce a versioned **separate benchmark store**, leaving `v5_benchHist` untouched as the legacy baseline. A small recommended shape is:

```
{
  version: 2,
  legacyFingerprint: "hash of preserved v5_benchHist bytes",
  series: {
    QQQ: {
      symbol: "QQQ", currency: "USD", market: "US",
      observations: [
        { d: "2026-11-09", close: 625,
          source: "alpha-vantage-daily", receivedAt: "actual receipt",
          providerBarTs: null, adjustment: "unverified", finality: "unverified" }
      ],
      conflicts: ["bounded immutable alternatives linked by date and observation ID"]
    }
  }
}
```

The example is a proposed shape, not accepted current code. Exact field names/key require implementation review. Store actual provider timestamps only when supplied; a date does not become midnight, 14:30 UTC, received time, or a manufactured close time. Preserve the original legacy point objects/bytes and map their exchange dates at read time. Do not label old fabricated AV timestamps as genuine provider timestamps, since old cache provenance is unknown.

- Validate envelope/source identity before accepting bars. Quarantine conflicting bars by symbol/date; continue appending unrelated valid dates. Return accepted dates, unchanged dates, pending conflicts, and failures separately.
- Keep current-exchange-date bars provisional or outside canonical historical selections. A later-day revised observation can supersede that provisional selection **while retaining both versions**. Becoming an earlier date alone does not prove finalized close.
- For old historical differences, preserve the active old observation and store the new alternative with its receipt/source. Do not silently rewrite. A reviewed source-specific precision rule may treat rounding-only values as equivalent, retaining both originals; no universal 0.5% replacement rule. Split/adjustment differences are not rounding.
- A conflict must not freeze later unrelated dates or a separate symbol. If a comparison boundary depends on a disputed date, show a pending-data warning for that comparison. Prefer an exact prior usable date only under an explicit disclosed fallback rule, not silent forward-fill across the conflict.
- Preserve every old observation and revision until an explicitly approved archival design exists. Bounds/quota failure must leave the committed store unchanged; do not truncate. Distinguish “conflict saved” from “new observation appended”. Never refresh legacy `fetchedAt` merely because a request returned.
- New readers prefer the versioned store only after full validation. Detect a changed legacy fingerprint from another tab/older application; do not silently overwrite either store. Concurrent reads/writes need an expected-version check, preserving the existing restore invalidation barrier. localStorage remains non-transactional, so document that limit.

**Backup and consumers must land together before AV/GAS can be connected:**

- Add the new store and transition-evidence store to an explicit new backup version, rather than smuggling a new top-level field into v6. Continue accepting v4/v5/v6 read-only import plans. Export old values exactly, migrate only into the new store, never rewrite old records in place.
- Share date, numeric, identity, duplication and bounds validators across runtime and backup. Test omitted groups versus explicit empty groups, malformed v2 data, old-v6 round-trip, unknown extensions, no-secret export and quota/rollback behavior using synthetic stores only.
- Update `findBenchAtOrBefore`, `getBenchmarkReturnPct`, `priceAtTs`, `computeCashFlowSeries`, mixed KS200/QQQ logic, SPY overlay, latest-date labels and cache loading to pass symbol/market and consume exchange dates. A date-only bar cannot claim it was available at an arbitrary intraday timestamp. For intraday snapshot comparison, conservatively use an earlier exchange date unless actual availability is known; disclose this lag. Daily retrospective comparison must be labelled as such, not point-in-time executable evidence.
- Retain the fixed 20/80 comparator and USD/KRW differences as explicit limitations; they are outside the minimal regression fix. Do not call the blend measured portfolio allocation.

**Transport restoration without a real request:**

- Inject transport and clock into a bounded provider chain. Mock every response in tests. Reinstate query1/query2 failover and AV availability for QQQ/SPY only after date-native storage/consumers pass. Preserve GAS as disabled/live-unconfigured until separately authorized and verified.
- AV parser must reject rate-limit/error payloads, invalid dates/prices, wrong symbol metadata and ambiguous conflicting duplicates; keep adjustment/finality unknown. Do not treat AV metadata's last-refresh clock as each bar's close timestamp or copy it into bars.
- Do not copy the old hardcoded “two calls/day” or “one per second” comments as verified present limits. Budget/cache reuse, rate-limit handling and live source priority require current provider facts and authorization. Keep request counters/test credentials synthetic; do not read saved keys.
- Preserve active-run checks after every asynchronous boundary, timeouts, retry limits, restore cancellation and commit-time reread. Test primary failure → query2 success, Yahoo failure → synthetic AV success, quota/error → preserved cache, duplicate completion, stale callbacks, and out-of-order runs. Do not forward an AV secret through a general CORS proxy.
- The GAS document supplies metadata summaries, not the full recorded payload. Obtain sanitized complete samples through an approved route before claiming real-provider contract coverage. No real API call was made in this review.

## Concrete change map and acceptance gates

1. `has/snapshot-policy.js`: keep v1 validator/preservation logic; add metric-specific read assessment and explicit transition-evidence resolver. Replace blanket legacy/quantity/basis holds only in display decisions, not by disabling malformed-data checks.
2. `portfolio_v5.html`: route raw, Dietz, alpha and chart line decisions separately; pass actual `snap.ts`; use actual endpoint time; distinguish unverified numbers from unavailable/incomplete input; add a small activity-kind input wherever holdings are changed rather than guess history.
3. `has/benchmark-history-policy.js`: shared date-native validation, per-date merge results, provisional lifecycle, immutable alternatives and per-symbol diagnostics. Keep pure functions and no credentials/network in this module.
4. `backup/core.js` and `backup/ui.js`: explicit version transition/allowlist, old-format import compatibility, legacy-byte preservation, shared validator, include new records without exposing credentials. No real migration/restore as part of development tests.
5. Benchmark transport block: query2 reintroduced using strict parser; mock-only AV adapter; no old timestamp fabrication, broad overwrite, global fresh stamp or unlimited retry.
6. Tests: convert the relevant CURRENT regression assertions into desired-behavior assertions only **after** implementation changes. Retain these logs as pre-fix evidence. Add separate invalid-data negative tests, event-reconciliation tests, backup downgrade warnings and full consumer/date-boundary cases. Focused tests are not full-suite/browser/production approval.

Priority for a minimal delivery: (a) preserve computable legacy display and correct interval endpoints, (b) event-local scope and cash-flow interpretation, (c) conflict-local append plus query2, (d) date-native store/backup/consumers, then (e) AV/GAS mock adapter and a separately authorized live verification. Until (d), do not claim AV/GAS restored simply because a fetch function exists.

## Reproduction

From the repository root:

```
TZ=Etc/UTC node docs/kis-free-auth/daily-regression-followup/reproduce-current.cjs
TZ=Asia/Seoul node docs/kis-free-auth/daily-regression-followup/reproduce-current.cjs
TZ=America/New_York node docs/kis-free-auth/daily-regression-followup/reproduce-current.cjs
```

Or from this folder:

```
TZ=Etc/UTC node reproduce-current.cjs
TZ=Asia/Seoul node reproduce-current.cjs
TZ=America/New_York node reproduce-current.cjs
```

The script loads only pure modules and selected function declarations from the actual current HTML and bundled pre-daily function excerpts. It never initializes either application or loads/renders historical HTML. Backup parse/create operate against a synthetic read-only object whose write methods throw; no `apply`, `restore`, `undo`, browser storage, server, or API is used. Execution only reads source files; no runtime file is changed. The repository's no-network guard is preloaded before its policy modules. There were zero external attempts. No previously denied operation was retried.

Optional environment overrides: `HAS_REVIEW_ROOT` selects another repository root; `HAS_PREDAILY_FILE` selects the historical function-excerpt file. The excerpt hash must still match the exact reviewed bytes, not a full HTML file. Overrides do not authorize network calls, real user data, rendering, or runtime edits. The original source checkout paths in `SOURCE-MANIFEST.json` are provenance, not execution dependencies.

Artifacts: `reproduce-current.cjs`, `result-Etc_UTC.log`, `result-Asia_Seoul.log`, `result-America_New_York.log`, `SOURCE-MANIFEST.json`, `historical-reference/portfolio_v5.functions.js.txt`, `SHA256SUMS`.

Unverified: real data shape/frequency, actual normal-trade cash accounting, real provider availability/quotas/rights, real phone/browser layout, live restore concurrency, complete repository/full npm tests and production behavior. These limits do not erase the deterministic synthetic defects above.
