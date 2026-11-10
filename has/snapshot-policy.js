(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HASSnapshotPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Pure, bounded recording policy. Receipt time is NOT a market price timestamp.
  var DAY = 86400000, MAX_NUMBER = 1e12, MAX_TOTAL = Number.MAX_SAFE_INTEGER;
  var ACCOUNTS = ['dom', 'ov', 'pen', 'gen'], MAX_ROWS = 10000;
  var MAX_RECORDS = 50000, MAX_REVISIONS = 64, MAX_BYTES = 20 * 1024 * 1024, MAX_NODES = 500000;
  function timestamp(n) { return Number.isSafeInteger(n) && n > 0 && n <= 8640000000000000; }
  function number(v, max, zero) { return typeof v === 'number' && Number.isFinite(v) && (zero ? v >= 0 : v > 0) && v <= max; }
  function isoTime(value) {
    if (typeof value !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!m || +m[1] < 1970 || +m[1] > 9999 || +m[2] < 1 || +m[2] > 12 || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return null;
    var days = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    if (+m[3] < 1 || +m[3] > days) return null;
    if (m[8] !== 'Z' && (+m[8].slice(1, 3) > 14 || +m[8].slice(4) > 59 || (+m[8].slice(1, 3) === 14 && +m[8].slice(4) !== 0))) return null;
    var ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  }
  function validateManual(manual, currency, now) {
    if (!manual || !number(manual.value, MAX_NUMBER)) return { ok: false, code: 'manual-value', reason: '수동 가격은 0 초과 1조 이하의 유한한 숫자여야 합니다' };
    if (manual.currency !== currency || manual.unit !== 'per-held-unit') return { ok: false, code: 'manual-unit', reason: '수동 가격의 통화 또는 보유수량 단위가 맞지 않습니다' };
    if (!Number.isInteger(manual.maxAgeDays) || manual.maxAgeDays < 1 || manual.maxAgeDays > 4) return { ok: false, code: 'manual-window', reason: '수동 가격 허용 기간(1~4일)을 직접 선택해주세요' };
    var asOf = isoTime(manual.priceAsOf);
    if (asOf === null) return { ok: false, code: 'manual-asof', reason: '수동 가격의 실제 기준 일시를 입력해주세요' };
    if (!timestamp(now)) return { ok: false, code: 'clock', reason: '기록 시각을 확인할 수 없습니다' };
    if (asOf > now) return { ok: false, code: 'manual-future', reason: '수동 가격 기준 일시가 미래입니다' };
    if (Math.floor((now + 9 * 3600000) / DAY) - Math.floor((asOf + 9 * 3600000) / DAY) > manual.maxAgeDays) return { ok: false, code: 'manual-stale', reason: '수동 가격이 선택한 ' + manual.maxAgeDays + '일 허용 기간(KST 달력 날짜)을 지났습니다' };
    return { ok: true, value: manual.value, priceAsOf: manual.priceAsOf, maxAgeDays: manual.maxAgeDays };
  }
  function localDay(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function evaluate(input) {
    input = input || {};
    var now = input.now, key = input.key, accounts = input.accounts || {}, missing = [], components = [], manualComponents = [], value = 0, cost = 0, fxUsed = null;
    function fail(account, ticker, code, reason) { missing.push({ account: account, ticker: ticker, code: code, reason: reason }); }
    if (!timestamp(now)) fail(key || 'all', '', 'clock', '기록 시각을 확인할 수 없습니다');
    var keys = key === 'all' ? ACCOUNTS : ACCOUNTS.indexOf(key) >= 0 ? [key] : [];
    if (!keys.length) fail(String(key || ''), '', 'account', '지원하지 않는 계좌입니다');
    if (keys.reduce(function (count, a) { return count + (Array.isArray(accounts[a]) ? accounts[a].length : 0); }, 0) > MAX_ROWS) return { ok: false, missing: [{ account: key, ticker: '', code: 'holdings-limit', reason: '한 번에 확인할 수 있는 종목은 전체 10,000개 이하입니다' }], snapshot: null };
    keys.forEach(function (account) {
      var stocks = accounts[account];
      if (!Array.isArray(stocks)) { fail(account, '', 'holdings', '보유 종목 목록이 올바르지 않습니다'); return; }
      var ids = new Set();
      stocks.forEach(function (stock) {
        var ticker = stock && typeof stock.ticker === 'string' ? stock.ticker : '';
        if (!stock || !Number.isSafeInteger(stock.id) || stock.id < 0 || ids.has(stock.id)) { fail(account, ticker, 'stock-id', '종목 ID가 유효하지 않거나 중복되었습니다'); return; }
        ids.add(stock.id);
        if (!number(stock.quantity, MAX_NUMBER, true)) { fail(account, ticker, 'quantity', '수량이 유효한 범위의 숫자가 아닙니다'); return; }
        if (stock.quantity === 0) return;
        if (!ticker || ticker.length > 100) { fail(account, ticker.slice(0, 100), 'ticker', '보유 종목 코드를 확인해주세요'); return; }
        var currency = account === 'ov' ? 'USD' : 'KRW', prefix = currency === 'USD' ? 'US:' : 'KR:', component = { account: account, stockId: stock.id, ticker: ticker, quantity: stock.quantity, currency: currency, unit: 'per-held-unit', priceAsOf: null, receivedAt: null };
        var quoteKey = prefix + ticker, received = (input.quoteMeta || {})[quoteKey], price;
        if (stock.pricingMode !== undefined && stock.pricingMode !== 'manual' && stock.pricingMode !== 'quote') { fail(account, ticker, 'pricing-mode', '가격 입력 방식을 확인해주세요'); return; }
        if (stock.pricingMode === 'manual') {
          var checked = validateManual(stock.manualPrice, currency, now);
          if (!checked.ok) { fail(account, ticker, checked.code, checked.reason); return; }
          price = checked.value; component.origin = 'manual'; component.priceAsOf = checked.priceAsOf; component.maxAgeDays = checked.maxAgeDays;
        } else if (ticker.indexOf('DEP_') === 0) {
          price = stock.currentPrice; component.origin = 'entered-balance';
        } else {
          price = stock.currentPrice; component.origin = 'session-quote';
          if ((input.freshPrice || {})[quoteKey] !== true) { fail(account, ticker, 'quote-missing', '이번 접속에서 시세를 받지 못했습니다'); return; }
          if (!timestamp(received) || received > now || now - received > DAY) { fail(account, ticker, 'quote-receipt', '시세 수신 시각이 없거나 24시간을 지났습니다'); return; }
          if ((input.quoteValues || {})[quoteKey] !== price) { fail(account, ticker, 'quote-changed', '수신 후 가격이 변경되어 다시 조회해야 합니다'); return; }
          component.receivedAt = new Date(received).toISOString();
        }
        if (!number(price, MAX_NUMBER)) { fail(account, ticker, 'price', '유효한 현재가가 없습니다(평균단가로 대체하지 않음)'); return; }
        if (!number(stock.avgPrice, MAX_NUMBER, true)) { fail(account, ticker, 'cost', '평균단가가 유효한 범위의 숫자가 아닙니다'); return; }
        var rate = 1;
        if (currency === 'USD') {
          var fx = input.fx, fxReceived = (input.quoteMeta || {}).FX;
          if (!number(fx, 1e6) || (input.quoteValues || {}).FX !== fx || !timestamp(fxReceived) || fxReceived > now || now - fxReceived > DAY) { fail(account, ticker, 'fx', '이번 접속에서 받은 유효한 USD/KRW 환율이 없습니다'); return; }
          rate = fx; fxUsed = { value: fx, currencyPair: 'USD/KRW', origin: 'session-quote', priceAsOf: null, receivedAt: new Date(fxReceived).toISOString() };
        }
        var v = stock.quantity * price * rate, c = stock.quantity * stock.avgPrice * rate;
        if (!number(v, MAX_TOTAL) || !number(c, MAX_TOTAL, true) || !number(value + v, MAX_TOTAL) || !number(cost + c, MAX_TOTAL, true)) { fail(account, ticker, 'total-range', '평가금액 또는 매수금이 안전한 숫자 범위를 벗어났습니다'); return; }
        component.price = price; component.avgPrice = stock.avgPrice; components.push(component); value += v; cost += c;
        if (component.origin === 'manual') manualComponents.push({ account: account, stockId: stock.id, ticker: ticker, value: price, priceAsOf: component.priceAsOf, currency: currency, unit: 'per-held-unit', maxAgeDays: component.maxAgeDays });
      });
    });
    if (!components.length && !missing.length) fail(key, '', 'empty', '기록할 보유 자산이 없습니다');
    if (missing.length) return { ok: false, missing: missing, snapshot: null };
    var allKnown = components.every(function (c) { return c.priceAsOf !== null; }) && !fxUsed;
    var asOf = allKnown ? components.reduce(function (oldest, c) { return isoTime(c.priceAsOf) < isoTime(oldest) ? c.priceAsOf : oldest; }, components[0].priceAsOf) : null;
    return { ok: true, missing: [], snapshot: { ts: now, val: value, cost: cost, schemaVersion: 1, recordedAt: new Date(now).toISOString(), origin: manualComponents.length ? 'manual-included' : components.some(function (c) { return c.origin === 'session-quote'; }) ? 'session-quote' : 'entered-balance', priceAsOf: asOf, quality: 'unconfirmed', signalHold: true, manualComponents: manualComponents, components: components, fx: fxUsed } };
  }
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var META_FIELDS = ['schemaVersion', 'origin', 'priceAsOf', 'recordedAt', 'quality', 'signalHold', 'manualComponents', 'components', 'fx'];
  var SCOPE_TYPES = ['holdings', 'cost-basis', 'cost-basis-unknown', 'legacy-unknown'];
  var REASONS = ['price-change', 'price-time-change', 'valuation-input-change', 'scope-change', 'legacy-provenance-unverified'];
  function plain(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    var p = Object.getPrototypeOf(v);
    return p === null || Object.getPrototypeOf(p) === null;
  }
  // Inspect descriptors before reading values: getters, cycles, sparse arrays and
  // non-JSON metadata cannot enter a revision or make serialization lossy.
  function jsonBounded(value) {
    var nodes = 0, path = new Set();
    function visit(v, depth) {
      if (++nodes > MAX_NODES || depth > 30) throw Error('resource-limit');
      if (v === null || typeof v === 'boolean') return;
      if (typeof v === 'number') { if (!Number.isFinite(v) || Math.abs(v) > MAX_TOTAL) throw Error('json-number'); return; }
      if (typeof v === 'string') { if (v.length > MAX_BYTES) throw Error('resource-limit'); return; }
      if ((!Array.isArray(v) && !plain(v)) || path.has(v)) throw Error('json-object');
      if (Array.isArray(v) && v.length > MAX_RECORDS) throw Error('resource-limit');
      var keys = Reflect.ownKeys(v);
      if (keys.length > MAX_RECORDS + (Array.isArray(v) ? 1 : 0)) throw Error('resource-limit');
      if (Array.isArray(v) && keys.length !== v.length + 1) throw Error('json-array');
      path.add(v);
      keys.forEach(function (k) {
        if (Array.isArray(v) && k === 'length') return;
        if (typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].indexOf(k) >= 0 || (Array.isArray(v) && !/^(0|[1-9]\d*)$/.test(k))) throw Error('json-key');
        var d = Object.getOwnPropertyDescriptor(v, k);
        if (!d || !own(d, 'value') || !d.enumerable) throw Error('json-property');
        visit(d.value, depth + 1);
      });
      path.delete(v);
    }
    visit(value, 0);
    var text = JSON.stringify(value), bytes = 0;
    // Count UTF-8 without requiring a browser encoder or allocating another copy.
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 128) bytes++; else if (c < 2048) bytes += 2;
      else if (c >= 0xd800 && c <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else bytes += 3;
      if (bytes > MAX_BYTES) throw Error('resource-limit');
    }
  }
  function near(a, b) { return Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * Number.EPSILON * 16; }
  function nullableTime(v, ts) { return v === null || (isoTime(v) !== null && isoTime(v) <= ts); }
  function id(c) { return c.account + ':' + (own(c, 'stockId') ? 'id:' + c.stockId : 'ticker:' + c.ticker); }
  function known(s) { return s.schemaVersion === 1; }
  function priceTime(s) {
    var times = s.components.map(function (c) { return c.priceAsOf; });
    if (s.fx) times.push(s.fx.priceAsOf);
    var count = times.filter(function (t) { return t !== null; }).length;
    return count === 0 ? 'unknown' : count === times.length ? 'known' : 'mixed';
  }
  function validScope(s) {
    if (!own(s, 'scopeChange') && !own(s, 'comparisonHold')) return true;
    var c = s.scopeChange;
    return s.comparisonHold === true && plain(c) && Array.isArray(c.types) && c.types.length > 0 && c.types.length <= SCOPE_TYPES.length &&
      new Set(c.types).size === c.types.length && c.types.every(function (x) { return SCOPE_TYPES.indexOf(x) >= 0; }) &&
      timestamp(c.previousTs) && c.previousTs <= s.ts && isoTime(c.changedAt) !== null && isoTime(c.changedAt) >= c.previousTs && isoTime(c.changedAt) <= s.ts && c.returnComparable === false &&
      Object.keys(c).every(function (k) { return ['types', 'previousTs', 'changedAt', 'returnComparable'].indexOf(k) >= 0; });
  }
  function validPoint(s, legacy) {
    if (!plain(s) || !timestamp(s.ts) || !number(s.val, MAX_TOTAL, true) || (own(s, 'cost') && !number(s.cost, MAX_TOTAL, true)) || own(s, 'dailyHistory')) return false;
    if (!META_FIELDS.some(function (k) { return own(s, k); })) return !!legacy && !own(s, 'scopeChange') && !own(s, 'comparisonHold');
    if (!META_FIELDS.every(function (k) { return own(s, k); }) || s.schemaVersion !== 1 || !number(s.val, MAX_TOTAL) || !number(s.cost, MAX_TOTAL, true) ||
        isoTime(s.recordedAt) !== s.ts || !nullableTime(s.priceAsOf, s.ts) || s.quality !== 'unconfirmed' || s.signalHold !== true || !validScope(s) ||
        !Array.isArray(s.components) || !s.components.length || s.components.length > MAX_ROWS || !Array.isArray(s.manualComponents) || s.manualComponents.length > MAX_ROWS) return false;
    var ids = new Set(), componentById = new Map(), manualIds = new Set(), total = 0, cost = 0, allCosts = true, usd = false, times = [];
    for (var i = 0; i < s.components.length; i++) {
      var c = s.components[i];
      if (!plain(c) || ACCOUNTS.indexOf(c.account) < 0 || (own(c, 'stockId') && (!Number.isSafeInteger(c.stockId) || c.stockId < 0)) ||
          typeof c.ticker !== 'string' || !c.ticker.trim() || c.ticker.length > 100 || !number(c.quantity, MAX_NUMBER) || !number(c.price, MAX_NUMBER) ||
          c.currency !== (c.account === 'ov' ? 'USD' : 'KRW') || c.unit !== 'per-held-unit' || ['manual', 'session-quote', 'entered-balance'].indexOf(c.origin) < 0 ||
          !own(c, 'priceAsOf') || !own(c, 'receivedAt') || !nullableTime(c.priceAsOf, s.ts) || !nullableTime(c.receivedAt, s.ts) || ids.has(id(c))) return false;
      ids.add(id(c)); componentById.set(id(c), c);
      if (c.origin === 'session-quote' && (c.receivedAt === null || s.ts - isoTime(c.receivedAt) > DAY)) return false;
      if (c.origin !== 'session-quote' && c.receivedAt !== null) return false;
      if (c.origin === 'manual' && !validateManual({ value: c.price, currency: c.currency, unit: c.unit, priceAsOf: c.priceAsOf, maxAgeDays: c.maxAgeDays }, c.currency, s.ts).ok) return false;
      if (c.origin === 'entered-balance' && (c.priceAsOf !== null || c.ticker.indexOf('DEP_') !== 0)) return false;
      var rate = c.currency === 'USD' && s.fx ? s.fx.value : 1;
      usd = usd || c.currency === 'USD';
      total += c.quantity * c.price * rate;
      if (own(c, 'avgPrice')) { if (!number(c.avgPrice, MAX_NUMBER, true)) return false; cost += c.quantity * c.avgPrice * rate; } else allCosts = false;
      times.push(c.priceAsOf);
    }
    for (var j = 0; j < s.manualComponents.length; j++) {
      var m = s.manualComponents[j];
      if (!plain(m) || !validateManual(m, m.currency, s.ts).ok || manualIds.has(id(m))) return false;
      var match = componentById.get(id(m));
      if (!match || match.origin !== 'manual' || m.ticker !== match.ticker || m.value !== match.price || m.priceAsOf !== match.priceAsOf || m.currency !== match.currency || m.unit !== match.unit || m.maxAgeDays !== match.maxAgeDays) return false;
      manualIds.add(id(m));
    }
    var manualCount = s.components.filter(function (c) { return c.origin === 'manual'; }).length;
    var origin = manualCount ? 'manual-included' : s.components.some(function (c) { return c.origin === 'session-quote'; }) ? 'session-quote' : 'entered-balance';
    if (s.origin !== origin || s.manualComponents.length !== manualCount || usd !== (s.fx !== null)) return false;
    if (s.fx !== null) {
      var f = s.fx;
      if (!plain(f) || !number(f.value, 1e6) || f.currencyPair !== 'USD/KRW' || f.origin !== 'session-quote' || !own(f, 'priceAsOf') || !nullableTime(f.priceAsOf, s.ts) ||
          isoTime(f.receivedAt) === null || isoTime(f.receivedAt) > s.ts || s.ts - isoTime(f.receivedAt) > DAY) return false;
      times.push(f.priceAsOf);
    }
    var aggregate = times.indexOf(null) >= 0 ? null : Math.min.apply(null, times.map(isoTime));
    return (aggregate === null ? s.priceAsOf === null : isoTime(s.priceAsOf) === aggregate) && number(total, MAX_TOTAL) && near(total, s.val) && (!allCosts || (number(cost, MAX_TOTAL, true) && near(cost, s.cost)));
  }
  function withoutHistory(s) { var p = Object.assign({}, s); delete p.dailyHistory; return p; }
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    var keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(function (k) { return own(b, k) && equal(a[k], b[k]); });
  }
  function dayAt(ts, offset) {
    var d = new Date(ts - offset * 60000);
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  function validRecord(s) {
    if (!plain(s)) return false;
    if (!own(s, 'dailyHistory')) return validPoint(s, true);
    var h = s.dailyHistory;
    if (!plain(h) || h.version !== 1 || typeof h.localDay !== 'string' || !Array.isArray(h.entries) || h.entries.length < 2 || h.entries.length > MAX_REVISIONS + 1 ||
        Object.keys(h).some(function (k) { return ['version', 'localDay', 'entries'].indexOf(k) < 0; })) return false;
    var last = null;
    for (var i = 0; i < h.entries.length; i++) {
      var e = h.entries[i];
      if (!plain(e) || !validPoint(e.point, i === 0) || !Number.isInteger(e.utcOffsetMinutes) || Math.abs(e.utcOffsetMinutes) > 840 || dayAt(e.point.ts, e.utcOffsetMinutes) !== h.localDay ||
          Object.keys(e).some(function (k) { return (i ? ['point', 'utcOffsetMinutes', 'reason', 'priceTime'] : ['point', 'utcOffsetMinutes']).indexOf(k) < 0; })) return false;
      if (last && (e.point.ts < last.ts || REASONS.indexOf(e.reason) < 0 || e.priceTime !== priceTime(e.point) || h.entries.slice(0, i).some(function (prior) { return regression(prior.point, e.point); }) || evidence(last) === evidence(e.point))) return false;
      if (last) {
        var types = scopeTypes(last, e.point);
        if (types.length) {
          if (!e.point.comparisonHold || !equal(e.point.scopeChange, { types: types, previousTs: last.ts, changedAt: e.point.recordedAt, returnComparable: false })) return false;
        } else if (last.scopeChange) {
          if (e.point.comparisonHold !== true || !equal(e.point.scopeChange, last.scopeChange)) return false;
        } else if (own(e.point, 'scopeChange') || own(e.point, 'comparisonHold')) return false;
        if (e.reason !== revisionReason(last, e.point, types)) return false;
      }
      last = e.point;
    }
    return equal(withoutHistory(s), last);
  }
  function validateRecord(s) {
    try { jsonBounded(s); return { ok: validRecord(s) }; } catch (e) { return { ok: false, code: e.message === 'resource-limit' ? 'resource-limit' : 'invalid-record' }; }
  }
  function scope(s) {
    return s.components.map(function (c) { return [id(c), c.ticker, c.quantity, c.currency, c.unit]; }).sort(function (a, b) { return a[0].localeCompare(b[0]); });
  }
  function scopeTypes(previous, next) {
    if (!known(previous)) return ['legacy-unknown'];
    var types = [];
    if (!equal(scope(previous), scope(next))) types.push('holdings');
    else {
      var old = new Map(previous.components.map(function (c) { return [id(c), c]; }));
      var costsKnown = next.components.every(function (c) { return own(c, 'avgPrice') && own(old.get(id(c)), 'avgPrice'); });
      if (costsKnown && next.components.some(function (c) { return c.avgPrice !== old.get(id(c)).avgPrice; })) types.push('cost-basis');
      else if (!costsKnown && previous.cost !== next.cost) types.push('cost-basis-unknown');
    }
    return types;
  }
  function regression(previous, next) {
    if (!known(previous)) return false;
    var old = new Map(previous.components.map(function (c) { return [id(c), c]; }));
    var backwards = next.components.some(function (c) {
      var p = old.get(id(c));
      return p && p.ticker === c.ticker && p.priceAsOf !== null && (c.priceAsOf === null || isoTime(c.priceAsOf) < isoTime(p.priceAsOf));
    });
    return backwards || (previous.fx && next.fx && previous.fx.priceAsOf !== null && (next.fx.priceAsOf === null || isoTime(next.fx.priceAsOf) < isoTime(previous.fx.priceAsOf)));
  }
  function historyRegression(records, next) {
    return records.some(function (s) { return regression(s, next) || (s.dailyHistory && s.dailyHistory.entries.some(function (e) { return regression(e.point, next); })); });
  }
  function evidence(s) {
    if (!known(s)) return null;
    var cs = s.components.map(function (c) { return [id(c), c.ticker, c.quantity, c.price, own(c, 'avgPrice') ? c.avgPrice : null, c.currency, c.unit, c.origin, c.priceAsOf === null ? null : isoTime(c.priceAsOf), own(c, 'maxAgeDays') ? c.maxAgeDays : null]; });
    cs.sort(function (a, b) { return a[0].localeCompare(b[0]); });
    return JSON.stringify([s.val, s.cost, cs, s.fx ? [s.fx.value, s.fx.currencyPair, s.fx.origin, s.fx.priceAsOf === null ? null : isoTime(s.fx.priceAsOf)] : null]);
  }
  function revisionReason(previous, next, types) {
    if (!known(previous)) return 'legacy-provenance-unverified';
    if (types.length) return 'scope-change';
    var old = new Map(previous.components.map(function (c) { return [id(c), c]; }));
    if (next.components.some(function (c) { return old.get(id(c)).price !== c.price; }) || (previous.fx && next.fx && previous.fx.value !== next.fx.value)) return 'price-change';
    if (next.components.some(function (c) { return isoTime(old.get(id(c)).priceAsOf) !== isoTime(c.priceAsOf); }) || (previous.fx && next.fx && isoTime(previous.fx.priceAsOf) !== isoTime(next.fx.priceAsOf))) return 'price-time-change';
    return 'valuation-input-change';
  }
  function refusal(code, reason) { return { ok: false, changed: false, code: code, reason: reason }; }
  function appendDaily(records, snapshot) {
    try { jsonBounded(records); } catch (e) { return refusal(e.message === 'resource-limit' ? 'resource-limit' : 'existing-invalid', '기존 기록이 손상되었거나 보존 한도를 넘었습니다. 기존 기록은 변경하지 않았습니다'); }
    if (!Array.isArray(records) || records.length > MAX_RECORDS || records.some(function (s) { return !validRecord(s); }) || new Set(records.map(function (s) { return s.ts; })).size !== records.length) return refusal('existing-invalid', '기존 기록 형식을 확인해야 합니다. 기존 기록은 변경하지 않았습니다');
    try { jsonBounded(snapshot); } catch (e) { return refusal(e.message === 'resource-limit' ? 'resource-limit' : 'candidate-invalid', '새 기록 형식 또는 보존 한도가 올바르지 않습니다'); }
    if (!validPoint(snapshot, false) || own(snapshot, 'scopeChange') || own(snapshot, 'comparisonHold')) return refusal('candidate-invalid', '완전한 새 평가기록이 아닙니다. 부분 가격이나 손상된 출처는 기록하지 않습니다');
    var day = localDay(snapshot.ts), sameDay = records.filter(function (s) { return localDay(s.ts) === day; });
    if (sameDay.length > 1) return refusal('day-ambiguous', '같은 날짜에 여러 기존 기록이 있어 자동으로 바꾸지 않았습니다');
    var sorted = records.slice().sort(function (a, b) { return a.ts - b.ts; }), previous = sorted[sorted.length - 1];
    if (previous && snapshot.ts < previous.ts) return refusal('record-time-regression', '기록 시각이 이전 기록보다 과거여서 보류했습니다');
    if (previous && historyRegression(records, snapshot)) return refusal('price-time-regression', '확인된 가격 기준 시각이 과거로 돌아가거나 사라져 보류했습니다. 수신 시각으로 대신하지 않습니다');
    var old = sameDay[0], types = previous ? scopeTypes(previous, snapshot) : [];
    if (old && evidence(old) === evidence(snapshot)) return { ok: true, changed: false, action: 'unchanged', records: records, reason: '가격·수량·출처가 같아 기존 기록을 유지했습니다. 수신 시각만으로 새 가격이라 판단하지 않습니다' };
    if (!old && records.length >= MAX_RECORDS) return refusal('record-limit', '기록 보존 한도에 도달해 새 날짜 기록을 추가하지 않았습니다. 기존 기록은 삭제하지 않습니다');
    if (old && old.dailyHistory && old.dailyHistory.entries.length >= MAX_REVISIONS + 1) return refusal('revision-limit', '하루 수정 이력 보존 한도에 도달해 갱신을 보류했습니다. 기존 이력은 삭제하지 않습니다');
    if (old && old.dailyHistory && old.dailyHistory.localDay !== day) return refusal('day-zone-change', '기기 시간대의 날짜가 기존 수정 이력과 달라 갱신을 보류했습니다');
    var point = JSON.parse(JSON.stringify(snapshot));
    if (types.length) { point.comparisonHold = true; point.scopeChange = { types: types, previousTs: previous.ts, changedAt: snapshot.recordedAt, returnComparable: false }; }
    else if (old && old.scopeChange) { point.comparisonHold = true; point.scopeChange = JSON.parse(JSON.stringify(old.scopeChange)); }
    var next = point, reason = old ? revisionReason(old, point, types) : 'new-day';
    if (old) {
      var entries = old.dailyHistory ? old.dailyHistory.entries.slice() : [{ point: JSON.parse(JSON.stringify(old)), utcOffsetMinutes: new Date(old.ts).getTimezoneOffset() }];
      entries.push({ point: point, utcOffsetMinutes: new Date(point.ts).getTimezoneOffset(), reason: reason, priceTime: priceTime(point) });
      next = Object.assign({}, point, { dailyHistory: { version: 1, localDay: day, entries: entries } });
    }
    var out = records.map(function (s) { return s === old ? next : s; });
    if (!old) out.push(next);
    out.sort(function (a, b) { return a.ts - b.ts; });
    try { jsonBounded(out); } catch (e) { return refusal('resource-limit', '완전한 수정 이력을 보존할 공간 한도를 넘어 갱신하지 않았습니다. 이력은 줄이지 않습니다'); }
    return { ok: true, changed: true, action: old ? 'revised' : 'appended', reason: reason, records: out };
  }
  function comparisonStatus(records, fromTs, toTs, currentCandidate) {
    var reasons = [];
    function hold(reason) { if (reasons.indexOf(reason) < 0) reasons.push(reason); }
    try {
      jsonBounded(records);
      if (!Array.isArray(records) || records.some(function (s) { return !validRecord(s); }) || !timestamp(fromTs) || !timestamp(toTs) || fromTs > toTs) return { hold: true, reasons: ['invalid-history'] };
      var rows = records.filter(function (s) { return s.ts >= fromTs && s.ts <= toTs; }).sort(function (a, b) { return a.ts - b.ts; });
      if (rows.length < 2) hold('insufficient-history');
      rows.forEach(function (s, i) {
        if (!known(s)) hold('legacy-provenance-unknown');
        if (s.comparisonHold) hold('scope-change');
        if (i && known(s)) scopeTypes(rows[i - 1], s).forEach(function (t) { hold(t === 'legacy-unknown' ? 'legacy-provenance-unknown' : t === 'holdings' ? 'scope-change' : 'cost-basis-change'); });
      });
      if (currentCandidate !== undefined) {
        jsonBounded(currentCandidate);
        if (!validPoint(currentCandidate, false)) hold('invalid-current');
        else {
          if (!rows.length || !known(rows[rows.length - 1]) || scopeTypes(rows[rows.length - 1], currentCandidate).length) hold('current-scope-change');
          if (historyRegression(records, currentCandidate)) hold('current-price-time-regression');
        }
      }
    } catch (e) { hold('invalid-history'); }
    return { hold: reasons.length > 0, reasons: reasons };
  }
  return { evaluate: evaluate, appendDaily: appendDaily, comparisonStatus: comparisonStatus, validateRecord: validateRecord, validateManual: validateManual, isoTime: isoTime, localDay: localDay, MAX_NUMBER: MAX_NUMBER, MAX_TOTAL: MAX_TOTAL, MAX_MANUAL_DAYS: 4, MAX_ROWS: MAX_ROWS, MAX_RECORDS: MAX_RECORDS, MAX_REVISIONS: MAX_REVISIONS, MAX_BYTES: MAX_BYTES, MAX_NODES: MAX_NODES };
});
