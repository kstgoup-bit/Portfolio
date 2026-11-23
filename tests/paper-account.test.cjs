'use strict';
/* 가상 계좌 P2 순수 계산 모듈 v0.1 — 합성 자료만(SYN- 종목). 네트워크·저장소·실제 기록 없음.
   지피 GPT-REVIEW-paper-p2-20261123-1430 CR-1~3: 게이트는 실제 HASBuyReviewGate.evaluate 발급 결과만, 계획은 모듈 발급분만, 시간 순서. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../has/paper-account.js');
const G = require('../has/buy-review-gate.js');
const F = require('../has/buy-review-fixtures.js');

const CAL = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2027-02-15', '2027-02-16', '2027-02-17'];
const LIMITS = { cashFloorPct: 20, dailyLossStopPct: 5, monthlyLossStopPct: 10 };
const acct = (over = {}) => P.createAccount(Object.assign({ synthetic: true, id: 'SYN-PAPER-1', startDate: '2026-11-02', cash: { USD: 100000 }, riskLimits: LIMITS }, over));
// 합성 게이트 자료를 시각만 옮겨(같은 상대 간격) 실제 게이트 엔진으로 발급한다. KR은 시장·통화·문서번호 형식만 바꾼 합성 사본.
const shift = (x, ms) => { if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) { const full = /T/.test(x); const s = new Date(Date.parse(full ? x : x + 'T00:00:00Z') + ms).toISOString(); return full ? s.replace('.000Z', 'Z') : s.slice(0, 10); } if (Array.isArray(x)) return x.map(y => shift(y, ms)); if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = shift(x[k], ms); return o; } return x; };
const remap = (x, f) => { if (Array.isArray(x)) return x.map(y => remap(y, f)); if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = remap(f(k, x[k]), f); return o; } return x; };
const issueGate = (iso, { market = 'US', symbol = 'SYN-A', synthetic = true } = {}) => {
  let d = shift(F.base(), Date.parse(iso) - Date.parse(F.NOW));
  if (market === 'KR' || symbol !== 'SYN-A') d = remap(d, (k, v) => v === 'SYN-A' ? symbol : market === 'KR' && v === 'USD' ? 'KRW' : market === 'KR' && v === 'US' ? 'KR' : market === 'KR' && k === 'docId' ? '20261101000001' : v);
  if (!synthetic) d.synthetic = false;
  return G.evaluate(d, iso);
};
const GATE_1103 = issueGate('2026-11-03T21:00:00Z');
const cand = (over = {}) => Object.assign({ synthetic: true, market: 'US', symbol: 'SYN-A', sector: 'SYN-TECH', decidedAt: '2026-11-03T22:00:00Z', signalAsOf: '2026-11-03', decisionVersion: 'gate-v2.2', gate: GATE_1103, calendar: CAL }, over);
const bar = (date, close, over = {}) => Object.assign({ synthetic: true, date, close, priceType: 'close', currency: 'USD' }, over);
const marks = obj => Object.assign({ synthetic: true }, obj);

test('정책: 순태씨 2026-11-23 결정값과 미정 항목(null)이 고정돼 있다', () => {
  assert.equal(P.POLICY.capPct, 10); assert.equal(P.POLICY.tranches, 3); assert.equal(P.POLICY.exitReviewConsecutive, 2);
  assert.equal(P.POLICY.fill, 'next-trading-day-close'); assert.equal(P.POLICY.costStatus, 'unconfirmed');
  assert.equal(P.POLICY.partialSellPct, null); assert.equal(P.POLICY.storage, null); assert.equal(P.POLICY.kisPaperCriteria, null);
  assert.equal(P.POLICY.riskLimits.cashFloorPct, null);
  assert.equal(P.REAL_DATA_LOCK, true); assert.equal(P.CONVICTION_LOCKED, true);
  assert.ok(Object.isFrozen(P.POLICY));
});

test('실제 자료 잠금: 비합성 계좌·후보·시세·평가 가격 모두 거부', () => {
  assert.equal(P.createAccount({ id: 'X', startDate: '2026-11-02', cash: { USD: 1 } }).ok, false);
  const a = acct().account;
  const pl = P.planEntry(a, cand({ synthetic: false }));
  assert.equal(pl.action, 'PAPER_ENTRY_HOLD'); assert.ok(pl.reasons.some(r => /실제 자료 잠금/.test(r)));
  assert.equal(P.planEntry(a, cand({ gate: issueGate('2026-11-03T21:00:00Z', { synthetic: false }) })).action, 'PAPER_ENTRY_HOLD');
  const ok = P.planEntry(a, cand());
  assert.equal(P.fillEntry(a, ok.plan, bar('2026-11-04', 100, { synthetic: false })).ok, false);
  assert.equal(P.markToMarket(a, '2026-11-04', { 'US:SYN-A': 100 }).ok, false);
});

test('퇴직 브리지 자금은 투자가능 현금에 넣지 않는다', () => {
  const r = acct({ retirementBridge: 50000 });
  assert.equal(r.account.cash.USD, 100000); assert.ok(r.account.notes.some(n => /퇴직 브리지/.test(n)));
});

test('진입 전제: 게이트 매수 검토 발급 결과가 아니면(관찰·보류·가격 하락만) 보류', () => {
  const a = acct().account;
  for (const g of [{ buyReview: false, state: '관찰', synthetic: true }, { buyReview: true, state: '판단 보류', synthetic: true }, { drawdownPct: 40 }, issueGate('2026-11-03T21:00:00Z', { synthetic: false })]) {
    const r = P.planEntry(a, cand({ gate: g }));
    assert.equal(r.action, 'PAPER_ENTRY_HOLD'); assert.ok(r.reasons.some(x => /가격 하락만으로 진입 금지/.test(x)));
  }
});

test('위험 한도 숫자 미정이면 fail-closed(진입 보류)', () => {
  const a = acct({ riskLimits: {} }).account;
  const r = P.planEntry(a, cand());
  assert.equal(r.action, 'PAPER_ENTRY_HOLD'); assert.ok(r.reasons.some(x => /위험 한도.*미정/.test(x)));
});

test('체결 = 신호 다음 거래일 종가만. 당일·다른 날·시가·통화 불일치 거부', () => {
  const a = acct().account;
  const pl = P.planEntry(a, cand());
  assert.equal(pl.action, 'PAPER_ENTRY_PLANNED'); assert.equal(pl.plan.fillDay, '2026-11-04'); assert.equal(pl.order, null);
  assert.equal(P.fillEntry(a, pl.plan, bar('2026-11-03', 100)).ok, false);
  assert.equal(P.fillEntry(a, pl.plan, bar('2026-11-05', 90)).ok, false);
  assert.equal(P.fillEntry(a, pl.plan, bar('2026-11-04', 100, { priceType: 'open' })).ok, false);
  assert.equal(P.fillEntry(a, pl.plan, bar('2026-11-04', 100, { currency: 'KRW' })).ok, false);
  const f = P.fillEntry(a, pl.plan, bar('2026-11-04', 100));
  assert.equal(f.ok, true);
  // 1회차 = 상한 10%의 1/3 = 3,333.33 → 33주
  assert.equal(f.event.qty, 33); assert.equal(f.event.amount, 3300); assert.equal(f.event.costStatus, 'unconfirmed');
  assert.equal(f.account.cash.USD, 96700); assert.equal(a.cash.USD, 100000, '입력 계좌 불변');
});

test('멱등: 같은 체결 키 재요청은 변화 없음', () => {
  const a = acct().account;
  const pl = P.planEntry(a, cand());
  const f1 = P.fillEntry(a, pl.plan, bar('2026-11-04', 100));
  const f2 = P.fillEntry(f1.account, pl.plan, bar('2026-11-04', 100));
  assert.equal(f2.duplicate, true); assert.equal(f2.account.events.length, 1); assert.equal(f2.account.positions['US:SYN-A'].qty, 33);
});

const enter = (a, c, d, px) => { const pl = P.planEntry(a, c); assert.equal(pl.action, 'PAPER_ENTRY_PLANNED', pl.reasons.join('/')); const f = P.fillEntry(a, pl.plan, bar(d, px)); assert.ok(f.ok, f.reasons.join('/')); return f.account; };

test('추가 매수: 직전 결정 이후 새 정기 공시가 없으면 보류(가격·뉴스는 새 근거 아님), 최대 3회', () => {
  let a = enter(acct().account, cand(), '2026-11-04', 100);
  const c2 = cand({ decidedAt: '2026-11-09T22:00:00Z', signalAsOf: '2026-11-09', gate: issueGate('2026-11-09T21:00:00Z') });
  const fl = (id, t, kind = 'periodic') => ({ newFiling: { kind, id, publishedAt: t } });
  assert.ok(P.planEntry(a, c2).reasons.some(r => /새 정기 공시/.test(r)));
  assert.equal(P.planEntry(a, Object.assign({}, c2, fl('N-1', '2026-11-06T12:00:00Z', 'news'))).action, 'PAPER_ENTRY_HOLD');
  assert.equal(P.planEntry(a, Object.assign({}, c2, fl('F-0', '2026-11-02T12:00:00Z'))).action, 'PAPER_ENTRY_HOLD', '직전 결정 이전 공시');
  assert.equal(P.planEntry(a, Object.assign({}, c2, fl('F-9', '2026-11-10T12:00:00Z'))).action, 'PAPER_ENTRY_HOLD', '결정 이후(미래) 공시');
  assert.equal(P.planEntry(a, Object.assign({}, c2, { newFiling: { kind: 'periodic', publishedAt: '2026-11-06T12:00:00Z' } })).action, 'PAPER_ENTRY_HOLD', '공시 식별자 없음');
  assert.equal(P.planEntry(a, Object.assign({}, c2, { gate: GATE_1103 }, fl('F-1', '2026-11-06T12:00:00Z'))).action, 'PAPER_ENTRY_HOLD', '직전 회차 게이트 재사용');
  a = enter(a, Object.assign({}, c2, fl('F-1', '2026-11-06T12:00:00Z')), '2026-11-10', 100);
  const c3 = cand({ decidedAt: '2026-12-01T22:00:00Z', signalAsOf: '2026-12-01', gate: issueGate('2026-12-01T21:00:00Z') });
  const reuse = P.planEntry(a, Object.assign({}, c3, fl('F-1', '2026-11-30T12:00:00Z')));
  assert.ok(reuse.reasons.some(r => /이미 사용한 공시 재사용/.test(r)), reuse.reasons.join('/'));
  a = enter(a, Object.assign({}, c3, fl('F-2', '2026-11-30T12:00:00Z')), '2026-12-02', 100);
  assert.equal(a.positions['US:SYN-A'].tranches.length, 3);
  const r4 = P.planEntry(a, cand({ decidedAt: '2027-02-15T22:00:00Z', signalAsOf: '2027-02-15', gate: issueGate('2027-02-15T21:00:00Z'), newFiling: { kind: 'periodic', id: 'F-3', publishedAt: '2027-02-10T12:00:00Z' } }));
  assert.ok(r4.reasons.some(r => /회차 소진/.test(r)));
});

test('확신 종목 표시는 무시되고 상한 10% 유지, 상한 초과 체결 거부', () => {
  const a = acct().account;
  const pl = P.planEntry(a, cand({ conviction: true }));
  assert.equal(pl.action, 'PAPER_ENTRY_PLANNED'); assert.equal(pl.plan.capPct, 10); assert.ok(pl.reasons.some(r => /확신 종목 표시는 무시/.test(r)));
  // 예산을 키운 계획 사본은 발급 계획이 아니므로 거부(CR-2). 상한 검사는 체결 시점에 다시 한다.
  const big = Object.assign({}, pl.plan, { budget: 20000 });
  const f = P.fillEntry(a, big, bar('2026-11-04', 100));
  assert.equal(f.ok, false); assert.ok(f.reasons.some(r => /발급한 진입 계획 아님/.test(r)));
  assert.ok(Object.isFrozen(pl.plan)); assert.throws(() => { 'use strict'; pl.plan.budget = 20000; });
});

test('현금 하한 위반 체결 거부', () => {
  const a = acct({ riskLimits: { cashFloorPct: 98, dailyLossStopPct: 5, monthlyLossStopPct: 10 } }).account;
  const pl = P.planEntry(a, cand());
  const f = P.fillEntry(a, pl.plan, bar('2026-11-04', 100));
  assert.equal(f.ok, false); assert.ok(f.reasons.some(r => /현금 하한/.test(r)));
});

test('재평가: DATA-UNAVAILABLE은 청산 근거 아님, HOLD는 연속 초기화, EXIT-REVIEW 2연속 → 다음 거래일 종가 전량 청산', () => {
  let a = enter(acct().account, cand(), '2026-11-04', 100);
  const rv = (o, t, d) => ({ synthetic: true, market: 'US', symbol: 'SYN-A', outcome: o, reviewedAt: t, asOf: d, calendar: CAL, filing: o === 'DATA-UNAVAILABLE' ? null : { kind: 'periodic', id: 'F-' + t, publishedAt: t } });
  let r = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-05T22:00:00Z', '2026-11-05')); assert.equal(r.exitPlan, null); a = r.account;
  r = P.recordReview(a, rv('DATA-UNAVAILABLE', '2026-11-06T22:00:00Z', '2026-11-06')); assert.equal(r.exitPlan, null); assert.equal(r.event.streak, 1); a = r.account;
  r = P.recordReview(a, rv('HOLD', '2026-11-09T22:00:00Z', '2026-11-09')); assert.equal(r.event.streak, 0); a = r.account;
  r = P.recordReview(a, rv('EXIT-REVIEW', '2026-12-01T22:00:00Z', '2026-12-01')); assert.equal(r.exitPlan, null); a = r.account;
  assert.equal(P.recordReview(a, rv('EXIT-REVIEW', '2026-11-30T22:00:00Z', '2026-11-30')).ok, false, '시각 역전');
  r = P.recordReview(a, rv('EXIT-REVIEW', '2026-12-02T22:00:00Z', '2026-12-02')); a = r.account;
  assert.ok(r.exitPlan); assert.equal(r.exitPlan.fillDay, '2026-12-03'); assert.equal(r.exitPlan.qty, 33);
  assert.equal(P.fillExit(a, r.exitPlan, bar('2026-12-02', 80)).ok, false);
  const s = P.fillExit(a, r.exitPlan, bar('2026-12-03', 80));
  assert.equal(s.ok, true); assert.equal(s.event.realizedGross, -660); assert.equal(s.account.positions['US:SYN-A'].qty, 0);
  assert.equal(s.account.cash.USD, 96700 + 2640);
  assert.equal(P.fillExit(s.account, r.exitPlan, bar('2026-12-03', 80)).duplicate, true);
});

test('평가: 가격 누락은 숨기지 않고 실패, 일·월 손실 중지선 발동 시 신규 진입 중지, 재개는 사유 기록', () => {
  let a = enter(acct({ cash: { USD: 10000 } }).account, cand(), '2026-11-04', 10);
  assert.equal(P.markToMarket(a, '2026-11-04', marks({})).ok, false);
  let m = P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 10 })); a = m.account;
  assert.equal(m.mark.returnGrossPct.USD, 0); assert.equal(m.mark.costStatus, 'unconfirmed'); assert.match(m.mark.label, /실현 가능 성과 아님/);
  assert.equal(P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 10 })).ok, false, '같은 날 중복');
  m = P.markToMarket(a, '2026-11-05', marks({ 'US:SYN-A': 0.01 })); a = m.account; // 33주 × 10 → 거의 0: 계좌 약 -3.3%
  assert.equal(a.halted.USD, null);
  const crash = Object.assign({}, a, { riskLimits: { cashFloorPct: 20, dailyLossStopPct: 3, monthlyLossStopPct: 10 } });
  const m2 = P.markToMarket(crash, '2026-11-06', marks({ 'US:SYN-A': 0.01 }));
  assert.equal(m2.account.halted.USD, null, '직전 대비 변화 없음');
  const m3 = P.markToMarket(Object.assign({}, a, { riskLimits: { cashFloorPct: 20, dailyLossStopPct: 3, monthlyLossStopPct: 3 } }), '2026-11-06', marks({ 'US:SYN-A': 0.01 }));
  assert.match(m3.account.halted.USD, /월 손실 중지선/);
  const pl = P.planEntry(m3.account, cand({ symbol: 'SYN-B', decidedAt: '2026-11-09T22:00:00Z', signalAsOf: '2026-11-09' }));
  assert.ok(pl.reasons.some(r => /손실 중지선 발동/.test(r)));
  assert.equal(P.resume(m3.account, 'USD', '').ok, false);
  const rs = P.resume(m3.account, 'USD', '순태씨 합성 시험 재개');
  assert.equal(rs.account.halted.USD, null); assert.equal(rs.account.events.at(-1).kind, 'PAPER_RESUME');
});

test('KR/US 통화 분리: 원화 후보는 원화 현금으로만, 합계 환산 없음', () => {
  const a = acct({ cash: { KRW: 30000000, USD: 10000 } }).account;
  const pl = P.planEntry(a, cand({ market: 'KR', symbol: 'SYN-K', decidedAt: '2026-11-03T08:00:00Z', gate: issueGate('2026-11-03T07:00:00Z', { market: 'KR', symbol: 'SYN-K' }) }));
  assert.equal(pl.action, 'PAPER_ENTRY_PLANNED', pl.reasons.join('/')); assert.equal(pl.plan.fillDay, '2026-11-04');
  assert.equal(pl.plan.ccy, 'KRW'); assert.equal(pl.plan.equityAtPlan, 30000000);
  const f = P.fillEntry(a, pl.plan, bar('2026-11-04', 50000, { currency: 'KRW' }));
  assert.equal(f.ok, true); assert.equal(f.account.cash.USD, 10000);
  const m = P.markToMarket(f.account, '2026-11-04', marks({ 'KR:SYN-K': 50000 }));
  assert.deepEqual(Object.keys(m.mark.equity).sort(), ['KRW', 'USD']); assert.equal(m.mark.equityTotal, undefined);
});

/* ── 지피 GPT-REVIEW-paper-p2-20261123-1430 CR-1~3 반례 ── */
test('CR-1: 게이트 결과는 실제 엔진 발급·verify 통과·같은 시장/종목/신호일만 — 위조·JSON 복사·변조·교차종목·늦은/미래 게이트는 보류', () => {
  const a = acct().account;
  assert.equal(G.verify(GATE_1103), true); assert.equal(P.planEntry(a, cand()).action, 'PAPER_ENTRY_PLANNED');
  const forged = { buyReview: true, state: '조건부 분할매수 검토', synthetic: true, market: 'US', ticker: 'SYN-A', evaluatedAt: '2026-11-03T21:00:00Z' };
  const json = JSON.parse(JSON.stringify(GATE_1103));
  const tampered = Object.assign({}, GATE_1103, { state: '높은 확신의 분할매수 검토' });
  const cases = [
    [forged, /발급 결과 아님/], [json, /발급 결과 아님/], [tampered, /발급 결과 아님/],
    [issueGate('2026-11-03T21:00:00Z', { symbol: 'SYN-B' }), /시장·종목이 후보와 다름/],
    [issueGate('2026-11-03T23:00:00Z'), /결정시각보다 나중/],
    [issueGate('2026-11-02T21:00:00Z'), /24시간 넘게|신호 기준일과 다름/],
    [G.evaluate(F.base(), '2026-11-24T21:00:00Z'), /발급 결과 아님\(매수 검토 상태 아님/] // 실제 엔진 발급이지만 가격 증거 지연 → 판단 보류
  ];
  for (const [g, re] of cases) {
    const r = P.planEntry(a, cand({ gate: g }));
    assert.equal(r.action, 'PAPER_ENTRY_HOLD'); assert.ok(r.reasons.some(x => re.test(x)), r.reasons.join(' / '));
  }
  // 다른 종목 게이트로 다른 종목 후보 진입 불가(교차 사용)
  assert.equal(P.planEntry(a, cand({ symbol: 'SYN-B' })).action, 'PAPER_ENTRY_HOLD');
});

test('CR-2: 체결은 모듈 발급 계획만 — 위조·복사·다른 계좌·이전(중복 회차) 계획·계획 후 중지·위험 한도 해제는 거부', () => {
  const a = acct().account, pl = P.planEntry(a, cand());
  const own = { market: 'US', ccy: 'USD', symbol: 'SYN-A', tranche: 1, decidedAt: '2026-11-03T22:00:00Z', signalAsOf: '2026-11-03', decisionVersion: 'x', fillRule: P.POLICY.fill, fillDay: '2026-11-04', budget: 3000, capPct: 10 };
  for (const fake of [own, JSON.parse(JSON.stringify(pl.plan)), Object.freeze(Object.assign({}, pl.plan))]) {
    const f = P.fillEntry(a, fake, bar('2026-11-04', 100)); assert.equal(f.ok, false); assert.ok(f.reasons.some(r => /발급한 진입 계획 아님/.test(r)));
  }
  const other = acct({ id: 'SYN-PAPER-2' }).account;
  assert.ok(P.fillEntry(other, pl.plan, bar('2026-11-04', 100)).reasons.some(r => /다른 계좌/.test(r)));
  // 같은 회차를 두 번 계획(결정 버전만 다름) → 하나 체결 후 나머지는 이전 계획으로 거부
  const pl2 = P.planEntry(a, cand({ decisionVersion: 'gate-v2.2b' }));
  const f1 = P.fillEntry(a, pl.plan, bar('2026-11-04', 100)); assert.equal(f1.ok, true);
  const f2 = P.fillEntry(f1.account, pl2.plan, bar('2026-11-04', 100));
  assert.equal(f2.ok, false); assert.ok(f2.reasons.some(r => /회차.*맞지 않음/.test(r)));
  // 계획 후 손실 중지선 발동 → 체결 거부
  const halted = Object.assign({}, a, { halted: { KRW: null, USD: '월 손실 중지선 3% · 2026-11-03' } });
  assert.ok(P.fillEntry(halted, pl.plan, bar('2026-11-04', 100)).reasons.some(r => /손실 중지선 발동 중/.test(r)));
  // 계획 후 위험 한도가 미정(null)이 되면 0으로 강제 변환하지 않고 거부
  const unset = Object.assign({}, a, { riskLimits: { cashFloorPct: null, dailyLossStopPct: 5, monthlyLossStopPct: 10 } });
  assert.ok(P.fillEntry(unset, pl.plan, bar('2026-11-04', 100)).reasons.some(r => /위험 한도.*미정/.test(r)));
});

test('CR-2: 청산은 모듈 발급 청산 계획만 — 가짜 계획·이후 HOLD 재평가로 근거가 사라진 계획은 거부', () => {
  let a = enter(acct().account, cand(), '2026-11-04', 100);
  const rv = (o, t, d) => ({ synthetic: true, market: 'US', symbol: 'SYN-A', outcome: o, reviewedAt: t, asOf: d, calendar: CAL, filing: { kind: 'periodic', id: 'F-' + t, publishedAt: t } });
  const fake = { market: 'US', ccy: 'USD', symbol: 'SYN-A', qty: 33, fillRule: P.POLICY.fill, fillDay: '2026-11-05', decidedAt: '2026-11-04T22:00:00Z', decisionVersion: 'x', tranche: 1, reason: 'EXIT' };
  const ff = P.fillExit(a, fake, bar('2026-11-05', 120)); assert.equal(ff.ok, false); assert.ok(ff.reasons.some(r => /발급한 청산 계획 아님/.test(r)));
  let r = P.recordReview(a, rv('EXIT', '2026-11-05T22:00:00Z', '2026-11-05')); assert.ok(r.exitPlan); a = r.account;
  const plan = r.exitPlan;
  r = P.recordReview(a, rv('HOLD', '2026-11-06T22:00:00Z', '2026-11-06')); a = r.account;
  const s = P.fillExit(a, plan, bar('2026-11-06', 120));
  assert.equal(s.ok, false); assert.ok(s.reasons.some(x => /청산 근거 재검증 실패/.test(x)));
});

test('CR-3: 체결일은 결정시각(거래소 현지일)·신호일 이후 첫 거래일 — 결정 12/01·신호 11/03·체결 11/04 같은 과거 체결 불가', () => {
  const a = acct().account;
  // 오래된 게이트(11/03)로 12/01 결정 → 보류
  const late = P.planEntry(a, cand({ decidedAt: '2026-12-01T22:00:00Z' }));
  assert.equal(late.action, 'PAPER_ENTRY_HOLD'); assert.ok(late.reasons.some(r => /24시간 넘게/.test(r)));
  // 12/01 게이트를 11/03 신호로 쓰면 보류
  const mis = P.planEntry(a, cand({ decidedAt: '2026-12-01T22:00:00Z', gate: issueGate('2026-12-01T21:00:00Z') }));
  assert.equal(mis.action, 'PAPER_ENTRY_HOLD'); assert.ok(mis.reasons.some(r => /신호 기준일과 다름/.test(r)));
  // 신호 11/03 장마감 후 게이트, 결정은 다음 날 뉴욕 오전(11/04 10시) → 체결은 11/05(11/04 아님)
  const next = P.planEntry(a, cand({ decidedAt: '2026-11-04T15:00:00Z' }));
  assert.equal(next.action, 'PAPER_ENTRY_PLANNED', next.reasons.join('/')); assert.equal(next.plan.fillDay, '2026-11-05');
  assert.equal(P.fillEntry(a, next.plan, bar('2026-11-04', 100)).ok, false);
  // 뉴욕 현지일 기준: 11/04 03:00Z는 뉴욕 11/03 밤 → 체결 11/04
  const ny = P.planEntry(a, cand({ decidedAt: '2026-11-04T03:00:00Z' }));
  assert.equal(ny.plan.fillDay, '2026-11-04');
  assert.equal(P.localDay('2026-11-04T03:00:00Z', 'US'), '2026-11-03'); assert.equal(P.localDay('2026-11-03T16:00:00Z', 'KR'), '2026-11-04');
  assert.equal(P.localDay('2026-07-01T03:30:00Z', 'US'), '2026-06-30', '서머타임(UTC-4)');
});

test('CR-3: 재평가 공시 — 같은 공시 반복 EXIT-REVIEW·같은 공개시각·미래 공시·기준일 미래·매수 이전 공시는 거부, 청산일은 검토 현지일 이후', () => {
  let a = enter(acct().account, cand(), '2026-11-04', 100);
  const rv = (o, t, d, filing) => ({ synthetic: true, market: 'US', symbol: 'SYN-A', outcome: o, reviewedAt: t, asOf: d, calendar: CAL, filing });
  let r = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-05T22:00:00Z', '2026-11-05', { kind: 'periodic', id: 'Q3', publishedAt: '2026-11-05T12:00:00Z' })); assert.equal(r.ok, true); a = r.account;
  const again = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-06T22:00:00Z', '2026-11-06', { kind: 'periodic', id: 'Q3', publishedAt: '2026-11-05T12:00:00Z' }));
  assert.equal(again.ok, false); assert.ok(again.reasons.some(x => /같은 공시 재사용/.test(x)));
  const sameAt = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-06T22:00:00Z', '2026-11-06', { kind: 'periodic', id: 'Q3-copy', publishedAt: '2026-11-05T12:00:00Z' }));
  assert.ok(sameAt.reasons.some(x => /같은 공시 재사용/.test(x)));
  const future = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-06T22:00:00Z', '2026-11-06', { kind: 'periodic', id: 'Q4', publishedAt: '2026-11-07T12:00:00Z' }));
  assert.ok(future.reasons.some(x => /미래 공시/.test(x)));
  const futAsOf = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-06T22:00:00Z', '2026-11-09', { kind: 'periodic', id: 'Q4', publishedAt: '2026-11-06T12:00:00Z' }));
  assert.ok(futAsOf.reasons.some(x => /기준일이 재평가 시각보다 나중/.test(x)));
  const old = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-06T22:00:00Z', '2026-11-06', { kind: 'periodic', id: 'Q2', publishedAt: '2026-11-01T12:00:00Z' }));
  assert.ok(old.reasons.some(x => /마지막 매수 결정 이전/.test(x)));
  assert.equal(a.positions['US:SYN-A'].exitReviewStreak, 1, '거부된 재평가는 연속 횟수 불변');
  // 새 공시로 2연속 → 검토는 뉴욕 12/03 10시(asOf 12/02) → 청산일 12/04
  r = P.recordReview(a, rv('EXIT-REVIEW', '2026-12-03T15:00:00Z', '2026-12-02', { kind: 'periodic', id: 'Q4', publishedAt: '2026-12-02T12:00:00Z' }));
  assert.equal(r.ok, true, r.reasons.join('/')); assert.equal(r.exitPlan.fillDay, '2026-12-04');
});

test('모듈은 네트워크·저장소·주문 코드를 포함하지 않는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '../has/paper-account.js'), 'utf8');
  for (const bad of [/fetch\s*\(/, /XMLHttpRequest/, /localStorage/, /indexedDB/, /sessionStorage/, /script\.src/, /google\.script/]) assert.doesNotMatch(src, bad);
});
