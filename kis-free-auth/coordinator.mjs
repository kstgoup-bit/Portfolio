import { deny, ClosedError } from './auth.mjs';
export const STATE_KEY = 'synthetic-account-pilot-v1';
export const LIMITS = Object.freeze({ total: 2, token: 1, quote: 1, overallMs: 60000, requestMs: 10000 });
const modes = new Set(['running', 'failed', 'published']);
const safeMs = n => Number.isSafeInteger(n) && n >= 0;

function validate(s) {
  if (!s || s.version !== 1 || s.mode !== 'synthetic-only' || typeof s.blocked !== 'boolean' ||
      !Number.isSafeInteger(s.cutoffAuthTime) || s.cutoffAuthTime < -1 || !safeMs(s.revision) || !safeMs(s.lastNow)) deny('storage-unavailable');
  if (s.pilot !== null) {
    const p = s.pilot;
    if (!p || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(p.id) || !modes.has(p.phase) ||
        !safeMs(p.startedAt) || p.startedAt > s.lastNow || !safeMs(p.deadline) || p.deadline !== p.startedAt + LIMITS.overallMs ||
        !Number.isInteger(p.token) || p.token < 0 || p.token > 1 ||
        !Number.isInteger(p.quote) || p.quote < 0 || p.quote > 1 || p.quote > p.token ||
        p.total !== p.token + p.quote || p.total > 2 ||
        ![null, 'token', 'quote'].includes(p.pending) ||
        (p.pending === 'token' && (p.token !== 1 || p.quote !== 0)) ||
        (p.pending === 'quote' && (p.token !== 1 || p.quote !== 1)) ||
        (p.phase === 'published' && (p.total !== 2 || p.pending !== null))) deny('storage-unavailable');
  }
  return s;
}

// storage MUST provide a durable, serializable transaction (Cloudflare DO storage shape).
// No instance-memory mutex, KV read/put or fallback is accepted as the durable contract.
export class PilotCoordinator {
  constructor(storage, { now = Date.now, makeRunId } = {}) {
    if (!storage || typeof storage.transaction !== 'function' || typeof makeRunId !== 'function') deny('storage-unavailable');
    this.storage = storage; this.now = now; this.makeRunId = makeRunId;
  }
  async transact(fn) {
    try {
      return await this.storage.transaction(async tx => {
        const state = validate(await tx.get(STATE_KEY));
        const now = this.now();
        if (!safeMs(now) || now < state.lastNow) deny('clock-unavailable');
        state.lastNow = now;
        const result = await fn(state, now);
        await tx.put(STATE_KEY, state);
        return result;
      });
    } catch (error) { if (error instanceof ClosedError) throw error; deny('storage-unavailable'); }
  }
  // Explicit offline fixture initialization only. Never called by the request handler.
  async initializeSynthetic() {
    try {
      return await this.storage.transaction(async tx => {
        if (await tx.get(STATE_KEY) !== undefined) deny('already-initialized');
        const now = this.now(); if (!safeMs(now)) deny('clock-unavailable');
        await tx.put(STATE_KEY, { version: 1, mode: 'synthetic-only', blocked: false, cutoffAuthTime: -1, revision: 0, lastNow: now, pilot: null });
      });
    } catch (error) { if (error instanceof ClosedError) throw error; deny('storage-unavailable'); }
  }
  authorize(state, principal, now) {
    const second = Math.floor(now / 1000);
    if (state.blocked) deny('owner-blocked', 403);
    if (!principal || !safeMs(principal.authTime) || !safeMs(principal.expiresAt) ||
        principal.expiresAt <= second || principal.authTime > second || second - principal.authTime > 900 ||
        principal.authTime <= state.cutoffAuthTime) deny('session-revoked', 401);
  }
  requireRun(state, id, now) {
    const p = state.pilot;
    if (!p || p.id !== id || p.phase !== 'running') deny('pilot-closed', 409);
    if (now >= p.deadline) deny('pilot-expired', 408);
    return p;
  }
  async begin(principal) {
    // Generated once, outside the retryable transaction. Never from client input.
    const id = this.makeRunId();
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) deny('run-id-unavailable');
    return this.transact((s, now) => {
      this.authorize(s, principal, now);
      if (s.pilot !== null) deny('pilot-already-started', 409);
      s.pilot = { id, phase: 'running', startedAt: now, deadline: now + LIMITS.overallMs, total: 0, token: 0, quote: 0, pending: null };
      return Object.freeze({ id, deadline: s.pilot.deadline });
    });
  }
  async reserve(id, principal, kind) {
    return this.transact((s, now) => {
      this.authorize(s, principal, now);
      const p = this.requireRun(s, id, now);
      if (!['token', 'quote'].includes(kind) || p.pending !== null || p.total >= LIMITS.total || p[kind] >= LIMITS[kind] ||
          (kind === 'quote' && p.token !== 1) || (kind === 'token' && p.quote !== 0)) deny('budget-denied', 429);
      p[kind]++; p.total++; p.pending = kind;
      return Object.freeze({ kind, reservedAt: now, deadline: Math.min(p.deadline, now + LIMITS.requestMs), revision: s.revision });
    });
  }
  async complete(id, principal, kind) {
    return this.transact((s, now) => {
      this.authorize(s, principal, now);
      const p = this.requireRun(s, id, now);
      if (!['token', 'quote'].includes(kind) || p.pending !== kind) deny('pilot-closed', 409);
      p.pending = null;
    });
  }
  async publish(id, principal) {
    return this.transact((s, now) => {
      this.authorize(s, principal, now);
      const p = this.requireRun(s, id, now);
      if (p.pending !== null || p.quote !== 1 || p.token !== 1) deny('pilot-closed', 409);
      p.phase = 'published';
      return Object.freeze({ synthetic: true, verification: 'unverified' });
    });
  }
  async fail(id) {
    return this.transact(s => { if (s.pilot?.id === id && s.pilot.phase === 'running') s.pilot.phase = 'failed'; });
  }
  // Server-only policy operation, deliberately no HTTP route. No token/UID/email stored.
  // Inclusive cutoff: auth_time <= cutoff is rejected, including refreshed old sessions.
  // Unblocking never decreases cutoff and never resets the pilot or its consumed budget.
  async setOwnerPolicy({ blocked, cutoffAuthTime }) {
    return this.transact((s, now) => {
      if (typeof blocked !== 'boolean' || !Number.isSafeInteger(cutoffAuthTime) || cutoffAuthTime < s.cutoffAuthTime ||
          cutoffAuthTime > Math.floor(now / 1000)) deny('policy-invalid', 400);
      if (s.revision === Number.MAX_SAFE_INTEGER) deny('storage-unavailable');
      s.blocked = blocked; s.cutoffAuthTime = cutoffAuthTime; s.revision++;
      // A stop permanently cancels a running pilot. Unblocking cannot revive an old send/result.
      if (blocked && s.pilot?.phase === 'running') s.pilot.phase = 'failed';
    });
  }
}

// Minimal DO-compatible storage adapter. No namespace, binding ID or deployment configuration.
export function coordinatorFromDurableObjectState(state, options) {
  return new PilotCoordinator(state?.storage, options);
}
