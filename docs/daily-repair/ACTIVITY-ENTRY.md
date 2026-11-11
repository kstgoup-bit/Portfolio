# Classified activity entry and management

This local repair replaces the old combined “deposit (buy)” dialog. It is not a
trade/order interface and does not update holdings, cash balances, market data,
credentials, GAS, KIS or production. Tests use synthetic JSDOM and an in-memory
storage double only. No real browser, device or user storage was exercised.

## Meaning of a new entry

The user must explicitly select one of four types. There is no default type:

- `external-in`: money entering the account from outside.
- `external-out`: money leaving the account.
- `internal-buy`: a purchase inside the account, not external capital.
- `internal-sell`: a sale inside the account, not an external withdrawal.

All new rows have `activityVersion: 1`, a cryptographically generated unique
`id`, the account container's `account`, `kind`, positive numeric `amount`,
`currency: "KRW"`, `recordedAt` ISO receipt time and a user-selected timing mode.
This classification alone does not explain holdings changes or certify account
returns. Internal trades contribute zero external capital in the return module.

The timing selector also has no default and both date/time fields begin empty:

- **Exact local date/time** stores the selected instant with `timeCertainty:
  "instant"`. It uses the device's local time zone. Invalid/future times,
  nonexistent daylight-saving times and repeated ambiguous local times are
  rejected. Seconds and normalized milliseconds are accepted, not replaced by
  the current time.
- **Date only** stores `timeCertainty: "date-only"`, `effectiveDate`,
  `utcOffsetMinutes`, `dateEndTs` and `endUtcOffsetMinutes`. `ts` encodes the local
  starting midnight only, not the actual event time. The end is the next local
  calendar midnight, allowing 23/25-hour daylight-saving days. The return module
  holds relevant external-flow Dietz intervals when the day's uncertain timing
  overlaps them. The UI visibly labels the unknown event time.

`utcOffsetMinutes` and `endUtcOffsetMinutes` use JavaScript's `getTimezoneOffset`
convention (e.g. Seoul is −540). Both boundaries are validated by the return
module and backup boundary before persistence. Unsupported calendar boundaries
fail closed instead of silently inventing an instant.

## Historical preservation and write boundaries

Only an own `activityVersion` marker opts a record into the new schema. Old
records with inert `id`, `kind` or other metadata remain legacy and are displayed
as having unconfirmed type and actual timing. Opening a dialog never migrates or
rewrites historical rows. Appends retain existing row values, fields and order;
they do not sort or retroclassify old records. The JSON container is serialized
on an authorized write, so original whitespace is not retained.

The persisted `v5_deposits` value, not a potentially stale global memory copy,
is the source of truth. Every read goes through
`KSTPortfolioBackup.validateStoredValue("v5_deposits", raw)` before parsing, so
duplicate JSON properties, malformed typed records and resource-limit failures
cannot silently become the next saved state. The new row is independently
checked by `HASReturnAssessment.validateFlows` and the complete candidate goes
through the backup validator again. Legacy duplicates that remain compatible
with the historical backup schema do not prevent management of that history.

Writes are restricted to `safeSet("v5_deposits", ...)`; global `save()` is never
called. The flow compares the current raw bytes with the dialog-opening bytes,
checks again immediately before writing, and rereads the saved result. Memory
is updated only after exact post-write confirmation. Quota/restore-protection
failures retain the prior in-memory value. Concurrent changes detected before
writing are not overwritten. A post-write mismatch or read failure is reported
as uncertain and disables further writes from that dialog until it is reopened.
No rollback or automatic retry is attempted.

**These are conflict checks, not atomic cross-tab transactions.** A storage race
can still occur in the gap between a comparison and a write or after a confirmed
reread. The UI does not claim otherwise.

Secure IDs use `crypto.randomUUID`, with `crypto.getRandomValues` as fallback.
IDs are checked across typed rows in all accounts with bounded collision
retries. A browser without either secure source cannot create a new entry; no
weak random/time-based ID fallback is used.

## Management and interrupted flows

Management reads the persisted records and uses a new dialog, not a timestamp
filter. Each delete has an explicit user confirmation and removes only the
selected row. A typed row is matched by its unique ID and unchanged serialized
value; a legacy row by its original stored index and unchanged serialized
value. The unchanged raw-container check also guards deletion. Thus even two
byte-identical legacy records with the same timestamp can be removed one at a
time. Other rows/accounts retain their order and values.

Cancel, Escape, backdrop dismissal and replacement by a new dialog remove the
old event handlers. Captured callbacks additionally check that their dialog is
still active. Busy/closed guards prevent repeated submission or deletion.
Focus returns to the previous opener; dialogs have labels, a basic Tab loop and
live error status. New text declares at least 12px and interactive controls at
least 44px height. These are DOM/style checks, not mobile visual acceptance.

## Stable test hooks

- Entry: `depositInputBox`, `depositKindInput`, `depositTimeMode`,
  `depositDateTimeInput`, `depositDateInput`, `depositAmtInput`,
  `depositEntryStatus`, `depositCancelBtn`, `depositConfirmBtn`.
- Timing containers: `depositDateTimeWrap`, `depositDateWrap`, `depositTimeNote`.
- Management: `depositManageBox`, `depositManageList`, `depositManageStatus`,
  `depositManageCloseBtn`, `depositDeleteBtn-{original stored index}`.
- Submit through the form's submit event or the submit button's `.click()`.
  The button intentionally does not own an independent `.onclick` save handler.

## Focused verification

`tests/daily-activity-ui.test.cjs` covers all four types, explicit timing,
historical inert fields/order, stale memory, exact delete-one behavior,
cancel/reopen/detached callbacks, duplicate submission, malformed raw JSON,
missing validation, secure-ID fallback/collisions, quota/protection failure,
before/during/after-write races, post-write read failure and disabled uncertain
retry, accessibility declarations and New York daylight-saving boundaries.

Run without transport or user storage:

```sh
for ZONE in UTC Asia/Seoul America/New_York; do
  TZ="$ZONE" NODE_PATH=/workspace/scratch/a69a663b2cde/dabi-lab-closure/node_modules \
    node --require ./tests/lib/no-network.cjs --test tests/daily-activity-ui.test.cjs
done
```

This focused suite does not replace the parent's aggregate regression checks,
backup tests or independent review.

Verified on 2026-11-10: all 45 focused cases pass in `America/New_York`; UTC and
Seoul each pass 43 with the two New York-only DST cases explicitly skipped.
The combined activity/return/backup/independent suites pass 212 of 214 cases in
UTC with those same two declared skips. No failures. `git diff --check` also
passes for the owned changes.
