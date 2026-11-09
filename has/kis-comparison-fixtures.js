/* Synthetic values only. Not actual market data or raw KIS field mappings. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HASKISComparisonFixtures = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function create(scenario) {
    var gas = { ticker: '005930', market: 'KR', exchange: 'KRX', currency: 'KRW', priceKind: 'realtime',
      adjustment: 'raw', exchangeTimestamp: '2026-11-09T06:00:00.000Z', price: 10000, upstreamOrigin: 'google' };
    var kis = Object.assign({}, gas, { price: 10020, upstreamOrigin: 'kis' });
    if (scenario === 'conflict') kis.price = 10100;
    if (scenario === 'shared-origin') gas.upstreamOrigin = 'kis';
    if (scenario === 'missing-time') kis.exchangeTimestamp = null;
    if (scenario === 'different-venue') kis.exchange = 'NXT';
    if (scenario === 'missing-source') kis = null;
    return { version: 1, gas: gas, kis: kis };
  }
  return Object.freeze({ create: create });
});
