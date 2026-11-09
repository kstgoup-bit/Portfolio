'use strict';
/* 29단계: 환호성(급등) 신호와 비중 축소 검토 — 곡소리(매수 검토)의 대칭. 가격 상승만으로 매도 의견을 내지 않는다. */
const test = require('node:test'), a = require('node:assert/strict');
const W = require('../has/watch-engine.js'), A = require('../has/advisor-core.js'), G = require('../has/advice-guard.js'), F = require('./lib/fixtures-stage23.cjs');
const HIGH = { price: 100, asOfDate: '2026-11-05', source: 'SYNTHETIC-TEST' };
const hot = (o) => F.stock(Object.assign({ quote: F.quote({ price: 98 }), high52w: HIGH, returns: { stockPct: 55, benchPct: 8, periodDays: 60, asOfDate: '2026-11-05', source: 'SYNTHETIC-TEST' }, held: { quantity: 10, avgPrice: 50 } }, o));
const run = (stock, weight, settings) => { const c = F.ctx({ weightPct: weight }); const w = W.evaluateStock(stock, c, F.NOW); return A.analyze(stock, w, c, F.NOW, settings); };
const has = (stock, weight) => W.evaluateStock(stock, F.ctx({ weightPct: weight }), F.NOW).signals.find(x => x.type === 'euphoria');
test('급등 단계 30/50/80%: 고점 근접 + 시장 대비 초과 상승일 때만 신호', () => {
  for (const [pct, lv] of [[35, 30], [55, 50], [90, 80]]) { const g = has(hot({ returns: { stockPct: pct, benchPct: 5, periodDays: 60, asOfDate: '2026-11-05', source: 'S' } }), 5); a.equal(g.level, lv, String(pct)); a.ok(g.evidence.length === 2 && g.source && g.asOfDate); }
  a.equal(has(hot({ returns: { stockPct: 25, benchPct: 2, periodDays: 60, asOfDate: '2026-11-05', source: 'S' } }), 5), undefined);
  a.equal(has(hot({ returns: { stockPct: 55, benchPct: 50, periodDays: 60, asOfDate: '2026-11-05', source: 'S' } }), 5), undefined, '시장도 같이 올랐으면 환호성 아님');
  a.equal(has(hot({ quote: F.quote({ price: 85 }) }), 5), undefined, '고점에서 멀면 아님');
});
test('사용 불가 시세·자료 불일치면 환호성 신호를 만들지 않는다', () => {
  for (const o of [{ verification: 'unverified' }, { asOfDate: '2026-10-01' }, { source: null }]) a.equal(has(hot({ quote: F.quote(Object.assign({ price: 98 }, o)) }), 5), undefined);
  a.equal(has(hot({ returns: { stockPct: 55, benchPct: 8, periodDays: 60, asOfDate: '2026-11-03', source: 'S' } }), 5), undefined);
});
test('급등 + 비중 목표 초과 + 재무·논리 정상 → 비중 축소 검토, 공격형은 보유·방어형은 축소(의견 불일치 표시)', () => {
  const r = run(hot(), 15); a.equal(r.opinion, '비중 축소 검토'); a.equal(r.aggressive.stance, '보유'); a.equal(r.defensive.stance, '비중 축소 검토');
  a.ok(r.reasonsFor.some(x => x.includes('환호성')) && r.reasonsAgainst.some(x => x.includes('위대한 기업'))); a.ok(r.risks.includes('단기 급등(환호성) 구간'));
  a.ok(r.checks.some(x => x.includes('뉴스') && x.includes('세금')));
});
test('급등만으로는 매도 의견을 내지 않는다: 비중이 목표 이내면 보유(근거 부족 명시)', () => {
  const r = run(hot(), 6); a.equal(r.opinion, '보유'); a.ok(r.reasonsAgainst.some(x => x.includes('주가 상승만으로 매도를 권하지 않음')));
});
test('급등 + 비중 초과 + 재무 악화 → 공격형도 비중 축소 검토', () => {
  const r = run(hot({ fundamentals: F.fund({ freeCashFlow: -5 }) }), 15); a.equal(r.opinion, '비중 축소 검토'); a.equal(r.aggressive.stance, '비중 축소 검토');
});
test('보유하지 않은 종목은 환호성이어도 매도 의견을 내지 않는다', () => {
  const r = run(hot({ held: null }), 0); a.notEqual(r.opinion, '비중 축소 검토');
});
test('근거 없는 수치·목표가 표현이 없다(24단계 근거 검사 통과)', () => {
  const r = run(hot(), 15); const v = G.validateGrounding ? G.validateGrounding(r) : { ok: true }; a.deepEqual(v.errors || [], []);
  JSON.stringify([r.reasonsFor, r.reasonsAgainst, r.estimates]).split('"').forEach(x => a.ok(!/목표\s*가|적정\s*가|기대\s*수익|예상\s*수익/.test(x)));
});
test('설정으로 환호성 단계를 바꿀 수 있다', () => {
  const stock = hot({ returns: { stockPct: 40, benchPct: 5, periodDays: 60, asOfDate: '2026-11-05', source: 'S' } }), c = F.ctx({ weightPct: 5 });
  a.equal(W.evaluateStock(stock, c, F.NOW, { euphoriaLevels: [60, 80, 100] }).signals.some(x => x.type === 'euphoria'), false);
  a.equal(W.evaluateStock(stock, c, F.NOW).signals.some(x => x.type === 'euphoria'), true);
});
