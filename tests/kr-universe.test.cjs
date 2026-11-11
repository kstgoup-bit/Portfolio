'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const U = require('../kr-radar/universe.js'), F = require('../kr-radar/fixtures.js'), B = require('../kr-radar/buy.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
test('recorded candidate list is valid, honest about shortfall, and has zero verified/active/real-price items', () => {
  const r = U.audit(data); a.deepEqual(r.errors, []);
  a.equal(r.recordedStockCandidates, 73); a.equal(r.recordedEtfCandidates, 5); a.equal(r.targetStockCandidates, 100); a.equal(r.shortfallStockCandidates, 27);
  a.equal(r.verifiedAgainstOfficialListing, 0); a.equal(r.activeReal, 0); a.equal(r.realPriceValidated, 0); a.equal(r.realApiRequests, 0); a.equal(r.unverified, 78); a.equal(r.hold, 78);
  a.equal(data.honesty.verifiedAgainstOfficialListing, 0); a.equal(data.honesty.actualActiveMonitoring, 0);
});
test('every recorded entry is labeled unverified-recalled with a selection reason that is not a recommendation', () => {
  for (const s of data.securities) { a.equal(s.codeStatus, 'unverified-recalled'); a.equal(s.listingCheck, 'unverified'); a.equal(s.status, 'hold'); a.equal(s.reviewStatus, 'candidate'); a.equal(s.lastVerified, null); a.match(s.selectionReason, /적격 판정이 아님|규칙과 분리/); }
});
test('stocks and ETFs are separate groups; stock candidates are common shares only; evaluation profiles are known', () => {
  const stocks = data.securities.filter(s => s.group === 'stock'), etfs = data.securities.filter(s => s.group === 'etf');
  a.ok(stocks.every(s => s.securityType === '보통주' && Object.keys(B.SECTORS).includes(s.evaluationProfile))); a.ok(etfs.every(s => s.securityType === 'ETF' && s.etfKind));
  a.equal(new Set(data.securities.map(s => s.code)).size, data.securities.length);
  a.ok(data.securities.every(s => !s.code.startsWith('ZZ')), '실제 후보에 합성(ZZ) 코드가 섞이면 안 됨');
});
test('duplicates, bad codes and unverified activation are rejected', () => {
  const d = JSON.parse(JSON.stringify(data));
  d.securities.push({ ...d.securities[0] }); a.ok(U.audit(d).errors.some(e => /중복/.test(e)));
  const e = JSON.parse(JSON.stringify(data)); e.securities[0].code = '12'; a.ok(U.audit(e).errors.some(x => /형식/.test(x)));
  const act = JSON.parse(JSON.stringify(data)); act.securities[0].status = 'active'; a.ok(U.audit(act).errors.some(x => /활성 종목/.test(x)));
  const pref = JSON.parse(JSON.stringify(data)); pref.securities[0].securityType = '우선주'; a.ok(U.audit(pref).errors.some(x => /보통주만/.test(x)));
  a.ok(U.audit({}).errors.length > 0);
});
test('offline cross-check marks matches/mismatches without mutating input and never activates', () => {
  const snapshot = JSON.stringify(data);
  const listing = [{ code: data.securities[0].code, name: data.securities[0].name, market: data.securities[0].market }, { code: data.securities[1].code, name: '다른이름', market: data.securities[1].market }];
  const { data: out, report } = U.crossCheck(data, listing, '2026-10-29');
  a.equal(JSON.stringify(data), snapshot); a.deepEqual(report.matched, [data.securities[0].code]); a.deepEqual(report.mismatch, [data.securities[1].code]); a.equal(report.notFound.length, 76);
  const au = U.audit(out); a.equal(au.verifiedAgainstOfficialListing, 1); a.equal(au.mismatch, 1); a.equal(au.notFound, 76); a.equal(au.activeReal, 0); a.deepEqual(au.errors, []);
  a.equal(out.securities[0].status, 'hold'); a.equal(out.securities[0].reviewStatus, 'verified');
  a.throws(() => U.crossCheck(data, null, '2026-10-29')); a.throws(() => U.crossCheck(data, [], 'bad'));
});
test('synthetic 100-company fixture runs quickly but is never reported as real monitoring', () => {
  const uni = F.syntheticUniverse(100), t0 = process.hrtime.bigint();
  const results = uni.map((u, i) => B.evaluateBuy(F.buyInput({ id: 'KR-DEMO-P' + i, instrument: { code: u.code, name: u.name, market: u.market }, performance: { benchmark: u.market } }), { today: F.TODAY }));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  a.equal(results.length, 100); a.ok(results.every(r => r.status === '심층 분석 후보' && r.actualActiveCount === 0 && r.realApiRequests === 0)); a.ok(uni.every(u => u.synthetic === true && u.code.startsWith('ZZ'))); a.ok(ms < 2000, '합성 100종목 처리 ' + ms + 'ms');
});
