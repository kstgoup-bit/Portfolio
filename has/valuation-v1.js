'use strict';
/* 가치평가 v1(순수 모듈): 자기 과거 대비 지금 가격이 어느 위치인지(PER·PSR·FCF 수익률)를 계산한다.
 * 설계: docs/team/CLAUDE-DESIGN-VALUATION-20261126.md. 매수·매도 결론이 아니라 '비교 재료'만 만든다(투자 자문 아님).
 * 입력: years(F.normalize 결과 years, 최신순), shares(extractShares 결과), price(현재가), priceHistory([{date:'YYYY-MM-DD',close}]).
 * 판정: 과거 값 3개 미만이면 '판정 불가'. 하위 20%·10% = 싸다·아주 싸다, 상위 20%·10% = 비싸다·아주 비싸다. 경기민감 업종은 한 단계 완화. */
(function (root) {
  var MIN_HISTORY = 3;
  var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };

  /* SEC companyfacts 원본에서 주식 수만 뽑는다. normalize는 건드리지 않는다. */
  function extractShares(raw) {
    var out = { latest: null, annual: [] };
    var f = raw && raw.facts;
    if (!f) return out;
    var dei = f.dei && f.dei.EntityCommonStockSharesOutstanding;
    var list = dei && dei.units && dei.units.shares;
    if (Array.isArray(list)) {
      list.forEach(function (e) {
        var v = num(e && e.val);
        if (v && v > 0 && typeof e.end === 'string' && (!out.latest || e.end > out.latest.end)) out.latest = { end: e.end, value: v };
      });
    }
    var g = f['us-gaap'] || {};
    var seen = {};
    ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic'].forEach(function (tag) {
      var u = g[tag] && g[tag].units && g[tag].units.shares;
      if (!Array.isArray(u)) return;
      u.forEach(function (e) {
        var v = num(e && e.val);
        if (!v || v <= 0 || !e || e.fp !== 'FY' || !/^10-K/.test(String(e.form || '')) || typeof e.end !== 'string') return;
        if (seen[e.end]) return; // 희석 주식 수 우선
        seen[e.end] = true; out.annual.push({ end: e.end, value: v });
      });
    });
    out.annual.sort(function (a, b) { return a.end < b.end ? 1 : -1; });
    return out;
  }

  function priceAt(hist, end) {
    var best = null;
    (hist || []).forEach(function (p) { if (p && typeof p.date === 'string' && p.date <= end && num(p.close) && (!best || p.date > best.date)) best = p; });
    return best ? best.close : null;
  }
  function sharesAt(sh, end) {
    var a = (sh && sh.annual) || [];
    for (var i = 0; i < a.length; i++) if (Math.abs(Date.parse(a[i].end) - Date.parse(end)) <= 7 * 864e5) return a[i].value;
    return null;
  }
  function perShare(y, sh, kind) {
    var s = sharesAt(sh, y.end); if (!s) return null;
    if (kind === 'PER') { var n = num(y.netIncome); return n !== null && n > 0 ? n / s : null; }
    if (kind === 'PSR') { var r = num(y.revenue); return r !== null && r > 0 ? r / s : null; }
    var o = num(y.ocf), c = num(y.capex); if (o === null || c === null) return null;
    var fcf = o - Math.abs(c); return fcf > 0 ? fcf / s : null;
  }
  function percentile(sorted, v) { // v 이하인 과거 값의 비율(0~1)
    var n = 0; sorted.forEach(function (x) { if (x <= v) n++; }); return n / sorted.length;
  }
  function grade(p, cyclical, higherIsCheap) {
    var pos = higherIsCheap ? 1 - p : p; // pos가 낮을수록 싸다
    var lo1 = cyclical ? 0.10 : 0.20, lo2 = cyclical ? 0.05 : 0.10;
    if (pos <= lo2) return '아주 싸다';
    if (pos <= lo1) return '싸다';
    if (pos >= 1 - lo2) return '아주 비싸다';
    if (pos >= 1 - lo1) return '비싸다';
    return '보통';
  }

  function metric(kind, years, sh, price, hist, cyclical) {
    var label = kind === 'FCF' ? 'FCF 수익률' : kind;
    var vals = [], latest = null;
    (years || []).forEach(function (y, i) {
      var ps = perShare(y, sh, kind); if (ps === null) return;
      if (i === 0) latest = ps;
      var p = priceAt(hist, y.end); if (p === null) return;
      vals.push(kind === 'FCF' ? ps / p : p / ps);
    });
    if (latest === null || !num(price) || price <= 0) return { metric: label, grade: '판정 불가', reason: '현재가 또는 최근 연도 데이터 부족' };
    var cur = kind === 'FCF' ? latest / price : price / latest;
    if (vals.length < MIN_HISTORY) return { metric: label, current: cur, grade: '판정 불가', reason: '비교할 과거 값 ' + vals.length + '개(최소 ' + MIN_HISTORY + '개 필요)' };
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var p = percentile(sorted, cur);
    return { metric: label, current: cur, historyCount: vals.length, percentile: p, grade: grade(p, cyclical, kind === 'FCF'), reason: null };
  }

  function compute(input) {
    var i = input || {};
    var years = Array.isArray(i.years) ? i.years : [];
    var res = ['PER', 'PSR', 'FCF'].map(function (k) { return metric(k, years, i.shares, i.price, i.priceHistory, !!i.cyclical); });
    var ok = res.filter(function (r) { return r.grade !== '판정 불가'; });
    var cheap = ok.filter(function (r) { return /^(아주 )?싸다$/.test(r.grade); }).length;
    var dear = ok.filter(function (r) { return /비싸다$/.test(r.grade); }).length;
    var overall = !ok.length ? '판정 불가' : cheap > dear && cheap >= Math.ceil(ok.length / 2) ? '자기 과거 대비 싼 편' : dear > cheap && dear >= Math.ceil(ok.length / 2) ? '자기 과거 대비 비싼 편' : '자기 과거 대비 보통';
    return {
      metrics: res, overall: overall, counted: ok.length,
      limits: ['자기 과거와 비교한 위치일 뿐 매수·매도 결론이 아닙니다(투자 자문 아님).', '연간 값 기준(최근 4분기 합산 아님)이라 최신 변화가 덜 반영됩니다.', '적자·음수 현금흐름 해는 비교에서 빠집니다.'],
      counter: ok.length && overall === '자기 과거 대비 싼 편' ? '싸 보여도 이익이 꺾이는 중이면 이유 있는 할인일 수 있습니다.' : ok.length && overall === '자기 과거 대비 비싼 편' ? '비싸 보여도 성장이 그만큼 높아졌다면 정당화될 수 있습니다.' : null
    };
  }
  var api = { extractShares: extractShares, compute: compute, MIN_HISTORY: MIN_HISTORY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HASValuationV1 = api;
})(typeof self !== 'undefined' ? self : this);
