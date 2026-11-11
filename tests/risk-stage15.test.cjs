'use strict';
const { test } = require('node:test'), a = require('node:assert/strict');
const R = require('../invest/risk.js'), F = require('../invest/format.js');
const close = (x, y, m = '', tol = 1e-9) => a.ok(Math.abs(x - y) <= tol * Math.max(1, Math.abs(y)), `${m}: ${x} ≠ ${y}`);
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const H = (account, ticker, valueKRW, o = {}) => ({ account, ticker, name: ticker + '이름', valueKRW, ...o });
const base = () => deepFreeze([H('dom', 'A', 600), H('dom', 'B', 300), H('ov', 'C', 100)]);
const TODAY = '2026-10-29';

test('비중·상위 N·HHI: 600/300/100 → 60/30/10%, HHI 0.46, 실효 종목 수 2.17', () => {
  const r = R.analyze(base(), {}); a.equal(r.ok, true); a.equal(r.complete, true); close(r.totalKRW, 1000);
  a.deepEqual(r.byTicker.map(t => [t.ticker, t.weightPct]), [['A', 60], ['B', 30], ['C', 10]]); close(r.metrics.top1Pct, 60); close(r.metrics.top3Pct, 100); close(r.metrics.hhi, 0.46); close(r.metrics.effectiveN, 1 / 0.46);
  a.deepEqual(r.byAccount.map(x => [x.account, x.weightPct]), [['dom', 90], ['ov', 10]]);
});
test('같은 종목을 여러 계좌에 보유하면 종목 비중은 합산, 계좌 비중은 따로', () => {
  const r = R.analyze([H('dom', 'A', 200), H('pen', 'A', 300), H('ov', 'B', 500)]); close(r.byTicker.find(t => t.ticker === 'A').weightPct, 50); a.deepEqual(r.byTicker.find(t => t.ticker === 'A').accounts.sort(), ['dom', 'pen']); close(r.byAccount.find(x => x.account === 'pen').weightPct, 30);
});
test('테마: 사용자 매핑만 사용, 매핑 없으면 "미분류(미확인)"', () => {
  const r = R.analyze(base(), { themeMap: { A: '빅테크', B: '빅테크', C: '  ' } }); a.deepEqual(r.byTheme.map(t => [t.theme, t.weightPct]), [['빅테크', 90], [R.UNMAPPED, 10]]); close(r.unmappedThemeKRW, 100); a.equal(r.byTheme[1].unknown, true);
});
test('경고: 기준이 없으면 경고하지 않고 이유를 표시, 기준 초과만 "점검 알림"(매도 지시 아님)', () => {
  const none = R.analyze(base(), {}); a.deepEqual(none.alerts, []); a.match(none.thresholdNote, /임의로 정하지 않음/);
  const r = R.analyze(base(), { themeMap: { A: 'X', B: 'X' }, thresholds: { tickerMaxPct: 50, themeMaxPct: 85, accountMaxPct: 95, top3MaxPct: null } });
  const kinds = r.alerts.map(x => x.kind); a.deepEqual(kinds.sort(), ['ticker', 'theme'].sort());
  const t = r.alerts.find(x => x.kind === 'ticker'); close(t.gapPp, 10); close(t.gapKRW, 100); a.match(t.message, /점검 참고용이며 매도 지시가 아닙니다/); a.doesNotMatch(JSON.stringify(r.alerts), /매도하|팔아|매수하세요/);
  a.equal(R.analyze(base(), { thresholds: { tickerMaxPct: 60 } }).alerts.length, 0);   // 정확히 기준과 같으면 경고 없음
});
test('잘못된 기준 값(0·음수·100 초과·문자)은 무시하고 오류 표시', () => {
  const r = R.analyze(base(), { thresholds: { tickerMaxPct: 0, themeMaxPct: -5, accountMaxPct: 101, top3MaxPct: 'x' } }); a.equal(r.thresholdErrors.length, 4); a.deepEqual(r.alerts, []);
});
test('평가 불가 보유(가격/환율 없음)는 제외하고 "일부만 평가"로 표시, 전부 없으면 계산하지 않음', () => {
  const r = R.analyze([H('dom', 'A', 100), H('ov', 'C', null, { reason: 'USD 환율 없음' }), H('dom', 'Z', 0), H('dom', 'Y', NaN)]); a.equal(r.complete, false); a.equal(r.unvalued.length, 3); a.equal(r.unvalued[0].reason, 'USD 환율 없음'); close(r.totalKRW, 100);
  const none = R.analyze([H('dom', 'A', null)]); a.equal(none.metrics, null); a.deepEqual(none.byTicker, []); a.equal(R.analyze('x').ok, false); a.equal(R.analyze([{ account: 'zz', ticker: 'A', valueKRW: 1 }]).ok, false);
});
test('ETF 간접 노출: 자료가 있고 최신일 때만 합산, 오래되거나 형식 오류면 미확인', () => {
  const hs = deepFreeze([H('dom', 'A', 100), H('dom', 'E', 500), H('ov', 'C', 400)]);
  const lt = { E: { asOf: '2026-10-01', source: '운용사 공시(합성)', holdings: [{ ticker: 'A', weight: 0.4 }, { ticker: 'B', weight: 0.2 }] } };
  const r = R.analyze(hs, { lookThrough: lt, today: TODAY }); const A = r.combined.find(x => x.ticker === 'A'), B = r.combined.find(x => x.ticker === 'B'); close(A.totalKRW, 300); close(A.weightPct, 30); close(B.indirectKRW, 100); close(B.weightPct, 10); close(r.totalKRW, 1000); a.match(A.note, /간접/);
  for (const bad of [{ E: { ...lt.E, asOf: '2026-01-01' } }, { E: { ...lt.E, asOf: '2027-01-01' } }, { E: { ...lt.E, source: '' } }, { E: { ...lt.E, holdings: [{ ticker: 'A', weight: 0.7 }, { ticker: 'B', weight: 0.5 }] } }, { E: { ...lt.E, holdings: [{ ticker: 'A', weight: -1 }] } }, { E: null }]) {
    const x = R.analyze(hs, { lookThrough: bad, today: TODAY }); a.equal(x.combined.find(c => c.ticker === 'B'), undefined); close(x.combined.find(c => c.ticker === 'A').totalKRW, 100); a.ok(x.lookThroughProblems.length >= 1);
  }
});
test('하락 시나리오: 종목/테마/계좌/전체 손실액·비율과 계산식 문구', () => {
  const t = { A: '빅테크', B: '빅테크' }, hs = base();
  const r = R.stress(hs, [{ kind: 'ticker', key: 'A', dropPct: 50 }, { kind: 'theme', key: '빅테크', dropPct: 20 }, { kind: 'account', key: 'ov', dropPct: 30 }, { kind: 'all', dropPct: 10 }], { themeMap: t });
  a.equal(r.ok, true); close(r.items[0].lossKRW, 300); close(r.items[1].lossKRW, 180); close(r.items[1].lossPctOfTotal, 18); close(r.items[2].lossKRW, 30); close(r.items[3].lossKRW, 100); a.match(r.items[0].formula, /× 하락률 50%/); a.ok(r.assumptions.some(x => /상관관계 미반영/.test(x)));
});
test('겹치는 시나리오는 합산하지 않고 보유별 최대 하락률만 적용(종목 50% + 테마 20% → 360)', () => {
  const r = R.stress(base(), [{ kind: 'ticker', key: 'A', dropPct: 50 }, { kind: 'theme', key: '빅테크', dropPct: 20 }], { themeMap: { A: '빅테크', B: '빅테크' } }); close(r.combined.lossKRW, 300 + 60); close(r.combined.lossPctOfTotal, 36);
  const all = R.stress(base(), [{ kind: 'all', dropPct: 100 }, { kind: 'all', dropPct: 100 }]); close(all.combined.lossKRW, 1000); a.ok(all.combined.lossPctOfTotal <= 100);
});
test('간접 노출 하락(includeIndirect): ETF 구성종목이 하락하면 ETF 평가액 × 비중 × 하락률만큼 추가', () => {
  const hs = [H('dom', 'A', 100), H('dom', 'E', 500), H('ov', 'C', 400)], lt = { E: { asOf: '2026-10-01', source: 's', holdings: [{ ticker: 'A', weight: 0.4 }] } };
  const off = R.stress(hs, [{ kind: 'ticker', key: 'A', dropPct: 50 }], { lookThrough: lt, today: TODAY }); close(off.items[0].lossKRW, 50);
  const on = R.stress(hs, [{ kind: 'ticker', key: 'A', dropPct: 50 }], { lookThrough: lt, today: TODAY, includeIndirect: true }); close(on.items[0].lossKRW, 50 + 100); close(on.combined.lossKRW, 150); close(on.items[0].indirectKRW, 200);
});
test('시나리오 입력 검증: 하락률 0·101·문자, 종류/대상 오류, 보유 없음', () => {
  for (const s of [[{ kind: 'ticker', key: 'A', dropPct: 0 }], [{ kind: 'ticker', key: 'A', dropPct: 101 }], [{ kind: 'ticker', key: 'A', dropPct: '5' }], [{ kind: 'bond', key: 'A', dropPct: 5 }], [{ kind: 'ticker', dropPct: 5 }], [], null, [null]]) a.equal(R.stress(base(), s).ok, false);
  a.equal(R.stress([], [{ kind: 'all', dropPct: 5 }]).ok, false); a.equal(R.stress(base(), [{ kind: 'ticker', key: 'NOPE', dropPct: 50 }]).items[0].lossKRW, 0);
  a.equal(R.stress(base(), [{ kind: 'theme', key: R.UNMAPPED, dropPct: 50 }]).items[0].lossKRW, 0);   // 미분류는 테마로 취급하지 않음
});
test('앱 백업 값 → 보유 목록: 해외는 환율 필요, 수량 0·손상 JSON 처리', () => {
  const v = { v5_dom: JSON.stringify([{ ticker: '005930', name: '삼성', quantity: 10, avgPrice: 1, currentPrice: 70000 }, { ticker: 'Z', quantity: 0, currentPrice: 5 }]), v5_ov: JSON.stringify([{ ticker: 'MSFT', name: 'MS', quantity: 2, avgPrice: 1, currentPrice: 400 }]), v5_pen: '{broken', v5_gen: '[]' };
  const ok = R.holdingsFromStorage(v, { fxUsd: 1400 }); a.equal(ok.holdings.length, 2); close(ok.holdings.find(h => h.ticker === 'MSFT').valueKRW, 2 * 400 * 1400); a.ok(ok.notes.some(n => /v5_pen/.test(n)));
  const nofx = R.holdingsFromStorage(v, {}); a.equal(nofx.holdings.find(h => h.ticker === 'MSFT').valueKRW, null); a.equal(nofx.holdings.find(h => h.ticker === 'MSFT').reason, 'USD 환율 없음');
});
test('투자 판단 기록: 필수 항목·날짜 검증, 이력 추가만 가능, 원본 불변', () => {
  const c = R.createThesis({ id: 't1', ticker: 'MSFT', buyReason: '클라우드 성장', disconfirm: '성장률 10% 미만 2분기 연속', nextReviewDate: '2026-11-20', createdDate: '2026-10-29' }); a.equal(c.ok, true); a.equal(c.thesis.history.length, 1);
  for (const bad of [{ buyReason: '' }, { disconfirm: '   ' }, { nextReviewDate: '2026-02-30' }, { nextReviewDate: '2026-10-01' }, { id: '' }, { ticker: '' }, { createdDate: 'x' }]) a.equal(R.createThesis({ id: 't', ticker: 'M', buyReason: 'r', disconfirm: 'd', nextReviewDate: '2026-11-20', createdDate: '2026-10-29', ...bad }).ok, false);
  const t0 = deepFreeze(c.thesis), u = R.updateThesis(t0, { date: '2026-11-01', note: '실적 발표 후 근거 보강', changes: { buyReason: '클라우드 + AI 매출' } }); a.equal(u.ok, true); a.equal(t0.history.length, 1); a.equal(u.thesis.history.length, 2); a.deepEqual(u.thesis.history[0], t0.history[0]);
  a.equal(u.thesis.history[1].changes.buyReason.from, '클라우드 성장'); a.equal(u.thesis.buyReason, '클라우드 + AI 매출');
  for (const bad of [{ date: '2026-11-01', note: '', changes: { status: 'paused' } }, { date: '2026-10-01', note: 'x', changes: { status: 'paused' } }, { date: '2026-11-01', note: 'x', changes: {} }, { date: '2026-11-01', note: 'x', changes: { id: 'z' } }, { date: '2026-11-01', note: 'x', changes: { status: 'zz' } }, { date: '2026-11-01', note: 'x', changes: { buyReason: ' ' } }, { date: '2026-11-01', note: 'x', changes: { buyReason: t0.buyReason } }, { date: '2026-11-01', note: 'x', changes: { nextReviewDate: '2026-13-01' } }]) a.equal(R.updateThesis(t0, bad).ok, false, JSON.stringify(bad));
  a.equal(R.updateThesis(null, { date: '2026-11-01', note: 'x', changes: { status: 'paused' } }).ok, false);
});
test('점검일 상태: 지남/임박/정상/중지/종료/불완전', () => {
  const mk = o => ({ ...R.createThesis({ id: 't', ticker: 'M', buyReason: 'r', disconfirm: 'd', nextReviewDate: '2026-11-20', createdDate: '2026-10-01' }).thesis, ...o });
  a.equal(R.reviewStatus(mk({ nextReviewDate: '2026-10-20' }), TODAY).state, 'overdue'); a.match(R.reviewStatus(mk({ nextReviewDate: '2026-10-20' }), TODAY).label, /9일 지남/);
  a.equal(R.reviewStatus(mk({ nextReviewDate: '2026-11-12' }), TODAY).state, 'due-soon'); a.equal(R.reviewStatus(mk({ nextReviewDate: '2026-11-13' }), TODAY).state, 'ok'); a.equal(R.reviewStatus(mk({ nextReviewDate: '2026-11-14' }), TODAY).state, 'ok'); a.equal(R.reviewStatus(mk({ nextReviewDate: TODAY }), TODAY).state, 'due-soon');
  a.equal(R.reviewStatus(mk({ status: 'paused' }), TODAY).state, 'paused'); a.equal(R.reviewStatus(mk({ status: 'closed' }), TODAY).state, 'closed'); a.equal(R.reviewStatus(mk({ disconfirm: '' }), TODAY).state, 'incomplete'); a.equal(R.reviewStatus(null, TODAY).state, 'incomplete'); a.equal(R.reviewStatus(mk({}), 'x').state, 'incomplete');
});
test('기록 없는 보유 종목 목록과 내보내기/가져오기 왕복·변조 거부', () => {
  const t = R.createThesis({ id: 't1', ticker: 'A', buyReason: 'r', disconfirm: 'd', nextReviewDate: '2026-11-20', createdDate: '2026-10-29' }).thesis; a.deepEqual(R.holdingsWithoutThesis(base(), [t]).sort(), ['B', 'C']);
  const txt = R.exportTheses([t]), back = R.parseTheses(txt); a.equal(back.ok, true); a.deepEqual(back.theses, [t]);
  const tamper = f => { const o = JSON.parse(txt); f(o.theses[0]); return R.parseTheses(JSON.stringify(o)).ok; };
  a.equal(tamper(x => { x.history = []; }), false); a.equal(tamper(x => { x.history[0].kind = 'change'; }), false); a.equal(tamper(x => { x.buyReason = ''; }), false); a.equal(tamper(x => { x.status = 'zzz'; }), false); a.equal(tamper(x => { x.history.push({ date: '2020-01-01', note: 'x', kind: 'change' }); }), false);
  a.equal(R.parseTheses('{').ok, false); a.equal(R.parseTheses(JSON.stringify({ format: 'kst-thesis-log', schemaVersion: 2, theses: [] })).ok, false); a.equal(R.parseTheses(JSON.stringify({ format: 'kst-thesis-log', schemaVersion: 1, theses: [t, t] })).ok, false);
});
test('표기: 원/억·만 단위/퍼센트/자료 부족 — 0과 구분', () => {
  a.equal(F.krw(1234567), '1,234,567원'); a.equal(F.krw(-1234.5), '-1,235원'); a.equal(F.krw(0), '0원'); a.equal(F.krw(null), '자료 부족'); a.equal(F.krw(NaN), '자료 부족'); a.equal(F.krw(-0.2), '0원');
  a.equal(F.krwCompact(321500000), '3억 2,150만원'); a.equal(F.krwCompact(100000000), '1억원'); a.equal(F.krwCompact(99996000), '1억원'); a.equal(F.krwCompact(12340000), '1,234만원'); a.equal(F.krwCompact(5000), '5,000원'); a.equal(F.krwCompact(-250000000), '-2억 5,000만원'); a.equal(F.krwCompact(undefined), '자료 부족'); a.equal(F.krwCompact(1234500000000), '12,345억원');
  a.equal(F.pct(12.345), '12.3%'); a.equal(F.pct(12.345, 2, { sign: true }), '+12.35%'); a.equal(F.pct(-0.04), '0.0%'); a.equal(F.pct(null), '자료 부족'); a.equal(F.pp(3.14159), '+3.1%p'); a.equal(F.pp(-2), '-2.0%p'); a.equal(F.qty(1500), '1,500'); a.equal(F.qty(0.123456789), '0.123457'); a.equal(F.qty(undefined), '자료 부족');
});
test('정적 검사: risk.js/format.js 는 네트워크·저장소·DOM·타이머·동적 코드 접근 없음', () => {
  for (const f of ['../invest/risk.js', '../invest/format.js']) { const s = require('node:fs').readFileSync(require.resolve(f), 'utf8'); for (const w of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'setTimeout', 'eval(', 'new Function', 'document.', 'window.', 'process.', 'require(', 'innerHTML']) a.ok(!s.includes(w), f + ' ' + w); }
});
