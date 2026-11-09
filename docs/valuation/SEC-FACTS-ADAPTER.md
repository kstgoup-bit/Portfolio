# Offline SEC selected-fact draft adapter

`require('./has/sec-facts-adapter.js').select(input, nowISO)` or browser `HASSECFacts.select`. Fixture: `HASSECFactFixtures.create()` / CommonJS `require('./has/sec-facts-fixture.js').create()`. Pure synchronous function: no fetching, account access, storage, mutation, valuation defaults or execution actions.

## Input v1

```js
{
  version: 1,
  mode: 'synthetic', // imported only for an actual imported snapshot
  synthetic: true, // retained fixture-origin marker
  instrument: {ticker: 'EXAMPLE', market: 'US', currency: 'USD'},
  identityReview: {
    reviewed: true, ticker: 'EXAMPLE', cik: '0000123456',
    reviewedOn: '2026-02-21'
  },
  companyfacts: {
    cik: 123456, entityName: 'Invented Example Company (not a real issuer)',
    facts: {'us-gaap': {Revenues: {units: {USD: [{
      start: '2025-01-01', end: '2025-12-31', val: 123000000,
      accn: '0000123456-26-000001', fy: 2025, fp: 'FY',
      form: '10-K', filed: '2026-02-20'
    }]}}}}
  },
  selections: {
    revenue: {
      tag: 'Revenues', unit: 'USD', accession: '0000123456-26-000001',
      start: '2025-01-01', end: '2025-12-31',
      form: '10-K', filed: '2026-02-20'
    }
  }
}
```

Example is invented, not an actual SEC record, and must remain synthetic. Imported mode is a caller label, not an authenticity check. Imported mode rejects a retained synthetic=true flag or known synthetic/invented markers in source, reference, entityName, description, label, notice, note and origin fields. This prevents obvious fixture relabeling, not arbitrary fabricated inputs whose markers were removed. Synthetic origins must not be relabeled as real financial data. The fixture's early-2026 dates intentionally become stale under a November-2026 analysis date.

`nowISO` must be a real UTC ISO timestamp including seconds and Z; no implicit current clock. Dates use real YYYY-MM-DD. Explicit ticker/CIK review must match the raw CIK and supplied ticker and be dated no later than analysis. This records a caller's identity review, not independent authentication. Entity names never establish ticker identity. No sector, asset type, qualitative thesis or source certification is inferred.

Each selection uses exactly tag, unit, accession, start (duration only), end, form and filed. Unknown selection keys, including scaling flags, fail. Missing valuation inputs remain missing. Imported source URLs are generated only from numeric normalized CIK and validated accession in the official SEC archive index pattern. Synthetic observations contain no source link: sourceURL is null and the path example is separately labeled generatedExampleURL. Accession prefixes are not required to equal issuer CIK because submitting agents may differ; archive paths remain unverified draft locators. Arbitrary input URLs are never used. An archive-shaped link does not prove the uploaded number appears there.

## Allowlist

- revenue/revenuePrev: Revenues, SalesRevenueNet, RevenueFromContractWithCustomerExcludingAssessedTax; USD duration.
- netIncome: NetIncomeLoss; USD duration. No inference of common-shareholder attribution.
- operatingIncome: OperatingIncomeLoss; USD duration. Not silently reused as EBIT.
- operatingCashFlow/operatingCashFlowPrev: NetCashProvidedByUsedInOperatingActivities; USD duration.
- capex/capexPrev: PaymentsToAcquirePropertyPlantAndEquipment; nonnegative USD duration; this specific PP&E cash outflow is not all possible investment spending.
- liabilities: Liabilities; USD instant, not interest-bearing debt.
- equity: StockholdersEquity; USD instant, not an average or automatically equity including noncontrolling interests.
- cash: CashAndCashEquivalentsAtCarryingValue; USD instant, not restricted cash/investments.
- eps/epsPrev: EarningsPerShareDiluted; USD/shares duration, normalized only to engine unit USD/share. Basic EPS and combined basic/diluted tags are not accepted as diluted.
- dilutedShares: WeightedAverageNumberOfDilutedSharesOutstanding; shares duration, not ending shares.
- sharesOutstanding: CommonStockSharesOutstanding; shares instant. DEI or issuer-extension tags are not supported.
- interestExpense: InterestExpense; USD duration. No finance-industry equivalence inference.

