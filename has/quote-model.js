/* HAS 23단계 — 모바일 시세 "계약" 모델(순수 함수, 저장소·네트워크·타이머 없음). 실제 시세 조회는 하지 않는다.
   앞으로 어떤 중계·공급자가 와도 이 모양으로 들어와야 화면에 표시된다. 모르는 값은 '미확인'으로 두고 만들어내지 않는다.
   원칙: ① 실시간 표시는 공급자가 명시하고 시각이 5분 이내일 때만 ② 조회 실패는 기존 값·투자기록을 바꾸지 않는다
         ③ 마지막 '검증' 가격과 '현재' 가격을 구분해 보여준다 ④ 환율도 출처·적용시각 없이는 확정 표시하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASQuoteModel = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KINDS = Object.freeze(['realtime', 'delayed', 'close', 'unknown']);
  var KIND_LABEL = Object.freeze({ realtime: '실시간', delayed: '지연', close: '종가', unknown: '미확인' });
  var REALTIME_MAX_MIN = 5, DELAYED_MAX_MIN = 24 * 60, STALE_DAYS = 4;
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  var dayOk = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); };
  var tsOk = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !isNaN(Date.parse(s)); };
  var UNK = '미확인';

  /* 공급자(중계) 응답 → 표준 시세. 검증 못 하면 ok:false. 숫자 가격이 없으면 가격을 만들지 않는다. */
  function normalize(raw) {
    var issues = [], r = raw && typeof raw === 'object' ? raw : null;
    if (!r) return { ok: false, issues: ['응답 형식 오류'], quote: null };
    var price = typeof r.price === 'string' ? Number(r.price.replace(/,/g, '')) : r.price;
    if (!fin(price) || price <= 0) issues.push('가격 없음/0 이하');
    var ticker = typeof r.ticker === 'string' && r.ticker.trim() ? r.ticker.trim() : null; if (!ticker) issues.push('종목코드 없음');
    var market = r.market === 'KR' || r.market === 'US' ? r.market : null; if (!market) issues.push('시장(KR/US) 없음');
    var currency = r.currency === 'KRW' || r.currency === 'USD' ? r.currency : null; if (!currency) issues.push('통화 없음');
    if (market === 'KR' && currency === 'USD' || market === 'US' && currency === 'KRW') issues.push('시장과 통화 불일치');
    if (issues.length) return { ok: false, issues: issues, quote: null };
    var kind = KINDS.indexOf(r.kind) >= 0 ? r.kind : 'unknown';
    return { ok: true, issues: [], quote: Object.freeze({
      ticker: ticker, market: market, price: price, currency: currency, kind: kind,
      asOfDate: dayOk(r.asOfDate) ? r.asOfDate : null, asOfTime: tsOk(r.asOfTime) ? r.asOfTime : null, fetchedAt: tsOk(r.fetchedAt) ? r.fetchedAt : null,
      synthetic: r.synthetic === true, source: typeof r.source === 'string' && r.source.trim() ? r.source.trim() : null, verification: r.verification === 'independent-verified' ? 'independent-verified' : 'unverified' }) };
  }
  function minutesBetween(aISO, bISO) { return (Date.parse(bISO) - Date.parse(aISO)) / 60000; }
  /* 화면에 쓸 구분. '실시간'은 공급자가 realtime이라 하고 기준시각이 있고 5분 이내일 때만. */
  function classify(q, nowISO) {
    if (!q) return { kind: 'unknown', label: KIND_LABEL.unknown, note: '시세 없음', stale: true, ageMinutes: null };
    var age = q.asOfTime && tsOk(nowISO) ? minutesBetween(q.asOfTime, nowISO) : null, kind = q.kind, note = '';
    if (kind === 'realtime') { if (age === null) { kind = 'unknown'; note = '실시간이라 했으나 기준시각 없음'; } else if (age > REALTIME_MAX_MIN || age < -1) { kind = 'delayed'; note = '실시간 표시 조건(5분 이내) 불충족 → 지연으로 표시'; } }
    if (kind === 'delayed' && age !== null && age > DELAYED_MAX_MIN) { kind = 'unknown'; note = '기준시각이 하루를 넘어 지연 아님'; }
    var days = q.asOfDate && tsOk(nowISO) ? Math.floor((Date.parse(String(nowISO).slice(0, 10)) - Date.parse(q.asOfDate)) / 86400000) : null;
    var stale = days === null ? true : days > STALE_DAYS;
    if (!q.source) note = (note ? note + ' · ' : '') + '출처 없음';
    return { kind: kind, label: KIND_LABEL[kind], note: note, stale: stale, ageMinutes: age, ageDays: days };
  }
  /* 판단·신호에 쓸 수 있는 시세인가. 미검증·출처/기준일 없음·오래됨·종류 미확인은 사용 불가(표시는 가능). */
  function usableForSignals(q, nowISO) {
    var c = classify(q, nowISO), why = [];
    if (!q) return { ok: false, why: ['시세 없음'] };
    if (q.verification !== 'independent-verified') why.push('독립 검증 전(미검증)');
    if (!q.source) why.push('출처 없음'); if (!q.asOfDate) why.push('기준일 없음'); if (c.stale) why.push('오래됨 또는 기준일 불명'); if (c.kind === 'unknown') why.push('가격 종류 미확인');
    return { ok: why.length === 0, why: why };
  }
  /* 가격 장부(PriceBook): 종목별 current(마지막 성공 조회)와 lastVerified(마지막 독립 검증). 입력을 바꾸지 않는다. */
  function emptyBook() { return Object.freeze({ current: Object.freeze({}), lastVerified: Object.freeze({}), errors: Object.freeze({}) }); }
  function applyFetch(book, ticker, result, nowISO) {
    var b = book || emptyBook(), cur = Object.assign({}, b.current), lv = Object.assign({}, b.lastVerified), er = Object.assign({}, b.errors);
    if (result && result.ok && result.quote && result.quote.ticker === ticker) { cur[ticker] = result.quote; delete er[ticker]; if (result.quote.verification === 'independent-verified') lv[ticker] = result.quote; }
    else er[ticker] = { at: nowISO || null, issues: result && result.issues ? result.issues.slice() : ['조회 실패'] };
    return Object.freeze({ current: Object.freeze(cur), lastVerified: Object.freeze(lv), errors: Object.freeze(er) });
  }
  /* 화면용 보기. 현재 가격과 마지막 검증 가격을 섞지 않는다. 조회 실패면 직전 값을 '이전 값'으로 명시. */
  function view(book, ticker, nowISO) {
    var b = book || emptyBook(), cur = b.current[ticker] || null, lv = b.lastVerified[ticker] || null, er = b.errors[ticker] || null;
    var c = classify(cur, nowISO), out = { ticker: ticker, current: null, lastVerified: null, state: 'none', warnings: [] };
    if (cur) out.current = { price: cur.price, currency: cur.currency, kind: c.label, asOfDate: cur.asOfDate || UNK, asOfTime: cur.asOfTime || UNK, source: cur.source || UNK, verification: cur.verification === 'independent-verified' ? '독립 대조 완료' : '미검증', stale: c.stale, note: c.note };
    if (lv) { var lc = classify(lv, nowISO); out.lastVerified = { price: lv.price, currency: lv.currency, asOfDate: lv.asOfDate || UNK, source: lv.source || UNK, stale: lc.stale }; }
    if (er) { out.state = cur ? 'fetch-failed-showing-previous' : 'fetch-failed-no-data'; out.warnings.push('이번 조회 실패 — 아래 값은 최신이 아닙니다'); }
    else out.state = cur ? (c.stale ? 'stale' : 'current') : (lv ? 'last-verified-only' : 'none');
    if (cur && c.stale) out.warnings.push('오래된 가격입니다');
    if (cur && cur.verification !== 'independent-verified') out.warnings.push('미검증 가격 — 신호·조언에 쓰지 않습니다');
    return out;
  }
  /* 환율: 출처·적용시각이 모두 있어야 '확정', 아니면 '미확인'으로 표시(계산은 하되 근사 표시). */
  function fxView(fx, nowISO) {
    var ok = fx && fin(fx.rate) && fx.rate > 0 && typeof fx.source === 'string' && fx.source && tsOk(fx.appliedAt);
    if (!ok) return { ok: false, label: '환율 출처·적용시각 미확인 — 원화 환산은 근사', rate: fx && fin(fx.rate) && fx.rate > 0 ? fx.rate : null };
    var age = minutesBetween(fx.appliedAt, nowISO);
    return { ok: true, rate: fx.rate, label: '환율 ' + fx.rate + ' (' + fx.source + ', ' + fx.appliedAt + ' 적용' + (age > 24 * 60 ? ', 하루 넘게 지난 값' : '') + ')', stale: age > 24 * 60 };
  }
  /* 평가: 보유(수량)와 가격 장부로 평가액 계산. 보유·장부를 변경하지 않는다. 현재가가 없거나 실패면 마지막 검증가로 '추정' 표시. */
  function valuation(holdings, book, fx, nowISO) {
    var f = fxView(fx, nowISO), rows = [], total = 0, est = 0;
    (holdings || []).forEach(function (h) {
      var v = view(book, h.ticker, nowISO), p = null, basis = '없음';
      if (v.state === 'current' || v.state === 'stale') { p = v.current.price; basis = '현재가'; }
      else if (v.lastVerified) { p = v.lastVerified.price; basis = '마지막 검증가(추정)'; }
      else if (v.current) { p = v.current.price; basis = '이전 값(추정)'; }
      var cur = h.currency || (h.market === 'US' ? 'USD' : 'KRW'), krw = null;
      if (p !== null) { krw = cur === 'USD' ? (f.rate ? p * h.quantity * f.rate : null) : p * h.quantity; }
      if (krw !== null) { total += krw; if (basis !== '현재가') est += krw; }
      rows.push({ ticker: h.ticker, quantity: h.quantity, basis: basis, valueKRW: krw === null ? null : Math.round(krw), state: v.state });
    });
    return { rows: rows, totalKRW: Math.round(total), estimatedPartKRW: Math.round(est), fx: f };
  }
  return Object.freeze({ KINDS: KINDS, KIND_LABEL: KIND_LABEL, REALTIME_MAX_MIN: REALTIME_MAX_MIN, normalize: normalize, classify: classify, usableForSignals: usableForSignals, emptyBook: emptyBook, applyFetch: applyFetch, view: view, fxView: fxView, valuation: valuation });
});
