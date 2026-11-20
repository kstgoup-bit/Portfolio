/* 곡소리 신호 성적표(P1): 순수 계산 모듈. 앱·GAS·저장소·네트워크에 연결하지 않는다(시험 전용).
 * 질문 하나: 곡소리 후보(고점 대비 크게 빠진 종목)가 이후 지수보다 나았나? 매수·매도 의견을 만들지 않는다.
 * 정직 규칙: 표본 N<30 이면 결론 문구 없이 "표본 부족", 자료가 없으면 숨기지 않고 센다, 미래 자료는 쓰지 않는다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASSignalScorecard = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var DAY = 86400000;
  var CFG = {
    maxAgeMs: 36 * 3600000, maxMissingRatio: 0.05, basis: 'bar-close-high-365d', topN: 10,
    horizons: [30, 90, 180], toleranceDays: 5, absentSnapshots: 5, minSample: 30, maxChars: 60000, refusedKeep: 50,
    bench: { KR: '069500', US: 'SPY' }
  };
  function isDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function ms(d) { return Date.parse(d + 'T00:00:00Z'); }
  function addDays(d, n) { return new Date(ms(d) + n * DAY).toISOString().slice(0, 10); }
  function kstDay(t) { return new Date(t + 32400000).toISOString().slice(0, 10); }
  function pos(x) { return typeof x === 'number' && isFinite(x) && x > 0; }
  function emptyStore() { return { v: 1, snapshots: [], refused: [] }; }

  // 기록 관문(요약 전체): 하나라도 어기면 그날은 기록하지 않는다.
  function gate(summary, now) {
    var why = [];
    if (!summary || !Array.isArray(summary.items)) return { ok: false, reasons: ['no-summary'] };
    var gen = Date.parse(summary.generatedAt);
    if (!isFinite(gen)) why.push('bad-generatedAt');
    else if (gen > now + 60000) why.push('future-generatedAt');
    else if (now - gen > CFG.maxAgeMs) why.push('summary-too-old');
    var total = summary.items.length;
    if (!total) why.push('empty');
    else if (!(typeof summary.missingCount === 'number' && summary.missingCount >= 0) || summary.missingCount / total > CFG.maxMissingRatio) why.push('too-many-missing');
    return { ok: !why.length, reasons: why };
  }

  // rankedRows: 앱이 보여주는 순위(곡소리 Top)의 앞 topN개. bench: {KR:{ticker,asOf,close},US:{...}}
  function buildSnapshots(summary, rankedRows, bench, now) {
    var g = gate(summary, now), out = { snapshots: [], rejected: [] };
    if (!g.ok) { out.rejected.push({ market: '*', reason: g.reasons.join(',') }); return out; }
    var rows = (Array.isArray(rankedRows) ? rankedRows : []).slice(0, CFG.topN);
    if (!rows.length) { out.rejected.push({ market: '*', reason: 'no-candidates' }); return out; }
    var today = kstDay(now), by = { KR: [], US: [] }, bad = null;
    rows.forEach(function (r, i) {
      if (bad) return;
      if (!r || (r.market !== 'KR' && r.market !== 'US') || typeof r.ticker !== 'string' || !r.ticker) { bad = 'bad-row'; return; }
      if (r.status !== 'reference') { bad = 'status-not-reference'; return; }
      if (r.drawdownBasis !== CFG.basis) { bad = 'old-drawdown-basis'; return; }
      if (!pos(r.price) || !(typeof r.drawdownPct === 'number' && isFinite(r.drawdownPct) && r.drawdownPct <= 0)) { bad = 'bad-price'; return; }
      if (!isDay(r.asOf) || r.asOf > today) { bad = 'bad-asOf'; return; }
      by[r.market].push({ ticker: r.ticker, rank: i + 1, price: r.price, drawdownPct: r.drawdownPct, asOf: r.asOf });
    });
    if (bad) { out.rejected.push({ market: '*', reason: bad }); return out; }
    ['KR', 'US'].forEach(function (m) {
      var list = by[m]; if (!list.length) return;
      var asOfs = {}; list.forEach(function (x) { asOfs[x.asOf] = 1; });
      var keys = Object.keys(asOfs);
      if (keys.length !== 1) { out.rejected.push({ market: m, reason: 'mixed-asOf' }); return; }
      var b = bench && bench[m];
      if (!b || b.ticker !== CFG.bench[m] || !pos(b.close) || b.asOf !== keys[0]) { out.rejected.push({ market: m, reason: 'bench-missing-or-misaligned' }); return; }
      out.snapshots.push({
        key: m + '|' + keys[0], market: m, asOf: keys[0], recordedAt: new Date(now).toISOString(),
        benchTicker: b.ticker, benchClose: b.close,
        rows: list.map(function (x) { return { ticker: x.ticker, rank: x.rank, price: x.price, drawdownPct: x.drawdownPct }; })
      });
    });
    return out;
  }

  // 불변 저장: 같은 key 중복 거부, 용량 초과 시 새 기록만 거부(기존 자료는 지우지 않는다).
  function addSnapshot(store, snap, now) {
    var s = store && store.v === 1 && Array.isArray(store.snapshots) ? store : emptyStore();
    function refuse(reason) {
      var refused = (s.refused || []).concat([{ at: new Date(now == null ? Date.now() : now).toISOString(), key: snap && snap.key || null, reason: reason }]).slice(-CFG.refusedKeep);
      return { ok: false, reason: reason, store: { v: 1, snapshots: s.snapshots, refused: refused } };
    }
    if (!snap || typeof snap.key !== 'string') return refuse('bad-snapshot');
    for (var i = 0; i < s.snapshots.length; i++) if (s.snapshots[i].key === snap.key) return refuse('duplicate-asOf');
    var next = { v: 1, snapshots: s.snapshots.concat([snap]), refused: s.refused || [] };
    if (JSON.stringify(next).length > CFG.maxChars) return refuse('store-full');
    return { ok: true, reason: '', store: next };
  }

  // 신규 진입 이벤트: 해당 시장의 직전 기록 5개 이상에 연속으로 없다가 들어온 날. 첫 기록일은 이전 상태를 몰라 제외.
  function entryEvents(store) {
    var ev = [];
    ['KR', 'US'].forEach(function (m) {
      var snaps = (store.snapshots || []).filter(function (s) { return s.market === m; }).sort(function (a, b) { return a.asOf < b.asOf ? -1 : 1; });
      function has(s, t) { return s.rows.some(function (x) { return x.ticker === t; }); }
      snaps.forEach(function (s, idx) {
        if (idx === 0) return;
        s.rows.forEach(function (r) {
          var run = 0;
          for (var j = idx - 1; j >= 0 && !has(snaps[j], r.ticker); j--) run++;
          if (run >= CFG.absentSnapshots) ev.push({ market: m, ticker: r.ticker, asOf: s.asOf, key: s.key, price: r.price, rank: r.rank, benchTicker: s.benchTicker, benchClose: s.benchClose });
        });
      });
    });
    return ev;
  }

  // 채점. prices: {'KR:005930':[{d,c}], 'KR:069500':[...]} — now 이후 날짜의 봉은 쓰지 않는다(미래 자료 누출 방지).
  function scoreEvent(ev, prices, now, horizon) {
    var today = kstDay(now), target = addDays(ev.asOf, horizon), lastOk = addDays(target, CFG.toleranceDays);
    if (lastOk > today) return { horizon: horizon, status: 'pending' };
    var sk = ev.market + ':' + ev.ticker, bk = ev.market + ':' + ev.benchTicker;
    var sb = (prices && prices[sk]) || [], bb = (prices && prices[bk]) || [];
    var bmap = {}; bb.forEach(function (x) { if (x && isDay(x.d) && x.d <= today && pos(x.c)) bmap[x.d] = x.c; });
    var best = null, lo = addDays(target, -CFG.toleranceDays);
    sb.forEach(function (x) {
      if (!x || !isDay(x.d) || x.d > today || !pos(x.c) || x.d < lo || x.d > lastOk || !bmap[x.d]) return;
      var dist = Math.abs(ms(x.d) - ms(target));
      if (!best || dist < best.dist || (dist === best.dist && x.d < best.d)) best = { d: x.d, c: x.c, dist: dist };
    });
    if (!best) return { horizon: horizon, status: 'no-data' };
    var minC = ev.price;
    sb.forEach(function (x) { if (x && isDay(x.d) && x.d > ev.asOf && x.d <= best.d && pos(x.c) && x.c < minC) minC = x.c; });
    var stock = (best.c / ev.price - 1) * 100, bench = (bmap[best.d] / ev.benchClose - 1) * 100;
    return { horizon: horizon, status: 'scored', endDate: best.d, stockPct: stock, benchPct: bench, excessPct: stock - bench, maxDrawdownPct: (minC / ev.price - 1) * 100, success: stock - bench > 0 };
  }

  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function summarize(events, prices, now) {
    var res = [];
    ['KR', 'US'].forEach(function (m) {
      CFG.horizons.forEach(function (h) {
        var n = 0, pending = 0, noData = 0, wins = 0, ex = [];
        events.forEach(function (e) {
          if (e.market !== m) return;
          var r = scoreEvent(e, prices, now, h);
          if (r.status === 'pending') pending++; else if (r.status === 'no-data') noData++;
          else { n++; if (r.success) wins++; ex.push(r.excessPct); }
        });
        var enough = n >= CFG.minSample;
        res.push({
          market: m, horizon: h, entries: n + pending + noData, scored: n, pending: pending, noData: noData, wins: wins,
          winRatePct: n ? wins / n * 100 : null, medianExcessPct: median(ex), enough: enough,
          label: enough ? '표본 ' + n + '건 — 같은 결과가 계속된다는 보장은 없음(시장 국면·생존편향)' : '표본 부족 — 참고만(' + n + '/' + CFG.minSample + ')'
        });
      });
    });
    return res;
  }

  return { CFG: CFG, emptyStore: emptyStore, gate: gate, buildSnapshots: buildSnapshots, addSnapshot: addSnapshot, entryEvents: entryEvents, scoreEvent: scoreEvent, summarize: summarize };
});
