'use strict';
/* 20단계 B-3: 미검증·기준시각 불명·실패·오래됨·기업행위 의심·기준일 불일치 가격은 신호를 만들지 못한다. */
const { test } = require('node:test'), a = require('node:assert/strict'), T = require('../has/price-trust.js'), C = require('../radar/core.js');
const NOW = '2026-10-29T09:00:00Z';
const base = () => ({ ticker: 'AAA', asOf: '2026-10-28', currency: 'USD', timezone: 'America/New_York', adjustment: 'split-adjusted', close: 60, high52w: 100, high52wStart: '2025-10-28', high52wEnd: '2026-10-28', source: { name: '합성 시험', url: 'https://example.invalid/x' }, verification: 'independent-verified', priceKind: 'regular-close', status: 'ok' });
const ev = (q, s) => C.evaluateSignals(q, s);
test('독립 검증·기준일·통화·종류가 모두 있으면 관문을 통과해 급락 신호 계산', () => {
  const g = T.gateSignals(ev, base(), undefined, NOW); a.equal(g.held, false); a.ok(g.result.signals.length >= 1); a.equal(g.result.signals[0].type, 'drawdown');
});
const cases = {
  '미검증': q => { q.verification = 'unverified'; }, '단일 출처': q => { q.verification = 'single-source'; }, '합성': q => { q.verification = 'synthetic'; },
  '조회 실패': q => { q.status = 'error'; }, '기업행위 의심': q => { q.status = 'corporate-action-suspected'; }, '기준일 불일치': q => { q.status = 'date-mismatch'; },
  '오래됨(10일)': q => { q.asOf = '2026-10-19'; q.high52wEnd = '2026-10-19'; }, '기준일 없음': q => { delete q.asOf; }, '통화 없음': q => { delete q.currency; }, '가격 종류 미확인': q => { q.priceKind = 'unknown'; }
};
for (const [name, f] of Object.entries(cases)) test('보류: ' + name, () => {
  const q = base(); f(q); let called = 0; const g = T.gateSignals((x, y) => { called++; return ev(x, y); }, q, undefined, NOW);
  a.equal(g.held, true); a.equal(called, 0, '보류 시 신호 계산 함수를 호출하지 않음'); a.deepEqual(g.result.signals, []); a.match(g.result.missing[0], /판단 불가/);
});
test('관문 문구에 실시간·공식·검증 완료를 쓰지 않음', () => { for (const f of [null, ...Object.values(cases)]) { const q = base(); if (f) f(q); const r = T.gateSignals(ev, q, undefined, NOW).reason; a.ok(!/실시간|공식|검증 완료/.test(r), r); } });
test('레이더 evaluateSignals 자체도 출처·시간대·분할 조정 메타가 없으면 신호 0', () => {
  for (const mut of [q => { q.source.url = 'x'; }, q => { q.timezone = 'Asia/Seoul'; }, q => { q.adjustment = 'none'; }, q => { q.currency = 'KRW'; }]) { const q = base(); mut(q); const r = ev(q); a.deepEqual(r.signals, []); a.ok(r.missing.length > 0); }
});
test('입력 불변', () => { const q = base(), s = JSON.stringify(q); T.gateSignals(ev, q, undefined, NOW); a.equal(JSON.stringify(q), s); });
