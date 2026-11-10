(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HASSnapshotPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Pure, bounded recording policy. Receipt time is NOT a market price timestamp.
  var DAY = 86400000, MAX_NUMBER = 1e12, MAX_TOTAL = Number.MAX_SAFE_INTEGER;
  var ACCOUNTS = ['dom', 'ov', 'pen', 'gen'], MAX_ROWS = 10000;
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
        component.price = price; components.push(component); value += v; cost += c;
        if (component.origin === 'manual') manualComponents.push({ account: account, stockId: stock.id, ticker: ticker, value: price, priceAsOf: component.priceAsOf, currency: currency, unit: 'per-held-unit', maxAgeDays: component.maxAgeDays });
      });
    });
    if (!components.length && !missing.length) fail(key, '', 'empty', '기록할 보유 자산이 없습니다');
    if (missing.length) return { ok: false, missing: missing, snapshot: null };
    var allKnown = components.every(function (c) { return c.priceAsOf !== null; }) && !fxUsed;
    var asOf = allKnown ? components.reduce(function (oldest, c) { return isoTime(c.priceAsOf) < isoTime(oldest) ? c.priceAsOf : oldest; }, components[0].priceAsOf) : null;
    return { ok: true, missing: [], snapshot: { ts: now, val: value, cost: cost, schemaVersion: 1, recordedAt: new Date(now).toISOString(), origin: manualComponents.length ? 'manual-included' : components.some(function (c) { return c.origin === 'session-quote'; }) ? 'session-quote' : 'entered-balance', priceAsOf: asOf, quality: 'unconfirmed', signalHold: true, manualComponents: manualComponents, components: components, fx: fxUsed } };
  }
  function appendDaily(records, snapshot) {
    if (!Array.isArray(records) || records.length >= 50000 || records.some(function (s) { return !s || !timestamp(s.ts) || !number(s.val, MAX_TOTAL, true) || (s.cost !== undefined && !number(s.cost, MAX_TOTAL, true)); })) return { ok: false, code: 'existing-invalid', reason: '기존 기록 형식을 확인해야 합니다. 기존 기록은 변경하지 않았습니다' };
    if (!snapshot || !timestamp(snapshot.ts) || !number(snapshot.val, MAX_TOTAL) || !number(snapshot.cost, MAX_TOTAL, true) || snapshot.schemaVersion !== 1 || snapshot.quality !== 'unconfirmed' || snapshot.signalHold !== true) return { ok: false, code: 'candidate-invalid', reason: '새 기록 형식이 올바르지 않습니다' };
    if (records.some(function (s) { return localDay(s.ts) === localDay(snapshot.ts); })) return { ok: false, code: 'day-exists', reason: '오늘 기록이 이미 있어 그대로 보존했습니다. 덮어쓰지 않습니다' };
    return { ok: true, records: records.concat([snapshot]).sort(function (a, b) { return a.ts - b.ts; }) };
  }
  return { evaluate: evaluate, appendDaily: appendDaily, validateManual: validateManual, isoTime: isoTime, localDay: localDay, MAX_NUMBER: MAX_NUMBER, MAX_TOTAL: MAX_TOTAL, MAX_MANUAL_DAYS: 4, MAX_ROWS: MAX_ROWS };
});
