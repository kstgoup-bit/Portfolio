/* Invented values and calendar entries only; not market evidence or provider mappings. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HASCloseComparisonFixtures = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function create(scenario) {
    var gas = { source: 'gas', ticker: 'SYNTH', market: 'KR', exchange: 'KRX', currency: 'KRW', tradingDate: '2026-11-09', price: 10000,
      definition: 'official-regular-close', session: 'regular', completion: 'final', adjustment: 'raw', upstreamOrigin: 'google', provenance: 'synthetic', closeEvidence: 'synthetic-official-final-v1',
      publishedAt: '2026-11-09T06:31:00.000Z', retrievedAt: '2026-11-09T06:35:00.000Z' };
    var kis = Object.assign({}, gas, { source: 'kis', price: 10020, upstreamOrigin: 'kis', publishedAt: '2026-11-09T06:32:00.000Z', retrievedAt: '2026-11-09T06:36:00.000Z' });
    var calendar = { market: 'KR', exchange: 'KRX', tradingDate: '2026-11-09', timeZone: 'Asia/Seoul', reference: 'synthetic-calendar-v1', sessionType: 'regular', scheduledCloseAt: '2026-11-09T06:30:00.000Z', provenance: 'synthetic' };
    var p = { version: 1, analysisAt: '2026-11-09T07:00:00.000Z', calendar: calendar, gas: gas, kis: kis };
    if (scenario === 'conflict') kis.price = 10100;
    if (scenario === 'shared-origin') gas.upstreamOrigin = 'kis';
    if (scenario === 'missing-source') p.kis = null;
    if (scenario === 'different-venue') kis.exchange = 'NXT';
    if (scenario === 'adjusted') kis.adjustment = 'split-adjusted';
    if (scenario === 'pre-close') p.analysisAt = '2026-11-09T06:29:00.000Z';
    if (scenario === 'closed') calendar.sessionType = 'closed';
    if (scenario === 'early-close') calendar.sessionType = 'early-close';
    return p;
  }
  return Object.freeze({ create: create });
});
