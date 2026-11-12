'use strict';
/* 2026-11-12 로그인·화면 속도: 화면 한 번 그리는 동안만 기록 검증 재사용(withValidationCache·passMemo). 판정 결과는 캐시 유무와 동일해야 한다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const P = require('../has/snapshot-policy.js'), A = require('../has/return-assessment.js');
const now = Date.parse('2026-11-11T03:00:00Z');
const accounts = { gen: [{ id: 1, name: '합성 A', ticker: 'SYN_A', quantity: 10, avgPrice: 80, currentPrice: 100 }], dom: [], ov: [], pen: [] };
function input(ts, day) { const c = JSON.parse(JSON.stringify(accounts)); c.gen[0].currentPrice += day; return { key: 'all', now: ts, accounts: c, fx: 1370, freshPrice: { 'KR:SYN_A': true }, quoteMeta: { FX: ts, 'KR:SYN_A': ts }, quoteValues: { FX: 1370, 'KR:SYN_A': c.gen[0].currentPrice } }; }
const records = Array.from({ length: 40 }, (_, d) => { const r = P.evaluate(input(now - (40 - d) * 86400000, d)); a.equal(r.ok, true); return r.snapshot; });

test('캐시 구간 안팎 검증 결과 동일(정상·손상 기록), 구간 끝나면 캐시 폐기', () => {
  const bad = JSON.parse(JSON.stringify(records[3])); bad.ts = 'x';
  const outside = [records[0], bad, null, 5].map(r => P.validateRecord(r));
  const inside = P.withValidationCache(() => [records[0], bad, null, 5, records[0], bad].map(r => P.validateRecord(r)));
  a.deepEqual(inside.slice(0, 4), outside); a.deepEqual(inside[4], outside[0]); a.deepEqual(inside[5], outside[1]);
  // 구간 밖에서는 변경이 곧바로 반영(캐시 없음)
  const r = JSON.parse(JSON.stringify(records[5])); a.equal(P.validateRecord(r).ok, true); r.ts = 'broken'; a.equal(P.validateRecord(r).ok, false);
  // 반환 객체를 바꿔도 캐시 오염 없음
  P.withValidationCache(() => { const x = P.validateRecord(records[1]); x.ok = false; a.equal(P.validateRecord(records[1]).ok, true); });
});
test('중첩 구간은 바깥 구간 하나로 처리, 예외가 나도 캐시가 남지 않음', () => {
  a.throws(() => P.withValidationCache(() => { P.withValidationCache(() => P.validateRecord(records[2])); throw Error('boom'); }), /boom/);
  const r = JSON.parse(JSON.stringify(records[2])); a.equal(P.validateRecord(r).ok, true); r.ts = -1; a.equal(P.validateRecord(r).ok, false);
});
test('passMemo: 구간 안에서는 객체·이름별 한 번 실행(예외도 재전달), 구간 밖은 매번', () => {
  const o = {}; let n = 0;
  P.passMemo(o, 't', () => ++n); P.passMemo(o, 't', () => ++n); a.equal(n, 2);
  P.withValidationCache(() => { a.equal(P.passMemo(o, 't', () => ++n), 3); a.equal(P.passMemo(o, 't', () => ++n), 3); a.equal(P.passMemo(o, 'u', () => ++n), 4);
    const e = {}; let m = 0; for (let i = 0; i < 2; i++) a.throws(() => P.passMemo(e, 't', () => { m++; throw Error('limit'); }), /limit/); a.equal(m, 1); });
});
test('수익률 판정(assess)은 캐시 구간 안팎 결과가 같음(정상·손상 이력)', () => {
  const q = recs => ({ key: 'all', records: recs, targetTs: recs[0].ts, endTs: recs[recs.length - 1].ts });
  const bad = records.slice(); bad[7] = Object.assign(JSON.parse(JSON.stringify(bad[7])), { ts: 'x' });
  for (const recs of [records, bad]) {
    const out = JSON.stringify(A.assess(q(recs))), inn = P.withValidationCache(() => [A.assess(q(recs)), A.assess(q(recs))].map(x => JSON.stringify(x)));
    a.equal(inn[0], out); a.equal(inn[1], out);
  }
});
test('앱: 그리기 함수 3개를 검증 재사용 구간으로 감싸고, 잠금화면 동안 전체 그리기는 미룸(잠금 해제 시 checkPw가 그림)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
  a.match(html, /\["renderAll","renderAllReturnsTables","renderLineChart"\]\.forEach\(function\(name\)/);
  a.match(html, /if\(ls&&ls\.style\.display!=="none"\)\{hasStartApp\.deferredRender=true;return;\}/);
  a.match(html, /document\.getElementById\("lockScreen"\)\.style\.display="none";\s*failCount=0;\s*sessionStorage\.setItem\("v5_auth","1"\);\s*renderAll\(\);/);
});
