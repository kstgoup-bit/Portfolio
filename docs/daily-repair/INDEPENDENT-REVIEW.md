# Independent daily-record repair review

Date: 2026-11-10. Final independent local synthetic review checkpoint.

## Scope and safeguards

Reviewed the implementation in `has-daily-repair-20261110`, starting from local commit `35bc9d241d475cf53df56ddb3867263a25195280`, tree `6f8978e1181378bfccb2700fee456f1068c403b2`. Supplied baseline provenance identifies this tree with remote commit `d3f123fc757f4c6ad0a5017de8be894a3ae6e71b`; this reviewer did not fetch remote data.

Only `tests/daily-repair-independent.test.cjs` and this report belong to the independent reviewer. Runtime implementation and integration were performed separately. Tests preload the repository's `tests/lib/no-network.cjs`, use synthetic values and in-memory storage, and do not initialize real application storage or issue actual provider requests. JSDOM, where used, is a deterministic DOM harness without browser execution or resource loading.

Excluded: real data, keys, GAS/KIS calls, browser/socket retries, the five excluded network suites, cloud/project/settings changes, main, pushes, deployment, orders and autotrading. A focused check is not a full npm, real mobile, provider, deployment or production acceptance claim.

## Acceptance focus

- Actual saved start time, one saved point plus the valid later current endpoint, independent raw/Dietz/benchmark/alpha gates.
- Legacy provenance remains a warning, while malformed schema-v1 history/current quotes/FX do not gain trust or completeness.
- Scope markers at the beginning of an interval, same-day revisions, correctly bounded activity evidence and unexplained removal.
- Preserved old deposits, signed external flows and internal activity excluded from external cash-flow math.
- Per-date benchmark conflicts, retained alternative evidence, no tolerance/overwrite/backfill, today's provisional bar and no invented timestamp.
- Parser/candidate identity and hostile metadata, prototype/accessor/resource/nonfinite boundaries.
- Date-native consumers, missing required flow prices, old backups/general-account preservation, new-schema compatibility.
- Repeated/cancelled UI entry, commit-time storage checks and failed synthetic writes.

## Results

**42/42 passed in each of UTC, Asia/Seoul and America/New_York**, with zero failures, skips or external network attempts. These are the same 42 cases repeated in three time zones, not 126 distinct tests. A fresh rerun after the final four-account activity-label changes exercised the actual pure modules, HTML functions, streamed synthetic transport, activity dialogs and v7 backup implementation. Syntax validation and `git diff --check` also passed.

The final rehearsal dependency-order/display-label diff was also inspected. Two existing scoped checks passed: actual rehearsal HTML policy loading with synthetic v4/v5/v6/v7 VM round-trips, and main/rehearsal dependency ordering. The VM refused all real-storage/network access and recorded zero attempts. These two checks are separate from the 42-case independent suite.

No unresolved counterexample remains from this independent suite. This is not an exhaustive proof or a full-repository, browser, mobile, real-provider or production acceptance claim.

### Concrete counterexamples found during implementation

