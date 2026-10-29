'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const S = require('../kr-radar/selection.js'), cat = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/provider-selection-stage12.json'), 'utf8'));
const T = '2026-10-29', clone = () => JSON.parse(JSON.stringify(cat));
test('recorded selection is structurally valid: 2+ providers per market, exactly one primary each, sources and dates on every fact', () => {
  a.deepEqual(S.validateSelection(cat, { today: T }).errors, []);
  for (const m of ['US', 'KR']) { const ps = cat.providers.filter(p => p.market === m); a.ok(ps.length >= 3); a.equal(ps.filter(p => p.tier === 'primary').length, 1); a.ok(ps.every(p => p.reason.length > 20)); }
  a.ok(cat.providers.every(p => p.evidence.every(e => /^https:\/\//.test(e.source) && e.checkedAt === '2026-10-29')));
});
test('every non-excluded provider lists open questions — nothing is declared fully confirmed without data access', () => { a.ok(cat.providers.filter(p => p.tier !== 'excluded').every(p => p.unknowns.length >= 3)); });
test('validator rejects: missing reason/evidence/unknowns, bad URL, stale evidence, two primaries, one provider only, secrets', () => {
  const bad = f => { const c = clone(); f(c); return S.validateSelection(c, { today: T }).errors.length > 0; };
  a.ok(bad(c => { c.providers[0].reason = ''; })); a.ok(bad(c => { c.providers[0].evidence = []; })); a.ok(bad(c => { c.providers[0].unknowns = []; }));
  a.ok(bad(c => { c.providers[0].evidence[0].source = 'http://x'; })); a.ok(bad(c => { c.providers[0].evidence[0].checkedAt = '2026-01-01'; }));
  a.ok(bad(c => { c.providers.find(p => p.market === 'US' && p.tier === 'alternate').tier = 'primary'; })); a.ok(bad(c => { c.providers = c.providers.filter(p => p.market !== 'US' || p.tier === 'primary'); }));
  a.ok(bad(c => { c.providers[0].tier = 'best'; })); a.ok(bad(c => { c.providers[0].costUsdMonthly = [50, 10]; })); a.ok(bad(c => { c.providers[0].evidence[0].fact = 'serviceKey=AbCdEf0123456789xyzXYZ'; }));
  a.equal(S.validateSelection(null).errors.length, 1);
});
test('monthly call estimate for the minimal pilot (5 US + 5 KR + 2 benchmarks each, 22 trading days)', () => {
  const us = S.estimateMonthlyCalls({ symbols: 5, benchmarks: 2 }), kr = S.estimateMonthlyCalls({ symbols: 5, benchmarks: 2 }); a.equal(us.perDay, 7); a.equal(us.perProviderPerMonth, 154); a.equal(us.totalPerMonth, 308); a.equal(kr.totalPerMonth, 308);
  a.equal(S.estimateMonthlyCalls({ symbols: 5, benchmarks: 2, crossCheck: false }).totalPerMonth, 154);
  const g = cat.providers.find(p => p.id === 'twelve-data-grow'); a.ok(us.perDay <= 55, '분당 한도(55) 안'); a.equal(g.costUsdMonthly[0], 29);
});
test('pilot checklist is human-supplied and every item must be explicitly true', () => {
  const items = cat.pilot.checklist; a.equal(S.pilotChecklist({}, items).ready, false); a.equal(S.pilotChecklist({}, items).missing.length, items.length);
  a.equal(S.pilotChecklist(Object.fromEntries(items.map(k => [k, true])), items).ready, true); a.equal(S.pilotChecklist(Object.fromEntries(items.map(k => [k, 'yes'])), items).ready, false);
  a.deepEqual(cat.pilot.usSymbols, ['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM']); a.equal(cat.pilot.krMaxSymbols, 5); a.match(cat.pilot.krRule, /VERIFIED 가 0이면/);
});
