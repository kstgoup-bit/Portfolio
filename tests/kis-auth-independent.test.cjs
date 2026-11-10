'use strict';
// Independent adversarial review: local synthetic identity/signing only.
// This is not Firebase JWKS, Firebase Auth, Workers or Durable Objects integration.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const NOW = Math.floor(Date.parse('2026-11-10T01:00:00Z') / 1000);
const PROJECT = 'synthetic-has-project';
const OWNER = 'synthetic-owner-not-a-person';
const KEY_ID = 'synthetic-key-1';
const ALG = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const keys = webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
function claims(overrides = {}) {
  return { iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: OWNER, user_id: OWNER, iat: NOW - 10, exp: NOW + 300, auth_time: NOW - 30, firebase: { sign_in_provider: 'google.com' }, ...overrides };
}

const auth = import('../kis-free-auth/auth.mjs');
const coordination = import('../kis-free-auth/coordinator.mjs');
const workerModule = import('../kis-free-auth/worker.mjs');
const clientModule = import('../kis-free-auth/client.mjs');
async function verifier(options = {}) {
  const pair = await keys;
  return (await auth).createFirebaseVerifier({
    config: { projectId: PROJECT, ownerUid: OWNER }, subtle: webcrypto.subtle, now: () => NOW * 1000,
    keyProvider: async ({ kid, projectId }) => {
      assert.equal(projectId, PROJECT);
      return kid === KEY_ID ? { kid, key: pair.publicKey, validUntilMs: (NOW + 600) * 1000 } : null;
    }, ...options
  });
}
async function rejectsJWT(payload, header, options = {}) {
  const check = await verifier(options);
  await assert.rejects(check('Bearer ' + await signed(payload, header)), error => /^auth-/.test(error.code));
}
const principal = overrides => ({ uid: OWNER, projectId: PROJECT, authTime: NOW - 30, issuedAt: NOW - 10, expiresAt: NOW + 300, ...overrides });

