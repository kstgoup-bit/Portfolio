import { ClosedError, createFirebaseVerifier, deny } from './auth.mjs';
import { LIMITS, PilotCoordinator, coordinatorFromDurableObjectState } from './coordinator.mjs';

export const ROUTE = '/v1/quote/kr/005930';
export const SYNTHETIC_RELAY_ORIGIN = 'https://has.synthetic.invalid';
export const SYNTHETIC_APP_ORIGIN = 'https://app.synthetic.invalid';
// Only reserved .invalid destinations exist in executable code. No real API key inputs.
export const SYNTHETIC_REQUESTS = Object.freeze({
  token: Object.freeze({ mode: 'synthetic-only', kind: 'token', method: 'POST', destination: 'https://kis.synthetic.invalid', path: '/oauth2/tokenP', redirect: 'error', retries: 0 }),
  quote: Object.freeze({ mode: 'synthetic-only', kind: 'quote', method: 'GET', destination: 'https://kis.synthetic.invalid', path: '/uapi/domestic-stock/v1/quotations/inquire-price',
    trId: 'FHKST01010100', marketCode: 'J', symbol: '005930', venue: 'KRX',
    parameters: Object.freeze({ FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: '005930' }), redirect: 'error', retries: 0 })
});

// Only these internal enums can leave the boundary; dependency errors are never reflected.
const PUBLIC_ERRORS = Object.freeze({
  'route-denied': 403, 'origin-denied': 403, 'credential-mode-denied': 403, 'preflight-denied': 403, 'method-denied': 405,
  'auth-invalid': 401, 'auth-unavailable': 401, 'auth-clock-unavailable': 503, 'auth-keys-unavailable': 503,
  'official-key-provider-not-implemented': 503, 'storage-unavailable': 503, 'clock-unavailable': 503,
  'owner-blocked': 403, 'session-revoked': 401, 'pilot-closed': 409, 'pilot-already-started': 409,
  'pilot-expired': 408, 'budget-denied': 429, 'run-id-unavailable': 503, 'request-timeout': 408,
  'synthetic-upstream-rejected': 502, 'synthetic-upstream-failed': 502, 'synthetic-quote-invalid': 502
});

function reply(status, code, cors = false, quote = null) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', vary: 'Origin' });
  if (cors) {
    headers.set('access-control-allow-origin', SYNTHETIC_APP_ORIGIN);
    headers.set('access-control-allow-methods', 'GET');
    headers.set('access-control-allow-headers', 'authorization');
  }
  const body = status === 204 ? null : JSON.stringify({ ok: status === 200, mode: 'synthetic-only', liveEnabled: false, code, ...(quote ? { quote } : {}) });
  return new Response(body, { status, headers });
}

function exactRoute(request) {
  // Exact canonical Request URL comparison rejects queries, fragments and alternate paths/origins.
  // URL/Request may normalize dot segments/default ports first; this is not raw-wire inspection.
  if (request.url !== SYNTHETIC_RELAY_ORIGIN + ROUTE) deny('route-denied', 403);
  if (request.headers.get('origin') !== SYNTHETIC_APP_ORIGIN) deny('origin-denied', 403);
  if (request.headers.has('cookie') || request.headers.has('x-has-auth')) deny('credential-mode-denied', 403);
  if (request.method === 'OPTIONS') {
    if (request.headers.get('access-control-request-method') !== 'GET' ||
        request.headers.get('access-control-request-headers')?.trim().toLowerCase() !== 'authorization') deny('preflight-denied', 403);
    return 'preflight';
  }
  if (request.method !== 'GET') deny('method-denied', 405);
  return 'quote';
}

