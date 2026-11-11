'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const P = require('../kr-radar/providers.js');
const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/providers.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(cat));
test('catalog is valid and every confirmed fact carries an https source', () => { a.deepEqual(P.validateCatalog(cat).errors, []); });
test('no provider passes the pilot gate in stage8 (rights/adjustment/calendar unconfirmed)', () => {
  const s = P.summarize(cat); a.deepEqual(s.pilotAllowedProviders, []); a.equal(s.realApiRequests, 0); a.ok(s.gates.every(g => !g.allowed && g.blocked.length > 0));
});
test('unchecked providers record nothing as fact', () => {
  for (const id of ['tiingo', 'finnhub', 'kis-open-api', 'alpha-vantage']) { const p = cat.providers.find(x => x.id === id); a.ok(Object.values(p.fields).every(f => f.status === 'unconfirmed'), id); }
});
test('FSC price data is T+1 and has no confirmed adjusted-price field', () => {
  const p = cat.providers.find(x => x.id === 'fsc-stock-price'); a.equal(p.fields.adjustedPrice.status, 'unconfirmed'); a.match(p.fields.delay.value, /T\+1/); a.match(p.fields.redistribution.value, /재배포 금지/);
});
test('confirmed without source, malformed status, secrets are rejected', () => {
  const c1 = clone(); c1.providers[0].fields.market.source = null; a.ok(P.validateCatalog(c1).errors.some(e => /출처/.test(e)));
  const c2 = clone(); c2.providers[0].fields.cost.status = 'maybe'; a.ok(P.validateCatalog(c2).errors.length > 0);
  const c3 = clone(); c3.providers[0].notes = 'api_key=ABCDEF1234567890XYZ'; a.ok(P.validateCatalog(c3).errors.some(e => /비밀/.test(e)));
  a.ok(P.validateCatalog({}).errors.length > 0);
});
test('a provider would pass only when every required field is confirmed with a source', () => {
  const c = clone(), p = c.providers[0];
  for (const k of P.FIELDS) p.fields[k] = { value: '시험', status: 'confirmed', source: 'https://example.com/doc', checkedAt: '2026-10-29' };
  a.equal(P.gate(p).allowed, true);
  p.fields.redistribution.status = 'unconfirmed'; a.equal(P.gate(p).allowed, false);
});
test('pilot readiness is false unless a human sets every flag; always reports 0 active/0 requests', () => {
  a.equal(P.pilotReadiness().ready, false); a.equal(P.pilotReadiness({ userApprovedPilot: true }).ready, false);
  const all = Object.fromEntries(P.READINESS_ITEMS.map(k => [k, true])); const r = P.pilotReadiness(all);
  a.equal(r.ready, true); a.equal(r.actualActiveCount, 0); a.equal(r.realApiRequests, 0); a.deepEqual(r.usSymbols, ['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM']);
  a.equal(P.pilotReadiness({ ...all, rollbackPlan: 'yes' }).ready, false);
});
test('disabled provider adapter refuses to load', async () => { const ad = P.createDisabledProviderAdapter('x'); a.equal(ad.realNetwork, false); await a.rejects(ad.load(), /비활성/); a.ok(Object.isFrozen(ad)); });
test('repository files contain no key-like secrets', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(__dirname, '../kr-radar')).filter(f => /\.(js|json)$/.test(f))) a.doesNotMatch(fs.readFileSync(f, 'utf8'), /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, f);
});
