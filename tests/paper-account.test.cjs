'use strict';
/* 가상 계좌 P2 순수 계산 모듈 v0.1 — 합성 자료만(SYN- 종목). 네트워크·저장소·실제 기록 없음.
   지피 GPT-REVIEW-paper-p2-20261123-1430 CR-1~3: 게이트는 실제 HASBuyReviewGate.evaluate 발급 결과만, 계획은 모듈 발급분만, 시간 순서.
   v0.2 지피 GPT-REVIEW-paper-p2-20261123-1530 CR-5~7: 재개 잠금, 계좌 시간축, 모듈 발급 계좌·위험 한도 완화 금지.
   v0.3 지피 GPT-REVIEW-paper-p2-20261123-1630 CR-8~9: 계좌 상태 전체 무결성, 종목 간·같은 날 시간축(UTC 순간).
   v0.4 지피 GPT-REVIEW-paper-p2-20261123-1730 CR-10: 계획·계좌 계보 결합(같은 id 다른 계좌 교차 사용 금지). */
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

test('평가: 가격 누락은 숨기지 않고 실패, 일·월 손실 중지선 발동 시 신규 진입 중지, 재개는 잠금(CR-5)', () => {
  let a = enter(acct({ cash: { USD: 10000 } }).account, cand(), '2026-11-04', 10);
  assert.equal(P.markToMarket(a, '2026-11-04', marks({})).ok, false);
  let m = P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 10 })); a = m.account;
  assert.equal(m.mark.returnGrossPct.USD, 0); assert.equal(m.mark.costStatus, 'unconfirmed'); assert.match(m.mark.label, /실현 가능 성과 아님/);
  assert.equal(P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 10 })).ok, false, '같은 날 중복');
  m = P.markToMarket(a, '2026-11-05', marks({ 'US:SYN-A': 0.01 })); a = m.account; // 33주 × 10 → 거의 0: 계좌 약 -3.3%
  assert.equal(a.halted.USD, null);
  // 한도 변경은 모듈의 강화 경로로만(CR-7). 복사 계좌로 한도를 바꾸면 거부.
  assert.equal(P.markToMarket(Object.assign({}, a, { riskLimits: { cashFloorPct: 20, dailyLossStopPct: 3, monthlyLossStopPct: 3 } }), '2026-11-06', marks({ 'US:SYN-A': 0.01 })).ok, false);
  const crash = P.tightenRiskLimits(a, { dailyLossStopPct: 3 }); assert.equal(crash.ok, true, crash.reasons.join('/'));
  const m2 = P.markToMarket(crash.account, '2026-11-06', marks({ 'US:SYN-A': 0.01 }));
  assert.equal(m2.account.halted.USD, null, '직전 대비 변화 없음');
  const t3 = P.tightenRiskLimits(a, { dailyLossStopPct: 3, monthlyLossStopPct: 3 });
  const m3 = P.markToMarket(t3.account, '2026-11-06', marks({ 'US:SYN-A': 0.01 }));
  assert.match(m3.account.halted.USD, /월 손실 중지선/);
  const pl = P.planEntry(m3.account, cand({ symbol: 'SYN-B', decidedAt: '2026-11-09T22:00:00Z', signalAsOf: '2026-11-09' }));
  assert.ok(pl.reasons.some(r => /손실 중지선 발동/.test(r)));
  assert.equal(P.RESUME_LOCKED, true);
  assert.equal(P.resume(m3.account, 'USD', '').ok, false);
  const rs = P.resume(m3.account, 'USD', '순태씨 합성 시험 재개');
  assert.equal(rs.ok, false); assert.equal(rs.account, m3.account); assert.match(rs.account.halted.USD, /월 손실 중지선/);
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
  // 중지 상태·위험 한도를 모듈 밖에서 바꾼 복사 계좌는 거부(중지 해제·한도 null 위조 포함)
  const halted = Object.assign({}, a, { halted: { KRW: null, USD: '월 손실 중지선 3% · 2026-11-03' } });
  assert.ok(P.fillEntry(halted, pl.plan, bar('2026-11-04', 100)).reasons.some(r => /모듈이 만든 계좌 상태 아님/.test(r)));
  const unset = Object.assign({}, a, { riskLimits: { cashFloorPct: null, dailyLossStopPct: 5, monthlyLossStopPct: 10 } });
  assert.ok(P.fillEntry(unset, pl.plan, bar('2026-11-04', 100)).reasons.some(r => /모듈이 만든 계좌 상태 아님/.test(r)));
});

