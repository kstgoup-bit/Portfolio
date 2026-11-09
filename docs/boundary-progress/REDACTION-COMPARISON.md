# Redaction comparison: executable regression gate

Verified locally on 2026-11-09 against the current redactor in the independent boundary-progress checkout based on Claude `42332fc`. No production redactor changes were needed for this work.

## Corrected comparison

The retained 30 synthetic secret cases produce:

| Check | Historical baseline (2eed163) | Current |
| --- | ---: | ---: |
| Cases returning the sentinel | 17 | 0 |
| Fail-closed cases | Diagnostic only | 13 |
| Valid GAS examples unchanged | Not a baseline gate | 5 of 5 |

The earlier battery inserted the numeric value `277` (digits extracted from the invented `hunter2-VALUE-77`) but searched for `12345`. That false negative understated historical leaks as 16. The numeric fixture now uses the same computed value in both source and sentinel. Every fixture asserts that its nonempty sentinel is actually present in its source. Historical Claude reports are left unchanged as historical evidence; this note records the corrected measurement.

All fixture values are invented. These counts describe this finite corpus, not proof that arbitrary code or secrets can always be safely redacted. The 13 refusals include otherwise valid syntax the scanner conservatively does not support, such as a regular expression containing a quote. They are explicit expected refusals, not evidence that every valid GAS program is preserved. The five benign GAS examples have a separate exact-preservation gate.

## Changes

- `tools/review-redact-battery.cjs` exports frozen fixtures, `runBattery`, and `main`; importing it neither loads an external baseline nor runs the CLI.
- Each current secret fixture specifies its expected success/refusal and exact output. Refusals must return empty text. Accepted output must match the expected redaction while preserving adjacent nonsecret code.
- Sentinels are checked even when a result says `ok: false`. Exceptions, malformed responses, unexpected blocking, and changed valid GAS are failures.
- Baseline leaks and redactor exceptions are reported as diagnostics only. They cannot turn a passing current implementation into a failed regression gate. An invalid baseline module/path still causes a CLI setup error.
- The CLI does not print input secrets, arbitrary exception messages, or returned redactor text.

## Run locally

Current gate alone:

```sh
node --require ./tests/lib/no-network.cjs tools/review-redact-battery.cjs
```

Optional historical comparison (use a verified, trusted local baseline):

```sh
node --require ./tests/lib/no-network.cjs tools/review-redact-battery.cjs /tmp/has-review-old-redact-2eed163.js
```

The comparison above used the existing local historical file at that path. That temporary file is not a committed test dependency. The historical redactor is also available from `has/gas-redact.js` in local historical commit `9cd1292837f9349d57f0fb703a75c28de0a61a9c` of the separate review checkout.

`--current path/to/module.cjs` permits checking an explicitly chosen local current implementation and supports the negative CLI self-test. `--help` describes usage. Only regular `.js`/`.cjs` file paths are accepted, and the module must export `redact()`.

**Trust boundary:** requiring a module executes its code. File/path/export validation is not a sandbox or proof of trust. Never pass downloaded, user-supplied, or otherwise unreviewed code. The no-network guard is useful defense in depth, not a general code-execution sandbox. No real credential input is needed.

Exit status:

- `0`: all current fixtures and benign GAS preservation pass; historical leaks do not fail this gate.
- `1`: a current regression, leak, malformed response, exception, unexpected refusal, or benign GAS modification occurred.
- `2`: invalid usage, module path, loading failure, or missing `redact()` export.

Focused verification:

```sh
node --require ./tests/lib/no-network.cjs --test tests/redact-battery.test.cjs tests/gas-redact.test.cjs
```

Result: 30 tests passed (10 new harness tests plus 20 existing redactor tests), zero failures. The child-process test verifies a deliberately leaky fake current redactor exits `1`, while the same fake used only as a historical baseline exits `0`. Further self-tests cover all-input blocking, `ok: false` with leaked text, wrong/malformed output, thrown exceptions, benign GAS changes/refusals, quiet imports, numeric sentinel integrity, and CLI argument/path errors.

## Verification limits

This was focused local, offline validation. The full `npm test` suite was not retried after its earlier network-suite denial. No network, storage keys, trading/orders, deployments, production changes, commits, or pushes were performed by this work. Exact expected outputs deliberately make behavior changes visible and should be reviewed rather than blindly regenerated when the redactor changes.
