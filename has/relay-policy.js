/* HAS 24단계 — 개인용 시세 중계 서버가 반드시 지켜야 할 "정책 코어"(순수 함수). 서버는 만들지 않는다(자원 생성 금지).
   나중에 서버(예: 서버리스 함수)를 만들면 요청마다 이 함수들을 통과시킨다. 조건: ① 사용자 인증 ② 시세 조회 경로만 허용(주문·계좌·토큰 경로 거부)
   ③ 호출 횟수 제한 ④ 비밀값이 로그·응답에 나가지 않게 가림 ⑤ 오류·이상 접근 기록 ⑥ 비정상 접근 누적 시 자동 차단(키 폐기 절차 안내). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASRelayPolicy = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  /* 허용 목록(allowlist): 여기 없는 경로는 전부 거부한다. 경로 자체는 KIS 공식 문서로 확인되기 전까지 '후보'이며 서버 구현 전 대조가 필요하다. */
  var ALLOW = Object.freeze([
    { id: 'kr-price', method: 'GET', pattern: /^\/v1\/quote\/kr\/[0-9A-Z]{6}$/ },
    { id: 'us-price', method: 'GET', pattern: /^\/v1\/quote\/us\/[A-Z][A-Z0-9.\-]{0,9}$/ },
    { id: 'fx', method: 'GET', pattern: /^\/v1\/fx\/usdkrw$/ }]);
  var DENY_WORDS = /order|trading|execute|buy|sell|cancel|modify|balance|account|inquire-psbl|token|revoke|approval|ws\b|websocket|transfer|withdraw/i;
  var LIMITS = Object.freeze({ perSecond: 5, perMinute: 60, perDay: 600, maxTickersPerRequest: 1, abuseStrikesToBlock: 5 }); // KIS 한도(초당 10건, 2022 FAQ 게시)보다 낮게
  var SECRET_KEYS = /(app[_-]?key|app[_-]?secret|secret|authorization|access[_-]?token|bearer|password|cano|acnt|account)/i;
  function authenticate(req, cfg) { // 상수시간 비교. cfg.tokenHash 는 서버 비밀 저장소에서 읽은 해시이며 코드·저장소에 넣지 않는다.
    var given = req && req.headers && req.headers['x-has-auth'], expect = cfg && cfg.expectedProof; if (typeof given !== 'string' || typeof expect !== 'string' || given.length !== expect.length || !given) return { ok: false, reason: 'unauthenticated' };
    var d = 0; for (var i = 0; i < given.length; i++) d |= given.charCodeAt(i) ^ expect.charCodeAt(i); return d === 0 ? { ok: true } : { ok: false, reason: 'unauthenticated' };
  }
  function checkRoute(method, path) {
    if (typeof path !== 'string' || path.length > 64 || /[?#%\\]|\.\./.test(path)) return { ok: false, reason: 'bad-path' };
    if (DENY_WORDS.test(path)) return { ok: false, reason: 'denied-keyword' };
    for (var i = 0; i < ALLOW.length; i++) if (ALLOW[i].method === method && ALLOW[i].pattern.test(path)) return { ok: true, route: ALLOW[i].id };
    return { ok: false, reason: 'not-allowlisted' };
  }
  /* 호출 횟수 제한: state 는 호출자가 보관(서버 메모리·KV). 입력을 바꾸지 않고 새 state 를 돌려준다. */
  function rateLimit(state, nowMs) {
    var s = state || { hits: [], day: null, dayCount: 0 }, day = new Date(nowMs).toISOString().slice(0, 10), hits = s.hits.filter(function (t) { return nowMs - t < 60000; }), dayCount = s.day === day ? s.dayCount : 0;
    var sec = hits.filter(function (t) { return nowMs - t < 1000; }).length;
    if (sec >= LIMITS.perSecond) return { ok: false, reason: 'per-second', state: { hits: hits, day: day, dayCount: dayCount } };
    if (hits.length >= LIMITS.perMinute) return { ok: false, reason: 'per-minute', state: { hits: hits, day: day, dayCount: dayCount } };
    if (dayCount >= LIMITS.perDay) return { ok: false, reason: 'per-day', state: { hits: hits, day: day, dayCount: dayCount } };
    return { ok: true, state: { hits: hits.concat([nowMs]), day: day, dayCount: dayCount + 1 } };
  }
  function redact(v, depth) { depth = depth || 0; if (depth > 6) return '[깊이 초과]'; if (Array.isArray(v)) return v.map(function (x) { return redact(x, depth + 1); });
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = SECRET_KEYS.test(k) ? '[가림]' : redact(v[k], depth + 1); }); return o; }
    if (typeof v === 'string') return v.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [가림]').replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '[가림]').replace(/\b\d{8}-\d{2}\b/g, '[가림]'); return v; }
  /* 이상 접근 기록·자동 차단. 반환 log 는 이미 비밀이 가려진 한 줄 객체. */
  function judge(req, cfg, state, nowMs) {
    var st = state || { rate: null, strikes: 0, blocked: false }, base = { at: new Date(nowMs).toISOString(), method: req && req.method, path: req && String(req.path || '').slice(0, 64) };
    var res = function (ok, reason, extra, strike) { var strikes = st.strikes + (strike ? 1 : 0), blocked = st.blocked || strikes >= LIMITS.abuseStrikesToBlock; return Object.assign({ ok: ok, reason: reason, status: ok ? 200 : ({ unauthenticated: 401, 'not-allowlisted': 403, 'denied-keyword': 403, 'bad-path': 400, blocked: 423 }[reason] || 429), log: redact(Object.assign({}, base, { ok: ok, reason: reason, strikes: strikes, blocked: blocked })), state: { rate: extra && extra.rate !== undefined ? extra.rate : st.rate, strikes: strikes, blocked: blocked }, action: blocked && !st.blocked ? '비정상 접근 누적 — 자동 차단. 키 폐기·재발급 절차를 즉시 진행하십시오.' : null }, extra && extra.route ? { route: extra.route } : {}); };
    if (st.blocked) return res(false, 'blocked', null, false);
    var a = authenticate(req, cfg); if (!a.ok) return res(false, a.reason, null, true);
    var r = checkRoute(req.method, req.path); if (!r.ok) return res(false, r.reason, null, true);
    var l = rateLimit(st.rate, nowMs); if (!l.ok) return res(false, l.reason, { rate: l.state }, false);
    return res(true, 'ok', { rate: l.state.rate !== undefined ? l.state : l.state, route: r.route }, false);
  }
  return Object.freeze({ ALLOW: ALLOW, LIMITS: LIMITS, authenticate: authenticate, checkRoute: checkRoute, rateLimit: rateLimit, redact: redact, judge: judge });
});
