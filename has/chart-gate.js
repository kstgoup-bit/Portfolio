/* HAS: 차트 관문 — "사도 될 회사"와 "지금 살 때"를 나눈다. 확정 종가(오늘 막대 제외)로 20·60일 이동평균과 추세를 계산해
 * 분할매수 단계(1·3·3·3: 정찰병 10% / 20일선 회복 30% / 60일선 회복·높아진 저점 30% / 다음 실적 확인 뒤 30%)를 표시한다. 순수 계산 + 버튼을 누를 때만 GAS 이력 조회.
 * 매수·매도 지시가 아니며 저장소·투자기록·신호를 바꾸지 않는다. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASChartGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var STAGE = {
    falling: ['⛔ 하락 추세 · 매수 대기(떨어지는 칼날)', '#8b2020'],
    basing: ['➖ 바닥 다지는 중 · 정찰병(목표의 10%) 가능', '#8a4b00'],
    stage2: ['📈 20일선 회복 · 2차(30% 더) 가능', '#1b5e20'],
    stage3: ['🚀 60일선 회복·저점 상승 · 3차(30% 더) 가능 · 마지막 30%는 다음 실적 확인 뒤', '#0d47a1'],
    unknown: ['차트 자료 부족', '#333']
  };
  function marketToday(market, now) { return new Intl.DateTimeFormat('en-CA', { timeZone: market === 'US' ? 'America/New_York' : 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)); }
  function ma(c, n, end) { if (end < n - 1) return NaN; var s = 0; for (var i = end - n + 1; i <= end; i++) s += c[i]; return s / n; }
  function minIn(c, a, b) { var m = Infinity; for (var i = Math.max(0, a); i <= b; i++) m = Math.min(m, c[i]); return m; }
  // bars: [{d, c}] 오름차순. 결과 {stage, price, ma20, ma60, slope20, slope60, low60, low20}
  function classify(rawBars, market, now) {
    var today = marketToday(market, now == null ? Date.now() : now);
    var bars = (rawBars || []).filter(function (b) { return b && typeof b.d === 'string' && b.d < today && typeof b.c === 'number' && isFinite(b.c) && b.c > 0; });
    var c = bars.map(function (b) { return b.c; }), n = c.length - 1;
    if (n < 64) return { stage: 'unknown' };
    var p = c[n], m20 = ma(c, 20, n), m60 = ma(c, 60, n), s20 = m20 - ma(c, 20, n - 5), s60 = m60 - ma(c, 60, n - 5);
    var above20 = [0, 1, 2].every(function (k) { return c[n - k] > ma(c, 20, n - k); }), above60 = [0, 1, 2].every(function (k) { return c[n - k] > ma(c, 60, n - k); });
    var low20 = minIn(c, n - 19, n), lowPrev = minIn(c, n - 59, n - 20), higherLow = low20 > lowPrev && c[n - 19] > low20;
    var stage = 'basing';
    if (above60 && s60 >= 0 || higherLow && above20 && p > m60) stage = 'stage3';
    else if (above20 && s20 >= 0) stage = 'stage2';
    else if (p < m20 && s20 < 0) stage = 'falling';
    return { stage: stage, asOf: bars[n].d, price: p, ma20: m20, ma60: m60, slope20: s20, slope60: s60, low20: low20, lowPrev: lowPrev, higherLow: higherLow };
  }
  function describe(r) {
    var s = STAGE[r && r.stage] || STAGE.unknown, out = { label: s[0], color: s[1], detail: '' };
    if (r && r.stage !== 'unknown') out.detail = r.asOf + ' 종가 기준 · 20일선 ' + (r.slope20 >= 0 ? '상승' : '하락') + '·60일선 ' + (r.slope60 >= 0 ? '상승' : '하락') + ' · 주가 ' + (r.price > r.ma20 ? '20일선 위' : '20일선 아래') + (r.higherLow ? ' · 저점 상승' : '');
    return out;
  }
  // ---- 조회(브라우저) ----
  var W = typeof window !== 'undefined' ? window : null, cache = {}, cb = 0;
  function endpoint() { var u = new URL(W && typeof W.gasUrl === 'string' ? W.gasUrl : ''); if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || u.port || u.username || u.password || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)) throw Error('gas'); u.search = ''; u.hash = ''; return u; }
  function jsonp(params) {
    return new Promise(function (resolve, reject) {
      var u; try { u = endpoint(); } catch (e) { reject(e); return; }
      var name = 'hasGate_' + (++cb), s = document.createElement('script'), done = false, t;
      function fin(err, d) { if (done) return; done = true; clearTimeout(t); s.onerror = null; s.remove(); try { delete W[name]; } catch (e) { W[name] = undefined; } if (err) reject(err); else resolve(d); }
      W[name] = function (d) { fin(null, d); }; Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); }); u.searchParams.set('callback', name);
      s.referrerPolicy = 'no-referrer'; s.src = u.href; s.onerror = function () { fin(Error('gas')); }; t = setTimeout(function () { fin(Error('timeout')); }, 20000);
      try { document.head.appendChild(s); } catch (e) { fin(e); }
    });
  }
  // 결과를 휴대폰에 6시간 보관 — 앱을 다시 열어도 버튼을 또 누르지 않게(순태씨 2026-11-25). 실패(자료 부족)는 저장하지 않는다.
  var KEY = 'has_chartGate_v1', TTL = 6 * 3600e3;
  function restore() {
    try { var o = JSON.parse(W.localStorage.getItem(KEY)); if (!o || o.v !== 1 || !o.items || typeof o.items !== 'object') return;
      Object.keys(o.items).slice(0, 200).forEach(function (k) { var x = o.items[k]; if (/^(KR|US):[0-9A-Z.\-]{1,10}$/.test(k) && x && STAGE[x.stage] && x.stage !== 'unknown' && typeof x.at === 'number' && isFinite(x.price) && typeof x.asOf === 'string') cache[k] = x; });
    } catch (e) {}
  }
  function persist() {
    try { var items = {}; Object.keys(cache).filter(function (k) { return cache[k].stage !== 'unknown'; }).slice(-100).forEach(function (k) { items[k] = cache[k]; }); W.localStorage.setItem(KEY, JSON.stringify({ v: 1, items: items })); } catch (e) {}
  }
  function fresh(market, ticker, now) { var x = cache[market + ':' + ticker]; return !!(x && x.stage !== 'unknown' && typeof x.at === 'number' && (now == null ? Date.now() : now) - x.at < TTL); }
  if (W && W.localStorage) restore();
  // items: [{ticker, market}] → Promise<{ 'KR:005930': classify결과 }>
  function load(items) {
    var want = { KR: [], US: [] }, now = Date.now();
    items.forEach(function (x) { var k = x.market + ':' + x.ticker; if (!fresh(x.market, x.ticker, now) && want[x.market] && want[x.market].indexOf(x.ticker) < 0) want[x.market].push(x.ticker); });
    var seq = Promise.resolve();
    ['KR', 'US'].forEach(function (m) { for (var i = 0; i < want[m].length; i += 12) (function (chunk) { seq = seq.then(function () { return jsonp({ type: 'history', tickers: chunk.join(','), market: m }).then(function (d) { chunk.forEach(function (t) { var raw = d && d[t]; var res = classify(raw && raw.bars, m, now); if (res.stage !== 'unknown' || !cache[m + ':' + t]) { res.at = now; cache[m + ':' + t] = res; } }); }, function () { chunk.forEach(function (t) { if (!cache[m + ':' + t]) cache[m + ':' + t] = { stage: 'unknown' }; }); }); }); })(want[m].slice(i, i + 12)); });
    return seq.then(function () { persist(); var out = {}; items.forEach(function (x) { out[x.market + ':' + x.ticker] = cache[x.market + ':' + x.ticker] || { stage: 'unknown' }; }); return out; });
  }
  function cached(market, ticker) { return cache[market + ':' + ticker] || null; }
  return { classify: classify, describe: describe, load: load, cached: cached, fresh: fresh, STAGE: STAGE };
});
