# Independent offline authentication and budget review

Review date: 2026-11-10. Baseline: `eba37f0dc231fb94382ee31e45b79260731197b7`, the locally reconstructed source baseline identified as upstream `08fb2a5`.

Status: focused offline review complete. The 41 independent adversarial tests pass. This document is not a deployment, identity-provider integration or live KIS readiness approval.

## Evidence boundary

The review uses local, newly generated synthetic RSA keys and actual WebCrypto RS256 signatures. No real user, Firebase project, signing-key service, OAuth endpoint, credential, KIS API, cloud account, deployment, remote write or purchase is used. No new software is installed. The previously denied browser/socket and five network-oriented npm suites are not retried.

The existing `has/relay-policy.js`, `docs/KIS-comparison-contract.md`, and the standalone 2026-11-10 pilot preparation README were read. The latter describes the stage 27 weaknesses: long-lived browser bearer storage, mutable KIS destination and permissive redirects, process-local token/budget coordination, guessed US exchanges, and missing quote-time semantics. This review does not claim to have rerun the historical stage 27 code or tests.

## Verified coverage

- Strict signed JWT format, algorithm, trusted key selection, issuer/project, audience, owner identity, token time and duplicate-key handling.
- Owner disable/revocation, `auth_time` cutoff and refreshed-token behavior, including checks across asynchronous boundaries.
- Concurrent shared issuance/query budgets, persistent reservations, restart, uncertain/failed outcomes, and no refunds or hidden retries.
- Fixed-off live transport, exact route/origin boundaries, no redirects, no secret reflection/logging, and fail-closed state errors.
- Byte preservation of existing GAS, record/backup, application, comparison and investment-signal code.

The synthetic transaction store is independently implemented. It serializes operations, clones values, commits only successful writes, and separately models a committed reservation whose acknowledgement is lost. Twenty-four coordinator instances compete for the same stored pilot; exactly one initial pilot and one reservation of each kind succeed. Twenty concurrent request handlers dispatch only one token and one quote operation. These checks do not substitute for the production database contract.

The tests also cover in-memory client logout during token acquisition, clearing during response decoding, request-signal cancellation, exact currency/venue/instrument validation, and withholding stale results. Additional operation-epoch cases show that a hung old quote does not block relogin or clear the newer busy operation, and a hung old logout remains scoped to the old session/generation and cannot clear the newer local session. These are synthetic adapter behaviors, not proof of real Firebase SDK cleanup. A synthetic price remains explicitly unverified, with unknown price kind, no exchange timestamp, no independence claim, no investment-signal permission and no persistence permission.

## Counterexamples found and fixed

The following failures were reproduced locally against the initial candidate and then rerun successfully after the corresponding fixes:

1. **Emergency block could be undone for an in-flight run.** Reserving a token, setting `blocked: true`, then unblocking with an unchanged cutoff allowed completion of the old reservation. Blocking now makes a running pilot terminally failed; unblocking does not revive it or refund its budget.
2. **Dependency exceptions could reflect arbitrary content and status.** A synthetic provider or transport could throw a `ClosedError` containing a marker, which reached the public response; an arbitrary status could also claim success. Responses now use a fixed code-to-status allowlist, unknown exceptions become a generic failure, and key/signature dependency exceptions are normalized. Both transport and key-source marker tests pass.
3. **An invalid clock after reservation could still dispatch.** Changing the test clock to `NaN` after a successful durable reservation caused one synthetic upstream call before failure. The worker now requires a safe, monotone time before dispatch and after the response. The already consumed reservation stays spent.
4. **JWT key identifiers were implicitly coerced.** A signed numeric `kid` was accepted when a permissive key adapter returned that same value. The header now requires a JSON string, and numeric, boolean and array key identifiers are rejected.
5. **Client signout did not abort an in-flight request signal.** The synthetic client now uses per-operation cancellation and an abort signal while suppressing late results. This proves local cancellation behavior, not cancellation or refund of an already dispatched server-side request.

