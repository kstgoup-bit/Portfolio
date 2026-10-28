'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const R = require('../kr-radar/rights.js');
const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/providers-stage9.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(cat));
const T = '2026-10-29';
test('stage9 catalog is valid and every confirmed/conflict fact has an https source', () => { a.deepEqual(R.validate(cat).errors, []); });
test('no provider is 후보 적격; two are 부적격 for the stated reasons; the rest are 미확정', () => {
  const s = R.summarize(cat, { today: T }); a.equal(s.counts['후보 적격'], 0); a.equal(s.counts['부적격'], 2); a.equal(s.counts['미확정'], 9); a.equal(s.realApiRequests, 0);
  const by = Object.fromEntries(s.verdicts.map(v => [v.id, v]));
  a.deepEqual(by['twelve-data-basic'].conflicts, ['personalDisplay']); a.deepEqual(by['alpha-vantage-free'].conflicts, ['adjustmentBasis52w']);
  a.ok(s.verdicts.every(v => v.approvalToConnect === false));
});
test('FSC price/ETF data: T+1 confirmed, adjusted price NOT confirmed (never assumed)', () => {
  for (const id of ['fsc-stock-price', 'fsc-etf-price']) { const p = cat.providers.find(x => x.id === id); a.match(p.fields.updateTimingDelay.value, /13시/); a.equal(p.fields.adjustmentBasis52w.status, 'unconfirmed'); a.match(p.fields.redistribution.value, /재배포/); }
  const l = cat.providers.find(x => x.id === 'fsc-krx-listing'); a.equal(l.fields.statusFields.status, 'confirmed'); a.match(l.fields.statusFields.value, /판정 불가/);
});
test('providers that could not be read record nothing as fact', () => {
  for (const id of ['tiingo', 'finnhub']) a.ok(Object.values(cat.providers.find(x => x.id === id).fields).every(f => f.status === 'unconfirmed'), id);
});
test('a provider reaches 후보 적격 only if every required field is confirmed with a source, no conflict, and checks are fresh', () => {
  const c = clone(), p = c.providers.find(x => x.id === 'fsc-stock-price');
  for (const k of Object.keys(p.fields)) p.fields[k] = { value: '시험', status: 'confirmed', source: 'https://example.com/doc', checkedAt: T };
  a.equal(R.verdict(p, { today: T }).verdict, '후보 적격');
  a.equal(R.verdict(p, { today: '2026-12-31' }).verdict, '미확정', '확인일 30일 초과는 내려감');
  a.equal(R.verdict(p, {}).verdict, '미확정', '기준일 없으면 신선도 보장 불가');
  p.fields.personalDisplay.status = 'conflict'; a.equal(R.verdict(p, { today: T }).verdict, '부적격');
});
test('malformed catalog entries and secret-like strings are rejected', () => {
  const c1 = clone(); c1.providers[0].fields.coverage.source = null; a.ok(R.validate(c1).errors.some(e => /출처/.test(e)));
  const c2 = clone(); c2.providers[0].fields.cost.status = 'maybe'; a.ok(R.validate(c2).errors.length > 0);
  const c3 = clone(); c3.providers[0].note = 'serviceKey=AbCdEf0123456789xyzXYZ'; a.ok(R.validate(c3).errors.some(e => /비밀/.test(e)));
  a.ok(R.validate({}).errors.length > 0); a.deepEqual(R.summarize({}, { today: T }).verdicts, []);
});
test('stage8 catalog file is untouched and both catalogs coexist', () => {
  const old = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/providers.json'), 'utf8')); a.equal(old.schemaVersion, 1); a.equal(cat.schemaVersion, 2);
});