// Independent serialized transaction model. It exercises the contract, not Cloudflare itself.
class TransactionStore {
  constructor() { this.values = new Map(); this.queue = Promise.resolve(); this.failRead = false; this.failPut = false; this.uncertainCommit = false; }
  transaction(callback) {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.values);
      const tx = {
        get: async key => { if (this.failRead) throw Error('SYNTHETIC_STORAGE_SECRET'); return structuredClone(draft.get(key)); },
        put: async (key, value) => { if (this.failPut) throw Error('SYNTHETIC_STORAGE_SECRET'); draft.set(key, structuredClone(value)); }
      };
      const result = await callback(tx);
      this.values = draft;
      if (this.uncertainCommit) { this.uncertainCommit = false; throw Error('SYNTHETIC_UNCERTAIN_COMMIT_SECRET'); }
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async snapshot() { await this.queue; return structuredClone(this.values.get((await coordination).STATE_KEY)); }
}
async function setup({ initialize = true, now = () => NOW * 1000 } = {}) {
  const store = new TransactionStore(), { PilotCoordinator } = await coordination;
  let sequence = 0;
  const create = () => new PilotCoordinator(store, { now, makeRunId: () => 'independent_run_' + (++sequence) });
  const coordinator = create();
  if (initialize) await coordinator.initializeSynthetic();
  return { store, coordinator, create };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function upstream(kind) {
  return kind === 'token' ? { synthetic: true, status: 200, redirected: false, syntheticAccessToken: 'synthetic:independent_fixture' } :
    { synthetic: true, status: 200, redirected: false, symbol: '005930', venue: 'KRX', currency: 'KRW', price: 71500 };
}
async function workerSetup(options = {}) {
  const fixture = await setup(options), pair = await keys, calls = [];
  const transport = options.transport || (async request => { calls.push(request); return upstream(request.kind); });
  transport.mode = 'synthetic-only';
  const worker = (await workerModule).createSyntheticWorker({
    authConfig: { projectId: PROJECT, ownerUid: OWNER }, subtle: webcrypto.subtle,
    keyProvider: async ({ kid }) => kid === KEY_ID ? { kid, key: pair.publicKey, validUntilMs: (NOW + 600) * 1000 } : null,
    coordinator: fixture.coordinator, transport, now: () => NOW * 1000, ...options
  });
  const token = await signed();
  const request = ({ url, method = 'GET', headers = {} } = {}) => new Request(url || 'https://has.synthetic.invalid/v1/quote/kr/005930', {
    method, headers: { origin: 'https://app.synthetic.invalid', authorization: 'Bearer ' + token, ...headers }
  });
  return { ...fixture, worker, calls, token, request };
}

test('independent: actual local RS256 signature verifies and returns only a frozen principal', async () => {
  const token = await signed(), result = await (await verifier())('Bearer ' + token);
  assert.deepEqual(result, principal());
  assert.equal(Object.isFrozen(result), true);
  assert.ok(!JSON.stringify(result).includes(token));
});

test('independent: unsigned, wrong algorithm and supplied key/URL headers are rejected', async () => {
  for (const alg of ['none', 'HS256', 'RS384', 'RS512', 'ES256', 'rs256', null]) await rejectsJWT(claims(), { alg, kid: KEY_ID });
  for (const [field, value] of Object.entries({ jku: 'https://attacker.invalid/keys', x5u: 'https://attacker.invalid/cert', jwk: {}, crit: [], zip: 'DEF', typ: 'at+jwt' })) {
    await rejectsJWT(claims(), { alg: 'RS256', kid: KEY_ID, [field]: value });
  }
  await assert.rejects((await verifier())('Bearer ' + b64({ alg: 'none', kid: KEY_ID }) + '.' + b64(claims()) + '.'));
});

test('independent: exact project issuer, audience and owner are required', async () => {
  const bad = {
    iss: ['https://securetoken.google.com/other-project', 'https://securetoken.google.com/' + PROJECT + '/', 'http://securetoken.google.com/' + PROJECT, 'https://securetoken.google.com.attacker.invalid/' + PROJECT],
    aud: ['other-project', [PROJECT], null, 1], sub: ['synthetic-another-owner', '', null, OWNER + ' '], user_id: ['synthetic-another-owner', null],
    firebase: [null, {}, { sign_in_provider: 'password' }, { sign_in_provider: 'anonymous' }, { sign_in_provider: 'google.com', tenant: 'other-tenant' }]
  };
  for (const [field, values] of Object.entries(bad)) for (const value of values) await rejectsJWT(claims({ [field]: value }));
});

test('independent: expiration, issued/auth times and numeric types fail closed', async () => {
  const bad = {
    exp: [NOW, NOW - 1, NOW + 4000, '9999999999', null, -1, NOW + 0.1],
    iat: [NOW + 1, NOW + 301, NOW - 4000, String(NOW - 10), null, -1, NOW - 0.1],
    auth_time: [NOW + 1, NOW - 5, NOW - 901, String(NOW - 30), null, -1, NOW - 30.5],
    nbf: [NOW + 1, String(NOW), null, -1]
  };
  for (const [field, values] of Object.entries(bad)) for (const value of values) await rejectsJWT(claims({ [field]: value }));
  for (const field of ['exp', 'iat', 'auth_time', 'sub', 'aud', 'iss', 'firebase']) { const p = claims(); delete p[field]; await rejectsJWT(p); }
});

test('independent: signed duplicate and escaped-equivalent JSON claims cannot override identity', async () => {
  const json = JSON.stringify(claims());
  for (const raw of [
    json.replace('"aud":', '"aud":"other-project","aud":'),
    json.replace('"sub":', '"s\\u0075b":"synthetic-attacker","sub":'),
    json.replace('"auth_time":', '"auth_time":0,"auth_time":'),
    json.replace('"sign_in_provider":', '"sign_in_provider":"anonymous","sign_in_provider":'),
    json.replace('"iss":', '"__proto__":{},"iss":'),
    json.replace('"iss":', '"constructor":{},"iss":'),
    json.replace('"exp":' + (NOW + 300), '"exp":1e999')
  ]) await rejectsJWT(raw);
  await rejectsJWT(claims(), '{"alg":"none","alg":"RS256","kid":"' + KEY_ID + '"}');
  await rejectsJWT(claims(), '{"alg":"RS256","kid":"wrong","k\\u0069d":"' + KEY_ID + '"}');
  for (const raw of ['null', '[]', 'true', '{', '{"x":NaN}', '{"x":1,}', '{"x":' + '['.repeat(20) + '0' + ']'.repeat(20) + '}']) await rejectsJWT(raw);
});

test('independent: wrong RSA key, unknown kid, altered payload and malformed signature are rejected', async () => {
  const other = await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const check = await verifier();
  await assert.rejects(check('Bearer ' + await signed(claims(), undefined, other)));
  await rejectsJWT(claims(), { alg: 'RS256', kid: 'unknown-key' });
  const token = await signed(), segments = token.split('.');
  await assert.rejects(check('Bearer ' + [segments[0], b64(claims({ auth_time: NOW - 31 })), segments[2]].join('.')));
  for (const signature of ['AA', '!', segments[2] + '=', segments[2].slice(1), 'A'.repeat(200)]) await assert.rejects(check('Bearer ' + [segments[0], segments[1], signature].join('.')));
  for (const raw of ['', 'bearer ' + token, 'Bearer  ' + token, 'Basic ' + token, 'Bearer ' + token + '.extra', 'Bearer ' + 'A'.repeat(8200), null, {}]) await assert.rejects(check(raw));
});

test('independent: stale/mismatched signing keys and non-RSA key confusion fail closed', async () => {
  const pair = await keys;
  const hmac = await webcrypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign', 'verify']);
  const weak = await webcrypto.subtle.generateKey({ ...ALG, modulusLength: 1024 }, true, ['sign', 'verify']);
  const wrongHash = await webcrypto.subtle.generateKey({ ...ALG, hash: 'SHA-384' }, true, ['sign', 'verify']);
  for (const material of [null, {}, { kid: KEY_ID, key: pair.publicKey, validUntilMs: NOW * 1000 }, { kid: 'wrong', key: pair.publicKey, validUntilMs: (NOW + 600) * 1000 }, ...[hmac, weak.publicKey, wrongHash.publicKey, pair.privateKey].map(key => ({ kid: KEY_ID, key, validUntilMs: (NOW + 600) * 1000 }))]) {
    await rejectsJWT(claims(), undefined, { keyProvider: async () => material });
  }
  await rejectsJWT(claims(), undefined, { keyProvider: async () => { throw Error('SYNTHETIC_KEY_SECRET'); } });
});

test('independent: kid must be a JSON string even when a permissive trusted key adapter matches it', async () => {
  const pair = await keys;
  for (const kid of [123, true, ['synthetic-key-1']]) {
    await rejectsJWT(claims(), { alg: 'RS256', kid }, { keyProvider: async ({ kid: received }) => ({ kid: received, key: pair.publicKey, validUntilMs: (NOW + 600) * 1000 }) });
  }
});

test('independent: token expiry during asynchronous key acquisition is rechecked', async () => {
  let time = NOW * 1000;
  const pair = await keys;
  const check = await verifier({ now: () => time, keyProvider: async () => { time = (NOW + 301) * 1000; return { kid: KEY_ID, key: pair.publicKey, validUntilMs: (NOW + 600) * 1000 }; } });
  await assert.rejects(check('Bearer ' + await signed()));
});

test('independent: unavailable or rolled-back post-await clocks cannot authorize a token', async () => {
  const pair = await keys;
  for (const later of [NaN, Infinity, -1, NOW * 1000 - 1]) {
    let time = NOW * 1000;
    const check = await verifier({ now: () => time, keyProvider: async () => { time = later; return { kid: KEY_ID, key: pair.publicKey, validUntilMs: (NOW + 600) * 1000 }; } });
    await assert.rejects(check('Bearer ' + await signed()), undefined, String(later));
  }
});

test('independent: signing key expiry during actual WebCrypto verification fails closed', async () => {
  let time = NOW * 1000;
  const pair = await keys;
  const subtle = { verify: async (...args) => { const ok = await webcrypto.subtle.verify(...args); time = (NOW + 2) * 1000; return ok; } };
  const check = await verifier({ subtle, now: () => time, keyProvider: async () => ({ kid: KEY_ID, key: pair.publicKey, validUntilMs: (NOW + 1) * 1000 }) });
  await assert.rejects(check('Bearer ' + await signed()), { code: 'auth-keys-unavailable' });
});

test('independent: fake configuration never permits a real project or emulator fallback', async () => {
  const { createFirebaseVerifier, unavailableOfficialKeyProvider } = await auth;
  for (const config of [{ projectId: 'real-project', ownerUid: OWNER }, { projectId: PROJECT, ownerUid: 'real-owner' }, {}, null]) {
    assert.throws(() => createFirebaseVerifier({ config, keyProvider: async () => null, subtle: webcrypto.subtle }));
  }
  await assert.rejects(unavailableOfficialKeyProvider(), { code: 'official-key-provider-not-implemented' });
});

test('independent: globally serialized beginnings and reservations permit only one pilot and one call per kind', async () => {
  const { store, create } = await setup();
  const coordinators = Array.from({ length: 24 }, create);
  const begins = await Promise.allSettled(coordinators.map(c => c.begin(principal())));
  assert.equal(begins.filter(x => x.status === 'fulfilled').length, 1);
  const id = begins.find(x => x.status === 'fulfilled').value.id;
  for (const kind of ['token', 'quote']) {
    const reservations = await Promise.allSettled(coordinators.map(c => c.reserve(id, principal(), kind)));
    assert.equal(reservations.filter(x => x.status === 'fulfilled').length, 1, kind);
    await coordinators[0].complete(id, principal(), kind);
  }
  await coordinators[0].publish(id, principal());
  const state = await store.snapshot();
  assert.deepEqual([state.pilot.total, state.pilot.token, state.pilot.quote, state.pilot.phase], [2, 1, 1, 'published']);
  await assert.rejects(create().begin(principal()));
  await assert.rejects(create().reserve(id, principal(), 'token'));
});

test('independent: reservations persist across object restart; a lost response cannot cause reissue or refund', async () => {
  const { store, coordinator, create } = await setup();
  const { id } = await coordinator.begin(principal());
  await coordinator.reserve(id, principal(), 'token');
  const restarted = create();
  await assert.rejects(restarted.initializeSynthetic(), { code: 'already-initialized' });
  await assert.rejects(restarted.reserve(id, principal(), 'token'));
  await assert.rejects(restarted.reserve(id, principal(), 'quote'));
  await restarted.fail(id);
  await assert.rejects(create().begin(principal()));
  const state = await store.snapshot();
  assert.deepEqual([state.pilot.phase, state.pilot.total, state.pilot.token, state.pilot.quote, state.pilot.pending], ['failed', 1, 1, 0, 'token']);
});

test('independent: uncertain durable commit is consumed and cannot be retried', async () => {
  const { store, coordinator, create } = await setup();
  const { id } = await coordinator.begin(principal());
  store.uncertainCommit = true;
  await assert.rejects(coordinator.reserve(id, principal(), 'token'), { code: 'storage-unavailable' });
  assert.equal((await store.snapshot()).pilot.token, 1);
  await assert.rejects(create().reserve(id, principal(), 'token'));
  await coordinator.fail(id);
  assert.equal((await store.snapshot()).pilot.total, 1);
});

test('independent: absent state, failed reads and failed reservation writes fail closed', async () => {
  const missing = await setup({ initialize: false });
  await assert.rejects(missing.coordinator.begin(principal()), { code: 'storage-unavailable' });
  const { store, coordinator } = await setup();
  store.failRead = true;
  await assert.rejects(coordinator.begin(principal()), { code: 'storage-unavailable' });
  store.failRead = false;
  const { id } = await coordinator.begin(principal());
  store.failPut = true;
  await assert.rejects(coordinator.reserve(id, principal(), 'token'), { code: 'storage-unavailable' });
  assert.equal((await store.snapshot()).pilot.total, 0);
});

test('independent: owner revocation cutoff is inclusive and refreshed issuance cannot bypass it', async () => {
  const { coordinator } = await setup();
  await coordinator.setOwnerPolicy({ blocked: true, cutoffAuthTime: NOW - 30 });
  await assert.rejects(coordinator.begin(principal()), { code: 'owner-blocked' });
  await coordinator.setOwnerPolicy({ blocked: false, cutoffAuthTime: NOW - 30 });
  await assert.rejects(coordinator.begin(principal({ issuedAt: NOW })), { code: 'session-revoked' });
  await assert.rejects(coordinator.setOwnerPolicy({ blocked: false, cutoffAuthTime: NOW - 31 }), { code: 'policy-invalid' });
  const run = await coordinator.begin(principal({ authTime: NOW - 29, issuedAt: NOW }));
  assert.ok(run.id);
});

test('independent: owner disable interleaved before reservation or publication prevents the next effect', async () => {
  const { coordinator, create, store } = await setup();
  const { id } = await coordinator.begin(principal());
  await create().setOwnerPolicy({ blocked: true, cutoffAuthTime: NOW - 30 });
  await assert.rejects(coordinator.reserve(id, principal(), 'token'), { code: 'owner-blocked' });
  assert.equal((await store.snapshot()).pilot.total, 0);
  const other = await setup(), otherRun = await other.coordinator.begin(principal());
  for (const kind of ['token', 'quote']) { await other.coordinator.reserve(otherRun.id, principal(), kind); await other.coordinator.complete(otherRun.id, principal(), kind); }
  await other.create().setOwnerPolicy({ blocked: true, cutoffAuthTime: NOW - 30 });
  await assert.rejects(other.coordinator.publish(otherRun.id, principal()), { code: 'owner-blocked' });
  assert.notEqual((await other.store.snapshot()).pilot.phase, 'published');
});

test('independent: emergency block followed by unblock cannot revive an in-flight reservation', async () => {
  const { coordinator, store } = await setup();
  const { id } = await coordinator.begin(principal());
  await coordinator.reserve(id, principal(), 'token');
  await coordinator.setOwnerPolicy({ blocked: true, cutoffAuthTime: -1 });
  await coordinator.setOwnerPolicy({ blocked: false, cutoffAuthTime: -1 });
  await assert.rejects(coordinator.complete(id, principal(), 'token'));
  assert.equal((await store.snapshot()).pilot.total, 1);
});

test('independent: deadlines, clock rollback and malformed durable state cannot resume a pilot', async () => {
  let time = NOW * 1000;
  const { coordinator, store } = await setup({ now: () => time });
  const { id } = await coordinator.begin(principal());
  time -= 1;
  await assert.rejects(coordinator.reserve(id, principal(), 'token'), { code: 'clock-unavailable' });
  time = (NOW + 60) * 1000;
  await assert.rejects(coordinator.reserve(id, principal(), 'token'), { code: 'pilot-expired' });
  assert.equal((await store.snapshot()).pilot.total, 0);
  for (const change of [s => { s.pilot.total = -1; }, s => { s.cutoffAuthTime = NaN; }, s => { s.pilot.pending = 'other'; }, s => { s.mode = 'live'; }]) {
    const fresh = await setup(), key = (await coordination).STATE_KEY;
    await fresh.coordinator.begin(principal());
    const state = await fresh.store.snapshot(); change(state); fresh.store.values.set(key, state);
    await assert.rejects(fresh.coordinator.begin(principal()), { code: 'storage-unavailable' });
  }
});

test('independent: full synthetic request preserves all unverified and no-persistence flags', async () => {
  const { worker, calls, request, store } = await workerSetup();
  const response = await worker.fetch(request()), body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.synthetic.invalid');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(calls.map(c => c.kind), ['token', 'quote']);
  for (const call of calls) {
    assert.equal(call.destination, 'https://kis.synthetic.invalid'); assert.equal(call.redirect, 'error'); assert.equal(call.retries, 0); assert.ok(Object.isFrozen(call));
  }
  assert.equal(body.liveEnabled, false); assert.equal(body.mode, 'synthetic-only');
  assert.deepEqual([body.quote.verification, body.quote.independent, body.quote.usableForSignals, body.quote.persistAllowed, body.quote.exchangeTimestamp, body.quote.kind], ['unverified', false, false, false, null, 'unknown']);
  assert.equal(body.quote.price, 71500);
  assert.equal((await store.snapshot()).pilot.total, 2);
});

test('independent: URL, origin, method, cookie and legacy-secret boundaries dispatch nothing', async () => {
  const f = await workerSetup();
  for (const url of [
    'http://has.synthetic.invalid/v1/quote/kr/005930', 'https://attacker.invalid/v1/quote/kr/005930',
    'https://has.synthetic.invalid:9443/v1/quote/kr/005930', 'https://has.synthetic.invalid/v1/quote/kr/000660',
    'https://has.synthetic.invalid/v1/quote/us/AAPL', 'https://has.synthetic.invalid/v1/quote/kr/005930?url=https://attacker.invalid',
    'https://has.synthetic.invalid/v1/quote/kr/%30%30%35%39%33%30', 'https://has.synthetic.invalid/v1/quote/kr/005930#secret',
    'https://has.synthetic.invalid/oauth2/tokenP', 'https://has.synthetic.invalid/v1/order'
  ]) assert.notEqual((await f.worker.fetch(f.request({ url }))).status, 200, url);
  for (const origin of ['null', 'https://app.synthetic.invalid.attacker.invalid', 'http://app.synthetic.invalid', 'https://other.synthetic.invalid', '']) {
    const response = await f.worker.fetch(f.request({ headers: { origin } })); assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await f.worker.fetch(f.request({ method }))).status, 405);
  for (const headers of [{ cookie: 'session=synthetic-secret' }, { 'x-has-auth': 'synthetic-secret' }]) assert.equal((await f.worker.fetch(f.request({ headers }))).status, 403);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.store.snapshot()).pilot, null);
});

