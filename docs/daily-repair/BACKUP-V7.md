# Daily-record repair: backup v7

Scope: local implementation and synthetic, offline verification only. No real user data was restored, migrated, removed, rebound or uploaded. No browser, production deployment, trading, API, GAS or KIS request was used for these checks.

## Format and compatibility

- New exports use `kst-portfolio-backup`, `schemaVersion: 7`. All four account keys (`v5_gen`, `v5_dom`, `v5_ov`, `v5_pen`) remain required. The schema bump makes a v6 reader reject a v7 archive instead of mistaking internal purchases or sales for external capital.
- Imports retain v4/v5 legacy compatibility, including `genStocks`, and accept existing v6 envelopes. Existing account/stock conversion rules remain unchanged. New `activityVersion` rows and `v5_benchHistV2` are rejected when presented in an old envelope.
- Missing accounts, settings and record groups mean “preserve the current value.” An explicitly present empty array replaces that group. Legacy deposit row objects are not automatically classified or rewritten. Historical `id`, `kind` or `account` metadata without `activityVersion` is inert.
- The existing key allowlist, credential/HTML checks, duplicate JSON-key detection, resource limits, account/provenance validation and read-only preview remain in force. No new credential or network setting is backed up.

## Activity validation

`KSTPortfolioBackup.validateStoredValue(key, raw)` is a synchronous, read-only public validator. It throws on an unsupported key, invalid JSON, invalid schema or invalid typed activity. The ordinary backup, restore and journal paths use the same validator.

An own `activityVersion` property opts a row into the new contract. Version 1 rows use `HASReturnAssessment.validateFlows` for account membership, positive amount, KRW, ID, kind, receipt/effective time, date-only bounds and duplicate checks. Duplicate typed IDs across account groups are rejected. Legacy rows retain their prior structural contract, including previously permitted zero values, duplicate timestamps/signatures and inert metadata. This preserves evidence without promising it is usable in a return calculation.

Date-only typed activities additionally support the paired `dateEndTs` and `endUtcOffsetMinutes` fields. With the start `utcOffsetMinutes`, these preserve the actual local midnight boundaries of 23-hour/25-hour DST days instead of assuming a 24-hour interval. Both fields must appear together, agree with the next calendar midnight and offset, and contain the representative timestamp within the half-open interval. Instant rows cannot contain these fields. Older typed date-only rows missing both end fields remain unmodified and use the assessment policy's conservative uncertainty range; backup does not manufacture timing evidence.

## Benchmark evidence

`v5_benchHist` remains a legacy timestamp cache. Its raw serialized string is preserved in export. It is validated with the benchmark policy's legacy-only series validator, allowing duplicate exchange dates only for archival preservation. Duplicate exact timestamps, reverse ordering, bad prices, wrong aliases and new date-native observations in that key are rejected. Compatible same-date legacy duplicates are never deduplicated and are warned as read-only/quarantined.

`v5_benchHistV2` is a separate allowlisted key containing version 2 observations and conflict alternatives. `HASBenchmarkHistory.validateStore` performs structural offline checks. The SHA-256 fingerprint identifies the exact original legacy string, including whitespace and key order; it does not authenticate provenance or prove final prices. Observations, pending alternatives and provisional successors remain separate evidence. Backup/restore does not choose a pending correction or change a finality/quality flag.

A structurally valid sidecar with a stale binding can still be exported for preservation. That does not make it restorable over a different baseline. Restore validates the actual destination combination before any journal or data write:

1. If legacy and sidecar arrive together, incoming legacy text is kept exactly when it covers every current legacy field. It is not serialized again merely for formatting.
2. If an omitted current legacy group or receipt field would require merging, the paired restore is refused rather than dropping that field or changing the fingerprint.
3. Sidecar-only imports are checked against the unchanged current legacy raw string. Missing legacy is `null`, not `{}` or an empty string.
4. Omitted current sidecar series are retained only when both sidecars have the same fingerprint. A merge that requires rebinding is refused. An explicitly supplied sidecar series replaces that series.
5. The resulting combination must pass exact binding and combined-group/conflict-target validation. The only archival exception is an otherwise compatible duplicate-date legacy group with no sidecar observations or conflicts in that quarantined group. It stays read-only.
6. An old archive without the sidecar leaves the existing sidecar untouched and warns that it may be held after a legacy change. No automatic deletion, rebind or migration occurs.

## Restore safety

Restore uses the existing prepared/applied/undone journal, pre-write comparisons, owned rollback and refusal to overwrite foreign edits. Raw sidecar/legacy before-values are journaled only when those keys are targets, allowing exact rollback/undo. Existing pending or damaged journals continue to block ordinary writes and exports.

Read-only dependencies are also compared: a sidecar-only restore watches the current legacy baseline even though it does not write it. Group merging watches the exact current source string. These comparisons occur in preview, before the journal, during target writes and before completion. A changed baseline cannot be silently accepted between preview and apply. Local storage is still not transactional; the journal is a guard and recovery artifact, not a guarantee of atomic multi-key writes.

## UI

The adapter downloads `KST-전체백업-v7-<date>.json` and describes v4/v5/v6 import compatibility. It distinguishes activity classifications, original benchmark cache, additional observations and separate pending conflicts. It states that duplicate-date legacy observations and stale bindings remain held, with no automatic correction or reclassification. Existing restore cancellation, stale-preview protection, runtime invalidation and manual recovery controls remain. The isolated `has/restore-rehearsal.html` page loads the same local quote, snapshot, return and benchmark policies before backup core; its CSP remains network-denying. A VM test follows the actual HTML script order and exercises v7/v6/v5/v4 rehearsal flows using fake storage, with real storage/network globals blocked.

## Verification

New offline suite: `tests/daily-repair-backup.test.cjs`.

Coverage includes all four activity kinds, strict invalid typed rows, inert legacy metadata/duplicates, v4/v5/v6 compatibility, v6 semantic-smuggling refusal, exact noncanonical legacy text, pending conflicts, duplicate-date archival, sidecar-only/null binding, omitted groups, stale sidecar preservation, invalid combined groups/conflict targets, preview and mid-write races, rollback, undo, date-only DST boundary roundtrips and refusals, public read-only validator and browser-policy wiring.

Run:

```sh
node --require ./tests/lib/no-network.cjs --test tests/daily-repair-backup.test.cjs tests/backup.test.cjs tests/backup-compat-stage19.test.cjs tests/backup-contract.test.cjs
```

This suite uses only synthetic in-memory storage and offline source execution. It does not authorize or perform an actual restore.
