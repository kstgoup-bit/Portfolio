/* HAS 23단계 — AI 조언 판단 기록과 사후 검증(순수 함수, 메모리 전용). 투자 원장과 완전히 분리(원장 모듈을 가져오지 않음).
   영구 저장 키 설계안: has_advice_journal_v1 (이번 단계에서는 어디에도 쓰지 않음 — 별도 승인 후).
   누출 방지: 조언 시각 이후의 자료가 기록에 섞이면 거부. 평가는 단순 상승 여부가 아니라 벤치마크 초과·최대낙폭(위험조정)으로 한다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASAdviceJournal = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DESIGN = Object.freeze({ proposedKey: 'has_advice_journal_v1', writtenInThisStage: false, separateFromLedger: true });
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  var day = function (s) { return String(s).slice(0, 10); };
  /* 기록 만들기. inputsUsed: [{name, asOfDate, source}] — 모두 조언일 이하여야 한다. */
  function record(advice, ctx, nowISO) {
    var e = [], adviceDay = day(advice.asOf || nowISO);
    (ctx.inputsUsed || []).forEach(function (x) { if (!x || !x.source) e.push('출처 없는 입력: ' + (x && x.name)); else if (!/^\d{4}-\d{2}-\d{2}/.test(x.asOfDate || '')) e.push('기준일 없는 입력: ' + x.name); else if (day(x.asOfDate) > adviceDay) e.push('미래 자료 혼입(데이터 누출): ' + x.name + ' ' + x.asOfDate); });
    if (!fin(ctx.priceAtAdvice) || ctx.priceAtAdvice <= 0) e.push('조언 당시 가격 없음');
    if (e.length) return { ok: false, errors: e, entry: null };
    return { ok: true, errors: [], entry: Object.freeze({ id: advice.ticker + '@' + adviceDay, ticker: advice.ticker, adviceDate: adviceDay, opinion: advice.opinion, reasonsFor: advice.reasonsFor.slice(), reasonsAgainst: advice.reasonsAgainst.slice(), risks: advice.risks.slice(),
      inputsUsed: Object.freeze((ctx.inputsUsed || []).map(function (x) { return Object.freeze({ name: x.name, asOfDate: x.asOfDate, source: x.source }); })), priceAtAdvice: ctx.priceAtAdvice, weightPctAtAdvice: ctx.weightPct == null ? null : ctx.weightPct, userDecision: 'undecided', separateFromLedger: true }) };
  }
  function decide(entry, decision) { if (['followed', 'ignored', 'undecided'].indexOf(decision) < 0) return entry; return Object.freeze(Object.assign({}, entry, { userDecision: decision })); }
  /* 사후 평가. later = {prices:[{date,price}], bench:[{date,price}]} 조언일 이후 구간. horizonDays 안의 자료만 사용. */
  function evaluate(entry, later, horizonDays) {
    var end = new Date(Date.parse(entry.adviceDate) + horizonDays * 86400000).toISOString().slice(0, 10);
    var inWin = function (a) { return (a || []).filter(function (p) { return p.date > entry.adviceDate && p.date <= end && fin(p.price); }).sort(function (x, y) { return x.date < y.date ? -1 : 1; }); };
    var p = inWin(later && later.prices), b = inWin(later && later.bench);
    if (entry.opinion === '판단 보류') return { scored: false, reason: '판단 보류는 적중 평가 대상 아님' };
    if (!p.length || !b.length) return { scored: false, reason: '사후 자료 부족' };
    if (p[p.length - 1].date < end && daysShort(p[p.length - 1].date, end) > 5) return { scored: false, reason: '평가 기간 자료가 끝까지 없음' };
    var base = entry.priceAtAdvice, baseB = (later.benchAtAdvice && later.benchAtAdvice > 0) ? later.benchAtAdvice : null;
    if (!baseB) return { scored: false, reason: '조언일 벤치마크 기준값 없음' };
    var ret = (p[p.length - 1].price / base - 1) * 100, bret = (b[b.length - 1].price / baseB - 1) * 100, peak = base, mdd = 0;
    p.forEach(function (x) { if (x.price > peak) peak = x.price; var d = (peak - x.price) / peak * 100; if (d > mdd) mdd = d; });
    var excess = ret - bret, riskAdj = mdd > 0 ? ret / mdd : null, hit, cause = [];
    if (entry.opinion === '매수 검토') { hit = excess > 0 && mdd <= 25; if (!hit) cause.push(excess <= 0 ? '벤치마크 하회' : '낙폭 과다(' + Math.round(mdd) + '%)'); }
    else if (entry.opinion === '비중 축소 검토') { hit = excess < 0; if (!hit) cause.push('축소 검토 후에도 종목이 시장을 앞섬'); }
    else { hit = Math.abs(excess) <= 10 && mdd <= 25; if (!hit) cause.push('보유 의견이었으나 큰 초과·하락 발생'); }
    return { scored: true, horizonDays: horizonDays, returnPct: r2(ret), benchPct: r2(bret), excessPct: r2(excess), maxDrawdownPct: r2(mdd), returnPerDrawdown: riskAdj === null ? null : r2(riskAdj), hit: hit, errorCauses: cause, note: '단순 상승 여부가 아니라 벤치마크 대비·최대낙폭으로 평가' };
  }
  function daysShort(a, b) { return (Date.parse(b) - Date.parse(a)) / 86400000; }
  function r2(x) { return Math.round(x * 100) / 100; }
  return Object.freeze({ DESIGN: DESIGN, record: record, decide: decide, evaluate: evaluate });
});
