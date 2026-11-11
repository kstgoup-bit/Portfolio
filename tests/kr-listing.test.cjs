'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const L = require('../kr-radar/listing.js'), U = require('../kr-radar/universe.js'), LD = require('../kr-radar/load.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
const TODAY = '2026-10-29';
const prov = (x = {}) => ({ provider: '합성 시험용(공식 아님)', datasetName: 'TEST-LISTING', sourceUrl: 'https://example.com/test/listing', baseDate: '2026-10-28', queriedAt: '2026-10-29', sha256: 'a'.repeat(64), licenseNote: '시험용', rowCount: 0, ...x });
const pkgFrom = (rows, p = {}) => ({ provenance: prov({ rowCount: rows.length, ...p }), rows });
const rowsOf = n => data.securities.slice(0, n).map(s => ({ code: s.code, name: s.name, market: s.market, isin: 'KR7TEST' }));
test('recorded candidate file stays unverified when no official listing is supplied (stage8 truth)', () => {
  const r = U.audit(data); a.equal(r.verifiedAgainstOfficialListing, 0); a.equal(r.unverified, 78); a.equal(r.activeReal, 0);
});
test('mechanism: a fresh complete package matches exact code+name+market, and still never activates', () => {
  const before = JSON.stringify(data);
  const { data: out, report } = L.crossCheckOfficial(data, pkgFrom(rowsOf(10)), { today: TODAY });
  a.equal(report.matched.length, 10); a.equal(report.notFound.length, 68);
  a.ok(out.securities.filter(s => s.listingCheck === 'matched').every(s => s.status === 'hold' && s.reviewStatus === 'verified' && s.listingEvidence.sha256 === 'a'.repeat(64)));
  a.equal(U.audit(out).activeReal, 0); a.equal(JSON.stringify(data), before, '입력 불변');
});
test('stale, future, hashless, wrong-count and non-https packages block everything', () => {
  for (const p of [{ baseDate: '2026-10-01' }, { queriedAt: '2026-11-30' }, { sha256: 'xyz' }, { rowCount: 999 }, { sourceUrl: 'http://example.com/x' }, { licenseNote: '' }]) {
    const rows = rowsOf(5), pk = { provenance: prov({ rowCount: 5, ...p }), rows };
    const { report, data: out } = L.crossCheckOfficial(data, pk, { today: TODAY });
    a.equal(report.matched.length, 0, JSON.stringify(p)); a.equal(report.blockedByPackage.length, 78); a.equal(U.audit(out).verifiedAgainstOfficialListing, 0);
  }
});
test('file hash mismatch with provenance is rejected', () => {
  const n = L.normalizeListing(pkgFrom(rowsOf(3)), { today: TODAY, fileSha256: 'b'.repeat(64) }); a.equal(n.ok, false); a.ok(n.errors.some(e => /해시/.test(e)));
});
test('name or market mismatch is mismatch, not matched; no fuzzy matching', () => {
  const rows = rowsOf(3); rows[0].name = rows[0].name + ' '; rows[1].market = rows[1].market === 'KOSPI' ? 'KOSDAQ' : 'KOSPI'; rows[2].name = '다른회사';
  const { report } = L.crossCheckOfficial(data, pkgFrom(rows), { today: TODAY });
  a.equal(report.matched.length, 1, '공백만 다른 이름은 trim 후 일치'); a.equal(report.mismatch.length, 2);
});
test('duplicate code inside the listing is ambiguous and matches nothing', () => {
  const rows = rowsOf(2); rows.push({ ...rows[0], name: '동일코드 다른이름' });
  const { report } = L.crossCheckOfficial(data, pkgFrom(rows), { today: TODAY });
  a.ok(report.ambiguous.includes(data.securities[0].code)); a.equal(report.matched.length, 1);
});
test('preferred/SPAC/REIT/ETN names are flagged as suspected and never matched as a common stock candidate', () => {
  a.equal(L.classifyByName('가상전자우'), 'preferred-suspected'); a.equal(L.classifyByName('가상기업스팩3호'), 'spac-suspected');
  a.equal(L.classifyByName('가상리츠'), 'reit-suspected'); a.equal(L.classifyByName('가상 ETN'), 'etn-suspected'); a.equal(L.classifyByName('가상전자'), 'common-presumed');
  const d = JSON.parse(JSON.stringify(data)); d.securities = [d.securities[0]]; d.securities[0].name = '가상전자우';
  const { report } = L.crossCheckOfficial(d, pkgFrom([{ code: d.securities[0].code, name: '가상전자우', market: d.securities[0].market }]), { today: TODAY });
  a.equal(report.matched.length, 0); a.match(report.mismatch[0].reason, /security-type/);
});
test('bad rows are reported, not silently accepted', () => {
  const rows = rowsOf(2); rows.push({ code: '12', name: 'x', market: 'KOSPI' }, { code: 'ZZ0001', name: 'x', market: 'NYSE' });
  const n = L.normalizeListing(pkgFrom(rows), { today: TODAY }); a.equal(n.ok, false); a.equal(n.byCode.size, 2);
});
test('supplement fills the shortfall only from the listing and only with explicit picks; never invents or duplicates', () => {
  const extra = [{ code: 'ZZ9001', name: '시험기업A', market: 'KOSPI' }, { code: 'ZZ9002', name: '시험기업우', market: 'KOSPI' }, { code: 'ZZ9003', name: '시험기업B', market: 'KONEX' }];
  const pkg = pkgFrom([...rowsOf(3), ...extra]);
  const pick = (code, over = {}) => ({ code, sector: '시험', evaluationProfile: 'general', reason: '시험 선정', ...over });
  const r = L.supplement(data, pkg, [pick('ZZ9001'), pick('ZZ9002'), pick('ZZ9003'), pick('ZZ9999'), pick(data.securities[0].code), pick('ZZ9001'), { code: 'ZZ9001' }], { today: TODAY });
  a.deepEqual(r.added, ['ZZ9001']); a.equal(r.rejected.length, 6); a.equal(r.data.securities.length, 79);
  a.equal(U.audit(r.data).errors.length, 0); a.equal(U.audit(r.data).activeReal, 0); a.equal(data.securities.length, 78);
  const none = L.supplement(data, pkgFrom(rowsOf(2), { baseDate: '2026-09-01' }), [pick('ZZ9001')], { today: TODAY }); a.deepEqual(none.added, []);
});
test('synthetic 100-symbol load is processed but reported as NOT real monitoring', () => {
  const r = LD.syntheticLoad(100); a.equal(r.evaluated, 100); a.equal(r.actualActiveCount, 0); a.equal(r.realApiRequests, 0); a.match(r.note, /실제 100종목 감시가 아닙니다/);
});
test('listing module has no network, storage, env, timer or crypto access', () => {
  for (const f of ['listing.js', 'providers.js', 'load.js']) { const s = fs.readFileSync(path.join(__dirname, '../kr-radar', f), 'utf8'); a.doesNotMatch(s, /fetch\(|XMLHttpRequest|require\(['"](node:)?(http|https|net|child_process|fs|crypto)['"]\)|localStorage|process\.env|setTimeout|setInterval/, f); }
});
