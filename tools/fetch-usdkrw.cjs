#!/usr/bin/env node
'use strict';
/* GitHub Actions에서 하루 한 번 원/달러 일별 환율을 받아 data/fx/usdkrw.json 하나만 저장한다(앱이 같은 사이트 정적 JSON으로 읽음).
 * 왜: 전체·해외·연금 계좌 알파는 원화 평가 vs 달러 지수(QQQ)라 기간별 환율 없이는 계산할 수 없다(순태씨 2026-11-28 '1번으로 하자').
 * 출처 두 개:
 *   1) Yahoo Finance KRW=X 일별 종가(최근 날짜까지, 비공식) — https://query1.finance.yahoo.com/v8/finance/chart/KRW=X
 *   2) 미국 연준 H.10(FRED DEXKOUS, 뉴욕 정오 매입률, 공식·약 1주 지연) — https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXKOUS
 *   같은 날짜가 둘 다 있으면 차이 1% 이내만 'ok', 넘으면 'conflict'(앱은 그 날짜를 쓰지 않음). 연준 자료가 아직 없는 최근 날짜는 'unchecked'.
 *   Yahoo가 막히면 연준 값만으로 저장('fred'), 둘 다 실패하거나 형식이 이상하면 아무것도 쓰지 않고 실패(마지막 성공 파일 유지, 재시도·우회 없음).
 * 비밀값·API 키 없음. 앱·GAS·사용자 자료 변경 없음. 투자 자문 아님. */
const fs = require('fs'), path = require('path');
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=10y&interval=1d';
const FRED_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXKOUS';
const MAX_BYTES = 8 * 1024 * 1024, MIN_V = 500, MAX_V = 3000, TOL = 0.01, MIN_POINTS = 200, KEEP_DAYS = 3700;
const DAYRE = /^\d{4}-\d{2}-\d{2}$/;
function day(s) { if (typeof s !== 'string' || !DAYRE.test(s)) return false; const t = Date.parse(s + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s; }
function okV(v) { return typeof v === 'number' && Number.isFinite(v) && v >= MIN_V && v <= MAX_V; }
async function getText(fetchFn, url) {
  const res = await fetchFn(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'HAS-portfolio fx (GitHub Actions)' } });
  if (!res || res.status !== 200) return { fail: 'http-' + (res && res.status) };
  const text = await res.text();
  if (typeof text !== 'string' || text.length > MAX_BYTES) return { fail: 'too-large' };
  return { text };
}
/* Yahoo chart JSON → {날짜: 종가}. 날짜는 캔들 시각(UTC)의 날짜. */
function parseYahoo(text) {
  const j = JSON.parse(text), r = j && j.chart && Array.isArray(j.chart.result) ? j.chart.result[0] : null;
  if (!r || !r.meta || r.meta.symbol !== 'KRW=X' || (r.meta.currency && r.meta.currency !== 'KRW')) throw new Error('yahoo-shape');
  const ts = r.timestamp, q = r.indicators && r.indicators.quote && r.indicators.quote[0], c = q && q.close;
  if (!Array.isArray(ts) || !Array.isArray(c) || ts.length !== c.length) throw new Error('yahoo-shape');
  const out = {};
  for (let i = 0; i < ts.length; i++) {
    if (!Number.isSafeInteger(ts[i]) || !okV(c[i])) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10); if (day(d)) out[d] = Math.round(c[i] * 100) / 100;
  }
  return out;
}
/* FRED CSV(observation_date,DEXKOUS) → {날짜: 값}. 휴일은 '.' 또는 빈 칸. */
function parseFred(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length || !/^(observation_date|DATE),DEXKOUS$/i.test(lines[0].trim())) throw new Error('fred-shape');
  const out = {};
  for (const line of lines.slice(1)) {
    const [d, v] = line.split(','); const n = Number(v);
    if (day(d) && v !== '' && v !== '.' && okV(n)) out[d] = Math.round(n * 100) / 100;
  }
  return out;
}
function merge(y, f, stamp) {
  const cut = new Date(Date.parse(stamp) - KEEP_DAYS * 86400000).toISOString().slice(0, 10), today = stamp.slice(0, 10);
  const dates = Array.from(new Set(Object.keys(y).concat(Object.keys(f)))).filter(d => d >= cut && d <= today).sort();
  return dates.map(d => {
    const a = y[d], b = f[d];
    if (a !== undefined && b !== undefined) return { d, v: a, fred: b, check: Math.abs(a - b) / b <= TOL ? 'ok' : 'conflict' };
    if (a !== undefined) return { d, v: a, check: 'unchecked' };
    return { d, v: b, fred: b, check: 'fred' };
  });
}
async function run(opts) {
  const { fetchFn, outFile, now, log } = opts, say = log || (() => {}), stamp = (now || new Date()).toISOString();
  const got = {};
  for (const [k, url, parse] of [['yahoo', YAHOO_URL, parseYahoo], ['fred', FRED_URL, parseFred]]) {
    try { const r = await getText(fetchFn, url); if (r.fail) { got[k] = { fail: r.fail }; continue; } got[k] = { map: parse(r.text) }; }
    catch (e) { got[k] = { fail: /shape/.test(e && e.message) ? e.message : 'fetch-or-parse-failed' }; }
  }
  const y = got.yahoo.map || {}, f = got.fred.map || {};
  if (!got.yahoo.map && !got.fred.map) { say('fx-failed yahoo=' + got.yahoo.fail + ' fred=' + got.fred.fail); return { ok: false, reason: 'both-failed' }; }
  const points = merge(y, f, stamp), conflicts = points.filter(p => p.check === 'conflict').length, checked = points.filter(p => p.check === 'ok').length;
  if (points.length < MIN_POINTS) { say('fx-too-few ' + points.length); return { ok: false, reason: 'too-few-points' }; }
  if (checked + conflicts > 0 && conflicts / (checked + conflicts) > 0.05) { say('fx-too-many-conflicts ' + conflicts); return { ok: false, reason: 'too-many-conflicts' }; }   // 출처 이상(단위·종목 바뀜 등) — 저장 안 함
  const doc = {
    version: 1, pair: 'USDKRW', unit: 'KRW per 1 USD', fetchedAt: stamp,
    sources: {
      yahoo: { name: 'Yahoo Finance KRW=X 일별 종가(비공식)', url: YAHOO_URL, status: got.yahoo.map ? 'ok' : got.yahoo.fail },
      fred: { name: '미국 연준 H.10 (FRED DEXKOUS, 뉴욕 정오 매입률)', url: FRED_URL, status: got.fred.map ? 'ok' : got.fred.fail, latest: Object.keys(f).sort().pop() || null }
    },
    tolerance: TOL, verification: 'unverified', points
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = outFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(doc)); fs.renameSync(tmp, outFile);
  say('fx-done points=' + points.length + ' checked=' + checked + ' conflicts=' + conflicts + ' yahoo=' + doc.sources.yahoo.status + ' fred=' + doc.sources.fred.status);
  return { ok: true, doc };
}
module.exports = { run, parseYahoo, parseFred, merge, YAHOO_URL, FRED_URL, TOL };
if (require.main === module) {
  (async () => { const r = await run({ fetchFn: fetch, outFile: path.join(__dirname, '..', 'data', 'fx', 'usdkrw.json'), log: console.log }); process.exit(r.ok ? 0 : 1); })()
    .catch(() => { console.log('fetch-usdkrw-failed'); process.exit(1); });
}