Additional review hardening covers clock safety across key/signature awaits, signing-key TTL expiry during actual WebCrypto verification, and rejection of impossible stored state combinations. These were raised during code review and tested after the fixes. Additional code review also prompted stricter currency/price checks and bounded client operations.

## Direct execution results

Independent test file: `tests/kis-auth-independent.test.cjs`.

```sh
node --require ./tests/lib/no-network.cjs --test tests/kis-auth-independent.test.cjs
```

- Independent cases: **41 passed**, zero failed, cancelled or skipped, rerun in a fresh Node process after the client cancellation rewrite.
- The final combined focused run at review time, adding 29 implementation cases and four preservation cases, passed **74/74**. The independent 41 are part of that total and must not be added again. Later aggregate reports may include additional tests.
- The existing no-network guard recorded **zero external connection attempts**. The test creates `Request`/`Response` objects and invokes synthetic functions; it does not make HTTP calls or open listening sockets.
- `node --check tests/kis-auth-independent.test.cjs` and `git diff --check` passed.
- Existing GAS, ledger/backup, application, service worker and prior policy/comparison sources have no byte changes from the stated baseline. The runtime additions are isolated candidate modules. Test scripts and the explicit regression inventory are updated separately.
- No full `npm test`, excluded network-oriented suite, Chromium/mobile render, deployment, production-signing test or live API test was run by this review.

## Remaining integration and security gates

1. **No actual Firebase integration.** The local test signs with newly generated in-memory synthetic RSA keys and verifies those real signatures with WebCrypto. It does not use Firebase Emulator Suite, real Firebase users, Google's production JWKS/certificates, OAuth, refresh tokens or Firebase account revocation APIs. Official key acquisition/rotation, bounded failure/cache behavior and the mapping of real owner disable/revocation events remain unfinished. The local owner cutoff is not proof of Firebase-wide revocation.
2. **No deployed Durable Objects system.** The coordinator has a storage-transaction-shaped interface and a default-disabled skeleton, not a provisioned namespace. The tests do not prove real cross-isolate serialization, storage durability, transaction retry behavior, outage semantics, migrations, binding selection or billing. A reviewed integration must route all use of one upstream credential to one authoritative coordinator and preserve state without silent reinitialization.
3. **No real Firebase browser lifecycle.** The client uses synthetic dependency interfaces, including generation-scoped cleanup and in-memory persistence selection. It is not an installed SDK or a working Google sign-in screen. Real SDK login cancellation, logout/global state interactions, mobile navigation, browser CORS enforcement and refresh behavior require separate review and runtime tests. Reference clearing is not secure erasure of JavaScript memory.
4. **Transport remains intentionally unusable for live service.** The default Worker always returns HTTP 503. Environment flags, supplied credentials and backend labels do not enable it. Only reserved `.invalid` origins exist in the executable transport contract. There is no real KIS OAuth or quote HTTP adapter, secret registration, approved live budget, deployment configuration or order/account route. Arbitrary injected test functions are trusted test code, not a sandbox for untrusted executable code.
5. **URL and revocation boundaries have precise limits.** The route check uses the canonical `Request.url`, not raw HTTP wire bytes. It restricts the effective origin/path but cannot distinguish strings already normalized by the URL implementation. A reservation is the authorization linearization point; a later policy block cannot retract a request already dispatched. It can prevent later work and publication, and neither failure nor cancellation refunds consumed budget.
6. **No free-operation or investment-readiness claim.** Free-tier limits and account conditions are documented separately. These tests do not prove a zero-cost deployment. A synthetic or eventual successful provider response cannot certify real-time semantics, the missing exchange timestamp, independent origin, market-data rights, investment suitability, or permission to change GAS/records/backup/signals.

No unresolved failure remains in the independent focused suite. The unresolved integration gates above are deliberate blockers to real use, not features proved by the local tests. This review grants no permission to create cloud resources, register credentials, use real identities or financial accounts, issue OAuth tokens, make KIS requests, deploy, push, merge or change existing data.
