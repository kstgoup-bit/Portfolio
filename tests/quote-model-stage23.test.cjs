'use strict';
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path');
const Q = require('../has/quote-model.js'), F = require('./lib/fixtures-stage23.cjs');
const raw = o => Object.assign({ ticker: '005930', market: 'KR', price: '71,500', currency: 'KRW', kind: 'close', asOfDate: '2026-11-05', asOfTime: '2026-11-05T09:00:00+09:00', fetchedAt: F.NOW, source: 'TEST', verification: 'unverified' }, o);
test('normalize: 정상/비정상 입력, 가격을 만들어내지 않음', () => {
  const r = Q.normalize(raw()); a.ok(r.ok); a.equal(r.quote.price, 71500); a.equal(r.quote.verification, 'unverified');
  [null, 5, {}, raw({ price: 0 }), raw({ price: 'abc' }), raw({ ticker: '' }), raw({ market: 'JP' }), raw({ currency: 'EUR' }), raw({ market: 'KR', currency: 'USD' })].forEach(x => a.equal(Q.normalize(x).ok, false));
  a.equal(Q.normalize(raw({ kind: 'weird' })).quote.kind, 'unknown'); a.equal(Q.normalize(raw({ asOfDate: '2026-13-45' })).quote.asOfDate, null);
});
test('classify: 실시간은 공급자 명시+기준시각 5분 이내일 때만', () => {
  const q = Q.normalize(raw({ kind: 'realtime', asOfTime: '2026-11-05T13:58:00+09:00' })).quote;
  a.equal(Q.classify(q, F.NOW).label, '실시간');
  a.equal(Q.classify(Q.normalize(raw({ kind: 'realtime', asOfTime: '2026-11-05T13:30:00+09:00' })).quote, F.NOW).label, '지연');
  a.equal(Q.classify(Q.normalize(raw({ kind: 'realtime', asOfTime: null })).quote, F.NOW).label, '미확인');
  a.equal(Q.classify(Q.normalize(raw({ kind: 'delayed', asOfTime: '2026-11-03T09:00:00+09:00' })).quote, F.NOW).label, '미확인');
  a.equal(Q.classify(Q.normalize(raw({ kind: 'close' })).quote, F.NOW).label, '종가'); a.equal(Q.classify(null, F.NOW).label, '미확인');
});
test('usableForSignals: 미검증·출처/기준일 없음·오래됨·종류 미확인은 사용 불가', () => {
  a.equal(Q.usableForSignals(Q.normalize(raw()).quote, F.NOW).ok, false);
  a.ok(Q.usableForSignals(Q.normalize(raw({ verification: 'independent-verified' })).quote, F.NOW).ok);
  const bad = o => Q.usableForSignals(Q.normalize(raw(Object.assign({ verification: 'independent-verified' }, o))).quote, F.NOW);
  a.equal(bad({ source: null }).ok, false); a.equal(bad({ asOfDate: null }).ok, false); a.equal(bad({ asOfDate: '2026-10-20' }).ok, false); a.equal(bad({ kind: 'unknown' }).ok, false);
});
test('가격 장부: 조회 실패는 이전 값을 바꾸지 않고 "최신 아님"으로 표시, 현재·마지막검증 분리', () => {
  const ok = Q.normalize(raw({ verification: 'independent-verified', price: 70000 })); let b = Q.applyFetch(Q.emptyBook(), '005930', ok, F.NOW);
  const b1 = JSON.stringify(b); a.equal(Q.view(b, '005930', F.NOW).state, 'current');
  const fail = Q.applyFetch(b, '005930', { ok: false, issues: ['HTTP 500'] }, F.NOW); a.equal(JSON.stringify(b), b1);   // 입력 불변
  const v = Q.view(fail, '005930', F.NOW); a.equal(v.state, 'fetch-failed-showing-previous'); a.ok(v.warnings[0].includes('최신이 아닙니다')); a.equal(v.current.price, 70000); a.equal(v.lastVerified.price, 70000);
  const unv = Q.applyFetch(Q.emptyBook(), 'X', Q.normalize(raw({ ticker: 'X', price: 10 })), F.NOW); const vu = Q.view(unv, 'X', F.NOW);
  a.equal(vu.lastVerified, null); a.ok(vu.warnings.some(w => w.includes('미검증')));          // 미검증은 lastVerified가 되지 않음
  a.equal(Q.view(Q.applyFetch(Q.emptyBook(), 'N', { ok: false, issues: [] }, F.NOW), 'N', F.NOW).state, 'fetch-failed-no-data');
  a.equal(Q.applyFetch(Q.emptyBook(), 'T', Q.normalize(raw({ ticker: 'Z' })), F.NOW).current.T, undefined); // 다른 종목 응답은 거부
});
test('환율: 출처·적용시각 없으면 근사 표시, 평가는 보유를 바꾸지 않음', () => {
  a.equal(Q.fxView({ rate: 1400 }, F.NOW).ok, false); a.ok(Q.fxView({ rate: 1400 }, F.NOW).label.includes('미확인'));
  const fx = { rate: 1400, source: 'SYN-FX', appliedAt: '2026-11-05T09:00:00+09:00' }; a.ok(Q.fxView(fx, F.NOW).ok);
  const hold = [{ ticker: 'US1', market: 'US', quantity: 2, currency: 'USD' }, { ticker: '005930', market: 'KR', quantity: 3 }], snap = JSON.stringify(hold);
  let b = Q.applyFetch(Q.emptyBook(), 'US1', Q.normalize({ ticker: 'US1', market: 'US', price: 100, currency: 'USD', kind: 'close', asOfDate: '2026-11-05', source: 'S', verification: 'independent-verified' }), F.NOW);
  b = Q.applyFetch(b, '005930', Q.normalize(raw({ verification: 'independent-verified', price: 1000 })), F.NOW);
  const v = Q.valuation(hold, b, fx, F.NOW); a.equal(v.totalKRW, 2 * 100 * 1400 + 3000); a.equal(v.estimatedPartKRW, 0); a.equal(JSON.stringify(hold), snap);
  const bf = Q.applyFetch(b, 'US1', { ok: false, issues: ['x'] }, F.NOW); const v2 = Q.valuation(hold, bf, fx, F.NOW); a.equal(v2.totalKRW, v.totalKRW);
  a.equal(Q.valuation(hold, b, { rate: 1400 }, F.NOW).rows[0].valueKRW, 280000);   // 근사지만 fx.ok=false 표시
  a.equal(Q.valuation(hold, b, null, F.NOW).rows[0].valueKRW, null);
});
test('정적: 저장소·네트워크·타이머 접근 없음', () => {
  for (const f of ['quote-model', 'watch-engine', 'advisor-core', 'alerts-core', 'advice-journal']) { const s = fs.readFileSync(path.join(__dirname, '../has/' + f + '.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); a.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|setTimeout|setInterval|indexedDB|navigator\.sendBeacon|WebSocket/.test(s), f); }
});
