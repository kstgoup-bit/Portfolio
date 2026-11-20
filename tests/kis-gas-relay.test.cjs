'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../docs/team/gas-drafts/has-kis-request.gs'), 'utf8');
function env(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.props), calls = [];
  const ctx = {
    console, JSON, Date, Math, Number, Object, Array, String, parseInt, isFinite, encodeURIComponent,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz, f) => { const s = new Date(d.getTime() + 9 * 3600000).toISOString(); const y = s.slice(0, 4), m = s.slice(5, 7), dd = s.slice(8, 10); return f === 'yyyyMMdd' ? y + m + dd : y + '-' + m + '-' + dd; } },
    ContentService: { MimeType: { JSON: 'J', JAVASCRIPT: 'JS' }, createTextOutput: t => ({ text: t, setMimeType(m) { this.mime = m; return this; } }) },
    UrlFetchApp: { fetch(url, o) { calls.push({ url, o }); return opts.fetch(url, o); } }
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, store, calls };
}
const ok = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
const daily = { rt_cd: '0', output2: [{ stck_bsop_date: '20261113', stck_clpr: '83115' }, { stck_bsop_date: '20261112', stck_clpr: '84000' }, {}] };
const fetchOk = (url) => url.includes('tokenP') ? ok(200, { access_token: 'T0K', expires_in: 86400 }) : ok(200, daily);
const P = { KIS_APP_KEY: 'k', KIS_APP_SECRET: 's' };

test('without keys: not-configured, no network', () => {
  const e = env({ fetch: fetchOk });
  assert.deepStrictEqual(JSON.parse(e.ctx.hasKisResponse_({ parameter: { tickers: '069500' } }, null).text), { error: 'kis-not-configured' });
  assert.strictEqual(e.calls.length, 0);
});
test('returns bars, reuses token, never leaks key/token, read-only endpoints only', () => {
  const e = env({ props: P, fetch: fetchOk });
  const out = e.ctx.hasKisResponse_({ parameter: { tickers: '069500' } }, 'cb');
  assert.ok(!/T0K|appsecret|"s"/.test(out.text));
  const j = JSON.parse(out.text.slice(3, -1));
  assert.deepStrictEqual(j['069500'].bars, [{ d: '2026-11-12', c: 84000 }, { d: '2026-11-13', c: 83115 }]);
  e.ctx.hasKisResponse_({ parameter: { tickers: '069500' } }, null);
  assert.strictEqual(e.calls.filter(c => c.url.includes('tokenP')).length, 1);
  assert.ok(e.calls.every(c => /oauth2\/tokenP$|inquire-daily-itemchartprice\?/.test(c.url)));
});
test('rejects bad input without network', () => {
  const e = env({ props: P, fetch: fetchOk });
  for (const t of ['', 'QQQ', '069500,069500,1,2,3,4,5', "069500'", undefined])
    assert.strictEqual(JSON.parse(e.ctx.hasKisResponse_({ parameter: { tickers: t } }, null).text).error, 'bad-request');
  assert.strictEqual(e.calls.length, 0);
});
test('budget stops calls', () => {
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const e = env({ props: Object.assign({ ['KIS_BUDGET_' + day]: '150' }, P), fetch: fetchOk });
  assert.strictEqual(JSON.parse(e.ctx.hasKisResponse_({ parameter: { tickers: '069500' } }, null).text).error, 'kis-token');
  assert.strictEqual(e.calls.length, 0);
});
test('provider failure or odd data gives null, not guesses', () => {
  const bad = { rt_cd: '0', output2: [{ stck_bsop_date: '20261113', stck_clpr: '0' }, { stck_bsop_date: '20261112', stck_clpr: '1' }] };
  for (const f of [(u) => u.includes('tokenP') ? ok(200, { access_token: 'x', expires_in: 1e5 }) : ok(500, {}),
                   (u) => u.includes('tokenP') ? ok(200, { access_token: 'x', expires_in: 1e5 }) : ok(200, bad),
                   (u) => u.includes('tokenP') ? ok(200, { access_token: 'x', expires_in: 1e5 }) : ok(200, { rt_cd: '1' })]) {
    const e = env({ props: P, fetch: f });
    assert.strictEqual(JSON.parse(e.ctx.hasKisResponse_({ parameter: { tickers: '069500' } }, null).text)['069500'], null);
  }
});
