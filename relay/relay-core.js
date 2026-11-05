/* HAS 27단계 — 개인용 시세 중계 코어(순수 로직, 네트워크는 주입). Cloudflare Workers 래퍼(relay/worker.mjs)가 사용한다.
   원칙: ① 모든 요청은 HASRelayPolicy.judge 통과 ② 시세 조회만(주문·잔고·계좌·토큰 경로는 구조적으로 없음) ③ 비밀값은 env 에서만 읽고 로그·응답에 내지 않음
   ④ KIS 경로·tr_id·응답 필드는 비공식 자료 기반 '후보'(미검증). 실제 호출로 확인한 적 없음. ⑤ 출력은 항상 verification:'unverified'. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('../has/relay-policy.js')); else root.HASRelayCore = factory(root.HASRelayPolicy); })(typeof globalThis !== 'undefined' ? globalThis : this, function (Policy) {
  'use strict';
  var KIS_BASE = 'https://openapi.koreainvestment.com:9443'; // 모의투자 키는 env.KIS_BASE 로 별도 지정(별도 도메인, 미검증)
  var TOKEN_MIN_GAP_MS = 60000; // KIS 공식 안내: 토큰 재발급 1분 1회
  var US_EXCHANGES = Object.freeze(['NAS', 'NYS', 'AMS']);
  var UPSTREAM_TIMEOUT_MS = 8000;
  var state = { policy: null, token: null, tokenExp: 0, lastIssueAt: 0 }; // 격리 환경(isolate) 메모리 — 전역 한도가 아니라 '최선 노력' 한도임

  function resetForTest() { state = { policy: null, token: null, tokenExp: 0, lastIssueAt: 0 }; }
  function num(v) { var n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v; return typeof n === 'number' && isFinite(n) && n > 0 ? n : null; }
  function ymd(v) { return typeof v === 'string' && /^\d{8}$/.test(v) ? v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6) : null; }
  function json(status, body, extra) { return { status: status, body: body, headers: extra || {} }; }

  /* 접근 토큰: 캐시 사용, 재발급은 1분 1회 제한을 지킨다. 토큰 값은 어디에도 기록하지 않는다. */
  async function getToken(env, fetchFn, nowMs) {
    if (state.token && nowMs < state.tokenExp) return { ok: true, token: state.token };
    if (nowMs - state.lastIssueAt < TOKEN_MIN_GAP_MS) return { ok: false, reason: 'token-cooldown' };
    state.lastIssueAt = nowMs;
    var r; try { r = await timed(fetchFn, (env.KIS_BASE || KIS_BASE) + '/oauth2/tokenP', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET }) }); } catch (e) { return { ok: false, reason: 'upstream-unreachable' }; }
    var j = null; try { j = await r.json(); } catch (e) { return { ok: false, reason: 'upstream-bad-response' }; }
    if (!r.ok || !j || typeof j.access_token !== 'string') return { ok: false, reason: 'upstream-auth-failed' };
    var ttl = Number(j.expires_in); ttl = isFinite(ttl) && ttl > 120 ? ttl : 3600; // 만료 정보가 이상하면 짧게 잡는다
    state.token = j.access_token; state.tokenExp = nowMs + (ttl - 60) * 1000; return { ok: true, token: state.token };
  }
  function timed(fetchFn, url, init) { var ac = typeof AbortController === 'function' ? new AbortController() : null, t = ac ? setTimeout(function () { ac.abort(); }, UPSTREAM_TIMEOUT_MS) : null;
    if (ac) init = Object.assign({ signal: ac.signal }, init); return Promise.resolve(fetchFn(url, init)).finally(function () { if (t) clearTimeout(t); }); }

  async function kisGet(env, fetchFn, nowMs, path, trId, params) {
    var tk = await getToken(env, fetchFn, nowMs); if (!tk.ok) return tk;
    var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var r; try { r = await timed(fetchFn, (env.KIS_BASE || KIS_BASE) + path + '?' + qs, { method: 'GET', headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + tk.token, appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET, tr_id: trId, custtype: 'P' } }); } catch (e) { return { ok: false, reason: 'upstream-unreachable' }; }
    var j = null; try { j = await r.json(); } catch (e) { return { ok: false, reason: 'upstream-bad-response' }; }
    if (!r.ok || !j) return { ok: false, reason: 'upstream-error' };
    if (j.rt_cd !== undefined && String(j.rt_cd) !== '0') return { ok: false, reason: 'upstream-rejected' }; // msg1 등 원문은 내보내지 않는다(계정 정보 포함 가능성)
    return { ok: true, data: j };
  }

  function quoteOut(ticker, market, currency, price, asOfDate, nowMs) {
    return { ticker: ticker, market: market, currency: currency, price: price, source: 'kis', kind: 'unknown', asOfDate: asOfDate, asOfTime: null, fetchedAt: new Date(nowMs).toISOString(), verification: 'unverified',
      note: 'KIS 단일 출처·가격 종류(실시간/지연/종가) 확인 불가·독립 대조 불가' };
  }
  async function krQuote(env, fetchFn, nowMs, code) {
    var r = await kisGet(env, fetchFn, nowMs, '/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code });
    if (!r.ok) return r; var o = r.data.output, p = o && num(o.stck_prpr); if (!p) return { ok: false, reason: 'no-price' };
    return { ok: true, quote: quoteOut(code, 'KR', 'KRW', p, ymd(o.stck_bsop_date), nowMs) };
  }
  async function usQuote(env, fetchFn, nowMs, sym) {
    var last = { ok: false, reason: 'no-price' };
    for (var i = 0; i < US_EXCHANGES.length; i++) {
      var r = await kisGet(env, fetchFn, nowMs, '/uapi/overseas-price/v1/quotations/price', 'HHDFS00000300', { AUTH: '', EXCD: US_EXCHANGES[i], SYMB: sym });
      if (!r.ok) { if (r.reason === 'token-cooldown' || r.reason === 'upstream-unreachable') return r; last = r; continue; }
      var o = r.data.output, p = o && num(o.last); if (p) return { ok: true, quote: quoteOut(sym, 'US', 'USD', p, ymd(o.xymd), nowMs) };
    }
    return last;
  }
  var STATUS = { 'token-cooldown': 503, 'upstream-unreachable': 502, 'upstream-bad-response': 502, 'upstream-auth-failed': 502, 'upstream-error': 502, 'upstream-rejected': 502, 'no-price': 404 };

  /* 요청 1건 처리. req = {method, path, headers(소문자 키), origin}. 반환 {status, body, headers, log}. */
  async function handle(req, env, fetchFn, nowMs) {
    env = env || {}; nowMs = nowMs || Date.now();
    var cors = {}; if (env.HAS_ALLOWED_ORIGIN) cors['access-control-allow-origin'] = env.HAS_ALLOWED_ORIGIN;
    cors['access-control-allow-headers'] = 'x-has-auth'; cors['access-control-allow-methods'] = 'GET'; cors['cache-control'] = 'no-store'; cors['x-content-type-options'] = 'nosniff';
    var origin = req.headers && req.headers.origin;
    if (!env.HAS_RELAY_PROOF || String(env.HAS_RELAY_PROOF).length < 24 || !env.KIS_APP_KEY || !env.KIS_APP_SECRET || !env.HAS_ALLOWED_ORIGIN) return json(503, { ok: false, reason: 'not-configured' }, cors); // 비밀·허용 출처 미설정 시 닫힘(fail-closed)
    if (req.method === 'OPTIONS') return json(204, null, cors);
    if (origin && origin !== env.HAS_ALLOWED_ORIGIN) return json(403, { ok: false, reason: 'origin-denied' }, cors);
    var j = Policy.judge({ method: req.method, path: req.path, headers: req.headers || {} }, { expectedProof: env.HAS_RELAY_PROOF }, state.policy, nowMs);
    state.policy = j.state; var out;
    if (!j.ok) out = json(j.status, { ok: false, reason: j.reason }, cors), out.log = j.log;
    else if (j.route === 'fx') out = json(501, { ok: false, reason: 'fx-not-supported' }, cors), out.log = j.log; // 검증된 환율 출처가 없어 만들지 않음
    else {
      var seg = req.path.split('/'), r = j.route === 'kr-price' ? await krQuote(env, fetchFn, nowMs, seg[4]) : await usQuote(env, fetchFn, nowMs, seg[4]);
      out = r.ok ? json(200, { ok: true, quote: r.quote }, cors) : json(STATUS[r.reason] || 502, { ok: false, reason: r.reason }, cors);
      out.log = Object.assign({}, j.log, { ok: r.ok, reason: r.ok ? 'ok' : r.reason });
    }
    out.log = Policy.redact(out.log); return out;
  }
  return Object.freeze({ handle: handle, resetForTest: resetForTest, KIS_BASE: KIS_BASE, TOKEN_MIN_GAP_MS: TOKEN_MIN_GAP_MS });
});
