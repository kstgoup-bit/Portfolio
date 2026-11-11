/* HAS 25단계 — AI 참모 화면의 "합성 예시" 자료. 전부 가짜이며 실제 보유·시세·재무가 아니다. 화면은 이것을 쓸 때 합성 배너를 항상 띄운다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./quote-model.js')); else root.HASAdvisorSynthetic = factory(root.HASQuoteModel); })(typeof globalThis !== 'undefined' ? globalThis : this, function (Q) {
  'use strict';
  var NOW = '2026-11-05T14:00:00+09:00';
  var DATA = { v5_gen: JSON.stringify([{ id: 1, name: '합성 국내 우량A', ticker: 'SYN-KR1', quantity: 10000, avgPrice: 100, currentPrice: 60 }, { id: 2, name: '예수금', ticker: 'DEP_GEN', quantity: 1, avgPrice: 1, currentPrice: 150000, role: 'shield' }]),
    v5_ov: JSON.stringify([{ id: 3, name: '합성 미국 성장B', ticker: 'SYN-US1', quantity: 3, avgPrice: 100, currentPrice: 92 }]), v5_dom: '[]', v5_pen: '[]', v5_fx: '1400', v5_cma_amount: '0' };
  var raw = function (o) { return Object.assign({ kind: 'close', asOfDate: '2026-11-05', asOfTime: o.market === 'US' ? '2026-11-05T00:00:00-05:00' : '2026-11-05T09:00:00+09:00', fetchedAt: NOW, source: '합성 시험 공급자', verification: 'independent-verified', synthetic: true }, o); };
  var RAWS = { 'SYN-KR1': raw({ ticker: 'SYN-KR1', market: 'KR', currency: 'KRW', price: 60 }), 'SYN-US1': raw({ ticker: 'SYN-US1', market: 'US', currency: 'USD', price: 92 }), 'SYN-KR2': raw({ ticker: 'SYN-KR2', market: 'KR', currency: 'KRW', price: 60 }), 'SYN-US2': raw({ ticker: 'SYN-US2', market: 'US', currency: 'USD', price: 55, verification: 'unverified' }) };
  var FUND = { asOfDate: '2026-09-30', verification: 'independent-verified', source: '합성 재무', revenueGrowthPct: 8, freeCashFlow: 100, freeCashFlowPrev: 90, debtToEquity: 0.6, debtToEquityPrev: 0.6 };
  function externals() { var quotes = {}, hi = {}, rt = {}, fd = {}, th = {}; Object.keys(RAWS).forEach(function (t) { var n = Q.normalize(RAWS[t]); if (n.ok) quotes[t] = n.quote; hi[t] = { price: 100, asOfDate: '2026-11-05', source: '합성 시험 공급자' }; rt[t] = { stockPct: -30, benchPct: -5, periodDays: 20, asOfDate: '2026-11-05', source: '합성 시험 공급자' }; fd[t] = Object.assign({}, FUND); th[t] = { intact: true, note: '합성' }; });
    fd['SYN-US1'] = Object.assign({}, FUND, { freeCashFlow: -5 }); th['SYN-US1'] = { intact: false, note: '합성: 핵심 제품 경쟁력 약화' };
    return { quotes: quotes, high52w: hi, returns: rt, fundamentals: fd, thesis: th, watchlist: [{ ticker: 'SYN-KR2', name: '합성 국내 우량C', market: 'KR' }, { ticker: 'SYN-US2', name: '합성 미국 대형D(시세 미검증)', market: 'US' }], market: { vix: { level: 32, change5dPct: 10, asOfDate: '2026-11-05', source: '합성 시험 공급자' } } }; }
  return Object.freeze({ NOW: NOW, DATA: DATA, externals: externals });
});
