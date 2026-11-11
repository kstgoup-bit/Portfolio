'use strict';
// Read-only raw export page: never writes/removes storage, excludes secrets, keeps raw strings verbatim, no network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'backup-raw-export.html'), 'utf8');

function boot(seed) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.invalid/Portfolio/backup-raw-export.html' });
  const w = dom.window;
  Object.entries(seed).forEach(([k, v]) => w.localStorage.setItem(k, v));
  const writes = [];
  const proto = Object.getPrototypeOf(w.localStorage);
  ['setItem', 'removeItem', 'clear'].forEach(m => { const o = proto[m]; proto[m] = function () { writes.push(m); return o.apply(this, arguments); }; });
  let blobText = null;
  w.Blob = class { constructor(parts) { blobText = parts.join(''); } };
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.fetch = () => { throw new Error('network'); };
  const script = dom.window.document.querySelector('script').textContent;
  w.eval(script);
  return { w, writes, blob: () => blobText };
}

test('exports raw strings verbatim, excludes secrets, never writes', async () => {
  const seed = { v5_gen: '[{"ticker":"005930","qty":3}]', v5_dom: '[]', v5_ov: '[{"ticker":"QQQ"}]', v5_pen: '[]', v5_fg: '50', v5_gas: 'https://script.google.com/macros/s/X/exec', v5_alphaVantageKey: 'SECRET1', v5_geminiKey: 'SECRET2', v5_pw: 'SECRET3', v5_snap: '{"all":[]}' };
  const env = boot(seed);
  const summary = env.w.document.getElementById('summary').textContent;
  assert.match(summary, /일반 계좌: 1종목/);
  env.w.document.getElementById('exportBtn').click();
  for (let i = 0; i < 50 && !env.blob(); i++) await new Promise(r => setTimeout(r, 10));
  const file = JSON.parse(env.blob());
  assert.strictEqual(file.format, 'has-raw-localstorage-v1');
  assert.deepStrictEqual(Object.keys(file.items).sort(), ['v5_dom', 'v5_fg', 'v5_gas', 'v5_gen', 'v5_ov', 'v5_pen', 'v5_snap']);
  for (const k of Object.keys(file.items)) assert.strictEqual(file.items[k], seed[k]);
  assert.ok(!env.blob().includes('SECRET'));
  assert.deepStrictEqual(env.writes, []);
});

test('page declares a no-network CSP and contains no fetch/XHR/storage writes', () => {
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|setItem|removeItem|\.clear\(/);
});
