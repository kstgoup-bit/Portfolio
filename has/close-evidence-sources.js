/* Curated negative evidence only. Never a fetcher or a full exchange calendar. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HASCloseEvidenceSources = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var closure = Object.freeze({ sourceId: 'krx-kind-11637', revision: 'review-20261109-v1', reviewId: 'local-primary-review-20261109',
    authority: 'KRX KIND disclosure notice', instrumentType: 'listed-equity', market: 'KR', exchange: 'KRX',
    validFrom: '2026-09-24', validThrough: '2026-09-27', correctionState: 'history-unestablished', supersedes: null,
    sourceVersion: 'publisher-version-unspecified', support: 'closed-only',
    url: 'https://kind.krx.co.kr/external/dst/notice/11637/%5B%ED%95%9C%EA%B5%AD%EA%B1%B0%EB%9E%98%EC%86%8C%5D%202026%EB%85%84%20%EC%98%AC%EB%B9%BC%EB%AF%B8%EA%B3%B5%EC%8B%9C%20%EC%95%88%EB%82%B4.pdf' });
  function knownClosed(cal, instrumentType) {
    return !!cal && instrumentType === closure.instrumentType && cal.market === closure.market && cal.exchange === closure.exchange &&
      cal.tradingDate >= closure.validFrom && cal.tradingDate <= closure.validThrough;
  }
  // No provider entry grants finality. Official examples describe fields, not finalized bars.
  var providers = Object.freeze({ gas: Object.freeze({ support: 'unreviewed-finality' }), kis: Object.freeze({ support: 'daily-field-mapping-only' }) });
  return Object.freeze({ closure: closure, knownClosed: knownClosed, providers: providers });
});
