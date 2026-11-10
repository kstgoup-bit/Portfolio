# Independent daily-records review

Reviewed local candidate based on `8cd8b6b503e5254ee9080b29ee7161d1afa7c5f0` on 2026-11-10. This review changed only `tests/daily-independent.test.cjs` and this report. Implementation fixes were made by the owning workers.

## Result

The final focused independent suite passes **36/36** in each of `TZ=Etc/UTC`, `TZ=Asia/Seoul` and `TZ=America/New_York`. `git diff --check` also passes. No unresolved defect was found in those tested paths. This is not a full-repository or live-browser certification.

All inputs are synthetic. The harness executes actual inline application code and relevant deferred dependencies in their actual HTML order, using jsdom, fake storage, inert timers, and explicit response fixtures. It never loads remote resources or a real browser profile. External-network guard output showed no attempted external connections.

## Defects found and verified fixed

1. **Malformed saved revision could break status rendering.** `renderSnapshotStatuses` dereferenced `entry.point` for `null` entries and could call `toISOString()` on an out-of-range numeric timestamp. The implementation now validates each stored row before rendering its history and leaves damaged originals unchanged. Regression: `tests/daily-independent.test.cjs:323`; fix near `portfolio_v5.html:4729,4750`.
2. **A propagated scope-comparison hold could be stripped from a revision.** After a quantity change followed by a price change, deleting `comparisonHold` and `scopeChange` from both the active row and its final history payload still passed `validateRecord`. The validator now checks the exact scope-change metadata and its propagation across later entries. Regression: `tests/daily-independent.test.cjs:335`; fix near `has/snapshot-policy.js:207–226`.
3. **A malformed history container was advertised as recordable.** The status preview replaced a non-array saved group with `[]` before validation, while the real save correctly rejected the original. The preview now validates the actual saved group, using an empty array only when the group is absent. Regression: `tests/daily-independent.test.cjs:450`; fix at `portfolio_v5.html:4737`. No data was written by this defect.

The parent also corrected the deferred-script order so the snapshot policy initializes before backup core. The independent test follows the actual HTML dependency order and verifies that new revision records export and restore successfully (`tests/daily-independent.test.cjs:313`).

## Important coverage

- Later receipt time never becomes price time or verified quality. Receipt-only repeats add no revision. Known price time cannot go backwards or disappear, including when a holding is removed and re-added within one day or across days.
- Price changes preserve prior complete payloads and earlier days. Legacy points retain unknown metadata and missing cost. History stays flat; all 64 permitted revisions survive and the next change is refused rather than trimmed. The status display explains the cap without claiming that recording is available or writing any data.
- Legacy v5 and revision-bearing v6 round trips, omitted benchmark groups, malformed history sequences, active/history mismatches, nested histories, wrong currency and scope-marker tampering.
- Initial and revised snapshot write failures leave both runtime history and storage unchanged. Prepared restore blocks writes. Old quote callbacks and pending benchmark responses cannot write after restore invalidation.
- Actual rendered asset-chart points come only from stored records. An injected large live valuation cannot overwrite or append a chart endpoint. Missing current quotes cannot fall back to average cost for return tables.
- Removed holdings trigger comparison holds for raw return, Modified Dietz, alpha and benchmark overlays. A removal is not displayed as a numerical investment loss.
- Benchmark identity, currency, exchange date, timestamp, price and receipt validation. Older responses and historical corrections are rejected. Compact valid history appends without replacing older metadata. Same history with a later receipt is not a new observation.
- Provider bar timestamps are not promoted to confirmed closing times. Date-only GAS fixtures stay synthetic and cannot enter the persisted `{ts, close}` cache. Cache reload does not invent source provenance from `fetchedAtISO`.
- Benchmark storage failure preserves prior runtime/storage state. Local-midnight day changes append without rewriting the preceding day.

## Reproduce

```sh
NODE_PATH=/workspace/scratch/a69a663b2cde/dabi-lab-closure/node_modules \
  node --require ./tests/lib/no-network.cjs --test tests/daily-independent.test.cjs

NODE_PATH=/workspace/scratch/a69a663b2cde/dabi-lab-closure/node_modules \
  TZ=Asia/Seoul node --require ./tests/lib/no-network.cjs --test tests/daily-independent.test.cjs

NODE_PATH=/workspace/scratch/a69a663b2cde/dabi-lab-closure/node_modules \
  TZ=America/New_York node --require ./tests/lib/no-network.cjs --test tests/daily-independent.test.cjs
```

Individual finding reproducers can use `--test-name-pattern='malformed saved revision'` or `--test-name-pattern='scope hold cannot be stripped'` before the test filename.

## Verification limits

- No Chromium launch, screenshot/visual layout check, physical Android/iOS device or touch-target measurement. The earlier denied browser/socket attempt was not retried.
- No aggregate `npm test` retry, live provider response, GAS deployment, real storage restore, API key access, production operation, trade, commit or push.
- No new gold pricing or manual-price functionality was added or activated by this review.
- Freshness, official trading calendars, final closing-price certainty, and adjusted-price equivalence are not asserted. Legacy caches and provider provenance remain bounded by the documented conservative policy.
