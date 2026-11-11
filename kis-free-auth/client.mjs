// In-memory architecture seam, not a working Firebase client. No imports/downloads/SDK/network.
// A reviewed SDK adapter must select inMemoryPersistence and implement generation-scoped cleanup.
import { ROUTE, SYNTHETIC_APP_ORIGIN, SYNTHETIC_RELAY_ORIGIN } from './worker.mjs';
const failure = code => Object.freeze({ ok: false, mode: 'synthetic-only', code });
const CANCELLED = Symbol('cancelled');

export function createMemoryLoginAdapter({ authAdapter, requestAdapter, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!authAdapter || authAdapter.mode !== 'synthetic-only' || typeof authAdapter.useMemoryPersistence !== 'function' ||
      typeof authAdapter.signInGoogle !== 'function' || typeof authAdapter.signOut !== 'function' ||
      typeof requestAdapter !== 'function' || requestAdapter.mode !== 'synthetic-only' ||
      typeof setTimer !== 'function' || typeof clearTimer !== 'function') throw new Error('synthetic-adapter-required');
  let session = null, epoch = 0, active = null;
  function cancel(code = 'session-ended') {
    const op = active;
    if (op) {
      active = null; op.code = code; op.abort.abort(); clearTimer(op.timer); op.resolveCancel(CANCELLED);
    }
  }
  function start(timeoutMs) {
    const op = { epoch, abort: new AbortController(), code: 'session-ended', timer: null };
    op.cancelled = new Promise(resolve => { op.resolveCancel = resolve; });
    active = op;
    op.timer = setTimer(() => { if (active === op) cancel('operation-timeout'); }, timeoutMs);
    return op;
  }
  const current = op => active === op && op.epoch === epoch;
  const context = op => Object.freeze({ generation: op.epoch, signal: op.abort.signal });
  async function step(op, promise) {
    const result = await Promise.race([promise, op.cancelled]);
    if (result === CANCELLED || !current(op)) throw CANCELLED;
    return result;
  }
  function finish(op) { clearTimer(op.timer); if (active === op) active = null; }

  return Object.freeze({
    async signIn() {
      if (active) return failure('busy');
      session = null; ++epoch; const op = start(120000);
      try {
        await step(op, authAdapter.useMemoryPersistence(context(op)));
        const next = await step(op, authAdapter.signInGoogle(context(op)));
        if (!next || typeof next.getIdToken !== 'function') return failure('sign-in-failed');
        session = next; return Object.freeze({ ok: true, mode: 'synthetic-only' });
      } catch (error) {
        if (op.epoch === epoch) session = null;
        return failure(error === CANCELLED ? op.code : 'sign-in-failed');
      } finally { finish(op); }
    },
    async quote() {
      if (active || !session) return failure(active ? 'busy' : 'signed-out');
      const signedInSession = session, op = start(75000); let idToken = null;
      try {
        idToken = await step(op, signedInSession.getIdToken(context(op)));
        if (typeof idToken !== 'string' || idToken.length > 8192 || !/^[A-Za-z0-9_.-]+$/.test(idToken)) return failure('token-unavailable');
        const response = await step(op, requestAdapter(new Request(SYNTHETIC_RELAY_ORIGIN + ROUTE, {
          method: 'GET', headers: { origin: SYNTHETIC_APP_ORIGIN, authorization: 'Bearer ' + idToken },
          credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: op.abort.signal
        })));
        idToken = null;
        const result = await step(op, response.json());
        if (!response.ok || result?.mode !== 'synthetic-only' || result?.liveEnabled !== false || !result?.ok ||
            result?.quote?.synthetic !== true || result.quote.ticker !== '005930' || result.quote.venue !== 'KRX' ||
            result.quote.currency !== 'KRW' || (result.quote.market !== undefined && result.quote.market !== 'KR') ||
            typeof result.quote.price !== 'number' || !Number.isFinite(result.quote.price) || result.quote.price <= 0 || result.quote.price > 1e9) return failure('quote-unavailable');
        // Never expose the raw response, user object, token, profile or diagnostic contents.
        return Object.freeze({ ok: true, mode: 'synthetic-only', quote: Object.freeze({ ticker: '005930', venue: 'KRX', currency: 'KRW',
          price: result.quote.price, source: 'kis-synthetic', verification: 'unverified', synthetic: true,
          kind: 'unknown', exchangeTimestamp: null, independent: false, usableForSignals: false, persistAllowed: false }) });
      } catch (error) { return failure(error === CANCELLED ? op.code : 'quote-unavailable'); }
      finally { idToken = null; finish(op); }
    },
    async signOut() {
      const oldSession = session, oldGeneration = epoch;
      ++epoch; session = null; cancel();
      const op = start(10000);
      try {
        // Scope cleanup to the OLD generation. An unscoped Firebase signOut adapter is unfinished.
        await step(op, authAdapter.signOut(Object.freeze({ session: oldSession, generation: oldGeneration, signal: op.abort.signal })));
        return Object.freeze({ ok: true });
      } catch (error) { return failure(error === CANCELLED ? op.code : 'sign-out-incomplete'); }
      finally { finish(op); }
    },
    // Call on pagehide/navigation. Reference removal does NOT promise secure memory erasure.
    clear() { ++epoch; session = null; cancel(); },
    status() { return Object.freeze({ signedIn: session !== null, busy: active !== null, mode: 'synthetic-only' }); }
  });
}
