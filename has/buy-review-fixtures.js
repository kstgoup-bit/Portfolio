/* 합성 시험 자료 — 실제 기업·시세·재무가 아니다(SYN- 종목, example.invalid 출처). 실제 판단에 쓰지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASBuyReviewFixtures = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var NOW = '2026-11-20T21:00:00Z', DAYV = '2026-11-20';
  function ev(t) { return [{ text: t, source: 'SYNTHETIC: example.invalid/filing', asOf: '2026-11-01', verification: 'independent-verified' }]; }
  function sc(v, method) { return { valuePerShare: v, method: method || 'DCF(합성)', discountRatePct: 9, growthPct: 3, normalizedFcf: 1000, stockCompensation: 50, dilutionPct: 1, netDebt: 200, shares: 100 }; }
  function base(over) {
    var d = {
      contract: 'buyReviewInput.v1', synthetic: true, market: 'US', ticker: 'SYN-A', name: '합성 우량기업 A', sector: '합성 소비재',
      price: { close: 60, high52w: 100, high52wAsOf: DAYV, priceType: 'regular-close', exchange: 'SYNTHETIC-EX', currency: 'USD', source: 'SYNTHETIC: example.invalid/close', asOf: DAYV, adjustment: 'split-dividend-adjusted',
        crossCheck: { status: 'match', diffPct: 0.2, sources: ['SYNTHETIC-1', 'SYNTHETIC-2'] }, benchmark: { id: 'SYN-INDEX', returnPct: -5, stockReturnPct: -30, period: { start: '2025-11-20', end: DAYV } } },
      gates: { A: { status: 'PASS', evidence: ev('시장점유율 유지(합성)') }, B: { status: 'PASS', evidence: ev('순부채/EBITDA 1배(합성)') }, C: { status: 'PASS', evidence: ev('5년 정상화 FCF 양수(합성)') }, D: { status: 'PASS', evidence: ev('보수 시나리오 가정 출처(합성)') }, E: { status: 'PASS', evidence: ev('감사의견 적정·악재 일시성 검토(합성)') } },
      valuation: { currency: 'USD', source: 'SYNTHETIC: example.invalid/model', asOf: '2026-11-10', verification: 'independent-verified', scenarios: { conservative: sc(80), base: sc(100), optimistic: sc(130) } },
      research: { filings: r('공시'), news: r('뉴스'), consensus: r('컨센서스'), community: r('커뮤니티') },
      counterArguments: ['수요 둔화가 길어질 수 있음(합성)'], invalidation: ['정상화 FCF가 2분기 연속 보수 시나리오 아래(합성)'],
      riskFlags: { accounting: false, liquidity: false, structural: false },
      context: { cash: { status: 'verified', amount: 5000000, asOf: DAYV }, emergencyFloor: { status: 'set', amount: 1000000 }, weightPct: 3, conviction: false, sectorWeightPct: 5, sameSectorHoldings: [] }
    };
    return over ? over(d) || d : d;
  }
  function r(label) { return { done: true, source: 'SYNTHETIC: example.invalid/' + label, summary: label + ' 확인(합성)', asOf: '2026-11-19' }; }
  return Object.freeze({ NOW: NOW, base: base, ev: ev, sc: sc });
});