test('CR-2/5: 계획 후 실제 손실 중지 발동 → 다른 종목 체결 거부, 미정 한도는 보류 유지', () => {
  let a = enter(acct({ cash: { USD: 10000 } }).account, cand(), '2026-11-04', 10);
  a = P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 10 })).account;
  const plB = P.planEntry(a, cand({ symbol: 'SYN-B', decidedAt: '2026-11-04T22:00:00Z', signalAsOf: '2026-11-04', gate: issueGate('2026-11-04T21:00:00Z', { symbol: 'SYN-B' }) }));
  assert.equal(plB.action, 'PAPER_ENTRY_PLANNED', plB.reasons.join('/')); assert.equal(plB.plan.fillDay, '2026-11-05');
  const t = P.tightenRiskLimits(a, { dailyLossStopPct: 3 }).account;
  const h = P.markToMarket(t, '2026-11-05', marks({ 'US:SYN-A': 0.01, 'US:SYN-B': 1 })).account;
  assert.match(h.halted.USD, /일 손실 중지선/);
  const f = P.fillEntry(h, plB.plan, bar('2026-11-05', 10));
  assert.equal(f.ok, false); assert.ok(f.reasons.some(r => /손실 중지선 발동 중/.test(r)));
  const u = acct({ riskLimits: { cashFloorPct: null, dailyLossStopPct: 5, monthlyLossStopPct: 10 } }).account;
  assert.ok(P.planEntry(u, cand()).reasons.some(r => /위험 한도.*미정/.test(r)));
  assert.ok(P.tightenRiskLimits(u, { cashFloorPct: 30 }).reasons.some(r => /미정.*순태씨 결정/.test(r)));
});

/* ── 지피 GPT-REVIEW-paper-p2-20261123-1530 CR-5~7 반례 ── */
test('CR-5: 손실 중지 재개는 잠금 — 임의 사유·승인처럼 보이는 객체·다른 계좌·재사용 승인 모두 거부, 재개 시도 후에도 신규 진입 보류', () => {
  let a = enter(acct({ cash: { USD: 10000 } }).account, cand(), '2026-11-04', 10);
  a = P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 10 })).account;
  a = P.markToMarket(P.tightenRiskLimits(a, { dailyLossStopPct: 3 }).account, '2026-11-05', marks({ 'US:SYN-A': 0.01 })).account;
  assert.match(a.halted.USD, /일 손실 중지선/);
  const fakeApproval = { approvedBy: 'user', source: 'ui', policy: P.POLICY.version, accountId: a.id, nonce: 'n-1' };
  const other = acct({ id: 'SYN-PAPER-2' }).account;
  const attempts = [[a, 'USD', '순태씨 승인'], [a, 'USD', fakeApproval], [a, 'USD', Object.assign({}, fakeApproval, { accountId: other.id })], [a, 'USD', fakeApproval], [other, 'USD', fakeApproval]];
  for (const [acc, ccy, note] of attempts) { const r = P.resume(acc, ccy, note); assert.equal(r.ok, false); assert.ok(r.reasons.some(x => /RESUME_LOCKED/.test(x))); assert.equal(r.account, acc); }
  assert.match(a.halted.USD, /일 손실 중지선/);
  const pl = P.planEntry(a, cand({ symbol: 'SYN-B', decidedAt: '2026-11-06T22:00:00Z', signalAsOf: '2026-11-06', gate: issueGate('2026-11-06T21:00:00Z', { symbol: 'SYN-B' }) }));
  assert.equal(pl.action, 'PAPER_ENTRY_HOLD'); assert.ok(pl.reasons.some(r => /손실 중지선 발동/.test(r)));
  // 모듈 밖에서 halted를 지우는 우회도 거부
  const cleared = JSON.parse(JSON.stringify(a)); cleared.halted.USD = null;
  assert.ok(P.planEntry(cleared, cand({ symbol: 'SYN-B', decidedAt: '2026-11-06T22:00:00Z', signalAsOf: '2026-11-06', gate: issueGate('2026-11-06T21:00:00Z', { symbol: 'SYN-B' }) })).reasons.some(r => /모듈이 만든 계좌 상태 아님/.test(r)));
  a.halted.USD = null; // 같은 객체 직접 수정
  assert.ok(P.planEntry(a, cand({ symbol: 'SYN-B', decidedAt: '2026-11-06T22:00:00Z', signalAsOf: '2026-11-06', gate: issueGate('2026-11-06T21:00:00Z', { symbol: 'SYN-B' }) })).reasons.some(r => /모듈 밖에서 바뀜/.test(r)));
});

