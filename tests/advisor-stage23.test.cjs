'use strict';
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path');
const W = require('../has/watch-engine.js'), A = require('../has/advisor-core.js'), F = require('./lib/fixtures-stage23.cjs');
const ev = (s, c) => W.evaluateStock(s, c || F.ctx(), F.NOW);
const types = r => r.signals.map(x => x.type);
test('52주 고점 대비 하락 20/30/35 단계, 15%는 신호 없음', () => {
  for (const [p, lv] of [[80, 20], [70, 30], [65, 35], [60, 35]]) { const r = ev(F.stock({ quote: F.quote({ price: p }) })); const g = r.signals.find(x => x.type === 'drawdown'); a.equal(g.level, lv, 'price ' + p); a.ok(g.evidence.length && g.source && g.asOfDate); }
  a.equal(ev(F.stock({ quote: F.quote({ price: 85 }) })).signals.some(x => x.type === 'drawdown'), false);
});
test('사용 불가 시세(미검증·오래됨·출처 없음)면 가격 기반 신호를 만들지 않고 이유를 남김', () => {
  for (const o of [{ verification: 'unverified' }, { asOfDate: '2026-10-01' }, { source: null }, { kind: 'unknown' }]) { const r = ev(F.stock({ quote: F.quote(Object.assign({ price: 60 }, o)) })); a.equal(r.dataGate.ok, false); a.equal(r.signals.some(x => x.type === 'drawdown'), false); a.ok(r.missing[0].includes('가격 기반 신호 보류')); }
  a.equal(ev(F.stock({ quote: null })).dataGate.ok, false);
  const r2 = ev(F.stock({ quote: F.quote({ price: 60 }), high52w: { price: 100, asOfDate: '2026-09-01', source: 'S' } })); a.ok(r2.missing.some(m => m.includes('오래됨'))); a.equal(r2.drawdownPct, null);
});
test('시장 대비 상대 과잉 하락 / 재무 악화 / 재무 오래됨 / 투자 논리', () => {
  a.ok(types(ev(F.stock())).includes('relative-overdrop')); a.equal(types(ev(F.stock({ returns: { stockPct: -5, benchPct: -3, periodDays: 20, asOfDate: '2026-11-05', source: 'S' } }))).includes('relative-overdrop'), false);
  a.equal(ev(F.stock()).fundamentalsStatus, 'ok');
  for (const f of [{ revenueGrowthPct: -3 }, { freeCashFlow: -5 }, { freeCashFlow: 50, freeCashFlowPrev: 100 }, { debtToEquity: 2.0, debtToEquityPrev: 1.0 }]) { const r = ev(F.stock({ fundamentals: F.fund(f) })); a.equal(r.fundamentalsStatus, 'deteriorated', JSON.stringify(f)); a.ok(types(r).includes('fundamental-deterioration')); }
  const st = ev(F.stock({ fundamentals: F.fund({ asOfDate: '2026-02-01' }) })); a.equal(st.fundamentalsStatus, 'stale'); a.ok(st.missing.some(m => m.includes('재무자료가 오래됨')));
  a.equal(ev(F.stock({ fundamentals: null })).fundamentalsStatus, 'missing');
  a.ok(types(ev(F.stock({ thesis: { intact: false, note: '경쟁 심화' } }))).includes('thesis-broken')); a.ok(ev(F.stock({ thesis: null })).missing.some(m => m.includes('투자 논리')));
});
test('보유 비중 과다·손실 위험(보유 종목만), 현금 부족·시장 위험(포트폴리오)', () => {
  const held = { quantity: 10, avgPrice: 100 };
  const r = ev(F.stock({ held }), F.ctx({ weightPct: 30 })); a.ok(types(r).includes('concentration')); a.ok(types(r).includes('loss-risk'));
  a.equal(types(ev(F.stock({ held: null }), F.ctx({ weightPct: 30 }))).includes('concentration'), false);
  a.equal(types(ev(F.stock({ held }), F.ctx({ weightPct: 5 }))).includes('loss-risk'), false);
  a.ok(ev(F.stock({ held }), { weightPct: 30, weightBasis: 'estimated' }).signals.find(x => x.type === 'concentration').evidence[0].includes('추정'));
  a.ok(W.evaluatePortfolio(F.ctx({ cashPct: 5 }), F.NOW).signals.some(x => x.type === 'cash-low'));
  a.ok(W.evaluatePortfolio(F.ctx({ market: { vix: { level: 35, asOfDate: '2026-11-05', source: 'S' } } }), F.NOW).signals.some(x => x.type === 'market-risk'));
  a.ok(W.evaluatePortfolio(F.ctx({ market: { vix: { level: 20, change5dPct: 40, asOfDate: '2026-11-05', source: 'S' } } }), F.NOW).signals.some(x => x.type === 'market-risk'));
  const nm = W.evaluatePortfolio(F.ctx({ market: { vix: { level: 35, asOfDate: '2026-11-05' } } }), F.NOW); a.equal(nm.signals.length, 0); a.ok(nm.missing[0].includes('출처'));
});
test('활성 감시 집계: 합성은 실제로 세지 않음', () => {
  const list = [F.stock(), F.stock({ ticker: 'B', quote: F.quote({ ticker: 'B', verification: 'unverified' }) }), F.stock({ ticker: 'C', quote: F.quote({ ticker: 'C', synthetic: false }) })];
  const c = W.activeWatchCount(list, F.NOW); a.deepEqual(c, { total: 3, activeReal: 1, activeSynthetic: 1, inactive: 1 });
  a.equal(W.activeWatchCount([], F.NOW).activeReal, 0);
});
const adv = (s, c) => { const cc = c || F.ctx(); return A.analyze(s, ev(s, cc), cc, F.NOW); };
test('매수 검토: 하락+재무·논리 정상+비중·현금 여유일 때만(두 관점 모두 충족)', () => {
  const r = adv(F.stock({ quote: F.quote({ price: 60 }) })); a.equal(r.opinion, '매수 검토'); a.equal(r.aggressive.stance, '매수 검토'); a.equal(r.defensive.stance, '매수 검토');
  a.ok(r.reasonsAgainst.length && r.facts.length && r.conditions.buyReview.length && r.checks.length); a.equal(A.validateAdvice(r, F.NOW).ok, true);
});
test('가격 하락만으로는 매수 의견 없음(재무·논리 자료 없음/악화/논리 훼손)', () => {
  for (const o of [{ fundamentals: null }, { fundamentals: F.fund({ asOfDate: '2026-01-01' }) }, { fundamentals: F.fund({ revenueGrowthPct: -5 }) }, { thesis: null }, { thesis: { intact: false, note: 'x' } }]) { const r = adv(F.stock(Object.assign({ quote: F.quote({ price: 55 }) }, o))); a.notEqual(r.opinion, '매수 검토', JSON.stringify(o)); }
  const r = adv(F.stock({ quote: F.quote({ price: 55 }), fundamentals: null })); a.equal(r.opinion, '판단 보류'); a.ok(r.reasonsAgainst[0].includes('가격만 하락'));
});
test('자료를 못 믿으면 판단 보류(어떤 하락이든)', () => {
  for (const q of [F.quote({ price: 40, verification: 'unverified' }), F.quote({ price: 40, asOfDate: '2026-10-01' }), null]) { const r = adv(F.stock({ quote: q })); a.equal(r.opinion, '판단 보류'); a.equal(r.dataQuality.ok, false); a.ok(r.unknown.length && r.reasonsAgainst[0].includes('신뢰할 수 없어')); }
});
test('공격형만 긍정이면 의견 불일치로 보유/보류, 방어형 조건은 현금 여력 필요', () => {
  const h = adv(F.stock({ quote: F.quote({ price: 75 }), held: { quantity: 1, avgPrice: 70 } })); a.equal(h.aggressive.stance, '매수 검토'); a.equal(h.defensive.stance, '보유'); a.equal(h.opinion, '보유'); a.ok(h.reasonsAgainst.some(x => x.includes('의견 불일치')));
  const n = adv(F.stock({ quote: F.quote({ price: 75 }) })); a.equal(n.opinion, '판단 보류');
  const lowCash = adv(F.stock({ quote: F.quote({ price: 60 }) }), F.ctx({ cashPct: 11 })); a.equal(lowCash.opinion, '보유' === lowCash.opinion ? '보유' : '판단 보류'); a.notEqual(lowCash.opinion, '매수 검토');
  const overW = adv(F.stock({ quote: F.quote({ price: 60 }) }), F.ctx({ weightPct: 12 })); a.notEqual(overW.opinion, '매수 검토');
});
test('비중 축소 검토: 논리 훼손/재무 악화+손실/비중 한도 초과(보유 종목)', () => {
  const held = { quantity: 5, avgPrice: 100 };
  a.equal(adv(F.stock({ quote: F.quote({ price: 95 }), thesis: { intact: false, note: 'n' }, held })).opinion, '비중 축소 검토');
  a.equal(adv(F.stock({ quote: F.quote({ price: 95 }), held }), F.ctx({ weightPct: 31 })).opinion, '비중 축소 검토');
  const r = adv(F.stock({ quote: F.quote({ price: 70 }), fundamentals: F.fund({ freeCashFlow: -1 }), held }), F.ctx({ weightPct: 12 })); a.equal(r.opinion, '비중 축소 검토'); a.ok(r.risks.length);
  a.equal(adv(F.stock({ quote: F.quote({ price: 95 }), thesis: { intact: false, note: 'n' }, held: null })).opinion, '판단 보류');   // 미보유는 축소 검토 없음
});
test('두 관점은 같은 엔진의 두 역할이라고 명시, 독립 모델 검증이라 쓰지 않음', () => {
  const r = adv(F.stock({ quote: F.quote({ price: 60 }) })); a.equal(r.independence, 'same-engine-two-roles'); a.match(r.notice, /같은 분석 엔진/); a.match(r.notice, /독립된 두 AI 모델이 검증한 결과가 아닙니다/);
});
test('validateAdvice: 필드 누락·신뢰 불가 자료의 판단·반대근거 없음·출처 없음·독립 주장·미래·주문 표현 거부', () => {
  const good = adv(F.stock({ quote: F.quote({ price: 60 }) })), clone = o => Object.assign(JSON.parse(JSON.stringify(good)), o);
  a.equal(A.validateAdvice(good, F.NOW).ok, true);
  a.equal(A.validateAdvice(clone({ unknown: undefined }), F.NOW).ok, false);
  a.equal(A.validateAdvice(clone({ dataQuality: { ok: false, why: ['x'] } }), F.NOW).ok, false);
  a.equal(A.validateAdvice(clone({ reasonsAgainst: [] }), F.NOW).ok, false);
  a.equal(A.validateAdvice(clone({ facts: [{ text: 't', source: null }] }), F.NOW).ok, false);
  a.equal(A.validateAdvice(clone({ independence: 'two-independent-models' }), F.NOW).ok, false);
  a.equal(A.validateAdvice(clone({ independence: 'two-independent-models', verifiedBy: ['m1', 'm2'] }), F.NOW).ok, true);
  a.equal(A.validateAdvice(clone({ asOf: '2027-01-01T00:00:00+09:00' }), F.NOW).ok, false);
  a.equal(A.validateAdvice(clone({ checks: ['지금 자동 매수 주문 실행'] }), F.NOW).ok, false);
  a.equal(A.validateAdvice(clone({ opinion: '무조건 매수' }), F.NOW).ok, false); a.equal(A.validateAdvice(null, F.NOW).ok, false);
});
test('분석은 입력을 변경하지 않음', () => { const s = F.stock({ quote: F.quote({ price: 60 }), held: { quantity: 1, avgPrice: 90 } }), c = F.ctx(), snap = JSON.stringify([s, c]); adv(s, c); a.equal(JSON.stringify([s, c]), snap); });
