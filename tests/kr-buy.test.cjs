'use strict';
const { test } = require('node:test'), a = require('node:assert/strict');
const F = require('../kr-radar/fixtures.js'), B = require('../kr-radar/buy.js'), { reconcile } = require('../kr-radar/reconcile.js'), S = require('../kr-radar/sell.js');
const run = over => B.evaluateBuy(F.buyInput(over), { today: F.TODAY });
const frozen = o => { const f = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(f); } return x; }; return f(o); };
const guards = r => { a.equal(r.automaticAction, false); a.equal(r.order, null); a.equal(r.notification, null); a.equal(r.actualActiveCount, 0); a.equal(r.realApiRequests, 0); a.equal(r.realPriceValidated, 0); a.equal(r.mode, 'synthetic'); };

test('weights sum to 100 and the baseline scores 80 with full provenance', () => {
  a.equal(Object.values(B.WEIGHTS).reduce((x, y) => x + y, 0), 100);
  const r = run({}); guards(r);
  a.equal(r.status, '심층 분석 후보'); a.equal(r.score, 80);
  a.deepEqual(r.components, { business: 16, financial: 16, event: 8, catalyst: 3, overreaction: 10, valuation: 12, shareholder: 15 });
  a.equal(r.provenance.quote.currency, 'KRW'); a.equal(r.provenance.quote.timezone, 'Asia/Seoul'); a.equal(r.provenance.quote.adjustment, 'adjusted-consistent');
  a.ok(r.provenance.claims.every(c => c.period.basis && c.period.fiscalLabel && /^\d{14}$/.test(c.filing.id) && c.source && c.asOf));
  a.ok(r.counterEvidence.length >= 6); a.ok(r.formulas.length >= 3); a.ok(r.uncertainty.length >= 2);
  a.match(r.notes.join(' '), /추천 정확도를 주장하지 않습니다/);
});
test('no signal means no score, even for excellent quality (drop alone is not the trigger, and neither is quality alone)', () => {
  const r = run({ quote: { close: 99 }, performance: { stockPct: -1, marketPct: -1, sectorPct: -1 } });
  a.equal(r.status, '신호 없음'); a.equal(r.score, null); guards(r);
});
test('excessive drop with deteriorated earnings is held, not promoted', () => {
  const r = run({ quote: { close: 50 }, assessment: { components: { business: 6, financial: 4, event: 2, catalyst: 0 }, valuation: { pbr: 1.5 } } });
  a.equal(r.band, 45); a.ok(r.score < 55); a.equal(r.status, '판단 보류');
});
test('cycle peak with a low multiple is a value trap, not a buy', () => {
  const r = run({ sector: 'semiconductor', assessment: { valuation: { cyclePhase: 'peak' } } });
  a.equal(r.status, '판단 보류'); a.equal(r.valuation.state, 'trap-risk'); a.ok(r.valuation.flags.some(f => /이익 정점/.test(f))); a.ok(r.components.valuation <= 3);
});
test('cyclical sector with unknown cycle position is not evaluable', () => {
  const r = run({ sector: 'shipbuilding', assessment: { valuation: { cyclePhase: 'unknown' } } });
  a.equal(r.status, '평가 불가'); a.ok(r.missing.some(m => /사이클/.test(m))); a.equal(r.score, null);
});
test('low PBR with collapsing ROE is a trap', () => {
  const r = run({ assessment: { valuation: { roe: 3 } } });
  a.equal(r.status, '판단 보류'); a.ok(r.valuation.flags.some(f => /가치함정/.test(f)));
  const loss = run({ assessment: { valuation: { roe: -2 } } }); a.equal(loss.status, '판단 보류');
});
test('buyback without cancellation earns no shareholder-return credit', () => {
  const r = run({ assessment: { shareholder: { buyback: { executed: true }, cancellation: { executedPct: 0, filingId: null, source: null } } } });
  a.equal(r.components.shareholder, 9); a.match(r.shareholderNotes.join(' '), /실제 소각이 없어/);
  const noFiling = run({ assessment: { shareholder: { cancellation: { executedPct: 1, filingId: null, source: null } } } });
  a.equal(noFiling.components.shareholder, 9); a.match(noFiling.shareholderNotes.join(' '), /공시번호·출처가 없어/);
});
test('dividend cut removes dividend credit; governance concern holds the item', () => {
  const cut = run({ assessment: { shareholder: { dividend: { yieldPct: 4, cut: true } } } }); a.equal(cut.components.shareholder, 10);
  const gov = run({ assessment: { shareholder: { governance: { concern: true } } } }); a.equal(gov.status, '판단 보류'); a.match(gov.reasons.join(' '), /지배구조 우려/);
});
test('a corrected (superseded) filing invalidates its claim', () => {
  const r = run({ assessment: { claims: F.buyInput().assessment.claims.map(c => c.component === 'financial' ? { ...c, filing: { id: c.filing.id, kind: 'original', supersededBy: '20260901000009' } } : c) } });
  a.equal(r.status, '평가 불가'); a.ok(r.missing.some(m => /정정공시로 대체/.test(m))); a.equal(r.score, null);
});
test('risk disclosures outrank any score and unknown tokens fail closed', () => {
  for (const t of Object.keys(B.RISK_TOKENS)) { const r = run({ assessment: { riskFlags: [t] } }); a.equal(r.status, '위험 우선 · 보류'); a.equal(r.score, null); }
  const unk = run({ assessment: { riskFlags: ['new-unknown-flag'] } }); a.equal(unk.status, '위험 우선 · 보류'); a.match(unk.riskFlags[0].meaning, /알 수 없는/);
  const absent = B.evaluateBuy((() => { const i = F.buyInput(); delete i.assessment.riskFlags; return i; })(), { today: F.TODAY }); a.equal(absent.status, '평가 불가');
});
test('trading halt, delisting review and administrative issue never reach scoring', () => {
  a.equal(run({ instrument: { tradingHalt: true } }).status, '판단 보류');
  a.equal(run({ quote: { tradingStatus: 'halt' } }).status, '판단 보류');
  a.equal(run({ instrument: { delistingReview: true } }).status, '제외');
  a.equal(run({ instrument: { administrativeIssue: true } }).status, '제외');
  a.equal(run({ instrument: { delisted: true } }).status, '제외');
  a.equal(run({ instrument: { tradingHalt: null } }).status, '판단 보류');
});
test('stale, future and mismatched dates are rejected, not guessed', () => {
  a.equal(run({ quote: { asOf: '2026-10-20', high52wEnd: '2026-10-20', high52wStart: '2025-10-20' }, performance: { end: '2026-10-20', start: '2026-07-20' } }).status, '평가 불가');
  a.equal(run({ quote: { asOf: '2026-11-02' } }).status, '평가 불가');
  const r = run({ performance: { end: '2026-10-27' } }); a.equal(r.marketExcess, null); a.ok(r.missing.some(m => /상대수익률/.test(m))); a.ok(r.signals.some(x => x.type === 'drawdown'), '상대수익률을 못 써도 낙폭 신호는 유지');
  const hi = run({ quote: { high52wEnd: '2026-10-27' } }); a.equal(hi.drawdown, null); a.ok(hi.missing.some(m => /52주 고가/.test(m)));
});
test('mixed adjusted/unadjusted prices and wrong benchmark are not compared', () => {
  a.equal(run({ quote: { adjustment: 'unadjusted' } }).status, '평가 불가');
  const mix = run({ performance: { adjustment: 'unadjusted' } }); a.equal(mix.marketExcess, null); a.ok(mix.missing.some(m => /수정기준/.test(m)));
  const wrong = run({ instrument: { market: 'KOSDAQ' } }); a.equal(wrong.marketExcess, null); a.ok(wrong.missing.some(m => /KOSDAQ/.test(m)));
  const ok = run({ instrument: { market: 'KOSDAQ' }, performance: { benchmark: 'KOSDAQ' } }); a.equal(ok.status, '심층 분석 후보');
  a.equal(run({ quote: { currency: 'USD' } }).status, '평가 불가'); a.equal(run({ quote: { session: 'after-hours' } }).status, '평가 불가'); a.equal(run({ quote: { timezone: 'America/New_York' } }).status, '평가 불가');
});
test('mis-typed ETF stays on hold; a proper ETF uses ETF-only handling with no score', () => {
  a.equal(run({ instrument: { name: 'KODEX 가상' } }).status, '판단 보류');
  const etf = run({ instrument: { name: 'KODEX 가상지수', securityType: 'ETF', etfKind: 'domestic-equity' } });
  a.equal(etf.status, 'ETF 신호만 · 점수 미구현'); a.equal(etf.score, null); a.ok(etf.missing.some(m => /ETF 전용 평가/.test(m)));
  a.equal(run({ instrument: { name: 'KODEX 가상레버리지', securityType: 'ETF', etfKind: 'leveraged-inverse' } }).status, '제외');
});
test('financial sector requires capital adequacy and uses ROE-linked PBR', () => {
  a.equal(run({ sector: 'financial' }).status, '평가 불가');
  const ok = run({ sector: 'financial', assessment: { valuation: { capitalAdequacy: true, costOfEquityPct: 10, roe: 11, pbr: 0.5 } } });
  a.equal(ok.components.valuation, 12); a.equal(ok.valuation.state, 'cheap-confirmed');
  const dear = run({ sector: 'financial', assessment: { valuation: { capitalAdequacy: true, costOfEquityPct: 10, roe: 11, pbr: 1.5 } } }); a.equal(dear.components.valuation, 0);
});
test('out-of-range components, stale evidence and unverified claims are rejected', () => {
  a.equal(run({ assessment: { components: { business: 21 } } }).status, '평가 불가');
  a.equal(run({ assessment: { valuation: { evidence: { asOf: '2026-01-01' } } } }).status, '평가 불가');
  a.equal(run({ assessment: { claims: F.buyInput().assessment.claims.map(c => ({ ...c, verification: 'verified' })) } }).status, '평가 불가');
  a.equal(run({ assessment: { claims: F.buyInput().assessment.claims.slice(1) } }).status, '평가 불가');
});
test('real-looking input is refused: only KR-DEMO synthetic contracts are accepted', () => {
  a.equal(B.evaluateBuy({ ...F.buyInput(), id: '005930' }, { today: F.TODAY }).status, '평가 불가');
  a.equal(B.evaluateBuy({ ...F.buyInput(), mode: 'real' }, { today: F.TODAY }).status, '평가 불가');
  a.equal(B.evaluateBuy(F.buyInput(), {}).status, '평가 불가'); a.equal(B.evaluateBuy(null, { today: F.TODAY }).status, '평가 불가');
});
test('inputs are never mutated and results are deterministic', () => {
  const i = frozen(F.buyInput()), snap = JSON.stringify(i);
  const r1 = B.evaluateBuy(i, { today: F.TODAY }), r2 = B.evaluateBuy(i, { today: F.TODAY });
  a.equal(JSON.stringify(i), snap); a.deepEqual(r1, r2);
  const s = frozen(F.sellInput()), ss = JSON.stringify(s); S.evaluateSell(s, { today: F.TODAY }); a.equal(JSON.stringify(s), ss);
});
test('buy/sell conflict is surfaced instead of averaged away', () => {
  const buy = run({}), sell = S.evaluateSell(F.sellInput({ thesis: { factors: [{ name: 'moat', state: 'structural-deterioration' }, ...F.sellInput().thesis.factors.slice(1)] } }), { today: F.TODAY });
  const r = reconcile(buy, sell, { today: F.TODAY }); a.equal(r.status, '상충 근거 재검토'); guards(r);
  a.equal(reconcile(buy, S.evaluateSell(F.sellInput(), { today: F.TODAY }), { today: F.TODAY }).status, '정보 제공');
  a.equal(reconcile(buy, S.evaluateSell(F.sellInput({ id: 'KR-DEMO-B' }), { today: F.TODAY }), { today: F.TODAY }).status, '평가 불가');
  const urgent = reconcile(run({ assessment: { riskFlags: ['rights-offering'] } }), sell, { today: F.TODAY }); a.ok(['위험 확인 우선', '평가 불가'].includes(urgent.status));
});