test('independent: CORS preflight grants only exact GET authorization and consumes no budget', async () => {
  const f = await workerSetup();
  const headers = { 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' };
  assert.equal((await f.worker.fetch(f.request({ method: 'OPTIONS', headers }))).status, 204);
  for (const change of [{ 'access-control-request-method': 'POST' }, { 'access-control-request-headers': 'authorization,x-has-auth' }, { 'access-control-request-headers': '*' }]) {
    assert.equal((await f.worker.fetch(f.request({ method: 'OPTIONS', headers: { ...headers, ...change } }))).status, 403);
  }
  assert.equal(f.calls.length, 0); assert.equal((await f.store.snapshot()).pilot, null);
});

test('independent: concurrent request handlers share one global issuance/query budget', async () => {
  const f = await workerSetup();
  const responses = await Promise.all(Array.from({ length: 20 }, () => f.worker.fetch(f.request())));
  assert.equal(responses.filter(r => r.status === 200).length, 1);
  assert.deepEqual(f.calls.map(c => c.kind), ['token', 'quote']);
  assert.equal((await f.store.snapshot()).pilot.total, 2);
});

test('independent: unexpected redirects and malformed token results remain spent without retry', async () => {
  for (const patch of [{ status: 302, location: 'https://attacker.invalid/' }, { redirected: true }, { location: 'https://attacker.invalid/' }, { synthetic: false }, { syntheticAccessToken: 'SYNTHETIC_SECRET_DO_NOT_ECHO' }]) {
    const calls = [];
    const f = await workerSetup({ transport: async request => { calls.push(request); return { ...upstream(request.kind), ...patch }; } });
    const response = await f.worker.fetch(f.request()), raw = await response.text();
    assert.notEqual(response.status, 200); assert.equal(calls.length, 1); assert.ok(!raw.includes('attacker.invalid')); assert.ok(!raw.includes('SYNTHETIC_SECRET_DO_NOT_ECHO'));
    const state = await f.store.snapshot(); assert.equal(state.pilot.total, 1); assert.equal(state.pilot.phase, 'failed');
    await f.worker.fetch(f.request()); assert.equal(calls.length, 1);
  }
});

test('independent: revocation while upstream response is pending suppresses later publication', async () => {
  const gate = deferred(), reached = deferred(), calls = [];
  const f = await workerSetup({ transport: async request => { calls.push(request); if (request.kind === 'quote') { reached.resolve(); await gate.promise; } return upstream(request.kind); } });
  const pending = f.worker.fetch(f.request()); await reached.promise;
  await f.coordinator.setOwnerPolicy({ blocked: true, cutoffAuthTime: NOW });
  gate.resolve(); const response = await pending;
  assert.notEqual(response.status, 200); assert.ok(!(await response.text()).includes('71500'));
  assert.equal(calls.length, 2); assert.equal((await f.store.snapshot()).pilot.total, 2);
});

test('independent: timeout never retries or refunds even when synthetic upstream finishes late', async () => {
  const gate = deferred(), called = deferred(), calls = [];
  let fire;
  const f = await workerSetup({
    setTimer: callback => { fire = callback; return 1; }, clearTimer: () => {},
    transport: async request => { calls.push(request); called.resolve(); await gate.promise; return upstream(request.kind); }
  });
  const pending = f.worker.fetch(f.request()); await called.promise; fire();
  const response = await pending; assert.equal(response.status, 408); assert.equal(calls.length, 1); assert.equal(calls[0].signal.aborted, true);
  gate.resolve(); await Promise.resolve();
  await f.worker.fetch(f.request()); assert.equal(calls.length, 1); assert.equal((await f.store.snapshot()).pilot.total, 1);
});

test('independent: failed or uncertain reservation never invokes transport', async () => {
  for (const mode of ['failPut', 'uncertainCommit']) {
    const f = await workerSetup();
    const original = f.coordinator.reserve.bind(f.coordinator);
    f.coordinator.reserve = (...args) => { f.store[mode] = true; return original(...args); };
    const response = await f.worker.fetch(f.request()); assert.equal(response.status, 503); assert.equal(f.calls.length, 0);
  }
});

test('independent: unavailable clock after reservation stops before transport without refund', async () => {
  let time = NOW * 1000;
  const f = await workerSetup({ now: () => time });
  const original = f.coordinator.reserve.bind(f.coordinator);
  f.coordinator.reserve = async (...args) => { const permit = await original(...args); time = NaN; return permit; };
  const response = await f.worker.fetch(f.request());
  assert.notEqual(response.status, 200); assert.equal(f.calls.length, 0);
  assert.equal((await f.store.snapshot()).pilot.total, 1);
});

test('independent: arbitrary dependency error strings are never reflected as public errors', async () => {
  const { ClosedError } = await auth, marker = 'SYNTHETIC_SECRET_DO_NOT_ECHO';
  for (const error of [Error(marker), new ClosedError(marker, 401), new ClosedError(marker, 200)]) {
    const f = await workerSetup({ transport: async () => { throw error; } });
    const response = await f.worker.fetch(f.request()), body = await response.text();
    assert.notEqual(response.status, 200); assert.ok(!body.includes(marker), body);
  }
});

test('independent: injected key-source errors are not reflected and never consume budget', async () => {
  const { ClosedError } = await auth, marker = 'SYNTHETIC_KEY_SOURCE_SECRET';
  const f = await workerSetup({ keyProvider: async () => { throw new ClosedError(marker, 200); } });
  const response = await f.worker.fetch(f.request()), text = await response.text();
  assert.notEqual(response.status, 200); assert.ok(!text.includes(marker));
  assert.equal(f.calls.length, 0); assert.equal((await f.store.snapshot()).pilot, null);
});

test('independent: successful synthetic secrets and extra upstream payloads are neither logged nor persisted', async () => {
  const marker = 'synthetic:DO_NOT_ECHO_OR_STORE', logs = [], originals = {};
  for (const name of ['log', 'warn', 'error', 'info', 'debug']) { originals[name] = console[name]; console[name] = (...args) => logs.push(args); }
  try {
    const f = await workerSetup({ transport: async request => ({ ...upstream(request.kind), ...(request.kind === 'token' ? { syntheticAccessToken: marker } : {}), appSecret: marker, rawPayload: marker, account: marker }) });
    const response = await f.worker.fetch(f.request()), text = await response.text();
    assert.equal(response.status, 200); assert.ok(!text.includes(marker)); assert.ok(!JSON.stringify(await f.store.snapshot()).includes(marker)); assert.deepEqual(logs, []);
  } finally { for (const [name, original] of Object.entries(originals)) console[name] = original; }
});

test('independent: memory-only client logout while acquiring ID token suppresses the request', async () => {
  const { createMemoryLoginAdapter } = await clientModule, gate = deferred(), requested = deferred(), calls = [];
  const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => calls.push('memory'), signInGoogle: async () => { calls.push('login'); return { getIdToken: async () => { requested.resolve(); return gate.promise; } }; }, signOut: async () => calls.push('logout') };
  let requests = 0;
  const requestAdapter = async () => { requests++; return new Response('{}'); }; requestAdapter.mode = 'synthetic-only';
  const client = createMemoryLoginAdapter({ authAdapter, requestAdapter });
  assert.equal((await client.signIn()).ok, true); assert.deepEqual(calls, ['memory', 'login']);
  const pending = client.quote(); await requested.promise; await client.signOut(); gate.resolve(await signed());
  assert.equal((await pending).ok, false); assert.equal(requests, 0); assert.equal(client.status().signedIn, false);
});

