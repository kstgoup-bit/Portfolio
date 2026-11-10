'use strict';
// Focused, synthetic-only tests. RSA is generated locally, not a Firebase credential.
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const T0 = Date.parse('2026-11-10T12:00:00Z');
const PROJECT = 'synthetic-has-project', UID = 'synthetic-owner';
const b64 = s => Buffer.from(s).toString('base64url');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let A, C, W, Client, keys;

// In-process model of a SERIALIZABLE durable store. State survives coordinator recreation.
// It is NOT a Cloudflare runtime validation or proof of a deployed DO namespace mapping.
class DurableModel {
  constructor() { this.records = new Map(); this.tail = Promise.resolve(); this.fail = false; this.uncertain = false; }
  transaction(fn) {
    const op = this.tail.then(async () => {
      if (this.fail) throw new Error('synthetic storage failure');
      const staged = structuredClone(this.records);
      const result = await fn({ get: async key => structuredClone(staged.get(key)), put: async (key, value) => staged.set(key, structuredClone(value)) });
      this.records = staged;
      if (this.uncertain) { this.uncertain = false; throw new Error('synthetic commit acknowledgement lost'); }
      return result;
    });
    this.tail = op.catch(() => {}); return op;
  }
  state() { return structuredClone(this.records.get(C.STATE_KEY)); }
}
const claims = overrides => ({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: UID, user_id: UID,
  iat: T0 / 1000, auth_time: T0 / 1000, exp: T0 / 1000 + 3600, firebase: { sign_in_provider: 'google.com' }, ...overrides });
async function sign(payload = claims(), header = { alg: 'RS256', typ: 'JWT', kid: 'synthetic-key' }, pair = keys) {
  const text = b64(typeof header === 'string' ? header : JSON.stringify(header)) + '.' + b64(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, Buffer.from(text));
  return text + '.' + Buffer.from(signature).toString('base64url');
}
const keyProvider = async ({ kid, projectId }) => {
  assert.equal(projectId, PROJECT);
  if (kid !== 'synthetic-key') throw new Error('unknown key');
  return { key: keys.publicKey, kid, validUntilMs: T0 + 7200000 };
};
const verifier = options => A.createFirebaseVerifier({ config: { projectId: PROJECT, ownerUid: UID }, keyProvider, subtle: webcrypto.subtle, now: () => T0, ...options });
const tokenResponse = () => ({ synthetic: true, status: 200, redirected: false, syntheticAccessToken: 'synthetic:temporary' });
const quoteResponse = () => ({ synthetic: true, status: 200, redirected: false, symbol: '005930', venue: 'KRX', currency: 'KRW', price: 71500 });
function request(jwt, changes = {}) {
  return new Request(changes.url || W.SYNTHETIC_RELAY_ORIGIN + W.ROUTE, {
    method: changes.method || 'GET', headers: { origin: W.SYNTHETIC_APP_ORIGIN, ...(jwt ? { authorization: 'Bearer ' + jwt } : {}), ...changes.headers }
  });
}
async function harness(options = {}) {
  const storage = options.storage || new DurableModel();
  const now = options.now || (() => T0);
  const coordinator = new C.PilotCoordinator(storage, { now, makeRunId: () => 'synthetic-run-0001' });
  if (options.initialize !== false && !storage.state()) await coordinator.initializeSynthetic();
  const calls = [];
  const transport = async spec => { calls.push(spec); return options.transport ? options.transport(spec) : spec.kind === 'token' ? tokenResponse() : quoteResponse(); };
  transport.mode = 'synthetic-only';
  const worker = W.createSyntheticWorker({ authConfig: { projectId: PROJECT, ownerUid: UID }, keyProvider: options.keyProvider || keyProvider,
    subtle: webcrypto.subtle, coordinator, transport, now, ...(options.timers || {}) });
  return { storage, coordinator, calls, worker };
}

test.before(async () => {
  [A, C, W, Client] = await Promise.all(['auth', 'coordinator', 'worker', 'client'].map(n => import(`../kis-free-auth/${n}.mjs`)));
  keys = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
});

