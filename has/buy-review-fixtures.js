/* 합성 시험 자료 — 실제 기업·시세·재무가 아니다(SYN- 종목, example.invalid 출처). 실제 판단에 쓰지 않는다.
   계약 buyReviewInput.v2: 구조화된 증빙(evidence.v2)·원시 교차 시세·가정 재계산·현금 계좌 범위를 포함한다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASBuyReviewFixtures = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var NOW = '2026-11-20T21:00:00Z', DAYV = '2026-11-20', HASH = 'a'.repeat(64);
  var KIND_PATH = { filing: 'filing', news: 'news', consensus: 'consensus', community: 'community', analysis: 'analysis' };
  function one(t, kind, publishedAt, ticker) {
    kind = kind || 'filing'; publishedAt = publishedAt || '2026-11-01';
    var e = { text: t, kind: kind, market: 'US', ticker: ticker || 'SYN-A', publishedAt: publishedAt,
      retrievedAt: publishedAt + 'T12:00:00Z', url: 'https://example.invalid/' + KIND_PATH[kind] + '/' + publishedAt, producedBy: 'synthetic-collector',
      verification: { status: 'verified', verifier: 'synthetic-verifier', checkedAt: publishedAt + 'T13:00:00Z', contentSha256: HASH } };
    if (kind === 'filing') e.docId = '0000000000-26-000001';
    return e;
  }
  function ev(t, kind, publishedAt) { return [one(t, kind, publishedAt)]; }
  // fcf-perpetuity 가정에서 목표 주당가치 v가 정확히 재계산되도록 정상화 FCF를 역산한다(합성).
  function sc(v) {
    var r = 9, g = 3, sbc = 50, dil = 1, nd = 200, sh = 100;
    var fcf = (v * sh * (1 + dil / 100) + nd) * (r - g) / 100 / (1 + g / 100) + sbc;
    return { valuePerShare: v, method: 'fcf-perpetuity', discountRatePct: r, growthPct: g, normalizedFcf: fcf, stockCompensation: sbc, dilutionPct: dil, netDebt: nd, shares: sh };
  }
  function quote(provider, close, high) {
    return { provider: provider, exchange: 'SYNTHETIC-EX', currency: 'USD', priceType: 'regular-close', sessionStatus: 'closed', asOf: DAYV,
      adjustment: 'split-dividend-adjusted', adjustmentAsOf: DAYV, retrievedAt: '2026-11-20T20:55:00Z', close: close, high52w: high };
  }
  function rs(label, kind) { return { done: true, summary: label + ' 확인(합성)', evidence: ev(label + '(합성)', kind, '2026-11-19') }; }
  function base(over) {
    var d = {
      contract: 'buyReviewInput.v2', synthetic: true, market: 'US', ticker: 'SYN-A', name: '합성 우량기업 A', sector: '합성 소비재',
      price: { close: 60, high52w: 100, high52wAsOf: DAYV, priceType: 'regular-close', sessionStatus: 'closed', closeConfirmedAt: '2026-11-20T20:50:00Z',
        exchange: 'SYNTHETIC-EX', currency: 'USD', source: 'SYNTHETIC-1', asOf: DAYV,
        adjustment: 'split-dividend-adjusted', adjustmentAsOf: DAYV, high52wAdjustment: 'split-dividend-adjusted', high52wAdjustmentAsOf: DAYV,
        crossCheck: { quotes: [quote('SYNTHETIC-1', 60, 100), quote('SYNTHETIC-2', 60.1, 100)] },
        benchmark: { id: 'SYN-INDEX', returnPct: -5, stockReturnPct: -30, period: { start: '2025-11-20', end: DAYV } } },
      gates: { A: { status: 'PASS', evidence: ev('시장점유율 유지(합성)') }, B: { status: 'PASS', evidence: ev('순부채/EBITDA 1배(합성)') }, C: { status: 'PASS', evidence: ev('5년 정상화 FCF 양수(합성)') }, D: { status: 'PASS', evidence: ev('보수 시나리오 가정 출처(합성)') }, E: { status: 'PASS', evidence: ev('감사의견 적정·악재 일시성 검토(합성)') } },
      valuation: { currency: 'USD', asOf: '2026-11-10', units: { currency: 'USD', moneyScale: 1, shareScale: 1 },
        lineage: { normalizedFcf: ev('현금흐름표(합성)'), stockCompensation: ev('주식보상 주석(합성)'), netDebt: ev('재무상태표(합성)'), shares: ev('발행주식수(합성)') },
        scenarios: { conservative: sc(80), base: sc(100), optimistic: sc(130) } },
      research: { filings: rs('공시', 'filing'), news: rs('뉴스', 'news'), consensus: rs('컨센서스', 'consensus'), community: rs('커뮤니티', 'community') },
      counterArguments: ['수요 둔화가 길어질 수 있음(합성)'], invalidation: ['정상화 FCF가 2분기 연속 보수 시나리오 아래(합성)'],
      riskFlags: { accounting: false, liquidity: false, structural: false },
      context: { cash: { status: 'verified', amount: 5000000, currency: 'KRW', asOf: '2026-11-20T20:00:00Z', accountScope: { status: 'confirmed', accounts: ['SYN-ACCT-1'] } },
        fx: { base: 'KRW', quote: 'USD', rate: 0.00072, source: 'SYNTHETIC-FX', asOf: '2026-11-20T20:00:00Z' },
        emergencyFloor: { status: 'set', amount: 1000000, currency: 'KRW' }, weightPct: 3, weightScope: { status: 'confirmed', accounts: ['SYN-ACCT-1'] }, conviction: false, sectorWeightPct: 5, sameSectorHoldings: [] }
    };
    return over ? over(d) || d : d;
  }
  // 종목 바꾸기: 해당 종목의 증빙 대상까지 함께 바꾼다(실험실·후보 시험용).
  function withTicker(d, t) {
    var old = d.ticker;
    (function walk(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walk); return; } if (x.kind && x.ticker === old) x.ticker = t; Object.keys(x).forEach(function (k) { walk(x[k]); }); })(d);
    d.ticker = t; return d;
  }
  // 합성 확신종목 목록(순태씨 지정 형식 예시) — 실제 목록이 아니다.
  function convictionList(tickers) { return { status: 'confirmed', designatedBy: 'user', asOf: '2026-11-15', accountScope: { status: 'confirmed', accounts: ['SYN-ACCT-1'] }, items: (tickers || ['SYN-A']).map(function (t) { return { market: 'US', ticker: t }; }) }; }
  return Object.freeze({ convictionList: convictionList, NOW: NOW, HASH: HASH, base: base, ev: ev, one: one, sc: sc, quote: quote, withTicker: withTicker });
});
