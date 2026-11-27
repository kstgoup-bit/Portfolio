/* 검토 카드의 '📊 재무 확인' 블록 — 저장소의 자동 수집본(data/fundamentals/<티커>.json)을 읽어 보여 준다. 읽기 전용·주문 없음.
 * 이 모듈은 카드의 판단 라벨을 바꾸지 않는다(해제 여부는 has/review-fin-gate.js가 판정하고, 여기서는 조건 충족 상태만 설명한다).
 * 시세 독립 대조(price)는 아직 앱에 연결되지 않아 항상 '미연결'로 전달한다 → 매수 쪽 판단 보류는 풀리지 않는다.
 * 자료는 SEC 공시 자동 수집본이며 검증 전(미검증)이다. 국내 종목은 DART 연결 전이라 '미연결'만 표시한다. 투자 자문 아님.
 * CR-FIN-1(지피 2026-11-28): 외피·내부 티커/CIK 대조, 엄격한 수집 시각, 미래 수집·미래 공시·결산 전 공시 차단, 4일 초과는 '과거 참고'를 먼저 표시.
 * CR-FIN-2: 블록은 카드 안 자리(host)에 그 자리에서만 채운다(자리가 화면에서 떨어지면 늦게 온 응답은 무시) → 보유종목 팝업도 갱신된다.
 * CR-FIN-3: 요청 대기 상한(15초)·오래된 응답 배제·실패는 60초 뒤·성공은 6시간 뒤 다시 받을 수 있음·수동 재시도는 티커당 3회까지(같은 사이트 정적 JSON만). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASFinPanel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BUY = { 'buy-review': 1, 'add-review': 1 }, STALE_FETCH_DAYS = 4, TIMEOUT_MS = 15000, ERROR_RETRY_MS = 60000, OK_TTL_MS = 6 * 3600000, MAX_TRIES = 3, SKEW_MS = 5 * 60000, cache = {};
  var STATUS_KO = { pass: '양호', warn: '주의', fail: '취약', na: '제외' };
  var MISS_KO = {
    'financials-missing': '재무 자료 없음·형식 불명', 'financials-weak': '재무 취약', 'financials-not-strong': '재무 판정이 "우량 근거 충분"이 아님',
    'financials-stale-or-conflict': '재무 자료가 오래됐거나 3년 미만·값 충돌', 'price-not-verified': '시세 독립 대조 미연결', 'synthetic-input': '가상 자료', 'invalid-now': '시각 오류', 'invalid-input': '입력 오류'
  };
  var CS_KO = { solo: '클로 단독', mismatch: '합의 기록 불일치', expired: '합의 기한(7일) 지남', 'no-response': '지피 응답 없음', disagree: '의견 불일치' };
  var CHECK_KO = { mismatch: '종목·회사 식별자 불일치(다른 회사 자료일 수 있음)', time: '수집 시각 형식 오류 또는 미래 시각', future: '결산일·공시일 충돌(미래 공시 또는 결산 전 공시)', invalid: '자료 형식 불명', ifrs: '해외 기업 공시(IFRS·20-F) — 미지원' };
  var ISO = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/, DAYRE = /^\d{4}-\d{2}-\d{2}$/;
  function node(tag, text, css, tid) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; if (tid) e.setAttribute('data-testid', tid); return e; }
  function kst(iso) { try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso); } }
  function missText(code) { if (MISS_KO[code]) return MISS_KO[code]; var m = /^consensus-(.+)$/.exec(code); return m ? '지피 합의 없음(' + (CS_KO[m[1]] || m[1]) + ')' : code; }
  function plain(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function day(s) { return typeof s === 'string' && DAYRE.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  /* 자료 확인: 'ok' 또는 실패 사유(mismatch·time·future·invalid·ifrs). 확인 못 하면 판정하지 않는다. */
  function check(rec, ticker, F, now) {
    if (!plain(rec) || rec.version !== 1 || !F) return 'invalid';
    var n = rec.normalized;
    if (rec.ticker !== ticker || !plain(n) || n.ticker !== ticker) return 'mismatch';
    if (typeof rec.cik === 'string' || typeof n.cik === 'string') { if (typeof rec.cik !== 'string' || !/^\d{1,10}$/.test(rec.cik) || rec.cik !== n.cik) return 'mismatch'; }
    if (typeof rec.fetchedAt !== 'string' || !ISO.test(rec.fetchedAt) || !day(rec.fetchedAt.slice(0, 10))) return 'time';
    var fAt = Date.parse(rec.fetchedAt); if (!Number.isFinite(fAt) || fAt > now + SKEW_MS) return 'time';
    if (n.ok === false && n.reason === 'ifrs-filer') return 'ifrs';
    if (!F.validNormalized(n)) return 'invalid';
    var limit = rec.fetchedAt.slice(0, 10), today = new Date(now).toISOString().slice(0, 10); if (today < limit) limit = today;
    if (!n.years.every(function (r) { return r.end <= limit && (r.filed === '' || (r.filed >= r.end && r.filed <= limit)); })) return 'future';
    return 'ok';
  }
  function settle(st, token, state, rec) {
    if (st.token !== token || st.state !== 'loading') return;                     // 대기 상한 초과 뒤 늦게 온 응답·교체된 요청은 무시
    st.state = state; st.rec = rec || null; st.at = Date.now(); clearTimeout(st.timer);
    var ws = st.waiters; st.waiters = []; ws.forEach(function (f) { try { f(); } catch (e) { /* 한 카드 실패가 다른 카드를 막지 않음 */ } });
  }
  function expired(st) { var age = Date.now() - st.at; return st.state === 'error' ? age > ERROR_RETRY_MS : (st.state === 'ok' || st.state === 'missing') && age > OK_TTL_MS; }
  function request(ticker, force) {
    var st = cache[ticker];
    if (st && st.state === 'loading') return st;                                     // 동시 요청 병합
    if (st && !force && !expired(st)) return st;
    if (st && force && st.tries >= MAX_TRIES) return st;                             // 수동 재시도 상한
    var tries = (st ? st.tries : 0) + 1, waiters = st ? st.waiters : [];
    st = cache[ticker] = { state: 'loading', token: {}, tries: tries, waiters: waiters, at: Date.now() };
    var token = st.token;
    if (typeof fetch !== 'function') { st.state = 'error'; return st; }
    st.timer = setTimeout(function () { settle(st, token, 'error'); }, TIMEOUT_MS);
    try {
      fetch('./data/fundamentals/' + encodeURIComponent(ticker) + '.json', { cache: 'no-store', credentials: 'omit' })
        .then(function (r) { if (r.status === 404) return 404; if (!r.ok) throw Error('http'); return r.json(); })
        .then(function (j) { if (j === 404) settle(st, token, 'missing'); else settle(st, token, 'ok', j); })
        .catch(function () { settle(st, token, 'error'); });
    } catch (e) { settle(st, token, 'error'); }
    return st;
  }
  function fill(host, card, ctx, buy) {
    var now = typeof ctx.now === 'number' ? ctx.now : Date.now(), st = cache[card.ticker];
    var F = typeof window !== 'undefined' ? window.HASFundamentalFilter : null, G = typeof window !== 'undefined' ? window.HASReviewFinGate : null;
    var box = node('div', null, 'margin-top:6px;padding:8px 10px;border:1px solid #c9d3e0;border-radius:8px;background:#fafcff;font-size:14px;line-height:1.55;color:#333', 'fin-panel');
    function put() { host.replaceChildren(box); }
    function clear() { host.replaceChildren(); }
    if (!st || st.state === 'loading') { if (buy) { box.appendChild(node('div', '📊 재무 자료를 불러오는 중…', null, 'fin-loading')); put(); } else clear(); return; }
    var why = st.state === 'ok' ? check(st.rec, card.ticker, F, now) : st.state;
    if (why !== 'ok') {
      if (!buy) { clear(); return; }
      var txt = why === 'missing' ? '자동 수집 대상 아님·자료 없음' : why === 'error' ? '자료를 읽지 못함(연결 실패 또는 시간 초과)' : CHECK_KO[why] || CHECK_KO.invalid;
      box.appendChild(node('div', '📊 재무 확인: ' + txt + ' · 판단 보류', 'font-weight:700', 'fin-hold'));
      if (why === 'error' && st.tries < MAX_TRIES) {
        var b = node('button', '재무 자료 다시 불러오기 (' + st.tries + '/' + MAX_TRIES + ')', 'min-height:44px;margin-top:6px;padding:4px 12px;font-size:14px;color:#333;background:#fff;border:1px solid #888;border-radius:8px', 'fin-retry');
        b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); load(host, card, ctx, true); }); box.appendChild(b);
      }
      put(); return;
    }
    var rec = st.rec, a = F.assess(rec.normalized, { now: now }), ageDays = Math.max(0, (now - Date.parse(rec.fetchedAt)) / 86400000), stale = ageDays > STALE_FETCH_DAYS;
    if (stale) box.appendChild(node('div', '⚠ 과거 참고 · 판단 보류 — 수집한 지 ' + Math.floor(ageDays) + '일 지남(자동 수집이 멈췄을 수 있음). 아래 판정은 현재 상태가 아닐 수 있습니다.', 'font-weight:700', 'fin-stale'));
    box.appendChild(node('div', '📊 재무 확인(SEC 공시 자동 수집 · 검증 전' + (stale ? ' · 과거 참고' : '') + '): ' + a.labelKo + (a.reason ? ' — ' + a.reason : ''), 'font-weight:700', 'fin-label'));
    box.appendChild(node('div', '최근 결산 ' + (a.asOf || '없음') + ' · 공시 ' + (a.filed || '미상') + ' · 수집 ' + kst(rec.fetchedAt) + ' · 판정 임계값은 미검증 제안 기준', 'font-size:13px', 'fin-meta'));
    if (buy && G) {
      var g = G.evaluate({ card: { ticker: card.ticker, market: card.market, verdict: card.verdict }, assessment: stale ? null : a, price: null, consensus: ctx.consensus }, new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'));
      var miss = stale ? ['financials-missing'].concat(g.missing.filter(function (x) { return x !== 'financials-missing'; })) : g.missing;
      box.appendChild(node('div', g.state === 'released' ? '보류 해제 조건 충족(재무·시세·합의)' : '판단 보류 유지 — 남은 조건: ' + miss.map(missText).join(' · '), 'font-weight:700;color:#333', 'fin-gate'));
    }
    if (a.checks && a.checks.length) {
      var det = node('details'); det.appendChild(node('summary', '재무 항목별 보기', 'min-height:44px;display:flex;align-items:center;cursor:pointer'));
      a.checks.forEach(function (c) { det.appendChild(node('div', '· ' + c.name + ': ' + (STATUS_KO[c.status] || c.status) + (c.evidence ? ' — ' + c.evidence : ''))); });
      det.appendChild(node('div', '자동 수집본이며 공시 원문과 일치 여부는 검증 전입니다. 판정 임계값은 미검증 제안 기준입니다. 매수·매도 지시가 아닙니다.', 'font-size:13px;margin-top:4px'));
      box.appendChild(det);
    }
    put();
  }
  function load(host, card, ctx, force) {
    var buy = !!BUY[card.verdict], st = request(card.ticker, force);
    if (st.state === 'loading') st.waiters.push(function () { if (host.isConnected) fill(host, card, ctx, buy); });   // 닫힌 팝업·다시 그린 카드의 자리는 건너뜀
    fill(host, card, ctx, buy);
  }
  /* host: 카드 안 재무 블록 자리(이 안만 바꾼다), card: {ticker, market, verdict}, ctx: {consensus, now} */
  function attach(host, card, ctx) {
    if (!host || !card || typeof document === 'undefined') return;
    ctx = ctx || {};
    if (card.market !== 'US') {
      if (BUY[card.verdict]) { var box = node('div', null, 'margin-top:6px;padding:8px 10px;border:1px solid #c9d3e0;border-radius:8px;background:#fafcff;font-size:14px;line-height:1.55;color:#333', 'fin-panel'); box.appendChild(node('div', '📊 재무 확인: 국내(DART) 재무 연결 전 · 판단 보류', 'font-weight:700')); host.replaceChildren(box); }
      return;
    }
    load(host, card, ctx, false);
  }
  return Object.freeze({ attach: attach, check: check, TIMEOUT_MS: TIMEOUT_MS, MAX_TRIES: MAX_TRIES, _reset: function () { Object.keys(cache).forEach(function (k) { clearTimeout(cache[k].timer); }); cache = {}; } });
});
