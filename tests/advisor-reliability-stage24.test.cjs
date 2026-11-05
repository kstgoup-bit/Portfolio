'use strict';
/* 24단계 제6과제: 자동 투자 조언 신뢰성 10개 상황(합성). 무조건 매수·매도 의견을 내지 않고, 자료가 나쁘면 보류·경고한다. */
const { test } = require('node:test'), assert = require('node:assert/strict');
const F = require('./lib/fixtures-stage23.cjs'), W = require('../has/watch-engine.js'), A = require('../has/advisor-core.js'), G = require('../has/advice-guard.js'),
  X = require('../has/quote-crosscheck.js'), Q = require('../has/quote-model.js'), Al = require('../has/alerts-core.js'), Bridge = require('../has/advisor-bridge.js'), R = require('../has/portfolio-reader.js');
const one = (s, c = F.ctx()) => { const w = W.evaluateStock(s, c, F.NOW), a = A.analyze(s, w, c, F.NOW); return { w, a, g: G.guard(a, F.NOW) }; };
const dropped = (o = {}) => F.stock(Object.assign({ quote: F.quote({ price: 60 }) }, o)); // 고점 100 대비 -40%

test('기준: 급락+재무·논리 정상+비중·현금 여유 → 매수 검토(근거 있는 경우만 매수 의견이 나온다)', () => { const r = one(dropped()); assert.equal(r.a.opinion, '매수 검토'); assert.ok(r.a.reasonsAgainst.length); assert.equal(r.g.ok, true, r.g.errors.join()); });
test('1 시세 데이터 없음 → 판단 보류', () => { const r = one(F.stock({ quote: null })); assert.equal(r.a.opinion, '판단 보류'); assert.ok(r.w.missing.length);
  const b = Bridge.run(k => ({ v5_gen: JSON.stringify([{ id: 1, name: 'a', ticker: 'AAA', quantity: 1, avgPrice: 1, currentPrice: 1 }]) })[k] ?? null, {}, F.NOW, { basis: 'synthetic' }); assert.equal(b.advices[0].opinion, '판단 보류'); });
test('2 오래된 재무자료(180일 초과) → 매수 검토 금지', () => { const r = one(dropped({ fundamentals: F.fund({ asOfDate: '2025-12-31' }) })); assert.notEqual(r.a.opinion, '매수 검토'); assert.ok(r.a.unknown.some(x => /오래/.test(x))); });
test('3 공급자 간 가격 불일치 → 충돌 표시, 신호 제외, 판단 보류', () => {
  const a = F.quote({ price: 60, source: 'P1' }), b = F.quote({ price: 66, source: 'P2' }), res = X.check([a, b]); assert.equal(res.status, 'conflict'); const q = X.apply(a, res);
  assert.equal(Q.usableForSignals(q, F.NOW).ok, false); assert.equal(one(dropped({ quote: q })).a.opinion, '판단 보류');
  assert.equal(X.check([a, F.quote({ price: 60.3, source: 'P2' })]).status, 'agree'); assert.equal(X.check([a]).status, 'single-source');
  assert.equal(X.check([a, F.quote({ price: 60, source: 'P2', asOfDate: '2026-11-04' })]).status, 'conflict'); });
test('4 실적 악화+주가 급락 동시(보유) → 비중 축소 검토 + 위험 표기, 저가 매수 의견 아님', () => {
  const r = one(dropped({ fundamentals: F.fund({ revenueGrowthPct: -9, freeCashFlow: -5, freeCashFlowPrev: 90 }), held: { quantity: 10, avgPrice: 120 } }), F.ctx({ weightPct: 30 })); assert.equal(r.a.opinion, '비중 축소 검토'); assert.ok(r.a.risks.length >= 2); });
test('5 특정 종목 비중 과다 → 집중 신호·비중 축소 검토, 매수 아님', () => { const r = one(F.stock({ held: { quantity: 5, avgPrice: 70 } }), F.ctx({ weightPct: 40 })); assert.ok(r.w.signals.some(s => s.type === 'concentration')); assert.notEqual(r.a.opinion, '매수 검토'); });
test('6 현금 부족 → 현금 신호·위험 표기, 방어형은 매수 검토 불가(공격형만이면 보류)', () => { const c = F.ctx({ cashPct: 3 }), r = one(dropped(), c); assert.ok(W.evaluatePortfolio(c, F.NOW).signals.some(s => s.type === 'cash-low')); assert.ok(r.a.risks.includes('현금 비중 부족')); assert.notEqual(r.a.opinion, '매수 검토'); });
test('7 환율 급변 → 근거·출처 있는 신호, 자료 없으면 만들어내지 않음, 알림 키는 VIX와 분리', () => {
  const fx = { rate: 1480, prevRate: 1370, asOfDate: '2026-11-05', prevAsOfDate: '2026-10-29', source: 'SYNTHETIC-FX' }, c = F.ctx({ fx }), ev = W.evaluatePortfolio(c, F.NOW);
  const s = ev.signals.find(x => x.id === 'market-risk|fx'); assert.ok(s && s.evidence[0].includes('+8%') && s.source); assert.equal(W.evaluatePortfolio(F.ctx(), F.NOW).signals.some(x => x.id === 'market-risk|fx'), false);
  assert.ok(W.evaluatePortfolio(F.ctx(), F.NOW).missing.some(m => /환율/.test(m))); assert.equal(W.evaluatePortfolio(F.ctx({ fx: { ...fx, rate: 1372 } }), F.NOW).signals.some(x => x.id === 'market-risk|fx'), false);
  const cands = Al.candidates([{ id: 'a', kind: 'market-risk', scope: 'fx', dataOk: true, evidence: ['x'], level: 8 }, { id: 'b', kind: 'market-risk', dataOk: true, evidence: ['y'], level: 35 }], F.NOW).candidates; assert.notEqual(cands[0].key, cands[1].key); });
