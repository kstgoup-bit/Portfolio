/* 미국 종목 확정 종가를 두 공급자(Yahoo 이력 · KIS 해외 일봉)로 대조한다. 읽기 전용: 평가가격·신호·투자기록·백업·저장소를 바꾸지 않는다.
 * 목적: 검토 카드의 '시세 독립 대조' 조건(has/review-fin-gate.js의 price)을 사실로 채운다. 국내 보유 종목용 has/kis-crosscheck.js와 같은 원칙(오늘 장중 봉 제외, 같은 날짜끼리, 허용 차이 0.5%).
 * 같은 사용자 GAS를 거치지만 GAS는 전달 수단일 뿐이고 원천은 Yahoo와 KIS로 서로 다르다.
 * 자동 대조(순태씨 2026-11-26 요청): 하루(한국 날짜) 1회만 자동으로 조회한다 — KIS 하루 호출 예산(150회)을 지키려고 시작 전에 오늘 날짜를 기록하고(기록 실패 시 자동 안 함, 실패해도 같은 날 자동 재시도 없음),
 *   결과는 이 기기 전용 키(has_priceVerifyUS_v1, 백업 대상 아님·20시간 유효)에 남겨 앱을 다시 열어도 재조회하지 않는다. 버튼은 그대로 있고 10분 안에는 재조회하지 않는다.
 * 미검증: 미국 KIS 일봉 GAS(has-kis-overseas.gs)는 실제 호출로 확인 전. 수정주가(KIS)와 Yahoo 종가의 배당·분할 차이는 허용 차이를 넘으면 '불일치'로 보수적으로 처리한다.
 * 한 종목 판정 = ok(독립 대조 통과) / 그 밖은 모두 미검증. 투자 자문 아님. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASPriceVerifyUS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (W) {
  'use strict';
  var TOLERANCE_PCT = 0.5, WINDOW = 20, MIN_COMMON = 5, STALE_DAYS = 6, MAX_TICKERS = 5, MIN_GAP_MS = 600000, KIS_ERR = { 'kis-not-configured': 1, 'kis-token': 1, 'kis-budget': 1, 'bad-request': 1, 'kis-failed': 1, 'kis-us-failed': 1, 'kis-base-missing': 1 };
  var SOURCES = { yahoo: 'yahoo-chart-v8', kis: 'kis-overseas-daily' };
  function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function validPrice(x) { return typeof x === 'number' && Number.isFinite(x) && x >= 0.0001 && x <= 1e6; }
  function validTicker(t) { return typeof t === 'string' && /^[A-Z]{1,5}(?:[.-][A-Z])?$/.test(t); }
  function dayGap(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function ny(now) { // 뉴욕 날짜와 시각(HHMM). 서머타임은 Intl이 처리.
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).forEach(function (x) { p[x.type] = x.value; });
    return { day: p.year + '-' + p.month + '-' + p.day, hm: Number(p.hour) * 100 + Number(p.minute) };
  }
  // 확정 종가만 날짜→값. 모양이 어긋나면 null. 뉴욕 오늘 봉은 16:30(마감 30분 뒤) 전에는 제외, 이후는 확정으로 본다.
  function closes(raw, kind, ticker, now) {
    if (!plain(raw) || raw.source !== SOURCES[kind] || raw.currency !== 'USD' || raw.symbol !== ticker || !Array.isArray(raw.bars) || raw.bars.length < 1 || raw.bars.length > 400) return null;
    var t = ny(now), out = Object.create(null);
    for (var i = 0; i < raw.bars.length; i++) {
      var b = raw.bars[i];
      if (!plain(b) || !validDate(b.d) || !validPrice(b.c)) return null;
      if (b.d > t.day || (b.d === t.day && t.hm < 1630) || b.finality === 'provisional' || b.confirmed === false) continue;
      if (Object.prototype.hasOwnProperty.call(out, b.d) && out[b.d] !== b.c) return null;
      out[b.d] = b.c;
    }
    return out;
  }
  function diffPct(a, b) { return Math.abs(a - b) / b * 100; }
  function compare(yahooRaw, kisRaw, options) {
    var o = options || {}, ticker = o.ticker, now = o.now == null ? Date.now() : o.now;
    if (!validTicker(ticker)) return { ok: false, status: 'invalid-ticker' };
    var y = closes(yahooRaw, 'yahoo', ticker, now), k = closes(kisRaw, 'kis', ticker, now);
    if (!k) return { ok: false, status: 'missing-kis' };
    if (!y) return { ok: false, status: 'missing-yahoo' };
    var common = Object.keys(k).filter(function (d) { return Object.prototype.hasOwnProperty.call(y, d); }).sort().reverse().slice(0, WINDOW);
    if (!common.length) return { ok: false, status: 'no-common-date' };
    var rows = common.map(function (d) { var p = diffPct(y[d], k[d]); return { d: d, yahoo: y[d], kis: k[d], diffPct: p, match: p <= TOLERANCE_PCT }; });
    var mismatches = rows.filter(function (r) { return !r.match; }), latest = rows[0];
    var kl = Object.keys(k).sort().pop(), yl = Object.keys(y).sort().pop(), today = ny(now).day;
    var stale = latest.d !== kl || latest.d !== yl ? 'source-lag' : dayGap(latest.d, today) > STALE_DAYS ? 'old' : '';
    var status = !latest.match ? 'mismatch' : stale ? 'stale' : mismatches.length ? 'partial' : rows.length < MIN_COMMON ? 'short' : 'match';
    return { ok: true, status: status, stale: stale, latest: latest, checked: rows.length, matched: rows.length - mismatches.length, mismatches: mismatches.slice(0, 5), kisLatest: kl, yahooLatest: yl };
  }
  // 카드 규칙(has/review-fin-gate.js)이 받는 모양. 통과('match')만 독립 대조 완료, 나머지는 미검증.
  function toTrust(r) {
    if (r && r.ok === true && r.status === 'match' && r.latest && validDate(r.latest.d)) return { verification: 'independent-verified', status: 'ok', marketDate: r.latest.d };
    return { verification: 'unverified', status: r && r.status === 'stale' ? 'stale' : r && r.status === 'mismatch' ? 'date-mismatch' : 'unknown', marketDate: r && r.latest && validDate(r.latest.d) ? r.latest.d : null };
  }
  // ---- 조회(사용자가 버튼을 눌렀을 때만) ----
  var results = Object.create(null), busy = false, lastAt = 0, lastError = '', cbSeq = 0, autoDay = '', hydrated = false, testStorage = null;
  var KEY = 'has_priceVerifyUS_v1', FRESH_MS = 20 * 3600000, MAX_AGE_MS = 24 * 3600000, VERIFS = ['independent-verified', 'unverified'];
  function store() { if (testStorage) return testStorage; try { return W && W.localStorage ? W.localStorage : null; } catch (e) { return null; } }
  function kstDay(now) { var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).forEach(function (x) { p[x.type] = x.value; }); return p.year + '-' + p.month + '-' + p.day; }
  function okItem(t, x, now) {
    return validTicker(t) && plain(x) && typeof x.at === 'number' && Number.isFinite(x.at) && x.at <= now + 60000 && now - x.at <= MAX_AGE_MS && plain(x.trust) && VERIFS.indexOf(x.trust.verification) >= 0 && typeof x.trust.status === 'string' && x.trust.status.length <= 30 &&
      (x.trust.marketDate === null || validDate(x.trust.marketDate)) && plain(x.r) && typeof x.r.status === 'string' && x.r.status.length <= 30 && (x.r.latest === undefined || (plain(x.r.latest) && validDate(x.r.latest.d))) &&
      (x.trust.verification !== 'independent-verified' || (x.trust.status === 'ok' && x.r.ok === true && x.r.status === 'match' && x.trust.marketDate === x.r.latest.d));
  }
  function hydrate(now) { // 저장된 값은 형식·날짜가 맞는 항목만 복원(손상되면 전부 버림). 자동 판정 근거를 저장값으로 조작하지 못하도록 'ok'는 일치 결과와 함께일 때만 인정.
    if (hydrated) return; hydrated = true; var st = store(); if (!st) return;
    try {
      var d = JSON.parse(st.getItem(KEY) || 'null'), n = now == null ? Date.now() : now; if (!plain(d) || d.v !== 1 || !plain(d.items)) return;
      if (typeof d.autoDay === 'string' && validDate(d.autoDay)) autoDay = d.autoDay;
      Object.keys(d.items).slice(0, 40).forEach(function (t) { if (okItem(t, d.items[t], n) && !results[t]) results[t] = { r: d.items[t].r, trust: d.items[t].trust, at: d.items[t].at }; });
    } catch (e) { /* 저장값 손상 → 무시 */ }
  }
  function persist(extraAutoDay) {
    var st = store(); if (!st) return false;
    try {
      var items = {}; Object.keys(results).forEach(function (t) { var x = results[t], l = x.r && x.r.latest ? { d: x.r.latest.d } : undefined; items[t] = { at: x.at, trust: x.trust, r: { ok: !!x.r.ok, status: x.r.status, stale: x.r.stale || '', latest: l } }; });
      st.setItem(KEY, JSON.stringify({ v: 1, autoDay: extraAutoDay || autoDay || '', items: items })); return true;
    } catch (e) { return false; }
  }
  function endpoint() {
    var u = new URL(W && typeof W.gasUrl === 'string' ? W.gasUrl : '');
    if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || u.port || u.username || u.password || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)) throw Error('gas-url');
    u.search = ''; u.hash = ''; return u;
  }
  function jsonp(params) {
    return new Promise(function (resolve, reject) {
      var u; try { u = endpoint(); } catch (e) { reject(e); return; }
      var cb = 'hasPvUs_' + (++cbSeq), script = document.createElement('script'), done = false, timer;
      function finish(err, data) { if (done) return; done = true; clearTimeout(timer); script.onerror = null; script.remove(); try { delete W[cb]; } catch (e) { W[cb] = undefined; } if (err) reject(err); else resolve(data); }
      W[cb] = function (data) { finish(null, data); };
      Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
      u.searchParams.set('callback', cb); script.referrerPolicy = 'no-referrer'; script.src = u.href;
      script.onerror = function () { finish(Error('gas-failed')); };
      timer = setTimeout(function () { finish(Error('gas-timeout')); }, 20000);
      try { document.head.appendChild(script); } catch (e) { finish(e); }
    });
  }
  function verify(tickers, opts) {
    var o = opts || {}, send = o.jsonp || jsonp, nowFn = o.now || Date.now;
    var list = []; (Array.isArray(tickers) ? tickers : []).forEach(function (t) { if (validTicker(t) && list.indexOf(t) < 0) list.push(t); });
    list = list.slice(0, MAX_TICKERS);
    if (busy) return Promise.resolve({ ok: false, reason: 'busy' });
    if (!list.length) return Promise.resolve({ ok: false, reason: 'no-tickers' });
    if (lastAt && nowFn() - lastAt < MIN_GAP_MS) { lastError = 'KIS 호출 한도를 아끼려고 10분 안에는 다시 조회하지 않습니다.'; return Promise.resolve({ ok: false, reason: 'too-soon' }); }
    busy = true; lastError = ''; lastAt = nowFn();
    var yahoo = {}, kis = {}, kisError = '';
    return send({ type: 'history', tickers: list.join(','), market: 'US' }).then(function (d) { if (plain(d)) list.forEach(function (t) { yahoo[t] = d[t]; }); }, function () {})
      .then(function () { return send({ type: 'kis-us', tickers: list.join(',') }).then(function (d) { if (plain(d) && typeof d.error === 'string') { kisError = KIS_ERR[d.error] ? d.error : 'kis-error'; return; } if (plain(d)) list.forEach(function (t) { kis[t] = d[t]; }); }, function () { kisError = 'kis-unreachable'; }); })
      .then(function () {
        var now = nowFn(); list.forEach(function (t) { var r = compare(yahoo[t], kis[t], { ticker: t, now: now }); results[t] = { r: r, trust: toTrust(r), at: now }; });
        if (kisError) lastError = kisError;
        persist();
        return { ok: true, error: kisError || null };
      }).then(function (x) { busy = false; return x; }, function (e) { busy = false; lastError = 'verify-failed'; return { ok: false, reason: 'verify-failed' }; });
  }
  // 카드가 쓰는 입력. 조회 전이거나 오래되면 null(= 미연결로 취급).
  function trustOf(ticker, now) {
    hydrate(now); var x = results[ticker]; if (!x) return null;
    var n = now == null ? Date.now() : now; if (n - x.at > 24 * 3600000) return null;
    return x.trust;
  }
  // 하루 1회 자동 조회. 조건: 저장소 사용 가능, 오늘(한국 날짜) 아직 자동 시도 안 함, 대상 종목 중 20시간 안의 결과가 없는 것이 있음.
  // 자동 시도는 호출 전에 오늘 날짜를 먼저 기록한다(앱을 다시 열어도 같은 날 재시도 없음). 기록하지 못하면 자동 조회하지 않는다.
  function auto(tickers, opts) {
    var o = opts || {}, nowFn = o.now || Date.now, now = nowFn(), list = [];
    (Array.isArray(tickers) ? tickers : []).forEach(function (t) { if (validTicker(t) && list.indexOf(t) < 0) list.push(t); });
    list = list.slice(0, MAX_TICKERS);
    if (!list.length) return Promise.resolve({ ok: false, reason: 'no-tickers' });
    hydrate(now);
    if (!store()) return Promise.resolve({ ok: false, reason: 'no-storage' });
    if (list.every(function (t) { return results[t] && now - results[t].at <= FRESH_MS; })) return Promise.resolve({ ok: false, reason: 'fresh' });
    var day = kstDay(now);
    if (autoDay === day) return Promise.resolve({ ok: false, reason: 'already-tried-today' });
    if (busy) return Promise.resolve({ ok: false, reason: 'busy' });
    var prev = autoDay; autoDay = day;
    if (!persist(day)) { autoDay = prev; return Promise.resolve({ ok: false, reason: 'no-storage-write' }); }
    return verify(list, o);
  }
  return Object.freeze({ compare: compare, toTrust: toTrust, verify: verify, auto: auto, trustOf: trustOf, resultOf: function (t) { return results[t] || null; }, isBusy: function () { return busy; }, lastError: function () { return lastError; }, _reset: function (st) { results = Object.create(null); busy = false; lastAt = 0; lastError = ''; autoDay = ''; hydrated = false; testStorage = st || null; }, autoDayOf: function () { return autoDay; }, TOLERANCE_PCT: TOLERANCE_PCT, MIN_COMMON: MIN_COMMON, MAX_TICKERS: MAX_TICKERS });
});