1. A Yahoo candidate accepted a receipt with UTC offset `+15:00`, because the shared timestamp helper did not restrict offsets to 14 hours. The benchmark boundary now independently enforces the offset limit. An independent negative test covers the exact reproducer.
2. Raw legacy benchmark JSON with duplicate `QQQ` keys was silently flattened by `JSON.parse`, while backup parsing rejected the same bytes. The benchmark raw parser now rejects duplicate keys before parsing, preserving the original input and refusing a merge.
3. A bar saved as provisional on its own exchange date became a permanent conflict on the next day's correction. The repair now retains the original and a `provisional-successor` alternative, derives an unverified active observation, and does not claim finality. A later ordinary historical correction still needs review.
4. A bare `{d, status: 'provisional-successor'}` supplied to the selector could evade the conflict hold. The selector now validates the complete conflict and its target instead of trusting the status string.
5. The first return assessment omitted explicit `signalHold`/`quality` metadata. Both available and unavailable assessment results now retain `signalHold: true` and `quality: unconfirmed`; the independent assertion passes.
6. Serialized legacy numeric overflow (`note: 1e999`) bypassed the object-level guard after raw JSON parsing and remained usable in runtime although backup rejected it. Parsed raw data now re-enters the same bounded-data guard, including finite/safe numeric checks. The independent reproducer passes.
7. Equal-time/equal-amount legacy contributions in two different accounts were projected with account labels but the compatibility validator discarded those labels, producing a false duplicate-flow hold. The pure API now receives a separate account-context array from the actual containing groups; old inert row metadata still does not establish identity. The integrated all-account Dietz and chart-flow tests pass.
8. Transport JSON decoding could flatten duplicate provider identity fields before the strict parser saw them. The final transport uses bounded streamed decoding followed by the duplicate-safe JSON parser for both direct and proxy contents. A synthetic duplicate-symbol primary response now fails over to query2; a repeated in-flight refresh does not start a second chain.
9. A changed legacy fingerprint could fall back to a read-only legacy view and hide pending sidecar conflicts from benchmark selection. The consumers now hold benchmark/alpha when binding is unresolved; raw/Dietz remain independent. The integrated counterexample passes.
10. Date-only uncertainty used a fixed 24-hour day. On New York's 25-hour 2026-11-01, a comparison crossing the final half-hour could show +50% rather than hold an uncertain contribution. New date-only inputs capture the next local midnight and its offset, including 23/25-hour days. Older rows without both end fields retain a conservative possible-time envelope. The exact final-half-hour reproducer now passes in all three tested time zones; declared day bounds are not independently verified timezone evidence.
11. Inherited object names (`constructor`, `__proto__`, `toString`) were accepted as Yahoo identities through prototype lookup, yielding an `ok` candidate with absent symbol/currency/timezone. Store admission already rejected the unsupported series, so no committed injection was reproduced. All public symbol lookups now require a known own-property ID; the independent parser regression passes.

These findings were reported with exact reproducers and rechecked after correction. The independent review changed no runtime code and made no commit.

### Deliberate remaining scope limitation

New internal-buy/internal-sell entries are excluded from external cash-flow math, but the candidate does **not** wire holding edits to a complete trade/cash reconciliation journal. A changed holding scope without exact matching transition evidence still holds Dietz and alpha, including an ordinary trade whose cash or trade evidence is incomplete. Raw recorded-value change remains visible with a warning. The pure assessment can evaluate exact user-declared transition evidence, but that is not independent ledger verification or a claim that the complete reconciliation UI exists.


## Reproduce

With the repository's declared development dependencies available:

```sh
TZ=Etc/UTC node --require ./tests/lib/no-network.cjs --test tests/daily-repair-independent.test.cjs
TZ=Asia/Seoul node --require ./tests/lib/no-network.cjs --test tests/daily-repair-independent.test.cjs
TZ=America/New_York node --require ./tests/lib/no-network.cjs --test tests/daily-repair-independent.test.cjs
```

The review used an already-installed JSDOM 26.1.0 through `NODE_PATH`; no package download or installation was performed. DOM resource loading and native browser execution were disabled. Synthetic fetch responses expose local byte streams only, and the existing network guard plus an explicit final zero-attempt assertion remained active.

### Reviewed file hashes

These hashes identify the frozen runtime used by the final fresh rerun, rather than an unpublished commit or remote deployment.

- `has/snapshot-policy.js`: `9109c84c4f4a8bfdde046646e668dc1c4b9ebf4712f50ff271daadf2f2bc3d1a`
- `has/return-assessment.js`: `67dc8d3b8e56f0d3621c9389a0fec9b3fd017205841d33582e853fab1be3ad6d`
- `has/benchmark-history-policy.js`: `e3581fe48c5d53826364d84b3067b3813e2a45d5ae498bdd28e20893862a9018`
- `portfolio_v5.html`: `e9ed6c4367be436323e59a2979a11b89b3b8126bfd919106fa94ce7f4b3ea3cc`
- `backup/core.js`: `123c9b91bcffaf91c8c5c55b47f07b3a32e5f9462fe7d9418aa1f6c21f651854`
- `backup/ui.js`: `55cfd9a5242218942dbd77c2c3716b06cad446b643f6d8865d7c90d926941c4f`
- `has/restore-rehearsal.html`: `635b30e9c1204cb09101b5c763d4baae532ba0cc5e62fbde46ae5c1c7a6bd375`
- `has/restore-rehearsal.js`: `bb92bbfa5b1d5826fa3fbbe7a5bdfb253c60e6ebc5e66724518f0ec9b38aed59`
- `tests/daily-repair-independent.test.cjs`: `ec3281b65007c8d7250b0b5b64432f168e3fc83c8df86c9c80223ae1fc0906d6`