// No function falls back to global fetch, env endpoints, KIS_BASE or an SDK.
export function createSyntheticWorker({ authConfig, keyProvider, subtle, coordinator, transport, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const verify = createFirebaseVerifier({ config: authConfig, keyProvider, subtle, now });
  if (!(coordinator instanceof PilotCoordinator) || typeof transport !== 'function' || transport.mode !== 'synthetic-only' ||
      typeof setTimer !== 'function' || typeof clearTimer !== 'function') deny('synthetic-dependency-unavailable');

  async function dispatch(kind, run, principal, token) {
    // This durable transaction is the authorization/reservation linearization point.
    // Network/transport is NEVER inside the retryable storage transaction.
    const permit = await coordinator.reserve(run.id, principal, kind);
    const dispatchAt = now();
    if (!Number.isSafeInteger(dispatchAt) || dispatchAt < permit.reservedAt) deny('clock-unavailable');
    const remaining = Math.min(LIMITS.requestMs, permit.deadline - dispatchAt);
    if (remaining <= 0) deny('request-timeout', 408);
    const abort = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimer(() => { abort.abort(); reject(new ClosedError('request-timeout', 408)); }, remaining);
      });
      const operation = Promise.resolve(transport(Object.freeze({ ...SYNTHETIC_REQUESTS[kind], signal: abort.signal,
        ...(kind === 'quote' ? { syntheticAccessToken: token } : {}) })));
      const response = await Promise.race([operation, timeout]);
      const completedAt = now();
      if (!Number.isSafeInteger(completedAt) || completedAt < dispatchAt) deny('clock-unavailable');
      if (completedAt >= permit.deadline) deny('request-timeout', 408);
      if (!response || response.synthetic !== true || response.status !== 200 || response.redirected !== false || response.location !== undefined) deny('synthetic-upstream-rejected', 502);
      await coordinator.complete(run.id, principal, kind);
      return response;
    } catch (error) {
      abort.abort();
      if (error instanceof ClosedError) throw error;
      deny('synthetic-upstream-failed', 502);
    } finally { clearTimer(timer); }
  }

  return Object.freeze({
    async fetch(request) {
      let run = null, token = null, cors = false;
      try {
        const route = exactRoute(request); cors = true;
        if (route === 'preflight') return reply(204, 'preflight', true);
        const principal = await verify(request.headers.get('authorization'));
        // Revocation/block state is read atomically after asynchronous key/signature work.
        run = await coordinator.begin(principal);
        const auth = await dispatch('token', run, principal);
        if (typeof auth.syntheticAccessToken !== 'string' || !/^synthetic:[A-Za-z0-9_-]{1,120}$/.test(auth.syntheticAccessToken)) deny('synthetic-upstream-rejected', 502);
        token = auth.syntheticAccessToken;
        const data = await dispatch('quote', run, principal, token);
        token = null;
        if (data.symbol !== '005930' || data.venue !== 'KRX' || data.currency !== 'KRW' ||
            typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0 || data.price > 1e9) deny('synthetic-quote-invalid', 502);
        const quote = Object.freeze({ ticker: '005930', market: 'KR', venue: 'KRX', currency: 'KRW', price: data.price,
          source: 'kis-synthetic', synthetic: true, verification: 'unverified', kind: 'unknown',
          asOfTime: null, exchangeTimestamp: null, receivedAt: new Date(now()).toISOString(),
          independent: false, usableForSignals: false, persistAllowed: false });
        // Last persisted revocation/expiry/deadline check, immediately before response creation.
        await coordinator.publish(run.id, principal);
        return reply(200, 'synthetic-result-only', true, quote);
      } catch (error) {
        token = null;
        if (run) { try { await coordinator.fail(run.id); } catch { /* Missing storage is not a reason to refund or retry. */ } }
        const code = error instanceof ClosedError && Object.hasOwn(PUBLIC_ERRORS, error.code) ? error.code : 'candidate-unavailable';
        return reply(PUBLIC_ERRORS[code] || 503, code, cors);
      }
    }
  });
}

// DO-compatible skeleton only. Missing approved infrastructure keeps the real entry closed.
// All requests for one upstream credential would have to reach ONE server-selected object.
export class SyntheticPilotDurableObject {
  constructor(state, options = {}) { this.coordinator = coordinatorFromDurableObjectState(state, options); }
  async fetch() { return reply(503, 'live-disabled'); }
}

// Immutable live gate: no env flag, project ID, secret, endpoint or binding enables this.
export default Object.freeze({ async fetch() { return reply(503, 'live-disabled'); } });
