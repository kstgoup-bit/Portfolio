/* HAS — 가격 메타 계약 v1 (GPT-20261117-0731 1단계: 설계·합성 시험 전용).
   ※ 이 파일은 portfolio_v5.html 이 불러오지 않는다. 운영 동작·GAS·저장 자료를 바꾸지 않는다.
   순수 함수 — 저장소·네트워크·타이머·DOM 접근 없음. 입력 객체를 바꾸지 않는다.
   용어(엄격 분리): source = 원천 가격 공급자, transport = 사용자 GAS(전달 경로, 출처 아님),
   asOf = 공급자가 밝힌 가격 관측 기준시각, receivedAt = GAS 서버 수신시각, appReceivedAt = 앱 수신시각(절대 asOf로 승격 금지).
   상태: U = 메타 없음(기존 호환, '미확인') · A = 메타가 붙은 단일 출처(독립 검증 아님) · B = 앱이 두 독립 공급자를 직접 대조해 일치
         · C = 근거 불충분/불일치/오래됨. GAS 응답의 자가 선언(verification 등)으로는 절대 B가 되지 않는다.
   0730 지피 1030 CR 반영(v1.1):
   CR-1 signalPolicy 는 문자열 'B'를 믿지 않는다 — 같은 계약 인스턴스의 crossCheck 가 발급한(WeakSet 등록·동결) 증거 객체만 인정.
   CR-2 공급자 이름(source)은 표시용. 독립성은 앱 코드가 정한 경로(route, 응답이 아닌 호출 문맥)와 앱 내부 신뢰 설정(routes: 승인·원천 계보)으로만 판정.
        기본 인스턴스는 승인 경로가 0개 → 운영에서는 B가 만들어지지 않는다.
   CR-3 정규장 종가는 거래소 현지 마감 시각(DST 포함, Intl 시간대) 이후여야 하고, 검증된 휴장·조기폐장 달력(closeCalendar)이 없으면 B 금지.
   CR-4 허용오차는 고정 정책값(0.5%, 설계 제안·공식 검증 아님) 이하의 유한 비음수만 허용, 그 외는 보류. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASQuoteMetaContract = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createContract(config) {
  var SCHEMA = 'has-quote-meta-v1', META_KEY = '__quoteMeta', MAX_QUOTES = 200, MAX_TEXT = 64, CLOCK_SKEW_MS = 60000;
  var KINDS = Object.freeze(['regular-close', 'delayed', 'intraday']), ADJ = Object.freeze(['none', 'split', 'split+dividend']);
  var CURRENCY = Object.freeze({ US: 'USD', KR: 'KRW' }), TZ = Object.freeze({ US: 'America/New_York', KR: 'Asia/Seoul' });
  /* 정규장 표준 마감(거래소 현지). 조기폐장·휴장은 반영하지 않음 → 검증된 closeCalendar 없이는 B 금지(CR-3). 출처: NYSE/Nasdaq 정규장 16:00 ET, KRX 정규장 15:30 KST(2026-11-17 기준 일반 지식, 달력은 미검증). */
  var STD_CLOSE = Object.freeze({ US: '16:00', KR: '15:30' });
  /* GAS·앱 경로 이름은 '출처'가 될 수 없다(전달 경로일 뿐). */
  var TRANSPORT_NAMES = Object.freeze(['gas', 'gas-jsonp', 'apps-script', 'google-apps-script', 'user-gas', 'has', 'app', 'manual', 'unknown', 'synthetic']);
  var CLOSE_STALE_DAYS = 4, LIVE_STALE_MS = 24 * 3600000, CROSS_TOLERANCE = 0.005;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null); };
  var text = function (s) { return typeof s === 'string' && s.trim().length > 0 && s.length <= MAX_TEXT; };
  var priceOk = function (p) { return typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= 1e12; };
  var tickerOk = function (t) { return typeof t === 'string' && /^[A-Za-z0-9.\-]{1,15}$/.test(t); };
  var dayOk = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; };
  /* 오프셋(Z 또는 ±hh:mm)이 반드시 있는 ISO-8601만 인정 */
  var tsOk = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s) && dayOk(s.slice(0, 10)) && !isNaN(Date.parse(s)) && +s.slice(11, 13) < 24 && +s.slice(14, 16) < 60 && +s.slice(17, 19) < 60; };
  function exchangeDate(iso, market) {
    var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ[market], year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function exchangeTime(iso, market) {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: TZ[market], hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    return p.hour + ':' + p.minute;
  }
  var hhmm = function (s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); };
  var isTransport = function (s) { return TRANSPORT_NAMES.indexOf(String(s).trim().toLowerCase()) >= 0; };

  /* 앱 내부 신뢰 설정(코드에서만 정함, GAS 응답에서 오지 않음). 형식이 틀린 항목은 버린다(fail-closed). */
  var cfg = plain(config) ? config : {}, ROUTES = {};
  if (plain(cfg.routes)) Object.keys(cfg.routes).forEach(function (id) {
    var r = cfg.routes[id];
    if (/^[a-z0-9-]{1,32}$/.test(id) && plain(r) && r.approved === true && text(r.upstream)) ROUTES[id] = Object.freeze({ upstream: r.upstream.trim().toLowerCase() });
  });
  Object.freeze(ROUTES);
  var CAL = typeof cfg.closeCalendar === 'function' ? cfg.closeCalendar : null;
  var issuedA = new WeakSet(), issuedB = new WeakSet();

  /* 한 종목 메타 검증 → { state:'A'|'C', reasons:[], flags:[], meta } (가격은 이미 숫자로 확인된 상태) */
  function checkQuote(ticker, m, ctx) {
    var r = [], flags = [], mk = ctx.market;
    if (!plain(m)) return { state: 'C', reasons: ['메타 형식 오류'], flags: flags, meta: null };
    if (m.market !== mk) r.push('시장 불일치');
    if (m.currency !== CURRENCY[mk]) r.push('통화 불일치');
    if (!text(m.source)) r.push('원천 공급자 없음');
    else if (isTransport(m.source)) r.push('전달 경로(GAS 등)를 출처로 표기 — 출처 아님');
    if (!tsOk(m.asOf)) r.push('기준시각 없음 또는 오프셋 없는 시각');
    if (!dayOk(m.marketDate)) r.push('시장일 없음/오류');
    if (KINDS.indexOf(m.kind) < 0) r.push('가격 종류 미확인');
    if (ADJ.indexOf(m.adjusted) < 0) r.push('조정 여부 미확인');
    if (own(m, 'verification') || own(m, 'verified') || own(m, 'independent')) flags.push('self-declared-verification-ignored');
    if (own(m, 'route') || own(m, 'upstream') || own(m, 'lineage')) flags.push('self-declared-route-ignored');
    if (m.corporateActionSuspected === true) r.push('기업행위(분할·배당) 의심');
    var now = Date.parse(ctx.now);
    if (tsOk(m.asOf)) {
      var at = Date.parse(m.asOf);
      if (at > now + CLOCK_SKEW_MS) r.push('미래 기준시각');
      if (dayOk(m.marketDate) && exchangeDate(m.asOf, mk) !== m.marketDate) r.push('기준시각과 거래소 시장일 불일치');
      if (m.kind === 'regular-close') {
        var today = exchangeDate(ctx.now, mk), age = dayOk(m.marketDate) ? Math.floor((Date.parse(today) - Date.parse(m.marketDate)) / 86400000) : null;
        if (age !== null && age > CLOSE_STALE_DAYS) r.push('오래된 종가(' + age + '일 전)');
        if (exchangeTime(m.asOf, mk) < STD_CLOSE[mk]) r.push('정규장 마감 전 시각을 종가로 표기');
        if (!CAL) flags.push('close-calendar-unverified');
      } else if (KINDS.indexOf(m.kind) >= 0 && now - at > LIVE_STALE_MS) r.push('오래된 장중/지연 가격');
      if (m.kind === 'intraday') flags.push('intraday');
    }
    if (dayOk(m.marketDate)) { var dow = new Date(m.marketDate + 'T12:00:00Z').getUTCDay(); if (dow === 0 || dow === 6) r.push('주말 시장일 — 휴장일 값 의심'); }
    if (m.receivedAt != null) {
      if (!tsOk(m.receivedAt)) r.push('GAS 수신시각 형식 오류');
      else if (Date.parse(m.receivedAt) > now + CLOCK_SKEW_MS) r.push('미래 GAS 수신시각');
      else if (tsOk(m.asOf) && Date.parse(m.receivedAt) + CLOCK_SKEW_MS < Date.parse(m.asOf)) r.push('수신시각이 기준시각보다 이전');
    }
    var meta = { ticker: ticker, market: m.market, currency: m.currency, source: text(m.source) ? m.source.trim() : null, transport: 'user-gas',
      asOf: tsOk(m.asOf) ? m.asOf : null, marketDate: dayOk(m.marketDate) ? m.marketDate : null, kind: KINDS.indexOf(m.kind) >= 0 ? m.kind : 'unknown',
      adjusted: ADJ.indexOf(m.adjusted) >= 0 ? m.adjusted : 'unknown', receivedAt: tsOk(m.receivedAt) ? m.receivedAt : null, appReceivedAt: ctx.appReceivedAt || null,
      route: typeof ctx.route === 'string' && own(ROUTES, ctx.route) ? ctx.route : null };
    return { state: r.length ? 'C' : 'A', reasons: r, flags: flags, meta: Object.freeze(meta) };
  }

  /* GAS JSONP 응답 해석. ctx = { market:'US'|'KR', tickers:[요청 종목], now:ISO, appReceivedAt:ISO }.
     기존 평면 응답 {"AAPL":100}은 그대로 U(미확인)로 받아 지금과 똑같이 가격만 쓴다. 메타가 잘못되면 메타만 버리고 가격 처리는 현행과 동일(fail-closed = 미확인). */
  /* 시세 객체를 동결하고 A 시세만 이 인스턴스 발급 목록에 등록(호출자가 만든 가짜 A 객체로 대조 불가) */
  function seal(out) {
    Object.keys(out.quotes).forEach(function (t) { var q = out.quotes[t]; Object.freeze(q.reasons); Object.freeze(q.flags); Object.freeze(q); if (q.state === 'A') issuedA.add(q); });
    Object.freeze(out.issues); Object.freeze(out.quotes); return Object.freeze(out);
  }
  function parseResponse(data, ctx) {
    var out = { schema: 'none', quotes: {}, issues: [], mixedSource: false };
    if (!ctx || !CURRENCY[ctx.market] || !tsOk(ctx.now) || !Array.isArray(ctx.tickers)) { out.issues.push('호출 문맥 오류'); return out; }
    if (!plain(data)) { out.issues.push('응답 형식 오류'); return out; }
    var wanted = ctx.tickers.filter(tickerOk);
    wanted.forEach(function (t) { var p = own(data, t) ? data[t] : undefined; if (priceOk(p)) out.quotes[t] = { price: p, state: 'U', reasons: ['메타 없음 — 출처·기준시각 미확인'], flags: [], meta: null }; });
    Object.keys(data).forEach(function (k) { if (k !== META_KEY && k.indexOf('__') === 0) out.issues.push('알 수 없는 예약 키 무시: ' + k.slice(0, 20)); });
    if (!own(data, META_KEY)) return seal(out);
    var mm = data[META_KEY];
    if (!plain(mm) || mm.schema !== SCHEMA || !plain(mm.quotes)) { out.schema = 'invalid'; out.issues.push('메타 스키마 불일치 — 메타 전체 무시(미확인)'); return seal(out); }
    var keys = Object.keys(mm.quotes);
    if (keys.length > MAX_QUOTES) { out.schema = 'invalid'; out.issues.push('메타 종목 수 상한 초과 — 메타 전체 무시'); return seal(out); }
    out.schema = SCHEMA;
    keys.forEach(function (t) { if (!out.quotes[t]) out.issues.push('가격 없는 메타 무시: ' + String(t).slice(0, 15)); });
    var sources = {};
    Object.keys(out.quotes).forEach(function (t) {
      if (!own(mm.quotes, t)) return; /* 부분 메타: 이 종목은 U 유지 */
      var c = checkQuote(t, mm.quotes[t], ctx), q = out.quotes[t];
      q.state = c.state; q.reasons = c.reasons; q.flags = c.flags; q.meta = c.meta;
      if (c.state === 'A') sources[c.meta.source.toLowerCase()] = true;
    });
    if (Object.keys(sources).length > 1) { out.mixedSource = true; out.issues.push('한 응답 안에 공급자 혼용'); Object.keys(out.quotes).forEach(function (t) { if (out.quotes[t].state === 'A') out.quotes[t].flags.push('mixed-source'); }); }
    return seal(out);
  }

  /* B 판정: 앱이 이 인스턴스가 발급한 두 A 시세를 직접 대조. 같은 시장·종목·시장일·정규장 종가·조정기준·통화,
     서로 다른 승인 경로 + 서로 다른 원천 계보(CR-2), 검증 달력상 거래일·마감 이후(CR-3), 고정 허용오차(CR-4)일 때만. */
  function crossCheck(qa, qb, opts) {
    var tol = CROSS_TOLERANCE, why = [];
    if (opts != null && !plain(opts)) return { state: 'C', reasons: ['대조 옵션 형식 오류 — 보류'] };
    if (opts && own(opts, 'tolerance')) {
      var t = opts.tolerance;
      if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > CROSS_TOLERANCE) return { state: 'C', reasons: ['허용오차 비정상(정책 상한 ' + (CROSS_TOLERANCE * 100) + '% 초과·음수·비유한) — 보류'] };
      tol = t;
    }
    if (!qa || !qb || qa.state !== 'A' || qb.state !== 'A') return { state: 'C', reasons: ['A 상태 시세 두 개가 필요'] };
    if (!issuedA.has(qa) || !issuedA.has(qb)) return { state: 'C', reasons: ['이 계약이 발급하지 않은 시세 — 보류'] };
    var a = qa.meta, b = qb.meta;
    if (a.ticker !== b.ticker || a.market !== b.market) why.push('종목·시장 불일치');
    if (a.currency !== b.currency) why.push('통화 불일치');
    if (a.marketDate !== b.marketDate) why.push('시장일 불일치');
    if (a.kind !== 'regular-close' || b.kind !== 'regular-close') why.push('정규장 종가끼리만 대조');
    if (a.adjusted !== b.adjusted) why.push('조정 기준 불일치');
    /* 공급자 이름은 독립성 근거가 아니다 */
    if (!a.route || !b.route) why.push('승인된 수집 경로 없음 — 독립성 미확인');
    else if (a.route === b.route) why.push('같은 수집 경로 — 독립 아님');
    else if (ROUTES[a.route].upstream === ROUTES[b.route].upstream) why.push('같은 원천 계보(재포장) — 독립 아님');
    if (!why.length) {
      var cal = null; try { cal = CAL ? CAL(a.market, a.marketDate) : null; } catch (e) { cal = null; }
      if (!plain(cal)) why.push('휴장·조기폐장 달력 미검증 — 종가 확정 근거 없음');
      else if (cal.trading !== true || !hhmm(cal.close)) why.push('달력상 거래일 아님 또는 마감 시각 오류');
      else if (exchangeTime(a.asOf, a.market) < cal.close || exchangeTime(b.asOf, b.market) < cal.close) why.push('달력상 마감 전 시각 — 종가 아님');
    }
    if (why.length) return { state: 'C', reasons: why };
    var diff = Math.abs(qa.price - qb.price) / Math.min(qa.price, qb.price);
    if (!(diff <= tol)) return { state: 'C', reasons: ['독립 가격 충돌(' + (diff * 100).toFixed(2) + '%)'], diff: diff };
    var ev = Object.freeze({ state: 'B', reasons: Object.freeze([]), diff: diff, tolerance: tol, ticker: a.ticker, market: a.market, marketDate: a.marketDate,
      prices: Object.freeze([qa.price, qb.price]), sources: Object.freeze([a.source, b.source]), routes: Object.freeze([a.route, b.route]),
      upstreams: Object.freeze([ROUTES[a.route].upstream, ROUTES[b.route].upstream]), rule: 'regular-close/same-adjusted/independent-route/calendar-close' });
    issuedB.add(ev); return ev;
  }

  /* 신호 보류 해제 정책: A·U·C는 절대 해제하지 않음. B여도 재무·본질가치·공시/뉴스·반론 관문이 모두 정확히 true여야 '검토 후보'. 최종 결정은 순태씨. */
  var GATES = Object.freeze(['fundamentals', 'valuation', 'disclosure', 'counterArgument']);
  function signalPolicy(evidence, gates) {
    if (evidence === 'B') return { hold: true, reason: '증거 없는 B 문자열 — 앱 내부 대조 증거 필요, 판단 보류' };
    if (evidence && typeof evidence === 'object') {
      if (!issuedB.has(evidence)) return { hold: true, reason: '이 계약이 발급하지 않은 대조 증거 — 판단 보류' };
      return gatesPolicy(gates);
    }
    var priceState = evidence;
    return { hold: true, reason: priceState === 'A' ? '단일 출처 가격(독립 대조 전) — 판단 보류' : priceState === 'C' ? '가격 근거 불충분/불일치 — 판단 보류' : '가격 출처·기준시각 미확인 — 판단 보류' };
  }
  function gatesPolicy(gates) {
    var g = plain(gates) ? gates : {}, miss = GATES.filter(function (k) { return g[k] !== true; });
    if (miss.length) return { hold: true, reason: '가격은 독립 대조됐지만 관문 미통과: ' + miss.join(', ') };
    return { hold: false, reason: '검토 후보 — 최종 결정은 순태씨' };
  }

  /* 한 줄 띠 상태: 실제 이상만 강조(alert), 그 외 '미확인'·단일 출처는 중립(neutral)으로 짧게 — 숨기지 않음.
     items = [{ticker, state, reasons}], ctx = { fetchFailed:n, adjustedChanged:n } */
  var ALERT_ORDER = [
    ['fetch-failed', '조회 실패'], ['mismatch', '종목·시장·통화 불일치'], ['conflict', '가격 충돌'], ['adjusted-change', '조정 여부 변경'], ['stale', '기준시각 경과'], ['future', '미래 시각']
  ];
  function classifyReason(s) {
    if (/불일치/.test(s) && /(시장|통화|종목)/.test(s) && !/시장일/.test(s)) return 'mismatch';
    if (/충돌/.test(s)) return 'conflict';
    if (/오래된/.test(s)) return 'stale';
    if (/미래/.test(s)) return 'future';
    return null;
  }
  function band(items, ctx) {
    var count = { U: 0, A: 0, B: 0, C: 0 }, alerts = {};
    (items || []).forEach(function (q) { if (!q || !count.hasOwnProperty(q.state)) return; count[q.state]++; if (q.state === 'C') (q.reasons || []).forEach(function (s) { var k = classifyReason(s); if (k) alerts[k] = (alerts[k] || 0) + 1; }); });
    var c = ctx || {}; if (c.fetchFailed > 0) alerts['fetch-failed'] = c.fetchFailed; if (c.adjustedChanged > 0) alerts['adjusted-change'] = c.adjustedChanged;
    for (var i = 0; i < ALERT_ORDER.length; i++) { var k = ALERT_ORDER[i][0]; if (alerts[k]) return { level: 'alert', key: k, label: '⚠ ' + ALERT_ORDER[i][1] + ' ' + alerts[k] + '종목 — 판단 보류', counts: count }; }
    var parts = [];
    if (count.B) parts.push('독립 대조 ' + count.B);
    if (count.A) parts.push('출처 표시(단일) ' + count.A);
    if (count.U) parts.push('미확인 ' + count.U);
    if (count.C) parts.push('근거 부족 ' + count.C);
    return { level: 'neutral', key: 'neutral', label: '가격 출처: ' + (parts.join(' · ') || '자료 없음'), counts: count };
  }
  return Object.freeze({ SCHEMA: SCHEMA, META_KEY: META_KEY, MAX_QUOTES: MAX_QUOTES, KINDS: KINDS, ADJ: ADJ, TRANSPORT_NAMES: TRANSPORT_NAMES, CROSS_TOLERANCE: CROSS_TOLERANCE,
    STD_CLOSE: STD_CLOSE, approvedRoutes: function () { return Object.keys(ROUTES); }, hasCloseCalendar: !!CAL,
    isTimestamp: tsOk, parseResponse: parseResponse, checkQuote: checkQuote, crossCheck: crossCheck, signalPolicy: signalPolicy, band: band, GATES: GATES, createContract: createContract });
  }
  /* 기본 인스턴스: 승인 경로 0개·달력 없음 → B 불가(운영 안전 기본값) */
  return createContract({});
});