test('independent: memory-only client clear during response decoding suppresses stale display', async () => {
  const { createMemoryLoginAdapter } = await clientModule, gate = deferred(), reached = deferred(), token = await signed();
  const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => {}, signInGoogle: async () => ({ getIdToken: async () => token }), signOut: async () => {} };
  const requestAdapter = async request => {
    assert.equal(request.credentials, 'omit'); assert.equal(request.cache, 'no-store'); assert.equal(request.redirect, 'error');
    return { ok: true, json: async () => { reached.resolve(); await gate.promise; return { mode: 'synthetic-only', liveEnabled: false, ok: true, quote: { synthetic: true, ticker: '005930', venue: 'KRX', price: 71500 } }; } };
  }; requestAdapter.mode = 'synthetic-only';
  const client = createMemoryLoginAdapter({ authAdapter, requestAdapter }); await client.signIn();
  const pending = client.quote(); await reached.promise; client.clear(); gate.resolve();
  const result = await pending; assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('71500')); assert.equal(client.status().signedIn, false);
});

test('independent: client never relabels USD or unsupported-market input as a KRW KRX result', async () => {
  const { createMemoryLoginAdapter } = await clientModule, token = await signed();
  for (const patch of [{ currency: 'USD' }, { ticker: 'AAPL' }, { venue: 'NXT' }, { price: 1e10 }]) {
    const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => {}, signInGoogle: async () => ({ getIdToken: async () => token }), signOut: async () => {} };
    const requestAdapter = async () => new Response(JSON.stringify({ mode: 'synthetic-only', liveEnabled: false, ok: true, quote: { synthetic: true, ticker: '005930', venue: 'KRX', currency: 'KRW', price: 71500, ...patch } })); requestAdapter.mode = 'synthetic-only';
    const client = createMemoryLoginAdapter({ authAdapter, requestAdapter }); await client.signIn();
    assert.equal((await client.quote()).ok, false, JSON.stringify(patch));
  }
});

