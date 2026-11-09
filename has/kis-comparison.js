/* Offline normalized evidence comparison only. No transport, credentials, or trading. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HASKISComparison = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var MAX_BYTES = 8192, TOLERANCE = 0.5;
  var FIELDS = ['ticker', 'market', 'exchange', 'currency', 'priceKind', 'adjustment', 'exchangeTimestamp', 'price', 'upstreamOrigin', 'delaySeconds'];
  var ENUMS = {
    market: ['KR', 'US'], exchange: ['KRX', 'NXT', 'NASDAQ', 'NYSE', 'AMEX'],
    currency: ['KRW', 'USD'], priceKind: ['realtime', 'delayed', 'close'], adjustment: ['raw', 'split-adjusted', 'total-return'],
    upstreamOrigin: ['unknown', 'exchange', 'kis', 'yahoo', 'google']
  };
  function record(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function keysAllowed(x, allowed) { return Object.keys(x).every(function (k) { return allowed.indexOf(k) !== -1; }); }
  function absent(x) { return x === null || x === undefined; }
  function timestamp(x) {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)) return false;
    var n = Date.parse(x);
    return Number.isFinite(n) && new Date(n).toISOString() === x;
  }
  function validQuote(q) {
    if (q === null) return true;
    if (!record(q) || !keysAllowed(q, FIELDS)) return false;
    return FIELDS.every(function (k) {
      var v = q[k];
      if (absent(v)) return true;
      if (k === 'ticker') return typeof v === 'string' && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(v);
      if (k === 'price') return typeof v === 'number' && Number.isFinite(v) && v >= 1e-9 && v <= 1e12;
      if (k === 'delaySeconds') return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 86400;
      if (k === 'exchangeTimestamp') return timestamp(v);
      return ENUMS[k].indexOf(v) !== -1;
    });
  }
  function result(status, reason, spread, origin) {
    // All values are scalar, so this freeze is also a deep freeze. No input strings or errors are reflected.
    return Object.freeze({ status: status, reason: reason, verification: 'unverified', independenceVerified: false,
      usableForSignals: false, freshnessVerified: false, liveConnection: 'unavailable', tolerancePct: TOLERANCE, spreadPct: spread === undefined ? null : spread,
      originRelationship: origin || 'unknown' });
  }
  function originRelationship(a, b) {
    if (!a.upstreamOrigin || !b.upstreamOrigin || a.upstreamOrigin === 'unknown' || b.upstreamOrigin === 'unknown') return 'unknown';
    return a.upstreamOrigin === b.upstreamOrigin ? 'shared' : 'distinct-declared';
  }
  function consistent(q) {
    if (q.market === 'KR') return ['KRX', 'NXT'].indexOf(q.exchange) !== -1 && q.currency === 'KRW';
    return ['NASDAQ', 'NYSE', 'AMEX'].indexOf(q.exchange) !== -1 && q.currency === 'USD';
  }
  function duplicateKeys(text) {
    var tokens = /"(?:\\.|[^"\\])*"|[{}]/g, stack = [], token;
    while ((token = tokens.exec(text))) {
      if (token[0] === '{') stack.push(Object.create(null));
      else if (token[0] === '}') stack.pop();
      else if (stack.length && /^\s*:/.test(text.slice(tokens.lastIndex))) {
        var key = JSON.parse(token[0]), seen = stack[stack.length - 1];
        if (Object.prototype.hasOwnProperty.call(seen, key)) return true;
        seen[key] = true;
      }
    }
    return false;
  }
  function compareJSON(text) {
    // Only primitive JSON text crosses the boundary. No user getters, proxies or coercion execute.
    if (typeof text !== 'string' || text.length > MAX_BYTES) return result('invalid', 'invalid-input');
    var bytes = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      bytes += c < 128 ? 1 : c < 2048 ? 2 : 3;
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes++; i++; }
      if (bytes > MAX_BYTES) return result('invalid', 'invalid-input');
    }
    var p;
    try { p = JSON.parse(text); if (duplicateKeys(text)) return result('invalid', 'invalid-input'); } catch (_) { return result('invalid', 'invalid-input'); }
    if (!record(p) || !keysAllowed(p, ['version', 'gas', 'kis']) || p.version !== 1 ||
        !Object.prototype.hasOwnProperty.call(p, 'gas') || !Object.prototype.hasOwnProperty.call(p, 'kis') ||
        !validQuote(p.gas) || !validQuote(p.kis)) return result('invalid', 'invalid-input');
    var a = p.gas, b = p.kis;
    if (!a || !b) return result('incomparable', 'missing-source');
    var origin = originRelationship(a, b);
    for (var j = 0; j < FIELDS.length; j++) {
      var key = FIELDS[j];
      if (key !== 'upstreamOrigin' && key !== 'delaySeconds' && (absent(a[key]) || absent(b[key]))) return result('incomparable', 'missing-' + key, null, origin);
    }
    if (a.priceKind === 'delayed' && (absent(a.delaySeconds) || absent(b.delaySeconds))) return result('incomparable', 'missing-delaySeconds', null, origin);
    if ((a.priceKind === 'delayed' && a.delaySeconds === 0) || (b.priceKind === 'delayed' && b.delaySeconds === 0)) return result('incomparable', 'inconsistent-delaySeconds', null, origin);
    if ((a.priceKind !== 'delayed' && !absent(a.delaySeconds) && a.delaySeconds !== 0) || (b.priceKind !== 'delayed' && !absent(b.delaySeconds) && b.delaySeconds !== 0)) return result('incomparable', 'inconsistent-delaySeconds', null, origin);
    if (!consistent(a) || !consistent(b)) return result('incomparable', 'inconsistent-market', null, origin);
    for (var k = 0; k < FIELDS.length; k++) {
      var field = FIELDS[k];
      if (field !== 'upstreamOrigin' && field !== 'price' && field !== 'delaySeconds' && a[field] !== b[field]) return result('incomparable', 'different-' + field, null, origin);
    }
    if (a.priceKind === 'delayed' && a.delaySeconds !== b.delaySeconds) return result('incomparable', 'different-delaySeconds', null, origin);
    var spread = (Math.max(a.price, b.price) - Math.min(a.price, b.price)) / Math.min(a.price, b.price) * 100;
    // Decide on full precision: display rounding must not hide an over-threshold conflict.
    return result(spread <= TOLERANCE ? 'agree' : 'conflict', spread <= TOLERANCE ? 'within-tolerance' : 'price-disagreement', spread, origin);
  }
  return Object.freeze({ compareJSON: compareJSON, MAX_BYTES: MAX_BYTES });
});