No averages, NOPAT, invested capital, debt totals, book value per share, normalized/forward EPS, price, growth estimates, regulatory capital or qualitative evidence are generated. Alternative tags may have different accounting scope; caller must review financial statement context. The adapter does not assert comparability merely because a tag is allowed.

## Exact selection and revision policy

Only one exact tag/unit/accession/start/end/form/filed match may exist. Identical duplicates are rejected too. Same accession/period with competing metadata fails. Missing or malformed revision dates/forms/accessions for that tag/unit/period fail closed. A later published same-tag/unit/period filing available by analysis date makes the older selection invalid. Two different accessions on the same filed date are ambiguous; date-only companyfacts cannot establish their order. A valid future revision is ignored for historical selection, while selecting a future filing is rejected. Revision checks are limited to the supplied snapshot: omitted filings, alternate tags, issuer extensions, contextual distinctions, and restatements absent from the upload cannot be discovered. No claim of full SEC history completeness is made.

Allowed forms: 10-K, 10-K/A, 10-Q, 10-Q/A. Annual duration (330–380 elapsed days) requires a K form. Quarter duration (65–110 days) may appear in a Q or K form. Instant dates can appear in either. Annual, quarter and instant derive only from explicitly selected actual start/end, not fiscal labels `fy`/`fp`/`frame`. Annual comparative facts in a quarterly filing are conservatively unsupported. Six- or nine-month YTD facts, TTM labels, quarter-times-four and four-quarter summation are not accepted or synthesized. Period ends must not follow filing dates. `filed` is the publication proxy; it is date-only, so same-day intraday availability cannot be guaranteed.

## Result and integration

`{status, instrument, mode, observations, selectionEvidence, issues, notice}`.

- ready means every requested selection mapped, not complete statements, ready-to-trade or verified evidence.
- partial means at least one draft observation exists and a selection failed or a stale fact was flagged.
- invalid means no observations can be mapped or the envelope/identity/bounds fail.
- Observations follow the valuation engine's contract: value, unit, period, asOf=filed, basis=reported, verification=unverified, source. Synthetic source text explicitly begins SYNTHETIC.
- All returned observations remain unverified regardless of input certifications. Downstream valuation calculations must therefore remain withheld. Never upgrade verification automatically to make a calculation appear.
- selectionEvidence is an array with field, tag, namespace, raw unit, accession, form, filed, period, CIK, entityName, reconstructed sourceURL (imported only), generatedExampleURL (synthetic only), filingAgeDays, periodAgeDays, identity-review limitation, unverified flag and revision policy.
- Facts older than 185 days by filing, or non-Prev period ends older than 185 days, produce `stale-draft-fact`. They remain visible for historical review with their real dates and unverified state, but the result is partial. Mapping does not reset dates to today.
- issues is an array of `{code,field}`; envelope errors have field=null.

No required metric receives an invented fallback. Merge only after instrument/mode checks and explicit review. Caller owns source authentication, completeness review, share-class/split consistency, statement scope, industry treatment and the analysis timestamp. A separate read-only draft workbench is appropriate; do not automatically overwrite a verified research record.

## Bounds and malformed data

Plain JSON only, no accessors/functions/class instances/cycles/prototype keys/nonfinite numbers. Limits: depth 16, 150,000 traversed nodes, 4,000,000 string characters, 50,000 own keys per container, 20,000 fact rows across all namespaces and units, 1–24 selections. Full companyfacts datasets may exceed bounds; explicitly prepare a bounded snapshot retaining relevant revision rows. The size limits bound work, not financial history completeness. Values remain unscaled; supported magnitude is zero or absolute 1e-12 through 1e18. Explicit fact scale/decimals/multiplier fields are rejected. Numeric strings are not parsed.

Run: `node --test tests/sec-facts-adapter.test.cjs`. Tests cover CommonJS/browser globals, identity, future/revised filings, duplicates, unit/tag/form/period mistakes, stale facts, malformed JSON, limits, hostile URLs, basic-vs-diluted EPS, negative capex and no mutation.
