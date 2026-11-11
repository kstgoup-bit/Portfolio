/* KST (stage10): keeps three different things apart. Pure.
   (1) 52-week drawdown of ONE instrument from its own high, (2) relative return over an IDENTICAL window,
   (3) the gap between two drawdowns whose peaks fall on different dates — which is NOT a relative return. */
'use strict';
const { finite, day, daysBetween } = require('./common.js');
const BANDS = Object.freeze([20, 30, 35]);
function drawdown52w({ close, high52w, highDate, asOf }) {
  if (!finite(close) || !finite(high52w) || close <= 0 || high52w < close || !day(highDate) || !day(asOf) || highDate > asOf || daysBetween(highDate, asOf) > 370) return { ok: false, reason: '종가/52주 고가/고가일 불충분' };
  const pct = (close / high52w - 1) * 100; const band = BANDS.filter(b => pct <= -b + 1e-9).at(-1) ?? null;
  return { ok: true, pct, band, highDate, label: '자기 52주 고점 대비 낙폭(고점일은 종목마다 다름)' };
}
function relativeReturn(stock, bench) {
  const w = x => x && day(x.start) && day(x.end) && finite(x.returnPct) && x.returnPct >= -100 && typeof x.adjustment === 'string' && typeof x.currency === 'string';
  if (!w(stock) || !w(bench)) return { ok: false, reason: '수익률 구간/조정/통화 정보 불충분' };
  if (stock.start !== bench.start || stock.end !== bench.end) return { ok: false, reason: '구간이 달라 상대수익률 불가(시작·종료일 동일해야 함)' };
  if (stock.adjustment !== bench.adjustment || stock.currency !== bench.currency) return { ok: false, reason: '조정 기준/통화 불일치' };
  return { ok: true, relativePp: stock.returnPct - bench.returnPct, window: { start: stock.start, end: stock.end }, label: '동일 구간 상대수익률(%p)' };
}
function drawdownGap(stockDd, benchDd) {
  if (!stockDd || !benchDd || !stockDd.ok || !benchDd.ok) return { ok: false, reason: '낙폭 계산 불가' };
  return { ok: true, gapPp: stockDd.pct - benchDd.pct, peakDatesDiffer: stockDd.highDate !== benchDd.highDate, isRelativeReturn: false, label: '낙폭 차이(%p) — 고점일이 다르면 상대수익률이 아님' };
}
// One call returns the three measures in separate fields and never merges them into a single "underperformance" number.
function report({ stock, bench, stockWindow, benchWindow }) {
  const sd = drawdown52w(stock), bd = drawdown52w(bench);
  return { drawdown: sd, benchDrawdown: bd, relative: relativeReturn(stockWindow, benchWindow), drawdownGap: drawdownGap(sd, bd), combinedScore: null, note: '세 지표는 합산·치환하지 않음. 평가 보류 조건은 pipeline에서 처리' };
}
module.exports = { BANDS, drawdown52w, relativeReturn, drawdownGap, report };