test('CR-6: 계좌 시간축 — 체결 전 재평가·미래 평가 뒤 과거 체결·과거 청산/재평가/평가 삽입 거부, 정상 시간순은 통과', () => {
  const base = acct().account;
  const rv = (o, t, d, id) => ({ synthetic: true, market: 'US', symbol: 'SYN-A', outcome: o, reviewedAt: t, asOf: d, calendar: CAL, filing: { kind: 'periodic', id, publishedAt: '2026-11-03T23:00:00Z' } });
  // 지피 예: 뉴욕 결정 11-03T22Z, 체결 11-04 → 11-04T03Z(뉴욕 11-03) 재평가는 체결 전
  let a = enter(base, cand(), '2026-11-04', 100);
  const pre = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-04T03:00:00Z', '2026-11-03', 'Q-pre'));
  assert.equal(pre.ok, false); assert.ok(pre.reasons.some(x => /체결 전 재평가 금지/.test(x)), pre.reasons.join('/'));
  const sameDay = P.recordReview(a, rv('EXIT-REVIEW', '2026-11-04T15:00:00Z', '2026-11-04', 'Q-same'));
  assert.equal(sameDay.ok, false, '체결일 당일(종가 전) 재평가도 금지');
  // 미래 평가 뒤 과거 체결
  const pl = P.planEntry(base, cand());
  const later = P.markToMarket(base, '2026-11-05', marks({})).account;
  const back = P.fillEntry(later, pl.plan, bar('2026-11-04', 100));
  assert.equal(back.ok, false); assert.ok(back.reasons.some(x => /시간축 역행|평가.*이후/.test(x)), back.reasons.join('/'));
  assert.ok(P.planEntry(later, cand()).reasons.some(x => /시간축 역행|평가.*이후/.test(x)), '계획 단계에서도 보류');
  // 같은 날 평가(종가) 뒤 그날 체결 삽입도 금지
  const sameMark = P.markToMarket(base, '2026-11-04', marks({})).account;
  assert.equal(P.fillEntry(sameMark, pl.plan, bar('2026-11-04', 100)).ok, false);
  // 정상: 체결 → 다음 날 재평가 EXIT → 청산 계획 11-06
  const ok = P.recordReview(a, rv('EXIT', '2026-11-05T22:00:00Z', '2026-11-05', 'Q3'));
  assert.equal(ok.ok, true, ok.reasons.join('/')); assert.equal(ok.exitPlan.fillDay, '2026-11-06'); a = ok.account;
  // 과거 청산 삽입: 11-09 평가 뒤 11-06 청산
  const marked = P.markToMarket(a, '2026-11-09', marks({ 'US:SYN-A': 100 })).account;
  const lateExit = P.fillExit(marked, ok.exitPlan, bar('2026-11-06', 100));
  assert.equal(lateExit.ok, false); assert.ok(lateExit.reasons.some(x => /시간축 역행|평가.*이후/.test(x)), lateExit.reasons.join('/'));
  // 과거 재평가 삽입: 11-09 평가 뒤 11-06 재평가
  const pastRv = P.recordReview(marked, rv('HOLD', '2026-11-06T22:00:00Z', '2026-11-06', 'Q3b'));
  assert.equal(pastRv.ok, false); assert.ok(pastRv.reasons.some(x => /시간축 역행|평가.*이후/.test(x)), pastRv.reasons.join('/'));
  // 과거 평가 삽입: 11-05 재평가 기록 뒤 11-04 평가
  assert.equal(P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 100 })).ok, false);
  // 정상 시간순 청산
  const s = P.fillExit(a, ok.exitPlan, bar('2026-11-06', 110)); assert.equal(s.ok, true, s.reasons.join('/'));
  assert.equal(P.markToMarket(s.account, '2026-11-06', marks({})).ok, true, '청산 당일 종가 평가는 허용');
});

