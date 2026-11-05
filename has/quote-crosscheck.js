/* HAS 24단계 — 공급자 간 가격 불일치 대조(순수 함수). 같은 종목을 서로 다른 공급자가 다르게 말하면 둘 다 '충돌'로 표시하고
   신호·조언에 쓰지 않는다(usableForSignals 가 independent-verified 만 허용하므로 verification 을 'conflict'로 내린다).
   하나뿐이면 대조 불가이며 '검증됨'으로 올리지 않는다. 입력은 변경하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASQuoteCrossCheck = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TOL = Object.freeze({ KR: 1.0, US: 1.0 }); // 허용 오차(%)
  function check(quotes, tolPct) {
    var list = (quotes || []).filter(function (q) { return q && typeof q.price === 'number' && q.price > 0; });
    var providers = {}; list.forEach(function (q) { providers[q.source || '?'] = 1; });
    var n = Object.keys(providers).length;
    if (n < 2) return { status: 'single-source', ok: false, spreadPct: null, note: '공급자 1곳뿐 — 독립 대조 불가', providers: n };
    var cur = list[0].currency; if (list.some(function (q) { return q.currency !== cur; })) return { status: 'conflict', ok: false, spreadPct: null, note: '통화가 서로 다름', providers: n };
    var lo = Math.min.apply(null, list.map(function (q) { return q.price; })), hi = Math.max.apply(null, list.map(function (q) { return q.price; }));
    var tol = typeof tolPct === 'number' ? tolPct : TOL[list[0].market] || 1, spread = Math.round((hi - lo) / lo * 10000) / 100;
    var days = {}; list.forEach(function (q) { days[q.asOfDate || '?'] = 1; });
    if (Object.keys(days).length > 1) return { status: 'conflict', ok: false, spreadPct: spread, note: '기준일이 서로 다름 — 같은 날 가격이 아니어서 대조 불가', providers: n };
    return spread <= tol ? { status: 'agree', ok: true, spreadPct: spread, note: n + '개 공급자 일치(±' + tol + '%)', providers: n }
      : { status: 'conflict', ok: false, spreadPct: spread, note: '공급자 간 가격 차이 ' + spread + '% > 허용 ' + tol + '%', providers: n };
  }
  /* 대조 결과를 시세에 반영한 사본. agree 여도 원래 독립 검증이 아닌 시세를 검증으로 올리지 않는다(올리는 것은 호출자의 별도 책임). */
  function apply(quote, result) {
    if (!quote) return quote; if (result.status === 'conflict') return Object.freeze(Object.assign({}, quote, { verification: 'conflict', crossCheck: result.note }));
    return Object.freeze(Object.assign({}, quote, { crossCheck: result.note }));
  }
  return Object.freeze({ check: check, apply: apply });
});