test('independent: client signout aborts in-flight request and suppresses its late result', async () => {
  const { createMemoryLoginAdapter } = await clientModule, token = await signed(), reached = deferred(), gate = deferred();
  const authAdapter = { mode: 'synthetic-only', useMemoryPersistence: async () => {}, signInGoogle: async () => ({ getIdToken: async () => token }), signOut: async () => {} };
  let requestSignal;
  const requestAdapter = async request => { requestSignal = request.signal; reached.resolve(); await gate.promise; return new Response(JSON.stringify({ mode: 'synthetic-only', liveEnabled: false, ok: true, quote: { synthetic: true, ticker: '005930', venue: 'KRX', currency: 'KRW', price: 71500 } })); }; requestAdapter.mode = 'synthetic-only';
  const client = createMemoryLoginAdapter({ authAdapter, requestAdapter }); await client.signIn();
  const pending = client.quote(); await reached.promise; await client.signOut();
  assert.equal(requestSignal.aborted, true); gate.resolve();
  assert.equal((await pending).ok, false);
});

test('independent: hung old quote cannot block relogin or clear a newer busy operation', async () => {
  const { createMemoryLoginAdapter } = await clientModule, token = await signed();
  const oldResponse = deferred(), reached = deferred(), newPersistence = deferred();
  let persistenceCalls = 0, requests = 0;
  const authAdapter = {
    mode: 'synthetic-only',
    useMemoryPersistence: async () => { if (++persistenceCalls === 2) await newPersistence.promise; },
    signInGoogle: async () => ({ getIdToken: async () => token }), signOut: async () => {}
  };
  const requestAdapter = async () => {
    if (++requests === 1) { reached.resolve(); await oldResponse.promise; }
    return new Response(JSON.stringify({ mode: 'synthetic-only', liveEnabled: false, ok: true, quote: { synthetic: true, ticker: '005930', venue: 'KRX', currency: 'KRW', price: 71500 } }));
  }; requestAdapter.mode = 'synthetic-only';
  const client = createMemoryLoginAdapter({ authAdapter, requestAdapter }); await client.signIn();
  const oldQuote = client.quote(); await reached.promise; client.clear();
  const newLogin = client.signIn();
  assert.equal((await oldQuote).ok, false); assert.equal(client.status().busy, true);
  newPersistence.resolve(); assert.equal((await newLogin).ok, true);
  oldResponse.resolve(); await Promise.resolve();
  assert.deepEqual(client.status(), { signedIn: true, busy: false, mode: 'synthetic-only' });
  assert.equal((await client.quote()).ok, true);
});

