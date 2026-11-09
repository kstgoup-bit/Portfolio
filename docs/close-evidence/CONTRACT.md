# Offline close-evidence contract v1

This boundary is research-only. GAS remains unchanged. No network, storage, credentials, real provider response, production, main, order, trading or cloud path is added. All verification and signal flags remain false. No output is a financial endorsement.

## Public entry points

`HASCloseEvidence.compareJSON(text)` accepts primitive JSON text only, at most 16,384 UTF-8 bytes and five container levels. It rejects duplicate keys (including escaped aliases), unknown keys, arrays at object positions, nested reference values, nonfinite numbers and oversized strings. Errors do not echo input. Outputs contain only frozen scalar fields. A withheld result always has null spread; no price arithmetic runs before the evidence gates.

Envelope: `{version:1, mode:'synthetic'|'normalized', comparison:<legacy v1 object>, evidence:{calendar:<reference>,gas:<reference>,kis:<reference>}}`.

References have exactly these permitted fields; all are required: `sourceId`, `revision`, `reviewId`, `provider` (calendar/gas/kis), `instrumentType`, `market`, `exchange`, `adjustment`, `validFrom`, `validThrough`, `correctionState`, `supersedes`, `semantics`, `finality`. Only `supersedes` may be null. Strings are bounded to 128 characters. Dates must be valid ISO dates and cover the requested date inclusively. Currently only listed-equity, raw prices and non-disputed current references with null supersedes can advance. Unknown or absent fields never become authority.

`HASCloseComparison.compareJSON(text)` remains a bounded legacy public interface, but normalized declarations now always withhold before arithmetic. It is not an alternate path to real-data approval. Old synthetic fixtures remain available for isolated simulation; successful results are explicitly `synthetic-simulation-only`. The UI now uses the envelope and corresponding synthetic fixture. Exact-time comparison is unchanged.

## Synthetic research path

Mode and all three provenance labels must agree. References must use the exact synthetic per-provider IDs (`synthetic-calendar-v1`, `synthetic-gas-v1`, `synthetic-kis-v1`), `simulation-v1`, `simulation-not-reviewed`, `synthetic-official-regular-close`, and `synthetic-final`. Scope, raw adjustment, date coverage and correction gates still apply. Price/session/time validation remains in the original core. No synthetic reference can grant normalized approval.

A primitive JSON boundary cannot determine whether a caller secretly relabeled a real number as invented. Therefore even successful synthetic comparison is only a simulation, never verified, authentic, current, live, or usable for signals. Mixed provenance fails closed. Known official negative calendar facts override synthetic regular-session declarations as well.

## Static official evidence registry

`has/close-evidence-sources.js` is code-reviewed, immutable, and has no registration API. Caller JSON cannot add or modify sources. URLs, hashes, review labels, final flags and `verified:true` cannot authenticate themselves. Unknown fields such as URL/hash/verified are rejected rather than used as proof.

The sole calendar entry is `krx-kind-11637`, local review revision `review-20261109-v1`, review ID `local-primary-review-20261109`. Reopened on 2026-11-09: [KRX KIND 2026 disclosure notice](https://kind.krx.co.kr/external/dst/notice/11637/%5B%ED%95%9C%EA%B5%AD%EA%B1%B0%EB%9E%98%EC%86%8C%5D%202026%EB%85%84%20%EC%98%AC%EB%B9%BC%EB%AF%B8%EA%B3%B5%EC%8B%9C%20%EC%95%88%EB%82%B4.pdf), page 1. The Chuseok row supports closure September 24–27, 2026. Registry scope is deliberately limited to that negative interval for KRX listed equities. It does not infer any other open date, special-session schedule, complete annual calendar, NXT/overseas session, latest session, or instrument eligibility. The issuer supplied no version identifier in this reviewed document; the local review revision is NOT a publisher revision or cryptographic hash. Correction history is explicitly unestablished, not a claim that no correction exists.

Normalized references must match registered source, local revision/review and coverage; copying these public identifiers still grants no permission. Known closures always hold. Dates outside the interval hold for coverage gaps; positive calendar evidence is unavailable. No real-data success path currently exists.

## Provider finality and correction contract

Provider reference identity is bound independently to gas/kis and the quote's market, venue, raw adjustment, date coverage and instrument type. Provider evidence must eventually establish the specific official regular-close meaning, finalization state, publication/observation semantics and correction/supersession lineage. A reviewed field label is not finality evidence. Current static provider entries explicitly support only `unreviewed-finality` (GAS) and `daily-field-mapping-only` (KIS). They grant no finality, no source independence, and no normalized comparison approval.

Existing [KIS source-gap review](../close-comparison/DAILY-SOURCE-GAPS.md) covers domestic `stck_clpr` and overseas `clos` examples. Neither those labels, `mod_yn`, a requested date, matching prices, historical age, the close clock, receipt time, nor a five-minute grace period proves official-close semantics or finality. No timestamps are invented. Provider references and caller finality declarations cannot close this gap.

Future positive support requires independently reviewed primary semantics, date/venue/instrument validity, provider-specific evidence binding, immutable review history, effective/expiry dates, correction-chain validation, superseded/disputed-source refusal and tests. Do not merely append a trusted flag or whitelist a URL. Current code intentionally supports no corrected/superseding reference chain; any non-null supersedes or unresolved correction state withholds.

## Validation

Focused Node tests cover synthetic success, legacy normalized bypass, mixed/laundered provenance, fake regular sessions on known holidays, missing references and review fields, revision/scope/coverage/correction mismatches, raw-only adjustment, absent provider finality, malicious primitive JSON, duplicate/escaped keys, no input echo, frozen results and false verification flags. Focused jsdom tests cover mode wiring and stale-output invalidation. No full npm suite or Chromium run is authorized by this work.

Validated locally: 76/76 focused tests passed using the no-network preload across close core, independent close, close DOM, evidence, exact-time core, independent exact-time, exact-time DOM and colors. The two DOM loader lists and local-only asset expectation were updated for the new evidence modules. No full npm test or Chromium was run.

The legacy browser core also withholds with `calendar-registry-unavailable` when its registry dependency is absent or structurally unusable. A VM/browser-global regression test covers missing/malformed registries for both synthetic and normalized holiday declarations.