test('8 보유종목 정보 누락 → 비중 자료 없음 표기, 보유 판단 불가·경고, 손상 계좌는 제외 표시', () => {
  const r = one(F.stock({ held: { quantity: 5, avgPrice: 70 } }), { cashPct: 20 }); assert.ok(r.w.missing.some(m => /비중/.test(m)));
  const p = R.read(k => ({ v5_gen: '{broken', v5_dom: JSON.stringify([{ ticker: 'X' }]), v5_fx: '1370' })[k] ?? null, { basis: 'synthetic' }); assert.equal(p.complete, false); assert.ok(p.issues.length >= 2); });
test('9 시장 위험 급등(VIX) → 시장 위험 신호(출처·기준일 필요), 자료 없으면 보류 표기', () => {
  const hi = F.ctx({ market: { vix: { level: 38, change5dPct: 45, asOfDate: '2026-11-05', source: 'SYNTHETIC-TEST' } } }); assert.ok(W.evaluatePortfolio(hi, F.NOW).signals.some(s => s.type === 'market-risk'));
  assert.ok(W.evaluatePortfolio(F.ctx({ market: { vix: { level: 38 } } }), F.NOW).missing.length); });
test('10 AI 응답에 근거 없는 수치·목표가·확정 표현 포함 → 거절', () => {
  const base = one(dropped()).a, mk = (k, v) => Object.assign({}, base, { [k]: v });
  assert.equal(G.guard(base, F.NOW).ok, true);
  for (const bad of [mk('reasonsFor', ['목표가 95 달성 가능']), mk('reasonsFor', ['1년 내 기대수익 35% 예상']), mk('estimates', ['내년 영업이익 777% 증가']), mk('reasonsFor', ['곧 오를 것']), mk('reasonsAgainst', ['PER 12.7 로 저평가']),
    mk('facts', [{ text: '앞으로 상승할 것으로 보인다', source: 'AI' }]), mk('independence', 'two-independent-models'), mk('reasonsFor', ['자동 매수 주문 실행'])]) assert.equal(G.guard(bad, F.NOW).ok, false, JSON.stringify(bad.reasonsFor)); });
test('가드는 정상적인 규칙 엔진 출력(보유·축소·보류·매수 전부)을 오탐하지 않는다', () => {
  const cases = [dropped(), F.stock(), F.stock({ held: { quantity: 1, avgPrice: 120 } }), F.stock({ thesis: { intact: false }, held: { quantity: 1, avgPrice: 100 } }), F.stock({ quote: null }), dropped({ fundamentals: F.fund({ revenueGrowthPct: -9 }) })];
  for (const s of cases) { const r = one(s); assert.equal(r.g.ok, true, r.a.opinion + ' ' + r.g.errors.join('|')); } });
test('가드: "추정 가격 포함" 같은 자료 한계 고지는 사실 칸에 있어도 통과, 예측성 서술은 거절', () => {
  const base = one(dropped()).a; assert.equal(G.guard(Object.assign({}, base, { facts: base.facts.concat([{ text: '평가액에 미검증·추정 가격 포함', source: '계산' }]) }), F.NOW).ok, true);
  assert.equal(G.guard(Object.assign({}, base, { facts: base.facts.concat([{ text: '실적이 개선될 가능성이 큼', source: 'AI' }]) }), F.NOW).ok, false); });
test('읽기 추출: 입력 불변·최소 정보·합성/실제 표기·쓰기 불가', () => {
  const data = { v5_gen: JSON.stringify([{ id: 1, name: '비밀이름', ticker: 'AAA', quantity: 2, avgPrice: 40000, currentPrice: 50000 }, { id: 2, name: '예수금', ticker: 'DEP_GEN', quantity: 1, avgPrice: 1, currentPrice: 100000 }]), v5_ov: JSON.stringify([{ id: 3, name: 'x', ticker: 'CCC', quantity: 1, avgPrice: 90, currentPrice: 100 }]), v5_dom: '[]', v5_pen: '[]', v5_fx: '1400', v5_cma_amount: '50000' };
  const snap = JSON.stringify(data), p = R.read(k => data[k] ?? null, { basis: 'synthetic' }); assert.equal(JSON.stringify(data), snap); assert.ok(Object.isFrozen(p) && Object.isFrozen(p.holdings[0]));
  assert.equal(p.totalKRW, 100000 + 100000 + 140000 + 50000); assert.equal(p.cashKRW, 150000); assert.equal(p.priceBasis, 'app-entered-unverified'); assert.equal(R.read(k => data[k] ?? null).basis, 'unspecified');
  const m = R.minimalForAdvisor(p); assert.deepEqual(Object.keys(m.holdings[0]).sort(), ['market', 'ticker', 'weightPct']); assert.ok(!JSON.stringify(m).includes('비밀이름')); assert.throws(() => { p.holdings.push(1); });
  assert.equal(R.read(k => data[k] ?? null, { basis: 'synthetic' }).readOnly, true); });
