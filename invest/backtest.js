/* KST 백테스트 엔진 1차 (순수 계산 모듈, UMD: KSTBacktest)
 * - 네트워크·저장소·DOM·타이머 접근 없음. 입력은 호출자가 넘긴 가격 배열뿐.
 * - 합성 자료/권리 미확인 자료는 "성과 주장 불가"로 표시. 실데이터 백테스트 수는 license 확인된 자료만 집계.
 * - 매수 추천·수익 보장 표현 금지: 판정 문구는 VERDICT 3종만 사용. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KSTBacktest = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HORIZONS = { '1M': 21, '3M': 63, '6M': 126, '12M': 252 };
  const RULE_VERSION = 'kst-bt-rules-1.0';
  const VERDICT = { INSUFFICIENT: '검증 부족', REVIEW: '전략 재검토', HYPOTHESIS: '가설 단계 (매수 추천 아님)' };
  const LABEL = { REAL: '실데이터 백테스트', SYNTH: '합성 계산기 시험 (성과 주장 불가)', UNLICENSED: '실데이터 여부·사용권 미확인 (성과 주장 불가)' };
  const DEFAULT_RULES = {
    gokso: { kind: 'gokso', name: '곡소리(52주 고점 대비 하락)', lookback: 252, bands: [20, 30, 35], rearmGap: 5, proxy: false },
    cheer: { kind: 'cheer', name: '환호성 (가격 기반 대용 규칙)', lookback: 252, bands: [50, 100], rearmGap: 10, proxy: true,
      proxyNote: '원래 환호성 규칙은 밸류에이션·판단 기반이라 가격만으로 완전 재현할 수 없습니다. 12개월 상승률로 근사한 대용 규칙입니다.' }
  };
  const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const num = x => typeof x === 'number' && isFinite(x);
  function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  function validateSeries(bars) {
    const errors = [];
    if (!Array.isArray(bars) || !bars.length) return ['가격 자료 없음'];
    let prev = '';
    bars.forEach((b, i) => {
      if (!b || !isDay(b.d)) errors.push(`${i + 1}번째 날짜 형식 오류`);
      else { if (b.d <= prev) errors.push(`${i + 1}번째 날짜가 중복이거나 정렬되지 않음`); prev = b.d; }
      if (!b || !num(b.c) || b.c <= 0) errors.push(`${i + 1}번째 종가 오류`);
    });
    return errors.slice(0, 20);
  }
  // 신호 탐지: i번째 신호는 bars[0..i]만 사용해야 한다(밖에서 leakCheck 로 검증).
  function detectSignals(bars, rule) {
    const out = [], L = rule.lookback, armed = rule.bands.map(() => true);
    for (let i = L - 1; i < bars.length; i++) {
      let metric;
      if (rule.kind === 'gokso') { let hi = 0; for (let j = i - L + 1; j <= i; j++) if (bars[j].c > hi) hi = bars[j].c; metric = (hi - bars[i].c) / hi * 100; }
      else { if (i - (L - 1) < 0) continue; const base = bars[i - (L - 1)].c; metric = (bars[i].c / base - 1) * 100; }
      rule.bands.forEach((b, k) => {
        if (armed[k] && metric >= b) { out.push({ i, d: bars[i].d, band: b, metric }); armed[k] = false; }
        else if (!armed[k] && metric < b - rule.rearmGap) armed[k] = true;
      });
    }
    return out;
  }
  // 미래 정보 누출 검사: 같은 시점까지의 신호가 "그 시점까지만 준 자료"와 "전체 자료" 에서 동일해야 한다.
  function leakCheck(bars, rule, detector) {
    const det = detector || detectSignals, full = det(bars, rule), n = bars.length, cuts = [];
    for (let k = 1; k <= 8; k++) cuts.push(Math.floor(n * k / 9));
    for (const cut of cuts) {
      if (cut < 2) continue;
      const part = det(bars.slice(0, cut), rule), want = full.filter(s => s.i < cut);
      if (JSON.stringify(part.map(s => [s.i, s.band])) !== JSON.stringify(want.map(s => [s.i, s.band]))) return { ok: false, cut, message: `미래 정보 누출 의심: ${cut}번째 자료까지만 줬을 때와 전체 자료일 때 신호가 다릅니다.` };
    }
    return { ok: true, cuts: cuts.length };
  }
  const fnv = s => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; } return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'); };
  function canon(o) { if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; if (o && typeof o === 'object') return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'; return JSON.stringify(o); }
  function metaInfo(meta, symbolCount) {
    const m = Object.assign({ source: '', asOf: '', adjusted: 'unknown', dividends: 'unknown', splits: 'unknown', delistings: 'unknown', haltDays: 'unknown', survivorship: 'unknown', fees: 'unknown', slippage: 'unknown', fx: 'not-applicable', isSynthetic: false, license: 'none' }, meta || {});
    const warnings = [];
    const flag = (k, text) => { if (m[k] !== 'reflected' && m[k] !== 'not-applicable' && m[k] !== 'handled' && m[k] !== 'adjusted') warnings.push(text + (m[k] === 'unknown' ? ' (반영 여부 미확인)' : ' (미반영)')); };
    if (m.adjusted !== 'adjusted') warnings.push('수정주가(배당·분할 조정) 여부: ' + (m.adjusted === 'unknown' ? '미확인' : '조정 안 된 가격'));
    flag('dividends', '배당 반영'); flag('splits', '주식분할 반영'); flag('delistings', '상장폐지 반영'); flag('haltDays', '거래정지 반영'); flag('survivorship', '생존편향 처리');
    flag('fees', '매매 수수료'); flag('slippage', '슬리피지'); flag('fx', '환전 비용');
    let label = LABEL.SYNTH;
    if (!m.isSynthetic) label = (m.license === 'verified' && m.source && m.asOf) ? LABEL.REAL : LABEL.UNLICENSED;
    return { meta: m, warnings, label, isReal: label === LABEL.REAL };
  }
  function pathMdd(bars, a, b) { let peak = bars[a].c, worst = 0; for (let j = a; j <= b; j++) { if (bars[j].c > peak) peak = bars[j].c; const dd = bars[j].c / peak - 1; if (dd < worst) worst = dd; } return worst * 100; }
  // 개별 관측치: 신호 다음 거래일 종가로 진입, h 거래일 뒤 종가로 청산
  function observe(bars, sig, h, costs, bench, benchIdx) {
    const e = sig.i + 1, x = e + h;
    if (x >= bars.length) return { excluded: 'horizon' };
    const slip = (costs.slippageBps || 0) / 1e4, fee = (costs.feeBps || 0) / 1e4, fx = (costs.fxBps || 0) / 1e4;
    const inP = bars[e].c * (1 + slip), outP = bars[x].c * (1 - slip);
    const ret = (outP * (1 - fee - fx)) / (inP * (1 + fee + fx)) - 1;
    const o = { signalDate: sig.d, entryDate: bars[e].d, exitDate: bars[x].d, entryIdx: e, exitIdx: x, retPct: ret * 100, mddPct: pathMdd(bars, e, x), band: sig.band };
    if (bench) {
      const be = benchIdx.get(bars[e].d), bx = benchIdx.get(bars[x].d);
      if (be === undefined || bx === undefined) return { excluded: 'benchmark' };
      o.benchPct = (bench[bx].c / bench[be].c - 1) * 100; o.excessPct = o.retPct - o.benchPct;
    }
    return { obs: o };
  }
  function summarize(list, excl) {
    const r = list.map(o => o.retPct), ex = list.filter(o => o.excessPct !== undefined).map(o => o.excessPct);
    return { n: list.length, excludedHorizon: excl.horizon || 0, excludedBenchmark: excl.benchmark || 0, excludedOverlap: excl.overlap || 0, excludedSegment: excl.segment || 0,
      winRatePct: list.length ? r.filter(x => x > 0).length / list.length * 100 : null, meanPct: mean(r), medianPct: median(r), worstPct: r.length ? Math.min(...r) : null,
      worstMddPct: list.length ? Math.min(...list.map(o => o.mddPct)) : null, medianMddPct: median(list.map(o => o.mddPct)),
      excessMedianPct: median(ex), excessMeanPct: mean(ex), excessN: ex.length };
  }
  function evaluate(bars, signals, opts) {
    const costs = opts.costs || {}, bench = opts.benchmark || null, bi = new Map(); if (bench) bench.forEach((b, i) => bi.set(b.d, i));
    const seg = opts.segment || null, res = {};
    for (const [name, h] of Object.entries(HORIZONS)) {
      const list = [], excl = {}; let lastExit = -1;
      for (const s of signals) {
        const r = observe(bars, s, h, costs, bench, bi);
        if (r.excluded) { excl[r.excluded] = (excl[r.excluded] || 0) + 1; continue; }
        if (seg && (bars[r.obs.entryIdx].d < seg[0] || bars[r.obs.exitIdx].d > seg[1])) { excl.segment = (excl.segment || 0) + 1; continue; }
        if (opts.nonOverlapping && r.obs.entryIdx <= lastExit) { excl.overlap = (excl.overlap || 0) + 1; continue; }
        lastExit = r.obs.exitIdx; list.push(r.obs);
      }
      res[name] = Object.assign(summarize(list, excl), { horizonDays: h, observations: opts.keepObservations ? list : undefined });
    }
    return res;
  }
  function verdictFor(val, minN) {
    const h = val && val['3M'];
    if (!h || h.n < minN) return { verdict: VERDICT.INSUFFICIENT, reason: `검증 구간 3개월 관측 ${h ? h.n : 0}건 < 최소 ${minN}건` };
    if (h.medianPct <= 0 || h.winRatePct < 50 || (h.excessMedianPct !== null && h.excessMedianPct <= 0)) return { verdict: VERDICT.REVIEW, reason: '검증 구간에서 중앙값·승률·비교지표 대비 초과수익 중 하나 이상이 기준 미달' };
    return { verdict: VERDICT.HYPOTHESIS, reason: '검증 구간 기준 통과. 표본·자료 한계로 미래 성과를 뜻하지 않음' };
  }
  function run(input) {
    const o = input || {}, errors = [];
    const sErr = validateSeries(o.bars); if (sErr.length) return { ok: false, errors: sErr.map(e => '가격: ' + e) };
    if (o.benchmark) { const be = validateSeries(o.benchmark); if (be.length) return { ok: false, errors: be.map(e => '비교지표: ' + e) }; }
    const rule = Object.assign({}, DEFAULT_RULES[(o.rule && o.rule.kind) || 'gokso'] || {}, o.rule || {});
    if (!rule.kind || !DEFAULT_RULES[rule.kind]) return { ok: false, errors: ['알 수 없는 규칙'] };
    if (!Array.isArray(rule.bands) || !rule.bands.length || rule.bands.some(b => !num(b) || b <= 0 || (rule.kind === 'gokso' && b >= 100))) return { ok: false, errors: ['기준 구간 값 오류'] };
    if (!Number.isInteger(rule.lookback) || rule.lookback < 2) return { ok: false, errors: ['관찰 기간 오류'] };
    const bars = o.bars, det = o.detector || detectSignals;
    const lk = leakCheck(bars, rule, det); if (!lk.ok) return { ok: false, errors: [lk.message], leak: lk };
    const mi = metaInfo(o.meta, 1), minN = Number.isInteger(o.minValidationN) ? o.minValidationN : 30;
    const trainFrac = num(o.trainFraction) && o.trainFraction > 0.2 && o.trainFraction < 0.9 ? o.trainFraction : 0.6;
    const splitDate = bars[Math.min(bars.length - 1, Math.floor(bars.length * trainFrac))].d;
    const signals = det(bars, rule), common = { costs: o.costs, benchmark: o.benchmark, nonOverlapping: o.nonOverlapping !== false };
    const all = evaluate(bars, signals, common);
    const train = evaluate(bars, signals, Object.assign({}, common, { segment: [bars[0].d, splitDate] }));
    const val = evaluate(bars, signals, Object.assign({}, common, { segment: [splitDate, bars[bars.length - 1].d] }));
    // 매개변수 탐색(과최적화 경계): 후보 구간 묶음 중 훈련 구간 3개월 중앙값 최고를 고르고, 검증 구간에서만 평가
    let grid = null;
    if (Array.isArray(o.grid) && o.grid.length) {
      const rows = o.grid.map(bands => { const r2 = Object.assign({}, rule, { bands }), s2 = det(bars, r2), t = evaluate(bars, s2, Object.assign({}, common, { segment: [bars[0].d, splitDate] })), v = evaluate(bars, s2, Object.assign({}, common, { segment: [splitDate, bars[bars.length - 1].d] })); return { bands, train3M: t['3M'], val3M: v['3M'] }; });
      const ok = rows.filter(r => r.train3M.n > 0), pick = ok.sort((a, b) => b.train3M.medianPct - a.train3M.medianPct)[0] || null;
      grid = { size: o.grid.length, picked: pick && pick.bands, pickedTrainMedianPct: pick && pick.train3M.medianPct, pickedValidationMedianPct: pick && pick.val3M.medianPct, pickedValidationN: pick && pick.val3M.n,
        overfitWarning: !!pick && (pick.val3M.n < minN || pick.val3M.medianPct === null || pick.train3M.medianPct - pick.val3M.medianPct > 5), note: `후보 ${o.grid.length}가지를 시험하면 우연히 좋아 보이는 조합이 나올 수 있습니다. 검증 구간 결과만 참고하세요.` };
    }
    const vd = verdictFor(val, minN), warnings = mi.warnings.slice();
    if (rule.proxy) warnings.push(rule.proxyNote);
    if (!mi.isReal) warnings.push('이 결과는 계산기·화면 시험용입니다. 성과를 주장하거나 투자 판단에 쓰지 마세요.');
    if (!o.benchmark) warnings.push('비교지표(예: S&P500) 없음 — 초과수익 계산 불가');
    if (!o.costs) warnings.push('거래비용 입력 없음 — 수수료·슬리피지·환전 비용 0으로 계산');
    const config = { rule, costs: o.costs || {}, nonOverlapping: common.nonOverlapping, trainFraction: trainFrac, minValidationN: minN, grid: o.grid || null, horizons: HORIZONS, ruleVersion: RULE_VERSION };
    const hash = typeof o.hash === 'function' ? o.hash : fnv;
    const result = { ok: true, label: mi.label, isRealDataBacktest: mi.isReal, claimsAllowed: mi.isReal, verdict: vd.verdict, verdictReason: vd.reason, warnings,
      signalCount: signals.length, signalsByBand: rule.bands.map(b => ({ band: b, count: signals.filter(s => s.band === b).length })), splitDate, all, train, validation: val, grid,
      meta: mi.meta, config, repro: { ruleVersion: RULE_VERSION, barsDigest: hash(canon(bars)), benchmarkDigest: o.benchmark ? hash(canon(o.benchmark)) : null, configDigest: hash(canon(config)), metaDigest: hash(canon(mi.meta)) },
      leakCheck: lk, disclaimer: '과거 가상 계산이며 매수 추천이나 미래 수익 보장이 아닙니다.' };
    result.resultDigest = hash(canon({ all, train, validation: val, signalCount: signals.length }));
    return result;
  }
  function realBacktestCount(results) { return (results || []).filter(r => r && r.ok && r.isRealDataBacktest).length; }
  // 합성 자료 생성(시드 고정, 같은 시드 → 같은 자료)
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function bizDates(start, n) { const out = []; let t = Date.parse(start + 'T00:00:00Z'); while (out.length < n) { const wd = new Date(t).getUTCDay(); if (wd !== 0 && wd !== 6) out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; } return out; }
  function fromCloses(start, closes) { const d = bizDates(start, closes.length); return closes.map((c, i) => ({ d: d[i], c })); }
  function makeSynthetic(o) {
    const p = Object.assign({ seed: 1, n: 1500, start: '2018-01-02', startPrice: 100, driftPct: 0.03, volPct: 1.6 }, o || {}), rnd = mulberry(p.seed), closes = []; let c = p.startPrice;
    for (let i = 0; i < p.n; i++) { const z = (rnd() + rnd() + rnd() + rnd() - 2) * 1.7320508; c = Math.max(0.01, c * (1 + p.driftPct / 100 + p.volPct / 100 * z)); closes.push(Math.round(c * 10000) / 10000); }
    return fromCloses(p.start, closes);
  }
  return { verdictFor, HORIZONS, RULE_VERSION, VERDICT, LABEL, DEFAULT_RULES, validateSeries, detectSignals, leakCheck, metaInfo, evaluate, run, realBacktestCount, makeSynthetic, fromCloses, bizDates, mulberry, canon, fnv };
});
