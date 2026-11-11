'use strict';
// Read-only raw export page (v2). Covers 다비's counterexamples: empty storage, unknown keys,
// null-on-read, __proto__ key, plus verbatim copy, no writes, file re-open verification.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'backup-raw-export.html'), 'utf8');

const FULL = { v5_gen: '[{"id":7,"ticker":"005930","quantity":3}]', v5_dom: '[]', v5_ov: '[{"id":1,"ticker":"QQQ","quantity":2}]', v5_pen: '[]', v5_fg: '50', v5_snap: '{"all":[]}', calc_q1_gen_7: '7', calc_p3_ov_1: '1' };

function boot(seed, opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.invalid/Portfolio/backup-raw-export.html' });
  const w = dom.window;
  Object.entries(seed).forEach(([k, v]) => w.localStorage.setItem(k, v));
  const writes = [];
  const proto = Object.getPrototypeOf(w.localStorage);
  ['setItem', 'removeItem', 'clear'].forEach(m => { const o = proto[m]; proto[m] = function () { writes.push(m); return o.apply(this, arguments); }; });
  if (opts.nullKey) { const og = proto.getItem; proto.getItem = function (k) { return k === opts.nullKey ? null : og.call(this, k); }; }
  let blobText = null;
  w.Blob = class { constructor(parts) { blobText = parts.join(''); } };
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  Object.defineProperty(w, 'crypto', { value: { subtle: { digest: (alg, data) => Promise.resolve(crypto.createHash('sha256').update(Buffer.from(data)).digest().buffer) } } });
  w.TextEncoder = TextEncoder;
  w.eval(w.document.querySelector('script').textContent);
  return { w, writes, blob: () => blobText, status: () => w.document.getElementById('status').textContent, btn: w.document.getElementById('exportBtn') };
}
async function waitFor(fn) { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 5)); } return null; }

test('full HAS storage: verbatim pairs, allowlist only, secrets/GAS/other apps excluded, no writes', async () => {
  const seed = Object.assign({}, FULL, { v5_gas: 'https://script.google.com/macros/s/X/exec', v5_alphaVantageKey: 'S1', v5_geminiKey: 'S2', v5_pw: 'S3', other_app_access_token: 'S4', wondang_admin: 'S5', v5_access_token: 'S6', calc_password: 'S7', calc_q1_gen_99: 'S8' });
  const env = boot(seed);
  assert.match(env.w.document.getElementById('summary').textContent, /일반 계좌: 1종목/);
  assert.strictEqual(env.btn.disabled, false);
  env.btn.click();
  const text = await waitFor(env.blob);
  const file = JSON.parse(text);
  assert.strictEqual(file.format, 'has-raw-localstorage-v3');
  assert.deepStrictEqual(file.pairs.map(p => p[0]), Object.keys(FULL).sort());
  for (const [k, v] of file.pairs) assert.strictEqual(v, FULL[k]);
  assert.strictEqual(file.pairsSha256, crypto.createHash('sha256').update(JSON.stringify(file.pairs)).digest('hex'));
  for (const s of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'script.google.com']) assert.ok(!text.includes(s), s);
  assert.deepStrictEqual(env.writes, []);
});

test('empty storage or a missing account blocks the download', () => {
  const empty = boot({});
  assert.strictEqual(empty.btn.disabled, true);
  assert.match(empty.status(), /일반 계좌 저장값 없음/);
  const noGen = Object.assign({}, FULL); delete noGen.v5_gen;
  const env = boot(noGen);
  assert.strictEqual(env.btn.disabled, true);
  assert.match(env.status(), /일반 계좌 저장값 없음/);
});

test('a key that reads as null aborts instead of exporting null', () => {
  const env = boot(FULL, { nullKey: 'v5_snap' });
  assert.strictEqual(env.btn.disabled, true);
  assert.match(env.status(), /읽을 수 없습니다/);
  assert.strictEqual(env.blob(), null);
});

test('__proto__-like keys are not silently dropped (not allowlisted, never written)', async () => {
  const env = boot(Object.assign({}, FULL, { __proto__x: 'p' }));
  env.btn.click();
  const file = JSON.parse(await waitFor(env.blob));
  assert.ok(file.pairs.every(p => p[0] !== '__proto__x'));
  assert.deepStrictEqual(env.writes, []);
});

test('storage changed after opening blocks the download', () => {
  const env = boot(FULL);
  // simulate the app in another tab writing after the page opened (bypass write spy)
  env.w.localStorage.__proto__.setItem.call(env.w.localStorage, 'v5_snap', '{"all":[1]}');
  env.btn.click();
  assert.match(env.status(), /자료가 바뀌었습니다/);
  assert.strictEqual(env.blob(), null);
});

test('page has no network or storage-write code and a no-network CSP', () => {
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|setItem|removeItem|\.clear\(|sendBeacon|WebSocket/);
});

test('invalid holdings like [null] or missing ticker block the download', () => {
  for (const bad of ['[null]', '[{}]', '[{"id":1,"ticker":"A","quantity":-1}]', '[{"id":1,"ticker":"A","quantity":1},{"id":1,"ticker":"B","quantity":1}]']) {
    const env = boot(Object.assign({}, FULL, { v5_gen: bad }));
    assert.strictEqual(env.btn.disabled, true, bad);
    assert.match(env.status(), /일반 계좌/);
  }
});
