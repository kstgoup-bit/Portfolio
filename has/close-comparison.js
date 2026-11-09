/* Offline normalized evidence comparison only. No transport, credentials, or trading. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./close-evidence-sources.js'));
  else root.HASCloseComparison = factory(root.HASCloseEvidenceSources);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sources) {
  'use strict';
  var MAX_BYTES = 12288, TOLERANCE = 0.5;
  var FIELDS = ['source', 'ticker', 'market', 'exchange', 'currency', 'tradingDate', 'price', 'definition', 'session', 'completion', 'adjustment', 'upstreamOrigin', 'provenance', 'closeEvidence', 'publishedAt', 'retrievedAt', 'observedAt'];
  var CALENDAR = ['market', 'exchange', 'tradingDate', 'sessionType', 'scheduledCloseAt', 'provenance', 'timeZone', 'reference'];
  var ENUMS = {
    closeEvidence: ['synthetic-official-final-v1', 'normalized-official-final-declaration-v1', 'unknown'], timeZone: ['Asia/Seoul', 'America/New_York'], reference: ['synthetic-calendar-v1', 'normalized-calendar-declaration-v1'], source: ['gas', 'kis'], market: ['KR', 'US'], exchange: ['KRX', 'NXT', 'NASDAQ', 'NYSE', 'AMEX'], currency: ['KRW', 'USD'],
    definition: ['official-regular-close', 'last-trade', 'indicative'], session: ['regular', 'extended'], completion: ['final', 'preliminary'],
    adjustment: ['raw', 'split-adjusted', 'total-return'], upstreamOrigin: ['unknown', 'exchange', 'kis', 'google', 'yahoo'],
    provenance: ['synthetic', 'normalized-declaration', 'unknown'], sessionType: ['regular', 'early-close', 'closed']
  };
  function record(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function keysAllowed(x, allowed) { return Object.keys(x).every(function (k) { return allowed.indexOf(k) !== -1; }); }
  function absent(x) { return x === null || x === undefined; }
  function timestamp(x) {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)) return false;
    var n = Date.parse(x);
    return Number.isFinite(n) && new Date(n).toISOString() === x;
  }
  function validQuote(q, fields) {
    if (q === null) return true;
    if (!record(q) || !keysAllowed(q, fields)) return false;
    return fields.every(function (k) {
      var v = q[k];
      if (absent(v)) return true;
      if (k === 'ticker') return typeof v === 'string' && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(v);
      if (k === 'price') return typeof v === 'number' && Number.isFinite(v) && v >= 1e-9 && v <= 1e12;
      if (k === 'tradingDate') return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && timestamp(v + 'T00:00:00.000Z');
      if (/At$/.test(k)) return timestamp(v);
      return ENUMS[k].indexOf(v) !== -1;
    });
  }
  function result(status, reason, spread, origin) {
    // All values are scalar, so this freeze is also a deep freeze. No input strings or errors are reflected.
    return Object.freeze({ status: status, reason: reason, verification: 'unverified', independenceVerified: false,
      usableForSignals: false, freshnessVerified: false, liveConnection: 'unavailable', tolerancePct: TOLERANCE, spreadPct: spread === undefined ? null : spread,
      finalityVerified: false, calendarVerified: false, latestSessionVerified: false, comparisonBasis: 'synthetic-simulation-only', originRelationship: origin || 'unknown' });
  }
  function originRelationship(a, b) {
    if (!a.upstreamOrigin || !b.upstreamOrigin || a.upstreamOrigin === 'unknown' || b.upstreamOrigin === 'unknown') return 'unknown';
    return a.upstreamOrigin === b.upstreamOrigin ? 'shared' : 'distinct-declared';
  }
  function consistent(q) {
    if (q.market === 'KR') return ['KRX', 'NXT'].indexOf(q.exchange) !== -1 && q.currency === 'KRW';
    return ['NASDAQ', 'NYSE', 'AMEX'].indexOf(q.exchange) !== -1 && q.currency === 'USD';
  }
  function scheduleReason(cal) {
    if (cal.timeZone !== (cal.market === 'KR' ? 'Asia/Seoul' : 'America/New_York')) return 'calendar-timezone-mismatch';
    if ((cal.provenance === 'synthetic') !== (cal.reference === 'synthetic-calendar-v1')) return 'calendar-reference-mismatch';
    if (cal.exchange === 'NXT') return 'unsupported-close-venue';
    if (cal.market === 'KR' && cal.sessionType !== 'regular') return 'unsupported-calendar-session';
    // A plausibility gate, not a verified holiday calendar. Unsupported special sessions are withheld.
    var d = new Date(cal.scheduledCloseAt), day = new Date(cal.tradingDate + 'T12:00:00.000Z').getUTCDay();
    if (day === 0 || day === 6) return 'calendar-schedule-mismatch';
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: cal.market === 'KR' ? 'Asia/Seoul' : 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d);
      function part(type) { return parts.filter(function (p) { return p.type === type; })[0].value; }
      var expected = cal.market === 'KR' ? '15:30:00' : cal.sessionType === 'early-close' ? '13:00:00' : '16:00:00';
      if (part('hour') + ':' + part('minute') + ':' + part('second') !== expected || d.getUTCMilliseconds() !== 0) return 'calendar-schedule-mismatch';
    } catch (_) { return 'calendar-timezone-unavailable'; }
    return null;
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
    if (!record(p) || !keysAllowed(p, ['version', 'analysisAt', 'calendar', 'gas', 'kis']) || p.version !== 1 ||
        !['gas', 'kis', 'calendar'].every(function (k) { return Object.prototype.hasOwnProperty.call(p, k); }) ||
        (!absent(p.analysisAt) && !timestamp(p.analysisAt)) || !validQuote(p.calendar, CALENDAR) || !validQuote(p.gas, FIELDS) || !validQuote(p.kis, FIELDS)) return result('invalid', 'invalid-input');
    var a = p.gas, b = p.kis, cal = p.calendar;
    if (!a || !b) return result('incomparable', 'missing-source');
    var origin = originRelationship(a, b);
    function hold(reason) { return result('incomparable', reason, null, origin); }
    if (absent(p.analysisAt)) return hold('missing-analysisAt');
    if (!cal) return hold('missing-calendar');
    var required = FIELDS.filter(function (k) { return k !== 'observedAt' && k !== 'publishedAt'; });
    for (var i = 0; i < required.length; i++) if (absent(a[required[i]]) || absent(b[required[i]])) return hold('missing-' + required[i]);
    for (var j = 0; j < CALENDAR.length; j++) if (absent(cal[CALENDAR[j]])) return hold('missing-calendar-' + CALENDAR[j]);
    if (a.source !== 'gas' || b.source !== 'kis') return hold('source-declaration-mismatch');
    if (!consistent(a) || !consistent(b)) return hold('inconsistent-market');
    var match = ['ticker', 'market', 'exchange', 'currency', 'tradingDate'];
    for (var m = 0; m < match.length; m++) if (a[match[m]] !== b[match[m]]) return hold('different-' + match[m]);
    if (cal.market !== a.market || cal.exchange !== a.exchange || cal.tradingDate !== a.tradingDate) return hold('calendar-mismatch');
    if (!sources || typeof sources.knownClosed !== 'function' || !sources.closure || sources.closure.sourceId !== 'krx-kind-11637') return hold('calendar-registry-unavailable');
    if (sources.knownClosed(cal, 'listed-equity')) return hold('official-calendar-closed');
    if (cal.sessionType === 'closed') return hold('calendar-closed');
    if (a.provenance === 'unknown' || b.provenance === 'unknown' || cal.provenance === 'unknown' || a.upstreamOrigin === 'unknown' || b.upstreamOrigin === 'unknown') return hold('missing-provenance');
    if (a.provenance !== b.provenance || cal.provenance !== a.provenance) return hold('different-provenance');
    if (a.closeEvidence === 'unknown' || b.closeEvidence === 'unknown') return hold('missing-close-evidence');
    if ([a, b].some(function (q) { return (q.provenance === 'synthetic') !== (q.closeEvidence === 'synthetic-official-final-v1'); })) return hold('close-evidence-mismatch');
    if (a.definition !== 'official-regular-close' || b.definition !== 'official-regular-close') return hold('not-official-close');
    if (a.session !== 'regular' || b.session !== 'regular') return hold('not-regular-session');
    if (a.completion !== 'final' || b.completion !== 'final') return hold('not-final');
    if (a.adjustment !== 'raw' || b.adjustment !== 'raw') return hold('adjusted-close-withheld');
    // Supported regular-close venues close on their trading date in UTC too. No schedule is inferred.
    if (cal.scheduledCloseAt.slice(0, 10) !== cal.tradingDate) return hold('calendar-date-mismatch');
    var scheduleFailure = scheduleReason(cal);
    if (scheduleFailure) return hold(scheduleFailure);
    var close = Date.parse(cal.scheduledCloseAt), analysis = Date.parse(p.analysisAt);
    if (analysis < close) return hold('session-not-completed');
    var quotes = [a, b];
    for (var n = 0; n < quotes.length; n++) {
      var q = quotes[n], published = Date.parse(q.publishedAt), retrieved = Date.parse(q.retrievedAt);
      if (retrieved < close || analysis < retrieved || (!absent(q.publishedAt) && (published < close || retrieved < published))) return hold('inconsistent-evidence-time');
      // observedAt is optional supplied evidence, never synthesized from scheduledCloseAt.
      if (!absent(q.observedAt) && (Date.parse(q.observedAt) < close || Date.parse(q.observedAt) > (absent(q.publishedAt) ? retrieved : published))) return hold('inconsistent-observation-time');
    }
    // Caller labels, URLs, elapsed time and matching prices cannot authenticate real data.
    if (a.provenance !== 'synthetic' || b.provenance !== 'synthetic' || cal.provenance !== 'synthetic') return hold('normalized-evidence-required');
    var spread = (Math.max(a.price, b.price) - Math.min(a.price, b.price)) / Math.min(a.price, b.price) * 100;
    // Decide on full precision: display rounding must not hide an over-threshold conflict.
    return result(spread <= TOLERANCE ? 'agree' : 'conflict', spread <= TOLERANCE ? 'within-tolerance' : 'price-disagreement', spread, origin);
  }
  return Object.freeze({ compareJSON: compareJSON, MAX_BYTES: MAX_BYTES });
});