test('CR-7: 위험 한도 — 계획 후 완화(98→0)·위조·직접 수정 계좌 거부, 강화(0→98)는 체결 시 반영, 미변경 정상 체결 통과', () => {
  const strict = acct({ riskLimits: { cashFloorPct: 98, dailyLossStopPct: 5, monthlyLossStopPct: 10 } }).account;
  const pl = P.planEntry(strict, cand()); assert.equal(pl.action, 'PAPER_ENTRY_PLANNED');
  assert.equal(pl.plan.riskLimitsAtPlan.cashFloorPct, 98); assert.ok(Object.isFrozen(pl.plan.riskLimitsAtPlan));
  const forged = JSON.parse(JSON.stringify(strict)); forged.riskLimits.cashFloorPct = 0;
  const f1 = P.fillEntry(forged, pl.plan, bar('2026-11-04', 100));
  assert.equal(f1.ok, false); assert.ok(f1.reasons.some(r => /모듈이 만든 계좌 상태 아님/.test(r)), '같은 id 복사 계좌는 신뢰 안 함');
  const spread = Object.assign({}, strict, { riskLimits: Object.assign({}, strict.riskLimits, { cashFloorPct: 0 }) });
  assert.equal(P.fillEntry(spread, pl.plan, bar('2026-11-04', 100)).ok, false);
  assert.ok(P.tightenRiskLimits(strict, { cashFloorPct: 0 }).reasons.some(r => /완화.*거부/.test(r)), '완화 경로 없음');
  assert.ok(P.tightenRiskLimits(strict, { dailyLossStopPct: 50 }).reasons.some(r => /완화.*거부/.test(r)));
  // 같은 객체 직접 수정
  const mut = acct({ riskLimits: { cashFloorPct: 98, dailyLossStopPct: 5, monthlyLossStopPct: 10 } }).account;
  const plm = P.planEntry(mut, cand()); mut.riskLimits.cashFloorPct = 0;
  assert.ok(P.fillEntry(mut, plm.plan, bar('2026-11-04', 100)).reasons.some(r => /모듈 밖에서 바뀜/.test(r)));
  // 강화 0→98: 계획 때 통과해도 체결 시 현금 하한 98% 위반으로 거부
  const loose = acct({ riskLimits: { cashFloorPct: 0, dailyLossStopPct: 5, monthlyLossStopPct: 10 } }).account;
  const pl0 = P.planEntry(loose, cand()); assert.equal(pl0.action, 'PAPER_ENTRY_PLANNED');
  const tight = P.tightenRiskLimits(loose, { cashFloorPct: 98 }); assert.equal(tight.ok, true); assert.equal(tight.account.events.at(-1).kind, 'PAPER_RISK_TIGHTEN');
  const f2 = P.fillEntry(tight.account, pl0.plan, bar('2026-11-04', 100));
  assert.equal(f2.ok, false); assert.ok(f2.reasons.some(r => /현금 하한 98% 위반/.test(r)), f2.reasons.join('/'));
  // 미변경 정상 체결
  const f3 = P.fillEntry(loose, pl0.plan, bar('2026-11-04', 100)); assert.equal(f3.ok, true, f3.reasons.join('/'));
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

/* ── 지피 GPT-REVIEW-paper-p2-20261123-1630 CR-8~9 반례 ── */
test('CR-8: 계좌 상태 전체 무결성 — 현금·납입·보유량·단가·회차·keys·marks·events·시작일·중첩 필드 직접 수정은 모두 거부, 반환 이벤트·평가 사본 수정은 무해', () => {
  const fresh = () => { const a = enter(acct().account, cand(), '2026-11-04', 100); return P.markToMarket(a, '2026-11-04', marks({ 'US:SYN-A': 100 })).account; };
  const tamper = {
    '현금 증액': a => { a.cash.USD += 1e6; },
    '납입 변경': a => { a.contributed.USD = 1; },
    '보유량 변경': a => { a.positions['US:SYN-A'].qty += 10; },
    '단가·원가 변경': a => { a.positions['US:SYN-A'].cost = 1; },
    '회차 기록 중첩 수정': a => { a.positions['US:SYN-A'].tranches[0].price = 1; },
    '회차 삭제': a => { a.positions['US:SYN-A'].tranches.length = 0; },
    'keys 삭제': a => { for (const k of Object.keys(a.keys)) delete a.keys[k]; },
    'marks 삭제': a => { a.marks.length = 0; },
    'marks 중첩 수정': a => { a.marks[0].equity.USD = 1e9; },
    'events 삭제': a => { a.events.pop(); },
    'events 삽입': a => { a.events.push({ kind: 'PAPER_BUY', fillDay: '2026-11-03', decidedAt: '2026-11-02T22:00:00Z', market: 'US' }); },
    '시작일 변경': a => { a.startDate = '2020-01-01'; },
    '포지션 삭제': a => { delete a.positions['US:SYN-A']; },
    '필드 추가': a => { a.extra = 1; }
  };
  const b2 = issueGate('2026-11-09T21:00:00Z', { symbol: 'SYN-B' });
  const cB = cand({ symbol: 'SYN-B', decidedAt: '2026-11-09T22:00:00Z', signalAsOf: '2026-11-09', gate: b2 });
  for (const [name, fn] of Object.entries(tamper)) {
    const a = fresh();
    const plB = P.planEntry(a, cB); assert.equal(plB.action, 'PAPER_ENTRY_PLANNED', name + ': 변조 전 정상');
    fn(a);
    const why = /모듈 밖에서 바뀜/;
    const pl = P.planEntry(a, cB); assert.equal(pl.action, 'PAPER_ENTRY_HOLD', name); assert.ok(pl.reasons.some(r => why.test(r)), name + ': ' + pl.reasons.join('/'));
    assert.ok(P.fillEntry(a, plB.plan, bar('2026-11-10', 100)).reasons.some(r => why.test(r)), name + ' 체결');
    assert.ok(P.markToMarket(a, '2026-11-10', marks({ 'US:SYN-A': 100, 'US:SYN-B': 100 })).reasons.some(r => why.test(r)), name + ' 평가');
    assert.ok(P.recordReview(a, { synthetic: true, market: 'US', symbol: 'SYN-A', outcome: 'HOLD', reviewedAt: '2026-11-10T22:00:00Z', asOf: '2026-11-10', calendar: CAL, filing: { kind: 'periodic', id: 'QX', publishedAt: '2026-11-10T12:00:00Z' } }).reasons.some(r => why.test(r)), name + ' 재평가');
    assert.ok(P.tightenRiskLimits(a, { cashFloorPct: 30 }).reasons.some(r => why.test(r)), name + ' 한도');
  }
  // 반환된 이벤트·평가 객체는 사본 — 고쳐도 계좌는 그대로 신뢰
  const a0 = acct().account; const pl0 = P.planEntry(a0, cand()); const f0 = P.fillEntry(a0, pl0.plan, bar('2026-11-04', 100));
  f0.event.qty = 0; f0.event.price = 1;
  const m0 = P.markToMarket(f0.account, '2026-11-04', marks({ 'US:SYN-A': 100 })); assert.equal(m0.ok, true, m0.reasons.join('/'));
  m0.mark.equity.USD = 1;
  // 정상 모듈 경유: 한도 강화 → 재평가 EXIT → 청산 → 평가 모두 통과
  const t = P.tightenRiskLimits(m0.account, { cashFloorPct: 25 }); assert.equal(t.ok, true, t.reasons.join('/'));
  const r = P.recordReview(t.account, { synthetic: true, market: 'US', symbol: 'SYN-A', outcome: 'EXIT', reviewedAt: '2026-11-05T22:00:00Z', asOf: '2026-11-05', calendar: CAL, filing: { kind: 'periodic', id: 'Q3', publishedAt: '2026-11-05T12:00:00Z' } });
  assert.equal(r.ok, true, r.reasons.join('/'));
  const s = P.fillExit(r.account, r.exitPlan, bar('2026-11-06', 110)); assert.equal(s.ok, true, s.reasons.join('/'));
  assert.equal(P.markToMarket(s.account, '2026-11-06', marks({})).ok, true);
  // 복사(서명 없는 복원) 계좌는 계속 거부
  assert.ok(P.planEntry(JSON.parse(JSON.stringify(s.account)), cB).reasons.some(r2 => /모듈이 만든 계좌 상태 아님/.test(r2)));
});

test('CR-9: 다른 종목 간 시간축 — A 재평가 뒤 과거 B 결정·같은 날 종가 소급 체결 거부, 미래 B 결정·다음 거래일 체결 통과, KR/US 현지일·서머타임', () => {
  const rvA = (t, d, id) => ({ synthetic: true, market: 'US', symbol: 'SYN-A', outcome: 'HOLD', reviewedAt: t, asOf: d, calendar: CAL, filing: { kind: 'periodic', id, publishedAt: d + 'T12:00:00Z' } });
  const candB = (iso, sig) => cand({ symbol: 'SYN-B', decidedAt: iso, signalAsOf: sig, gate: issueGate(new Date(Date.parse(iso) - 3600e3).toISOString().replace('.000Z', 'Z'), { symbol: 'SYN-B' }) });
  // 지피 예: A 재평가 11-06T22Z 기록 뒤, B의 과거 11-05T22Z 결정(체결 11-06) 사후 발급 → 보류
  const a = enter(acct().account, cand(), '2026-11-04', 100);
  const rA = P.recordReview(a, rvA('2026-11-06T22:00:00Z', '2026-11-06', 'QA1')); assert.equal(rA.ok, true, rA.reasons.join('/'));
  const back = P.planEntry(rA.account, candB('2026-11-05T22:00:00Z', '2026-11-05'));
  assert.equal(back.action, 'PAPER_ENTRY_HOLD'); assert.ok(back.reasons.some(r => /계좌 시간축 역행: 결정 시각.*다른 종목 포함/.test(r)), back.reasons.join('/'));
  // B 기존 회차 없음(lastDecidedAt 없음)에도 보호. 미래 B 결정 → 다음 거래일 체결 통과
  const fwd = P.planEntry(rA.account, candB('2026-11-09T22:00:00Z', '2026-11-09'));
  assert.equal(fwd.action, 'PAPER_ENTRY_PLANNED', fwd.reasons.join('/')); assert.equal(fwd.plan.fillDay, '2026-11-10');
  assert.equal(P.fillEntry(rA.account, fwd.plan, bar('2026-11-10', 50)).ok, true);
  // 같은 날 순서: B 계획(11-05T22Z, 체결 11-06) 발급 뒤 A 재평가가 11-06 장중(15Z)이면 11-06 종가(21Z) 체결 허용
  const plB = P.planEntry(a, candB('2026-11-05T22:00:00Z', '2026-11-05')); assert.equal(plB.action, 'PAPER_ENTRY_PLANNED', plB.reasons.join('/')); assert.equal(plB.plan.fillDay, '2026-11-06');
  const intra = P.recordReview(a, rvA('2026-11-06T15:00:00Z', '2026-11-06', 'QA2')); assert.equal(intra.ok, true, intra.reasons.join('/'));
  assert.equal(P.fillEntry(intra.account, plB.plan, bar('2026-11-06', 50)).ok, true, '장중 재평가 뒤 종가 체결');
  // …A 재평가가 11-06 장 마감 뒤(23Z)면 그날 종가 B 체결은 소급 → 거부
  const after = P.recordReview(a, rvA('2026-11-06T23:00:00Z', '2026-11-06', 'QA3')); assert.equal(after.ok, true);
  const late = P.fillEntry(after.account, plB.plan, bar('2026-11-06', 50));
  assert.equal(late.ok, false); assert.ok(late.reasons.some(r => /같은 날 소급 체결 금지/.test(r)), late.reasons.join('/'));
  // 평가도 같은 규칙: 마감 뒤 재평가가 기록된 날의 평가(그날 종가)는 소급 → 거부
  assert.ok(P.markToMarket(after.account, '2026-11-06', marks({ 'US:SYN-A': 100 })).reasons.some(r => /소급 평가 금지/.test(r)));
  // 종가 체결끼리는 같은 순간 허용(같은 날 두 종목 체결)
  const base = acct().account; const p1 = P.planEntry(base, cand()); const p2 = P.planEntry(base, candB('2026-11-03T22:30:00Z', '2026-11-03'));
  const g1 = P.fillEntry(base, p1.plan, bar('2026-11-04', 100)); assert.equal(g1.ok, true);
  assert.equal(P.fillEntry(g1.account, p2.plan, bar('2026-11-04', 50)).ok, true, '같은 날 US 종가 체결 2건');
  // KR/US 혼합: 원화 K 계획 → US A 체결(11-04 뉴욕 마감) 뒤 K 11-04(서울 마감, 더 이른 순간) 체결은 기록 순서 역행 → 거부, 시간순 기록은 통과
  const mix = acct({ cash: { KRW: 30000000, USD: 100000 } }).account;
  const kc = (iso, sig) => cand({ market: 'KR', symbol: 'SYN-K', decidedAt: iso, signalAsOf: sig, gate: issueGate(new Date(Date.parse(iso) - 3600e3).toISOString().replace('.000Z', 'Z'), { market: 'KR', symbol: 'SYN-K' }) });
  const pk = P.planEntry(mix, kc('2026-11-03T08:00:00Z', '2026-11-03')); assert.equal(pk.action, 'PAPER_ENTRY_PLANNED', pk.reasons.join('/'));
  const pu = P.planEntry(mix, cand());
  const u1 = P.fillEntry(mix, pu.plan, bar('2026-11-04', 100)); assert.equal(u1.ok, true);
  const kLate = P.fillEntry(u1.account, pk.plan, bar('2026-11-04', 50000, { currency: 'KRW' }));
  assert.equal(kLate.ok, false); assert.ok(kLate.reasons.some(r => /다른 종가 체결.*보다 앞섬/.test(r)), kLate.reasons.join('/'));
  const k1 = P.fillEntry(mix, pk.plan, bar('2026-11-04', 50000, { currency: 'KRW' })); assert.equal(k1.ok, true, k1.reasons.join('/'));
  const u2 = P.fillEntry(k1.account, pu.plan, bar('2026-11-04', 100)); assert.equal(u2.ok, true, u2.reasons.join('/'));
  // US 재평가 11-05T22Z(서울 11-06 07시) 뒤 서울 11-05 17시 K 추가 결정은 소급 → 보류
  const ru = P.recordReview(u2.account, rvA('2026-11-05T22:00:00Z', '2026-11-05', 'QM1')); assert.equal(ru.ok, true, ru.reasons.join('/'));
  assert.ok(P.planEntry(ru.account, kc('2026-11-05T08:00:00Z', '2026-11-05')).reasons.some(r => /계좌 시간축 역행: 결정 시각/.test(r)));
  // 마감 시각 가정(정규장, 조기폐장 미반영): KR 15:30 서울 = 06:30Z, US 16:00 뉴욕 = 겨울 21:00Z / 여름 20:00Z
  const iso = ms => new Date(ms).toISOString();
  assert.equal(iso(P.closeMs('2026-11-04', 'KR')), '2026-11-04T06:30:00.000Z');
  assert.equal(iso(P.closeMs('2026-10-30', 'US')), '2026-10-30T20:00:00.000Z', '서머타임 종료 전(EDT)');
  assert.equal(iso(P.closeMs('2026-11-02', 'US')), '2026-11-02T21:00:00.000Z', '서머타임 종료 후(EST, 11-01 전환)');
  assert.equal(iso(P.closeMs('2027-03-12', 'US')), '2027-03-12T21:00:00.000Z');
  assert.equal(iso(P.closeMs('2027-03-15', 'US')), '2027-03-15T20:00:00.000Z', '서머타임 시작(03-14) 후');
  assert.equal(P.closeMs('2026-13-01', 'US'), null); assert.equal(P.closeMs('2026-11-04', 'JP'), null);
});

test('CR-10: 같은 id·조건의 따로 만든 계좌 A/B — 서로의 발급 ENTRY·EXIT 계획 교차 사용 거부(B 상태 불변), 각자 계획·한도 강화·재평가 뒤 정상 경로는 유지', () => {
  const A = acct().account, B = acct().account; // 같은 id·시장·통화·현금·위험 한도
  assert.equal(A.id, B.id); assert.notEqual(A, B);
  const snap = x => JSON.stringify({ cash: x.cash, positions: x.positions, events: x.events, keys: x.keys, marks: x.marks });
  const pA = P.planEntry(A, cand()), pB = P.planEntry(B, cand());
  assert.equal(pA.action, 'PAPER_ENTRY_PLANNED'); assert.equal(pB.action, 'PAPER_ENTRY_PLANNED');
  const b0 = snap(B);
  const x = P.fillEntry(B, pA.plan, bar('2026-11-04', 100));
  assert.equal(x.ok, false); assert.ok(x.reasons.some(r => /다른 계좌 계보/.test(r)), x.reasons.join('/')); assert.equal(x.account, B);
  assert.equal(snap(B), b0, 'B 현금·보유·이벤트·keys 불변');
  assert.equal(P.fillEntry(A, pB.plan, bar('2026-11-04', 100)).ok, false);
  // 각자 정상 계획 → 정상 체결
  const fA = P.fillEntry(A, pA.plan, bar('2026-11-04', 100)); assert.equal(fA.ok, true, fA.reasons.join('/'));
  const fB = P.fillEntry(B, pB.plan, bar('2026-11-04', 100)); assert.equal(fB.ok, true, fB.reasons.join('/'));
  // 체결된 A 계보의 계획을 B 후속 상태에 재사용해도 거부(멱등 키 중복으로 통과하지 않음)
  const dup = P.fillEntry(fB.account, pA.plan, bar('2026-11-04', 100)); assert.equal(dup.ok, false); assert.notEqual(dup.duplicate, true);
  // 합법 전이(한도 강화·평가) 뒤 같은 보유·같은 EXIT 재평가 조건
  const step = a => { const t = P.tightenRiskLimits(a, { cashFloorPct: 25 }); assert.equal(t.ok, true, t.reasons.join('/'));
    const m = P.markToMarket(t.account, '2026-11-04', marks({ 'US:SYN-A': 100 })); assert.equal(m.ok, true, m.reasons.join('/'));
    const r = P.recordReview(m.account, { synthetic: true, market: 'US', symbol: 'SYN-A', outcome: 'EXIT', reviewedAt: '2026-11-05T22:00:00Z', asOf: '2026-11-05', calendar: CAL, filing: { kind: 'periodic', id: 'Q3', publishedAt: '2026-11-05T12:00:00Z' } });
    assert.equal(r.ok, true, r.reasons.join('/')); assert.ok(r.exitPlan); return r; };
  const rA = step(fA.account), rB = step(fB.account);
  assert.equal(JSON.stringify(rA.exitPlan), JSON.stringify(rB.exitPlan), '두 EXIT 계획 내용 동일');
  const rb0 = snap(rB.account);
  const xe = P.fillExit(rB.account, rA.exitPlan, bar('2026-11-06', 110));
  assert.equal(xe.ok, false); assert.ok(xe.reasons.some(r => /다른 계좌 계보/.test(r)), xe.reasons.join('/'));
  assert.equal(snap(rB.account), rb0, 'B 청산 전 상태 불변');
  assert.equal(P.fillExit(rA.account, rB.exitPlan, bar('2026-11-06', 110)).ok, false);
  const sA = P.fillExit(rA.account, rA.exitPlan, bar('2026-11-06', 110)); assert.equal(sA.ok, true, sA.reasons.join('/'));
  const sB = P.fillExit(rB.account, rB.exitPlan, bar('2026-11-06', 110)); assert.equal(sB.ok, true, sB.reasons.join('/'));
  assert.equal(P.fillExit(sA.account, rA.exitPlan, bar('2026-11-06', 110)).duplicate, true, '같은 계보 멱등 유지');
  // 같은 계보의 이전 상태에서 발급한 계획은 후속 상태에서 쓸 수 있다(계보 유지)
  const C = acct().account; const pC = P.planEntry(C, cand());
  const tC = P.tightenRiskLimits(C, { cashFloorPct: 25 }); assert.equal(tC.ok, true);
  const fC = P.fillEntry(tC.account, pC.plan, bar('2026-11-04', 100)); assert.equal(fC.ok, true, fC.reasons.join('/'));
  // 계좌 객체에 남의 계보처럼 보이는 속성을 붙이는 것은 무결성 실패(입력 속성은 계보로 신뢰하지 않음)
  const D = acct().account; D.lineage = 'A'; assert.ok(P.fillEntry(D, pA.plan, bar('2026-11-04', 100)).reasons.some(r => /모듈 밖에서 바뀜/.test(r)));
});

test('모듈은 네트워크·저장소·주문 코드를 포함하지 않는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '../has/paper-account.js'), 'utf8');
  for (const bad of [/fetch\s*\(/, /XMLHttpRequest/, /localStorage/, /indexedDB/, /sessionStorage/, /script\.src/, /google\.script/]) assert.doesNotMatch(src, bad);
});
