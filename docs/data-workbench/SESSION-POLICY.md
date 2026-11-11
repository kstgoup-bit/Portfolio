# Workbench close-session freshness policy

This policy applies only to `has/market-data.js` close-price input inspection. It does not change the legacy quote model, valuation engine, app, ledger, or production data. No exchange calendar is downloaded or independently verified. Real-time and delayed-price rules remain unchanged.

## Meaning of a usable close

`quote.selected.freshness.status = current-declared` means the quote matches the latest completed session **under the supplied, unverified calendar**, or the explicitly invented synthetic weekday schedule. It never means current live market data, independently verified data, or permission to trade. The selected quote and calendar both retain `verification: unverified`.

The market clock uses `Intl.DateTimeFormat` with `America/New_York` (US, including DST) or `Asia/Seoul` (KR). Regular local closes are 16:00 and 15:30 respectively. Quotes must be timestamped between the declared close and 60 seconds after it, inclusive. Receipt must not precede the quote or exceed analysis time.

At the next session's close, the prior close stops qualifying immediately. For five minutes after that close, freshness is unknown and selection is withheld, including selection of a newly reported close. At close + five minutes, inclusive, the new session becomes the required close. This fixed publication grace is not a freshness extension for the old quote. Weekends and declared holidays have no close. An early close uses its declared time rather than the regular time.

The workbench does **not** apply the legacy four-calendar-day stale gate to close quotes. Its close classification is produced by this single session policy. Thus a complete calendar can explain a holiday longer than four calendar days. Legacy consumers outside the workbench still have their existing policy and are not implicitly migrated.

## Conservative valuation compatibility boundary

Session-valid preview is not automatic eligibility for the separate legacy valuation engine. If a session-valid close is more than four market calendar days old and a valuation document is requested, the workbench leaves `valuation` null and reports the legacy valuation policy boundary explicitly. The declared, unverified quote preview remains available. This avoids returning a session-current quote alongside a contradictory legacy stale price assessment. Normal quotes within four calendar days retain the existing valuation path and checks. No dates are relabeled and no verification status is upgraded.

The shared valuation engine has deliberately not been changed. This is a conservative compatibility limitation, not a claim that all valuation and quote consumers now share one calendar. A future separately reviewed integration would be needed to use legitimate long-holiday closes for valuation.

## Calendar contract

Imported close quotes require `sessionCalendar`. Missing, malformed, incomplete, contradictory, unsupported, or out-of-range calendars withhold close selection with an issue. The old `closedDates` field cannot grant freshness: its presence with a close quote withholds selection and requests migration to this contract. There is no fallback from an invalid supplied calendar.

Example (all values below are invented, not an exchange calendar):

```json
{
  "market": "US",
  "timeZone": "America/New_York",
  "source": "Invented calendar example",
  "reference": "SYNTHETIC: example only",
  "reviewStatus": "declared",
  "reviewedAt": "2026-11-06T22:00:00Z",
  "from": "2026-11-06",
  "through": "2026-11-09",
  "sessions": [
    {"date":"2026-11-06","status":"regular","closeAt":"2026-11-06T21:00:00Z"},
    {"date":"2026-11-07","status":"closed","reason":"Weekend"},
    {"date":"2026-11-08","status":"closed","reason":"Weekend"},
    {"date":"2026-11-09","status":"early","closeAt":"2026-11-09T18:00:00Z","reason":"Invented early-close example"}
  ]
}
```

Requirements:

- Market and IANA time zone must match the instrument.
- Imported calendars must have an HTTPS reference and must not carry `synthetic: true` or explicit synthetic/invented markers in source/reference. This checks declared provenance consistency, not the truth or availability of a source.
- Source, reference, review status and a nonfuture review timestamp are required. Review status is `declared` or `reviewed`. Both are caller assertions, never independent verification. The output names it `declaredReviewStatus` and retains source/reference/time for review.
- Inclusive `from` and `through` cover every quote date through the analysis market date. At most 371 consecutive calendar days are supported. Future scheduled entries are allowed, but do not count as completed sessions.
- Every calendar date, including weekends and holidays, has exactly one entry in ascending order. Missing days, duplicates and out-of-order entries fail closed.
- `regular` requires a valid close timestamp on that market date at the regular local close.
- `early` requires a reason and a close after local regular opening (US 09:30, KR 09:00) and before regular closing. This is a narrow supported schedule, not a general exchange calendar model.
- `closed` requires a reason and no close timestamp. Weekend opening, delayed opening/closing, or other unsupported exceptional schedules are withheld rather than guessed.
- A quote dated on a closed session cannot qualify. Future or mismatched quote timestamps cannot qualify.

The code validates consistency, not the truth of a holiday or early-close assertion. An imported calendar must be supplied even on apparently ordinary days because the application cannot independently know whether an exceptional closure occurred. A caller's `reviewed` status cannot upgrade the result to verified.

## Synthetic compatibility

Only `mode: synthetic` with no calendar uses an invented regular-weekday schedule. Its basis is explicitly `synthetic-regular-weekdays`, with unverified status. It preserves the existing Friday 2026-11-06 close / Sunday 2026-11-08 fixture. This fallback makes no assertion about actual holidays or early closes; supply a complete invented calendar to test exceptions. Changing the mode to imported does not preserve that fallback.

## Verification

Run:

```sh
node --test tests/market-sessions.test.cjs tests/data-workbench-claude-fixes.test.cjs tests/market-data.test.cjs
```

Coverage includes pre/post-close and exact grace boundaries, US DST, KR time, weekends, long declared holidays, early closes, missing/invalid/incomplete/out-of-range/contradictory calendars, future prices and receipts, immutable inputs, unverified provenance and normal fixture compatibility. These are deterministic offline tests using invented data, not real exchange-calendar certification.