test('independent: hung old signout cannot clear a newer login and cleanup stays generation-scoped', async () => {
  const { createMemoryLoginAdapter } = await clientModule, token = await signed(), logoutGate = deferred(), logoutReached = deferred();
  const sessions = [], contexts = [], cleanup = [];
  const authAdapter = {
    mode: 'synthetic-only', useMemoryPersistence: async () => {},
    signInGoogle: async context => { contexts.push(context); const session = { getIdToken: async () => token }; sessions.push(session); return session; },
    signOut: async context => { cleanup.push(context); logoutReached.resolve(); await logoutGate.promise; }
  };
  const requestAdapter = async () => new Response('{}'); requestAdapter.mode = 'synthetic-only';
  const client = createMemoryLoginAdapter({ authAdapter, requestAdapter }); await client.signIn();
  const oldSignout = client.signOut(); await logoutReached.promise; client.clear();
  assert.equal((await client.signIn()).ok, true); assert.equal((await oldSignout).ok, false);
  assert.equal(cleanup.length, 1); assert.equal(cleanup[0].session, sessions[0]); assert.ok(cleanup[0].generation < contexts[1].generation); assert.equal(cleanup[0].signal.aborted, true);
  logoutGate.resolve(); await Promise.resolve();
  assert.deepEqual(client.status(), { signedIn: true, busy: false, mode: 'synthetic-only' });
  assert.equal(cleanup.length, 1, 'No late unscoped signOut callback was scheduled');
});