test('RSA-signed synthetic Google-owner JWT verifies; profile and token are not returned', async () => {
  const jwt = await sign(claims({ email: 'private@example.invalid', picture: 'private-avatar' }));
  const principal = await verifier()('Bearer ' + jwt);
  assert.deepEqual(principal, { uid: UID, projectId: PROJECT, authTime: T0 / 1000, issuedAt: T0 / 1000, expiresAt: T0 / 1000 + 3600 });
  assert.equal(Object.isFrozen(principal), true);
});
test('issuer, audience, exact UID, Google provider, tenant and all time claims fail closed', async () => {
  const bad = [
    { aud: 'synthetic-other' }, { aud: [PROJECT] }, { iss: 'https://evil.invalid' }, { sub: 'synthetic-other', email: 'same@example.invalid' },
    { user_id: 'synthetic-other' }, { exp: T0 / 1000 }, { iat: T0 / 1000 + 1 }, { auth_time: T0 / 1000 + 1 },
    { auth_time: T0 / 1000 - 901 }, { exp: T0 / 1000 + 3601 }, { exp: String(T0 / 1000 + 3600) }, { auth_time: null },
    { nbf: T0 / 1000 + 1 }, { firebase: { sign_in_provider: 'password' } }, { firebase: { sign_in_provider: 'google.com', tenant: 'tenant' } }
  ];
  for (const change of bad) await assert.rejects(verifier()('Bearer ' + await sign(claims(change))), /auth-invalid/);
});
test('alg none, HS256, supplied keys/URLs and unsupported JOSE extensions rejected before key fetch', async () => {
  let reads = 0; const verify = verifier({ keyProvider: async () => { reads++; return null; } });
  const headers = [{ alg: 'none' }, { alg: 'HS256' }, { jku: 'https://evil.invalid/keys' }, { jwk: {} }, { x5u: 'https://evil.invalid' }, { crit: ['b64'] }, { b64: false }, { kid: '../key' }];
  for (const h of headers) await assert.rejects(verify('Bearer ' + await sign(claims(), { alg: 'RS256', kid: 'synthetic-key', ...h })), /auth-invalid/);
  assert.equal(reads, 0);
});
test('duplicate/escaped-equivalent keys, invalid JSON/UTF8, padded JWT and malformed bearer rejected', async () => {
  const raws = [JSON.stringify(claims()).replace('"sub":', '"s\\u0075b":"synthetic-other","sub":'),
    JSON.stringify(claims()).replace('"firebase":{', '"firebase":{"sign_in_provider":"password",'),
    '[1,2]', '{"__proto__":{}}', '{"sub":1,}', '{"sub":01}'];
  for (const raw of raws) await assert.rejects(verifier()('Bearer ' + await sign(raw)));
  const jwt = await sign();
  for (const raw of ['', jwt, 'bearer ' + jwt, 'Bearer ' + jwt + '=', 'Bearer ' + jwt + '.x', 'Bearer ' + b64(Buffer.from([255])) + '.e30.x']) await assert.rejects(verifier()(raw));
});
test('wrong signature, unknown kid, stale/missing/public-key mismatch and missing official provider reject', async () => {
  const foreign = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  await assert.rejects(verifier()('Bearer ' + await sign(claims(), undefined, foreign)), /auth-invalid/);
  await assert.rejects(verifier()('Bearer ' + await sign(claims(), { alg: 'RS256', kid: 'unknown' })));
  for (const material of [null, { kid: 'synthetic-key', key: keys.publicKey, validUntilMs: T0 }, { kid: 'wrong', key: keys.publicKey, validUntilMs: T0 + 1000 }, { kid: 'synthetic-key', key: keys.privateKey, validUntilMs: T0 + 1000 }]) {
    await assert.rejects(verifier({ keyProvider: async () => material })('Bearer ' + await sign()));
  }
  await assert.rejects(A.unavailableOfficialKeyProvider(), /not-implemented/);
});
test('post-await clock invalidity/rollback and key TTL expiry reject', async () => {
  const jwt = await sign();
  for (const after of [NaN, -1, T0 - 1, Number.MAX_SAFE_INTEGER + 1]) {
    let clock = T0;
    await assert.rejects(verifier({ now: () => clock, keyProvider: async input => { const key = await keyProvider(input); clock = after; return key; } })('Bearer ' + jwt));
  }
  let clock = T0;
  await assert.rejects(verifier({ now: () => clock,
    keyProvider: async input => ({ ...await keyProvider(input), validUntilMs: T0 + 1 }),
    subtle: { verify: async (...args) => { const result = await webcrypto.subtle.verify(...args); clock += 2; return result; } }
  })('Bearer ' + jwt), /auth-keys-unavailable/);
});
test('default Worker is permanently disabled, regardless of supplied env, request or adapters', async () => {
  const r = await W.default.fetch(request(await sign()), { LIVE_ENABLED: true, KIS_BASE: 'https://evil.invalid', KIS_APP_KEY: 'never-read', FIREBASE_PROJECT: PROJECT });
  assert.equal(r.status, 503); assert.equal((await r.json()).code, 'live-disabled');
  assert.throws(() => W.createSyntheticWorker({}), /auth-config/);
  assert.throws(() => verifier({ config: { projectId: 'real-project', ownerUid: UID } }), /auth-config/);
});
test('one manual synthetic pilot consumes token+quote exactly and only returns an unverified auxiliary value', async () => {
  const h = await harness(), jwt = await sign();
  const r = await h.worker.fetch(request(jwt)), body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.liveEnabled, false); assert.equal(body.quote.price, 71500);
  assert.equal(body.quote.exchangeTimestamp, null); assert.equal(body.quote.verification, 'unverified');
  assert.equal(body.quote.usableForSignals, false); assert.equal(body.quote.persistAllowed, false);
  assert.equal(r.headers.get('access-control-allow-credentials'), null);
  assert.equal(r.headers.get('access-control-allow-origin'), W.SYNTHETIC_APP_ORIGIN);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.deepEqual(h.calls.map(c => c.kind), ['token', 'quote']);
  for (const spec of h.calls) { assert.equal(spec.destination, 'https://kis.synthetic.invalid'); assert.equal(spec.redirect, 'error'); assert.equal(spec.retries, 0); }
  assert.equal(h.calls[1].symbol, '005930'); assert.equal(h.calls[1].venue, 'KRX');
  const s = h.storage.state(); assert.equal(s.pilot.phase, 'published'); assert.equal(s.pilot.total, 2);
  for (const text of [JSON.stringify(s), JSON.stringify(body)]) { assert.ok(!text.includes(jwt)); assert.ok(!text.includes('synthetic:temporary')); assert.ok(!text.includes(UID)); }
});
test('all other symbols/markets/account/order/token routes, queries, origins and credentials are denied', async () => {
  const h = await harness(), jwt = await sign();
  for (const suffix of ['/v1/quote/kr/000660', '/v1/quote/us/AAPL', '/v1/account', '/v1/balance', '/v1/order', '/oauth2/tokenP', W.ROUTE + '?token=private', W.ROUTE + '/', '/v1/quote/kr/%3005930']) {
    assert.notEqual((await h.worker.fetch(request(jwt, { url: W.SYNTHETIC_RELAY_ORIGIN + suffix }))).status, 200);
  }
  for (const changes of [{ method: 'POST' }, { headers: { origin: 'https://evil.invalid' } }, { headers: { origin: '' } },
    { headers: { cookie: 'private' } }, { headers: { 'x-has-auth': 'old-shared-secret' } }, { url: 'https://evil.invalid' + W.ROUTE }]) {
    assert.notEqual((await h.worker.fetch(request(jwt, changes))).status, 200);
  }
  assert.equal(h.calls.length, 0); assert.equal(h.storage.state().pilot, null);
});
test('preflight is exact-origin/exact-route/exact-method; no authentication or quota reservation', async () => {
  const h = await harness();
  const req = changes => request(null, { method: 'OPTIONS', headers: { 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization', ...changes } });
  assert.equal((await h.worker.fetch(req({}))).status, 204);
  for (const changes of [{ origin: 'null' }, { 'access-control-request-method': 'POST' }, { 'access-control-request-headers': 'authorization, x-has-auth' }]) assert.equal((await h.worker.fetch(req(changes))).status, 403);
  assert.equal(h.calls.length, 0); assert.equal(h.storage.state().pilot, null);
});
test('invalid auth never reserves or dispatches; errors never reflect private request/provider content', async () => {
  const h = await harness();
  const r = await h.worker.fetch(request('private-token-marker')); assert.equal(r.status, 401);
  assert.ok(!(await r.text()).includes('private-token-marker'));
  assert.equal(h.calls.length, 0); assert.equal(h.storage.state().pilot, null);
  const fail = await harness({ transport: () => { throw new Error('private provider profile and token'); } });
  const result = await fail.worker.fetch(request(await sign()));
  assert.equal(result.status, 502); assert.ok(!(await result.text()).includes('private'));
});
test('many independent Worker/coordinator instances share one atomic persistent pilot and two total reservations', async () => {
  const storage = new DurableModel(); await harness({ storage });
  const instances = await Promise.all(Array.from({ length: 20 }, () => harness({ storage }))), jwt = await sign();
  const responses = await Promise.all(instances.map(h => h.worker.fetch(request(jwt))));
  assert.equal(responses.filter(r => r.status === 200).length, 1);
  assert.equal(instances.flatMap(h => h.calls).length, 2);
  assert.equal(storage.state().pilot.total, 2);
});
test('restart after uncertain token outcome never retries, refunds, reissues or resets pilot', async () => {
  const h = await harness({ transport: () => { throw new Error('uncertain'); } }), jwt = await sign();
  assert.equal((await h.worker.fetch(request(jwt))).status, 502);
  const restarted = await harness({ storage: h.storage });
  assert.equal((await restarted.worker.fetch(request(jwt))).status, 409);
  assert.equal(h.calls.length, 1); assert.equal(restarted.calls.length, 0);
  assert.equal(h.storage.state().pilot.total, 1); assert.equal(h.storage.state().pilot.token, 1);
  await assert.rejects(restarted.coordinator.initializeSynthetic(), /already-initialized/);
});
test('missing, corrupt or failed storage denies all dispatch, never local-memory fallback', async () => {
  const jwt = await sign();
  const missing = await harness({ initialize: false }); assert.equal((await missing.worker.fetch(request(jwt))).status, 503); assert.equal(missing.calls.length, 0);
  const failed = await harness(); failed.storage.fail = true; assert.equal((await failed.worker.fetch(request(jwt))).status, 503); assert.equal(failed.calls.length, 0);
  const broken = await harness(); broken.storage.records.set(C.STATE_KEY, { version: 1 }); assert.equal((await broken.worker.fetch(request(jwt))).status, 503); assert.equal(broken.calls.length, 0);
});
test('lost durable commit acknowledgement consumes the lock and cannot cause duplicate dispatch', async () => {
  const h = await harness(); h.storage.uncertain = true;
  const jwt = await sign(); assert.equal((await h.worker.fetch(request(jwt))).status, 503);
  assert.equal(h.calls.length, 0); assert.ok(h.storage.state().pilot);
  assert.equal((await (await harness({ storage: h.storage })).worker.fetch(request(jwt))).status, 409);
});
test('inclusive auth_time cutoff blocks refresh of old session and unblocking never resets cutoff or budget', async () => {
  const h = await harness(); await h.coordinator.setOwnerPolicy({ blocked: false, cutoffAuthTime: T0 / 1000 });
  const jwt = await sign(claims({ auth_time: T0 / 1000, iat: T0 / 1000 }));
  assert.equal((await h.worker.fetch(request(jwt))).status, 401); assert.equal(h.calls.length, 0);
  await h.coordinator.setOwnerPolicy({ blocked: true, cutoffAuthTime: T0 / 1000 });
  await h.coordinator.setOwnerPolicy({ blocked: false, cutoffAuthTime: T0 / 1000 });
  await assert.rejects(h.coordinator.setOwnerPolicy({ blocked: false, cutoffAuthTime: T0 / 1000 - 1 }), /policy-invalid/);
  assert.equal((await h.worker.fetch(request(jwt))).status, 401);
});
test('emergency block while key fetch waits denies begin and sends nothing', async () => {
  const gate = deferred(), entered = deferred();
  const h = await harness({ keyProvider: async input => { entered.resolve(); await gate.promise; return keyProvider(input); } });
  const pending = h.worker.fetch(request(await sign())); await entered.promise;
  await h.coordinator.setOwnerPolicy({ blocked: true, cutoffAuthTime: T0 / 1000 }); gate.resolve();
  assert.equal((await pending).status, 403); assert.equal(h.calls.length, 0);
});
test('emergency block during token transport prevents quote; reservation survives restart', async () => {
  const gate = deferred(), entered = deferred();
  const h = await harness({ transport: async () => { entered.resolve(); await gate.promise; return tokenResponse(); } });
  const pending = h.worker.fetch(request(await sign())); await entered.promise;
  await h.coordinator.setOwnerPolicy({ blocked: true, cutoffAuthTime: T0 / 1000 }); gate.resolve();
  assert.equal((await pending).status, 403); assert.equal(h.calls.length, 1); assert.equal(h.storage.state().pilot.total, 1);
  const restarted = await harness({ storage: h.storage }); assert.equal((await restarted.worker.fetch(request(await sign()))).status, 403);
});
test('auth_time revocation during quote transport suppresses publication and retains both reservations', async () => {
  const gate = deferred(), entered = deferred();
  const h = await harness({ transport: async spec => { if (spec.kind === 'token') return tokenResponse(); entered.resolve(); await gate.promise; return quoteResponse(); } });
  const pending = h.worker.fetch(request(await sign())); await entered.promise;
  await h.coordinator.setOwnerPolicy({ blocked: false, cutoffAuthTime: T0 / 1000 }); gate.resolve();
  const r = await pending; assert.equal(r.status, 401); assert.equal((await r.json()).quote, undefined);
  assert.equal(h.storage.state().pilot.total, 2); assert.equal(h.storage.state().pilot.phase, 'failed');
});
test('redirect, location, wrong status, malformed token/quote and network errors stop without retry', async () => {
  const jwt = await sign();
  for (const response of [{ ...tokenResponse(), status: 302 }, { ...tokenResponse(), redirected: true }, { ...tokenResponse(), location: 'https://evil.invalid' },
    { ...tokenResponse(), syntheticAccessToken: 'real-looking-token' }, { ...tokenResponse(), synthetic: false }]) {
    const h = await harness({ transport: () => response }); assert.notEqual((await h.worker.fetch(request(jwt))).status, 200); assert.equal(h.calls.length, 1);
  }
  for (const response of [{ ...quoteResponse(), symbol: '000660' }, { ...quoteResponse(), venue: 'NXT' }, { ...quoteResponse(), price: NaN }, { ...quoteResponse(), price: '71500' }]) {
    const h = await harness({ transport: spec => spec.kind === 'token' ? tokenResponse() : response }); assert.equal((await h.worker.fetch(request(jwt))).status, 502); assert.equal(h.calls.length, 2);
  }
});
test('10-second per-request timeout aborts and consumes attempted request, including ignored abort', async () => {
  const entered = deferred(); let fire, timeoutMs, signal;
  const h = await harness({ timers: { setTimer: (fn, ms) => { fire = fn; timeoutMs = ms; return 1; }, clearTimer: () => {} },
    transport: spec => { signal = spec.signal; entered.resolve(); return new Promise(() => {}); } });
  const pending = h.worker.fetch(request(await sign())); await entered.promise; assert.equal(timeoutMs, 10000); fire();
  assert.equal((await pending).status, 408); assert.equal(signal.aborted, true); assert.equal(h.storage.state().pilot.total, 1);
});
test('overall 60-second deadline and backwards storage clock deny additional reservations', async () => {
  let now = T0; const h = await harness({ now: () => now });
  const principal = await verifier()('Bearer ' + await sign()), run = await h.coordinator.begin(principal);
  now = T0 + 60000; await assert.rejects(h.coordinator.reserve(run.id, principal, 'token'), /pilot-expired/);
  assert.equal(h.storage.state().pilot.total, 0);
  now = T0 - 1; await assert.rejects(h.coordinator.reserve(run.id, principal, 'token'), /clock-unavailable/);
});
test('token timeout checked after awaited transport even if its timer has not fired', async () => {
  let now = T0; const h = await harness({ now: () => now, transport: () => { now += 10000; return tokenResponse(); } });
  assert.equal((await h.worker.fetch(request(await sign()))).status, 408); assert.equal(h.calls.length, 1); assert.equal(h.storage.state().pilot.total, 1);
});
test('memory client enforces persistence-before-login, suppresses secrets and clears state on logout', async () => {
  const h = await harness(), jwt = await sign(), events = [];
  const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => events.push('memory'),
    signInGoogle: async () => { events.push('login'); return { getIdToken: async () => jwt, email: 'private' }; }, signOut: async () => events.push('logout') };
  const requestAdapter = async req => { assert.equal(req.credentials, 'omit'); assert.equal(req.redirect, 'error'); return h.worker.fetch(req); }; requestAdapter.mode = 'synthetic-only';
  const client = Client.createMemoryLoginAdapter({ authAdapter, requestAdapter });
  assert.equal((await client.quote()).code, 'signed-out'); assert.equal((await client.signIn()).ok, true);
  assert.deepEqual(events, ['memory', 'login']); assert.equal((await client.quote()).quote.verification, 'unverified');
  assert.ok(!JSON.stringify(client.status()).includes(jwt)); await client.signOut(); assert.equal(client.status().signedIn, false);
  assert.equal((await client.quote()).code, 'signed-out');
});
test('client logout while ID token waits prevents transport; logout during response prevents display', async () => {
  for (const stage of ['token', 'response']) {
    const gate = deferred(), entered = deferred(); let calls = 0;
    const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => {}, signOut: async () => {},
      signInGoogle: async () => ({ getIdToken: async () => { if (stage === 'token') { entered.resolve(); await gate.promise; } return await sign(); } }) };
    const requestAdapter = async () => { calls++; entered.resolve(); await gate.promise; return new Response('{}'); }; requestAdapter.mode = 'synthetic-only';
    const client = Client.createMemoryLoginAdapter({ authAdapter, requestAdapter }); await client.signIn();
    const pending = client.quote(); await entered.promise; await client.signOut(); gate.resolve();
    assert.equal((await pending).code, 'session-ended'); assert.equal(calls, stage === 'token' ? 0 : 1);
  }
});
test('client never persists identity, imports SDKs, accesses existing app storage or logs raw content', () => {
  const folder = path.join(__dirname, '../kis-free-auth');
  const source = fs.readdirSync(folder).filter(f => f.endsWith('.mjs')).map(f => fs.readFileSync(path.join(folder, f), 'utf8')).join('\n');
  assert.doesNotMatch(source, /localStorage\.|sessionStorage\.|indexedDB\.|console\.|KIS_APP_KEY|KIS_APP_SECRET|https:\/\/openapi\.koreainvestment/);
  assert.doesNotMatch(source, /from ['"](?:firebase|https?:)|globalThis\.fetch|fetch\(url|portfolio_v5|snapshot-policy|ledger-years|gas-redact/);
  assert.equal(globalThis.__hasNoNetworkInstalled?.attempts.length, 0);
});
test('client clear cancels a never-settling login and old completion cannot clear a newer busy operation', async () => {
  const old = deferred(), next = deferred(), entered = deferred(); let count = 0;
  const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => {}, signOut: async () => {},
    signInGoogle: async () => { count++; if (count === 1) { entered.resolve(); return old.promise; } return next.promise; } };
  const requestAdapter = async () => new Response('{}'); requestAdapter.mode = 'synthetic-only';
  const client = Client.createMemoryLoginAdapter({ authAdapter, requestAdapter });
  const first = client.signIn(); await entered.promise; client.clear();
  const second = client.signIn(); assert.equal((await first).code, 'session-ended');
  old.resolve({ getIdToken: async () => 'old' }); await Promise.resolve();
  assert.equal(client.status().busy, true); assert.equal(client.status().signedIn, false);
  next.resolve({ getIdToken: async () => 'new' }); assert.equal((await second).ok, true); assert.equal(client.status().signedIn, true);
  client.clear();
});
test('client cancellation resolves even if ID-token provider never settles and permits fresh login', async () => {
  const entered = deferred();
  const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => {}, signOut: async () => {},
    signInGoogle: async () => ({ getIdToken: () => { entered.resolve(); return new Promise(() => {}); } }) };
  const requestAdapter = async () => { assert.fail('no request permitted'); }; requestAdapter.mode = 'synthetic-only';
  const client = Client.createMemoryLoginAdapter({ authAdapter, requestAdapter }); await client.signIn();
  const pending = client.quote(); await entered.promise; await client.signOut();
  assert.equal((await pending).code, 'session-ended'); assert.equal((await client.signIn()).ok, true); client.clear();
});
test('client timeout is bounded and an old scoped logout cannot mutate newer client state', async () => {
  let fire; const logout = deferred(), entered = deferred(), cleanup = [];
  const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => {},
    signOut: async ctx => { cleanup.push(ctx); entered.resolve(); return logout.promise; }, signInGoogle: async () => ({ getIdToken: async () => 'token' }) };
  const requestAdapter = async () => new Response('{}'); requestAdapter.mode = 'synthetic-only';
  const client = Client.createMemoryLoginAdapter({ authAdapter, requestAdapter, setTimer: fn => { fire = fn; return 1; }, clearTimer: () => {} });
  await client.signIn(); const pending = client.signOut(); await entered.promise; fire();
  assert.equal((await pending).code, 'operation-timeout'); assert.equal(cleanup[0].signal.aborted, true);
  assert.equal((await client.signIn()).ok, true); logout.resolve(); await Promise.resolve();
  assert.equal(client.status().signedIn, true); assert.equal(client.status().busy, false); client.clear();
});
