'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs');
const B = require('../invest/backtest.js');
const close = (x, y, m = '', tol = 1e-9) => a.ok(Math.abs(x - y) <= tol * Math.max(1, Math.abs(y)), `${m}: ${x} ≠ ${y}`);
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const RULE = { kind: 'gokso', lookback: 5, bands: [20], rearmGap: 5 };
const SYN = { isSynthetic: true, source: '시험용 합성' };
// 손계산 사례: idx0-4=100, idx5=90, idx6=79(신호: 최근 5일 고점 100 대비 21%↓), idx7=80(진입), idx8..10=78,75,72, 이후 idx28=96 까지 일정 상승, 100번째 봉까지 96 유지
function handCloses() {
  const c = [100, 100, 100, 100, 100, 90, 79, 80, 78, 75, 72]; for (let k = 1; k <= 18; k++) c.push(72 + 24 / 18 * k);   // idx11..28 (28 → 96)
  while (c.length < 100) c.push(96); return c;
}
const hand = () => B.fromCloses('2026-01-05', handCloses());
const benchFlat = () => B.fromCloses('2026-01-05', handCloses().map((_, i) => (i >= 28 ? 210 : 200)));

test('손계산 사례: 신호 1건(6번째 봉), 다음 봉 종가 80 진입, 21거래일 후 96 청산 → +20%, 경로 최대낙폭 -10%', () => {
  const b = hand(), sig = B.detectSignals(b, RULE); a.equal(sig.length, 1); a.equal(sig[0].i, 6); close(sig[0].metric, 21);
  const ev = B.evaluate(b, sig, { keepObservations: true }), o = ev['1M'].observations[0];
  a.equal(o.entryIdx, 7); a.equal(o.exitIdx, 28); close(o.retPct, 20); close(o.mddPct, -10, 'mdd'); a.equal(ev['1M'].n, 1); close(ev['1M'].winRatePct, 100); close(ev['1M'].medianPct, 20);
  a.equal(ev['3M'].n, 1); close(ev['3M'].medianPct, 20);   // 70번째 봉 = 96
});
test('관찰 기간이 모자란 6·12개월 관측은 제외하고 개수를 표시(0%로 채우지 않음)', () => {
  const ev = B.evaluate(hand(), B.detectSignals(hand(), RULE), {}); a.equal(ev['6M'].n, 0); a.equal(ev['6M'].excludedHorizon, 1); a.equal(ev['12M'].excludedHorizon, 1); a.equal(ev['6M'].medianPct, null); a.equal(ev['6M'].winRatePct, null);
});
test('거래비용: 수수료 1%(편도)면 96×0.99 ÷ (80×1.01) − 1 = 17.6238%', () => {
  const ev = B.evaluate(hand(), B.detectSignals(hand(), RULE), { costs: { feeBps: 100 }, keepObservations: true }); close(ev['1M'].observations[0].retPct, (96 * 0.99 / (80 * 1.01) - 1) * 100, 'fee', 1e-9);
  const sl = B.evaluate(hand(), B.detectSignals(hand(), RULE), { costs: { slippageBps: 100 }, keepObservations: true }); close(sl['1M'].observations[0].retPct, (96 * 0.99 / (80 * 1.01) - 1) * 100, 'slip');
  const none = B.evaluate(hand(), B.detectSignals(hand(), RULE), { costs: { feeBps: 100, fxBps: 100 }, keepObservations: true }); close(none['1M'].observations[0].retPct, (96 * 0.98 / (80 * 1.02) - 1) * 100, 'fx');
});
test('비교지표 대비 초과수익: +20% − 벤치마크 +5% = +15%p, 날짜가 없으면 제외 표시', () => {
  const ev = B.evaluate(hand(), B.detectSignals(hand(), RULE), { benchmark: benchFlat(), keepObservations: true }); close(ev['1M'].observations[0].benchPct, 5); close(ev['1M'].excessMedianPct, 15); a.equal(ev['1M'].excessN, 1);
  const short = benchFlat().filter((_, i) => i !== 7); const ev2 = B.evaluate(hand(), B.detectSignals(hand(), RULE), { benchmark: short }); a.equal(ev2['1M'].n, 0); a.equal(ev2['1M'].excludedBenchmark, 1);
});
test('신호 재장전: 이미 울린 구간은 반등 후 다시 내려가야 재신호, 같은 하락 구간에서 반복 신호 없음', () => {
  const c = [100, 100, 100, 100, 100, 75, 74, 73, 72, 71, 70, 70, 70, 70, 70, 70, 70, 70]; a.equal(B.detectSignals(B.fromCloses('2026-01-05', c), RULE).length, 1);
  const d = [...c, 100, 100, 100, 100, 100, 70]; const s = B.detectSignals(B.fromCloses('2026-01-05', d), RULE); a.equal(s.length, 2);
});
test('환호성 대용 규칙: 기간 수익률 기준, 대용 규칙 경고 표시', () => {
  const rule = { kind: 'cheer', lookback: 5, bands: [50], rearmGap: 10 }, c = [100, 100, 100, 100, 150, 151]; const s = B.detectSignals(B.fromCloses('2026-01-05', c), rule); a.equal(s.length, 1); a.equal(s[0].i, 4); close(s[0].metric, 50);
  const r = B.run({ bars: B.makeSynthetic({ seed: 3, n: 600 }), rule: { kind: 'cheer' }, meta: SYN }); a.equal(r.ok, true); a.ok(r.warnings.some(w => /대용 규칙/.test(w)));
});
test('겹치는 신호: 기본은 겹치지 않는 관측만, 해제하면 모두 포함, 제외 개수 표시', () => {
  const c = [100, 100, 100, 100, 100, 75, 65]; while (c.length < 60) c.push(70); const b = B.fromCloses('2026-01-05', c), r = { kind: 'gokso', lookback: 5, bands: [20, 30], rearmGap: 5 }, s = B.detectSignals(b, r); a.equal(s.length, 2);
  const non = B.evaluate(b, s, { nonOverlapping: true }), all = B.evaluate(b, s, { nonOverlapping: false }); a.equal(non['1M'].n, 1); a.equal(non['1M'].excludedOverlap, 1); a.equal(all['1M'].n, 2);
});
test('미래정보 누출 방지: 정상 규칙은 통과, 다음 날 가격을 훔쳐보는 규칙은 실행 거부', () => {
  const b = B.makeSynthetic({ seed: 11, n: 700 }); a.equal(B.leakCheck(b, B.DEFAULT_RULES.gokso).ok, true);
  const zig = B.fromCloses('2026-01-05', Array.from({ length: 300 }, (_, i) => (i % 2 ? 80 : 100)));
  const cheat = (bars, rule) => { const o = []; for (let i = 0; i < bars.length - 1; i++) if (bars[i + 1].c < bars[i].c * 0.9) o.push({ i, d: bars[i].d, band: 10, metric: 10 }); return o; };
  a.equal(B.leakCheck(zig, RULE, cheat).ok, false); const r = B.run({ bars: zig, rule: RULE, detector: cheat, meta: SYN }); a.equal(r.ok, false); a.match(r.errors[0], /미래 정보 누출/);
});
test('미래 자료를 마구 바꿔도 그 시점까지의 신호는 동일(오염 시험)', () => {
  const b = B.makeSynthetic({ seed: 5, n: 900 }), cut = 600, poisoned = b.map((x, i) => (i < cut ? x : { d: x.d, c: x.c * (i % 2 ? 0.1 : 9) }));
  const f = B.detectSignals(b, B.DEFAULT_RULES.gokso).filter(s => s.i < cut), p = B.detectSignals(poisoned, B.DEFAULT_RULES.gokso).filter(s => s.i < cut); a.deepEqual(p, f); a.ok(f.length > 0);
});
test('자료 검증: 날짜 중복·역순·없는 날짜·0 이하·문자 가격·빈 자료 거부', () => {
  const ok = [{ d: '2026-01-05', c: 1 }, { d: '2026-01-06', c: 2 }]; a.deepEqual(B.validateSeries(ok), []);
  for (const bad of [[], null, [{ d: '2026-01-05', c: 1 }, { d: '2026-01-05', c: 2 }], [{ d: '2026-01-06', c: 1 }, { d: '2026-01-05', c: 2 }], [{ d: '2026-02-30', c: 1 }], [{ d: '2026-01-05', c: 0 }], [{ d: '2026-01-05', c: '5' }], [{ d: '2026-01-05', c: NaN }], [null]]) a.ok(B.validateSeries(bad).length > 0, JSON.stringify(bad));
  a.equal(B.run({ bars: [] }).ok, false); a.equal(B.run({ bars: ok, rule: { kind: 'zz' } }).ok, false); a.equal(B.run({ bars: B.makeSynthetic({ n: 400 }), rule: { kind: 'gokso', bands: [] } }).ok, false); a.equal(B.run({ bars: B.makeSynthetic({ n: 400 }), rule: { kind: 'gokso', bands: [120] } }).ok, false); a.equal(B.run({ bars: B.makeSynthetic({ n: 400 }), rule: { kind: 'gokso', lookback: 1 } }).ok, false); a.equal(B.run({ bars: B.makeSynthetic({ n: 400 }), benchmark: [{ d: 'x', c: 1 }] }).ok, false);
});
test('표시 이름: 합성 → "성과 주장 불가", 권리 미확인 → 실데이터 아님, 확인된 실자료만 "실데이터 백테스트"', () => {
  const bars = B.makeSynthetic({ seed: 2, n: 700 }), okMeta = { source: '허가받은 공급자', asOf: '2026-10-28', license: 'verified', adjusted: 'adjusted', dividends: 'reflected', splits: 'reflected', delistings: 'reflected', haltDays: 'reflected', survivorship: 'handled', fees: 'reflected', slippage: 'reflected', fx: 'not-applicable' };
  const syn = B.run({ bars, meta: SYN }), unl = B.run({ bars, meta: { source: 'x', asOf: '2026-10-28', license: 'none' } }), real = B.run({ bars, meta: okMeta }), synLic = B.run({ bars, meta: { ...okMeta, isSynthetic: true } }), noSrc = B.run({ bars, meta: { ...okMeta, source: '' } });
  a.equal(syn.label, B.LABEL.SYNTH); a.equal(syn.claimsAllowed, false); a.equal(unl.label, B.LABEL.UNLICENSED); a.equal(real.label, B.LABEL.REAL); a.equal(real.claimsAllowed, true); a.equal(synLic.label, B.LABEL.SYNTH); a.equal(noSrc.label, B.LABEL.UNLICENSED);
  a.equal(B.realBacktestCount([syn, unl, real, synLic, noSrc, { ok: false }, null]), 1); a.equal(B.realBacktestCount([syn, unl]), 0); a.equal(B.realBacktestCount(), 0);
  a.deepEqual(real.warnings.filter(w => /반영|조정|처리/.test(w)), []);
});
test('메타데이터 경고: 미반영·미확인 항목마다 경고, 합성은 사용 금지 문구', () => {
  const r = B.run({ bars: B.makeSynthetic({ n: 700 }), meta: { ...SYN, dividends: 'not-reflected' } }), w = r.warnings.join('|');
  for (const k of ['수정주가', '배당 반영 (미반영)', '주식분할 반영 (반영 여부 미확인)', '상장폐지', '거래정지', '생존편향', '매매 수수료', '슬리피지', '성과를 주장하거나', '비교지표', '거래비용 입력 없음']) a.ok(w.includes(k), k);
});
test('판정 문구: 표본 부족 → 검증 부족, 기준 미달 → 전략 재검토, 통과해도 "가설 단계"일 뿐 추천 표현 없음', () => {
  const h = (n, med, win, ex) => ({ '3M': { n, medianPct: med, winRatePct: win, excessMedianPct: ex } });
  a.equal(B.verdictFor(h(5, 10, 80, 5), 30).verdict, B.VERDICT.INSUFFICIENT); a.equal(B.verdictFor(null, 30).verdict, B.VERDICT.INSUFFICIENT);
  a.equal(B.verdictFor(h(40, -1, 60, 1), 30).verdict, B.VERDICT.REVIEW); a.equal(B.verdictFor(h(40, 2, 49, 1), 30).verdict, B.VERDICT.REVIEW); a.equal(B.verdictFor(h(40, 2, 60, -0.5), 30).verdict, B.VERDICT.REVIEW);
  a.equal(B.verdictFor(h(40, 2, 60, 1), 30).verdict, B.VERDICT.HYPOTHESIS); a.equal(B.verdictFor(h(40, 2, 60, null), 30).verdict, B.VERDICT.HYPOTHESIS);
  for (const v of Object.values(B.VERDICT)) a.doesNotMatch(v.replace('매수 추천 아님', ''), /추천|보장|확실|사세요|매수하/);
  const r = B.run({ bars: B.makeSynthetic({ seed: 4, n: 800 }), meta: SYN }); a.doesNotMatch(JSON.stringify(r).replace(/매수 추천이나 미래 수익 보장이 아닙니다/g, '').replace(/매수 추천 아님/g, ''), /추천|보장/);
});
test('훈련/검증 분리: 구간을 넘는 관측은 제외, 검증 관측은 분리일 이후에만 진입', () => {
  const b = B.makeSynthetic({ seed: 21, n: 1500 }), r = B.run({ bars: b, meta: SYN }), sd = r.splitDate;
  const sig = B.detectSignals(b, B.DEFAULT_RULES.gokso), tv = B.evaluate(b, sig, { segment: [b[0].d, sd], keepObservations: true }), vv = B.evaluate(b, sig, { segment: [sd, b[b.length - 1].d], keepObservations: true });
  for (const o of tv['3M'].observations) a.ok(o.exitDate <= sd); for (const o of vv['3M'].observations) a.ok(o.entryDate >= sd);
  a.ok(r.train['3M'].n + r.validation['3M'].n <= r.all['3M'].n + 0); a.ok(r.train['3M'].excludedSegment + r.validation['3M'].excludedSegment >= 0);
});
test('매개변수 탐색: 후보 개수 기록, 검증 표본이 적으면 과최적화 경고', () => {
  const r = B.run({ bars: B.makeSynthetic({ seed: 7, n: 1500 }), benchmark: B.makeSynthetic({ seed: 8, n: 1500 }), meta: SYN, grid: [[10], [20], [30]] });
  a.equal(r.grid.size, 3); a.ok(Array.isArray(r.grid.picked)); a.equal(r.grid.overfitWarning, true); a.match(r.grid.note, /우연히/); a.equal(B.run({ bars: B.makeSynthetic({ n: 700 }), meta: SYN }).grid, null);
});
test('재현성: 같은 입력 → 같은 결과·지문, 자료/설정이 하나라도 바뀌면 지문이 달라짐, 주입한 해시 함수 사용', () => {
  const bars = B.makeSynthetic({ seed: 9, n: 900 }), bm = B.makeSynthetic({ seed: 10, n: 900 }), inp = { bars, benchmark: bm, meta: SYN, costs: { feeBps: 5 } };
  const r1 = B.run(inp), r2 = B.run(inp); a.deepEqual(r1, r2); a.equal(r1.resultDigest, r2.resultDigest);
  const bars2 = bars.map((x, i) => (i === 400 ? { d: x.d, c: x.c * 1.01 } : x)), r3 = B.run({ ...inp, bars: bars2 }); a.notEqual(r3.repro.barsDigest, r1.repro.barsDigest);
  a.notEqual(B.run({ ...inp, costs: { feeBps: 6 } }).repro.configDigest, r1.repro.configDigest); a.notEqual(B.run({ ...inp, meta: { ...SYN, source: '다른 출처' } }).repro.metaDigest, r1.repro.metaDigest);
  const r4 = B.run({ ...inp, hash: s => 'H' + s.length }); a.match(r4.repro.barsDigest, /^H\d+$/); a.equal(r1.repro.ruleVersion, B.RULE_VERSION);
  a.equal(B.makeSynthetic({ seed: 1, n: 50 })[10].c, B.makeSynthetic({ seed: 1, n: 50 })[10].c); a.notEqual(B.makeSynthetic({ seed: 1, n: 50 })[10].c, B.makeSynthetic({ seed: 2, n: 50 })[10].c);
});
test('합성 자료: 영업일만, 정렬·양수, 입력 객체 불변', () => {
  const b = B.makeSynthetic({ seed: 5, n: 300 }); a.deepEqual(B.validateSeries(b), []); for (const x of b) { const wd = new Date(x.d + 'T00:00:00Z').getUTCDay(); a.ok(wd !== 0 && wd !== 6); }
  const fb = deepFreeze(B.makeSynthetic({ seed: 6, n: 700 })), fm = deepFreeze(B.makeSynthetic({ seed: 7, n: 700 })); a.equal(B.run({ bars: fb, benchmark: fm, meta: SYN, costs: Object.freeze({ feeBps: 1 }), grid: [[10], [20]] }).ok, true);
});
test('정적 검사: backtest.js 는 네트워크·저장소·DOM·시간·난수·동적 코드 접근 없음', () => {
  const s = fs.readFileSync(require.resolve('../invest/backtest.js'), 'utf8'); for (const w of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'setTimeout', 'Date.now', 'new Date()', 'Math.random', 'eval(', 'new Function', 'document.', 'window.', 'process.', 'require(', 'innerHTML']) a.ok(!s.includes(w), w);
});
test('경계: 청산일이 자료 마지막 봉 바로 다음이면 제외(오류·NaN 없이)', () => {
  const b = hand().slice(0, 28), ev = B.evaluate(b, B.detectSignals(b, RULE), {}); a.equal(ev['1M'].n, 0); a.equal(ev['1M'].excludedHorizon, 1);
  const b2 = hand().slice(0, 29), ev2 = B.evaluate(b2, B.detectSignals(b2, RULE), {}); a.equal(ev2['1M'].n, 1);
});