test('independent: the default Worker live gate cannot be enabled by fake backend or environment flags', async () => {
  const module = await workerModule;
  const env = { LIVE_ENABLED: true, ENABLE_LIVE: 'true', MODE: 'production', KIS_BASE: 'https://attacker.invalid', FIREBASE_PROJECT_ID: PROJECT, backend: { mode: 'live' }, APP_KEY: 'SYNTHETIC_SECRET_DO_NOT_ECHO' };
  const response = await module.default.fetch(new Request('https://attacker.invalid/v1/order'), env);
  assert.equal(response.status, 503); const body = await response.json(); assert.equal(body.liveEnabled, false); assert.equal(body.code, 'live-disabled');
  assert.ok(!JSON.stringify(body).includes('SYNTHETIC_SECRET_DO_NOT_ECHO'));
  assert.ok(Object.isFrozen(module.default));
});

test('independent: no external network was attempted by this focused synthetic test process', () => {
  assert.ok(globalThis.__hasNoNetworkInstalled, 'Run with --require ./tests/lib/no-network.cjs');
  assert.deepEqual(globalThis.__hasNoNetworkInstalled.attempts, []);
});
async function signed(payload = claims(), header = { alg: 'RS256', kid: KEY_ID, typ: 'JWT' }, signingKeys) {
  const pair = signingKeys || await keys;
  const wire = b64(header) + '.' + b64(payload);
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(wire));
  return wire + '.' + Buffer.from(signature).toString('base64url');
}

test('independent: original source is byte-preserved after explicit reviewed daily repair projections without local Git', () => {
  assert.ok(require('./lib/daily-repair-projection.cjs').assertPortableKisPreservation() > 100);
});
