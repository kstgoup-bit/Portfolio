'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const D = require('../kr-radar/adapters.js'), F = require('../kr-radar/fixtures.js');
const root = path.join(__dirname, '..'), dir = path.join(root, 'kr-radar');
const bar = (o = {}) => ({ synthetic: true, code: 'ZZ0001', tradeDate: '2026-10-28', timezone: 'Asia/Seoul', currency: 'KRW', session: 'regular', close: 100, high52w: 120, high52wBasis: 'adjusted-consistent', adjustmentBasis: 'adjusted-consistent', tradingStatus: 'normal', delayMinutes: 0, fetchedAt: '2026-10-29T00:00:00+09:00', source: { name: '합성', url: 'https://example.com/demo' }, ...o });
const filing = (o = {}) => ({ synthetic: true, receiptNo: '20260814000001', code: 'ZZ0001', filedAt: '2026-08-14', kind: 'original', statementBasis: 'consolidated', fiscalLabel: '2026 2분기', periodEnd: '2026-06-30', auditOpinion: 'unqualified', cancellation: { actuallyCancelled: true }, source: { url: 'https://example.com/demo' }, ...o });
test('price and disclosure contracts reject unsafe data', () => {
  a.equal(D.validatePriceBar(bar()).ok, true);
  for (const o of [{ timezone: 'UTC' }, { currency: 'USD' }, { session: 'extended' }, { high52wBasis: 'unadjusted' }, { tradingStatus: 'maybe' }, { delayMinutes: -1 }, { code: '1' }, { close: 0 }, { source: { name: 'x', url: 'http://x' } }, { synthetic: false }]) a.equal(D.validatePriceBar(bar(o)).ok, false, JSON.stringify(o));
  a.equal(D.validateDisclosure(filing()).ok, true);
  for (const o of [{ receiptNo: '1' }, { kind: 'correction' }, { statementBasis: 'both' }, { auditOpinion: 'ok' }, { cancellation: {} }, { synthetic: false }]) a.equal(D.validateDisclosure(filing(o)).ok, false, JSON.stringify(o));
  a.equal(D.validateDisclosure(filing({ kind: 'correction', supersedes: '20260801000001' })).ok, true);
  a.ok(D.PRICE_CONTRACT.length >= 12 && D.DISCLOSURE_CONTRACT.length >= 10);
});
test('the synthetic adapter works with the network disabled and there is no real adapter', async () => {
  const realFetch = globalThis.fetch; let called = 0; globalThis.fetch = () => { called++; throw new Error('network'); };
  try { const ad = D.createSyntheticAdapter({ bars: [bar()], filings: [filing()] }); a.equal(ad.mode, 'synthetic'); a.equal(ad.realNetwork, false); const r = await ad.load(); a.equal(r.bars.length, 1); a.equal(called, 0);
    await a.rejects(D.createSyntheticAdapter({ bars: [bar({ currency: 'USD' })] }).load(), /계약 오류/); } finally { globalThis.fetch = realFetch; }
  a.throws(() => D.createRealAdapter(), /별도 승인/);
});
test('static guard: kr-radar sources have no network, storage, timer, env, process or dynamic-code access', () => {
  const forbidden = /(\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\.|window\.|process\.env|child_process|require\(['"]node:(http|https|net|dgram|tls|child_process|fs|worker_threads)['"]\)|require\(['"](http|https|net|fs)['"]\)|setTimeout|setInterval|\beval\s*\(|new Function)/;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  a.ok(files.length >= 8);
  for (const f of files) { const src = fs.readFileSync(path.join(dir, f), 'utf8'); a.doesNotMatch(src, forbidden, f); for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) a.ok(m[1].startsWith('./') || m[1] === '../sell/core.js', f + ' imports ' + m[1]); }
});
test('static guard: no secrets or key-like strings in new data and sources', () => {
  const secret = /(ghp_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|BEGIN (RSA|PRIVATE)|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{12,})/i;
  const targets = [...fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)), path.join(dir, 'data/universe.json'), path.join(root, 'tools/kr-universe-audit.cjs')];
  for (const f of targets) a.doesNotMatch(fs.readFileSync(f, 'utf8'), secret, f);
});
test('static guard: the audit tool is read-only and the module touches no existing app file', () => {
  const tool = fs.readFileSync(path.join(root, 'tools/kr-universe-audit.cjs'), 'utf8'); a.doesNotMatch(tool, /writeFile|appendFile|unlink|rmSync|mkdirSync|fetch\(|https?\.request/);
  for (const f of ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json']) { const s = fs.readFileSync(path.join(root, f), 'utf8'); a.doesNotMatch(s, /kr-radar/, f + ' must not reference kr-radar'); }
  a.ok(!fs.existsSync(path.join(dir, 'index.html')), 'no UI is shipped in stage7');
});
test('all result envelopes share the same safety fields', () => {
  const B = require('../kr-radar/buy.js'), S = require('../kr-radar/sell.js');
  const rs = [B.evaluateBuy(F.buyInput(), { today: F.TODAY }), B.evaluateBuy(null, { today: F.TODAY }), S.evaluateSell(F.sellInput(), { today: F.TODAY }), S.evaluateSell(null, { today: F.TODAY })];
  for (const r of rs) { a.equal(r.automaticAction, false); a.equal(r.order, null); a.equal(r.notification, null); a.equal(r.actualActiveCount, 0); a.equal(r.realPriceValidated, 0); a.equal(r.realApiRequests, 0); a.equal(r.schemaVersion, 1); }
});
