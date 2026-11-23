/* HAS 가상 계좌(PAPER ACCOUNT) P2 순수 계산 모듈 v0 — 합성 자료 전용, 연구용.
   근거: 설계 CLAUDE-DEV-PAPER-ACCOUNT-20261123.md(지피 0829 APPROVE) + 순태씨 2026-11-23 대화창 결정
   ("8번 승인, 나머지 추천대로").
   - 네트워크·저장소·투자기록·백업을 읽거나 쓰지 않는다. 입력 객체를 바꾸지 않는다(새 상태를 돌려준다).
   - 실제 자료 잠금(REAL_DATA_LOCK): synthetic:true 가 아닌 계좌·후보·시세는 모두 거부한다. 실종목 기록은 G0 이후 별도 승인.
   - 주문·자동매매·실제 수량을 만들지 않는다. 모든 체결은 '연구용 체결 가정'이며 실현 가능 성과가 아니다.
   - 진입 전제: 매수 검토 게이트(has/buy-review-gate.js)가 발급한 매수 검토 상태만. 가격 하락만으로는 진입하지 않는다.
   - 비용(수수료·세금·환전)은 미확정 → 0으로 대입하지 않고 결과에 costStatus:'unconfirmed'로 표시한다.
   v0.1(지피 GPT-REVIEW-paper-p2-20261123-1430 CR-1~3): 게이트 결과는 HASBuyReviewGate.verify 통과 객체만,
   체결은 이 모듈이 발급한 계획만(발급 시점 지문·계좌 대조 + 체결 시점 재검사), 체결일은 결정·검토 시각(거래소 현지일) 이후 첫 거래일,
   재평가 공시는 식별자·공개시각 중복 재사용·미래 공시 금지.
   v0.2(지피 GPT-REVIEW-paper-p2-20261123-1530 CR-5~7): 손실 중지 재개는 사용자 승인 경로가 생기기 전까지 잠금(RESUME_LOCKED),
   계좌 시간축(체결일·재평가일·평가일, 거래소 현지일 + UTC)을 거스르는 소급 기록 거부, 계좌는 이 모듈이 만든 상태만 신뢰
   (위험 한도·중지 상태 지문 대조), 계획 발급 당시 위험 한도보다 완화되면 체결 거부·강화는 반영. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./buy-review-gate.js')); else root.HASPaperAccount = factory(root.HASBuyReviewGate); })(typeof globalThis !== 'undefined' ? globalThis : this, function (GATE) {
  'use strict';
  var GATE_MAX_LAG_MS = 24 * 3600 * 1000; // 결정은 게이트 발급 후 24시간 이내(같은 신호일)만
  var TZ = Object.freeze({ KR: 'Asia/Seoul', US: 'America/New_York' });
  var CONTRACT = 'paperEvent.v0';
  var REAL_DATA_LOCK = true;
  // 순태씨 결정(2026-11-23). 숫자가 '미정'인 항목은 null이며, 호출자 계좌 설정에 없으면 fail-closed(진입 보류).
  var POLICY = Object.freeze({
    version: 'paperPolicy.v0-20261123', decidedBy: 'user', decidedAt: '2026-11-23',
    capPct: 10,                     // 결정 2: 확신 종목도 신뢰 등록 경로가 생기기 전엔 10%
    convictionCapPct: 25,           // 최대 상한(현재 잠김: CONVICTION_LOCKED)
    tranches: 3,                    // 결정 3: 목표 편입액 1/3 × 최대 3회
    addOnRequiresNewFiling: true,   // 결정 3: 2·3회차는 직전 결정 이후 공개된 새 정기 공시가 있어야 함
    fill: 'next-trading-day-close', // 결정 4: 신호 기준일 다음 거래일 종가(연구용 가정)
    costStatus: 'unconfirmed',      // 결정 4: 비용 미확정 범위(0 대입 금지)
    exitReviewConsecutive: 2,       // 결정 5: EXIT-REVIEW 2회 연속이면 가상 전량 청산
    partialSellPct: null,           // 결정 5: 부분 매도 비율 미정 → v0는 부분 매도 없음
    retirementBridgeExcluded: true, // 결정 1: 퇴직 브리지 자금은 투자가능 현금 아님
    riskLimits: Object.freeze({ cashFloorPct: null, dailyLossStopPct: null, monthlyLossStopPct: null }), // 결정 2: 숫자 미정
    kisPaperCriteria: null,         // 결정 6: 보류
    storage: null                   // 결정 7: 미정 → 모듈은 이벤트만 돌려주고 저장하지 않는다
  });
  var CONVICTION_LOCKED = true;
  var RESUME_LOCKED = true; // CR-5: 검증 가능한 순태씨 승인 경로(UI·승인 출처·정책 버전) 전까지 손실 중지 재개 불가
  var REVIEW_STATES = Object.freeze(['조건부 분할매수 검토', '높은 확신의 분할매수 검토']);
  var MARKETS = Object.freeze({ KR: 'KRW', US: 'USD' });
  var OUTCOMES = Object.freeze(['HOLD', 'EXIT-REVIEW', 'EXIT', 'DATA-UNAVAILABLE']);
  var LABEL = '연구용 가상 체결 가정 — 실현 가능 성과 아님, 비용 미확정, 투자 권유 아님. 최종 결정은 순태씨.';

  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function pos(x) { return finite(x) && x > 0; }
  function text(x) { return typeof x === 'string' && x.trim().length > 0; }
  function day(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x + 'T00:00:00Z')); }
  function isoTime(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x) && /(Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x)); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function round(x, n) { var p = Math.pow(10, n == null ? 2 : n); return Math.round(x * p) / p; }
  function pct(x) { return finite(x) && x >= 0 && x <= 100; }

  /* 거래일 캘린더는 호출자가 준다(합성). 실제 KR/US 휴장 캘린더는 미검증·미연결. */
  function calendarOk(cal) {
    if (!Array.isArray(cal) || cal.length === 0) return false;
    for (var i = 0; i < cal.length; i++) { if (!day(cal[i])) return false; if (i && cal[i] <= cal[i - 1]) return false; }
    return true;
  }
  function nextTradingDay(cal, d) {
    if (!calendarOk(cal) || !day(d)) return null;
    for (var i = 0; i < cal.length; i++) if (cal[i] > d) return cal[i];
    return null;
  }
  /* CR-3: 시각 → 거래소 현지 날짜(KR 서울, US 뉴욕 — 서머타임은 Intl 기준). 변환 불가면 null(보류). 실제 거래소 캘린더는 미검증. */
  function localDay(iso, market) {
    if (!isoTime(iso) || !TZ[market]) return null;
    try {
      var parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ[market], year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
      var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
      var s = o.year + '-' + o.month + '-' + o.day;
      return day(s) ? s : null;
    } catch (e) { return null; }
  }
  function maxDay(a, b) { return a > b ? a : b; }

  /* CR-1: 매수 검토 게이트가 발급·미변조(verify)하고 이 후보(시장·종목·신호일·결정시각)와 맞는 결과만. */
  function gateReasons(g, c, lastDecidedAt) {
    var why = [];
    if (!GATE || typeof GATE.verify !== 'function') return ['매수 검토 게이트 모듈 없음: 진입 보류'];
    if (!g || typeof g !== 'object' || GATE.verify(g) !== true) return ['매수 검토 게이트 발급 결과 아님(위조·복사·변조 포함, 가격 하락만으로 진입 금지)'];
    if (g.buyReview !== true || REVIEW_STATES.indexOf(g.state) < 0) why.push('매수 검토 게이트 발급 결과 아님(매수 검토 상태 아님, 가격 하락만으로 진입 금지)');
    if (g.synthetic !== true) why.push('게이트 결과가 합성 검증 경로가 아님');
    if (g.market !== c.market || !text(c.symbol) || g.ticker !== c.symbol.trim()) why.push('게이트 결과의 시장·종목이 후보와 다름');
    if (!isoTime(g.evaluatedAt) || !isoTime(c.decidedAt)) why.push('게이트 판정 시각 확인 불가');
    else {
      var ge = Date.parse(g.evaluatedAt), de = Date.parse(c.decidedAt);
      if (ge > de) why.push('게이트 판정이 결정시각보다 나중(미래 정보)');
      else if (de - ge > GATE_MAX_LAG_MS) why.push('게이트 판정이 결정시각보다 24시간 넘게 오래됨');
      if (localDay(g.evaluatedAt, c.market) !== c.signalAsOf) why.push('게이트 판정일(거래소 현지)이 신호 기준일과 다름');
      if (lastDecidedAt && ge <= Date.parse(lastDecidedAt)) why.push('직전 회차 결정 이후 새로 발급된 게이트 결과 아님');
    }
    return why;
  }

  /* CR-2: 이 모듈이 발급한 계획만 체결 가능. 발급 당시 사본 지문·계좌 id를 내부에 보관하고 대조한다. */
  var PLANS = new WeakMap();
  function stable(x) {
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(x[k]); }).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  function fp(x) { return stable(x); }
  /* CR-7: 계좌도 이 모듈이 돌려준 상태만 신뢰. 위험 한도·중지 상태·id 지문을 내부에 보관해 복사·위조·모듈 밖 수정 계좌를 거부한다.
     (저장·복원 경로는 결정 7 미정 — 복원 계좌는 현재 신뢰하지 않는다.) */
  var ACCTS = new WeakMap();
  function guardFp(a) { return fp({ id: a.id, policy: a.policy, riskLimits: a.riskLimits, halted: a.halted }); }
  function reg(a) { ACCTS.set(a, guardFp(a)); return a; }
  function acctReasons(a) {
    var t = a && typeof a === 'object' ? ACCTS.get(a) : null;
    if (!t) return ['이 모듈이 만든 계좌 상태 아님(복사·위조 계좌 — 위험 한도·중지 상태 신뢰 불가)'];
    if (t !== guardFp(a)) return ['계좌 위험 한도·중지 상태가 모듈 밖에서 바뀜(무결성 실패 — 완화·해제 우회 금지)'];
    return [];
  }
  /* CR-6: 계좌 시간축. day=기록된 체결일·재평가일(거래소 현지)·평가일 중 최대, markDay=마지막 평가일(종가 기준), at=기록된 결정·재평가 UTC 최대. */
  function clock(a) {
    var c = { day: null, markDay: null, at: null };
    function d(x) { if (day(x) && (!c.day || x > c.day)) c.day = x; }
    function t(x) { if (isoTime(x) && (!c.at || Date.parse(x) > Date.parse(c.at))) c.at = x; }
    (a.events || []).forEach(function (e) {
      if (e.kind === 'PAPER_BUY' || e.kind === 'PAPER_SELL') { d(e.fillDay); t(e.decidedAt); }
      else if (e.kind === 'PAPER_REVIEW') { d(e.reviewDay); t(e.reviewedAt); }
    });
    (a.marks || []).forEach(function (m) { d(m.date); c.markDay = m.date; });
    return c;
  }
  function fillTimeReasons(a, fillDay) {
    var c = clock(a), why = [];
    if (c.day && fillDay < c.day) why.push('계좌 시간축 역행: 이미 ' + c.day + '까지 기록된 계좌에 ' + fillDay + ' 체결 삽입 금지');
    if (c.markDay && fillDay <= c.markDay) why.push('평가(' + c.markDay + ' 종가) 이후 같은·과거 날 체결 삽입 금지');
    return why;
  }
  var LOOSER = { cashFloorPct: function (now, was) { return now < was; }, dailyLossStopPct: function (now, was) { return now > was; }, monthlyLossStopPct: function (now, was) { return now > was; } };
  function issuePlan(kind, accountId, plan) {
    plan.accountId = accountId; plan.kind = kind;
    var out = Object.freeze(plan);
    PLANS.set(out, { kind: kind, accountId: accountId, fp: fp(out) });
    return out;
  }
  function planReasons(a, plan, kind) {
    var t = plan && typeof plan === 'object' ? PLANS.get(plan) : null;
    if (!t || t.kind !== kind || !Object.isFrozen(plan) || fp(plan) !== t.fp) return ['이 모듈이 발급한 ' + (kind === 'ENTRY' ? '진입' : '청산') + ' 계획 아님(위조·복사·변조)'];
    if (t.accountId !== a.id || plan.accountId !== a.id) return ['다른 계좌의 계획'];
    return [];
  }

  function createAccount(cfg) {
    var why = [];
    if (!cfg || cfg.synthetic !== true) why.push('실제 자료 잠금: 합성 계좌(synthetic:true)만 허용');
    if (cfg && !text(cfg.id)) why.push('계좌 id 없음');
    if (cfg && !day(cfg.startDate)) why.push('시작일 형식 오류');
    var cash = (cfg && cfg.cash) || {};
    Object.keys(cash).forEach(function (c) { if (c !== 'KRW' && c !== 'USD') why.push('지원하지 않는 통화: ' + c); else if (!finite(cash[c]) || cash[c] < 0) why.push(c + ' 현금 값 오류'); });
    if (!Object.keys(cash).some(function (c) { return pos(cash[c]); })) why.push('투자가능 현금 0');
    var rl = (cfg && cfg.riskLimits) || {};
    var limits = {};
    ['cashFloorPct', 'dailyLossStopPct', 'monthlyLossStopPct'].forEach(function (k) {
      if (rl[k] == null) limits[k] = null; else if (pct(rl[k])) limits[k] = rl[k]; else why.push(k + ' 범위 오류(0~100)');
    });
    if (why.length) return { ok: false, reasons: why, account: null };
    var notes = [];
    if (cfg.retirementBridge != null) notes.push('퇴직 브리지 자금은 투자가능 현금에서 제외(결정 1) — 입력값 무시');
    var acct = {
      contract: CONTRACT, policy: POLICY.version, id: cfg.id.trim(), synthetic: true, startDate: cfg.startDate,
      cash: { KRW: finite(cash.KRW) ? cash.KRW : 0, USD: finite(cash.USD) ? cash.USD : 0 },
      contributed: { KRW: finite(cash.KRW) ? cash.KRW : 0, USD: finite(cash.USD) ? cash.USD : 0 },
      riskLimits: limits, positions: {}, events: [], keys: {}, marks: [], halted: { KRW: null, USD: null }, notes: notes
    };
    return { ok: true, reasons: [], account: reg(acct) };
  }

  function posKey(market, symbol) { return market + ':' + symbol; }
  function bucketEquity(a, ccy, prices) {
    var eq = a.cash[ccy];
    Object.keys(a.positions).forEach(function (k) {
      var p = a.positions[k]; if (p.ccy !== ccy || p.qty === 0) return;
      var px = prices && finite(prices[k]) ? prices[k] : p.lastPrice;
      eq += p.qty * px;
    });
    return eq;
  }

  /* 진입 계획: 하나라도 실패하면 PAPER_ENTRY_HOLD(사유 전부 기록). 주문·수량 확정 없음(수량은 체결 가정 시점에 계산). */
  function planEntry(a, c) {
    var why = [];
    if (!a || a.synthetic !== true) return { action: 'PAPER_ENTRY_HOLD', reasons: ['실제 자료 잠금: 합성 계좌만'], order: null };
    var ar = acctReasons(a);
    if (ar.length) return { action: 'PAPER_ENTRY_HOLD', reasons: ar, order: null };
    if (!c || c.synthetic !== true) why.push('실제 자료 잠금: 합성 후보만(실종목은 G0 이후 별도 승인)');
    c = c || {};
    var ccy = MARKETS[c.market];
    if (!ccy) why.push('시장 KR/US 아님');
    if (!text(c.symbol)) why.push('종목 없음');
    if (!isoTime(c.decidedAt)) why.push('결정시각 형식 오류');
    if (!day(c.signalAsOf)) why.push('신호 기준일 형식 오류');
    var decidedDay = ccy ? localDay(c.decidedAt, c.market) : null;
    if (isoTime(c.decidedAt) && ccy && !decidedDay) why.push('결정시각 거래소 현지 날짜 변환 불가');
    if (decidedDay && day(c.signalAsOf) && decidedDay < c.signalAsOf) why.push('결정시각이 신호 기준일보다 앞섬');
    if (!text(c.decisionVersion)) why.push('결정 버전 없음');
    // 위험 한도 숫자 미정이면 진입 보류(fail-closed).
    var rl = a.riskLimits;
    if (rl.cashFloorPct == null || rl.dailyLossStopPct == null || rl.monthlyLossStopPct == null) why.push('위험 한도(현금 하한·일/월 손실 중지선) 미정: 순태씨 결정 전 진입 보류');
    if (ccy && a.halted[ccy]) why.push('손실 중지선 발동 중(' + a.halted[ccy] + '): 신규 가상 매수 중지');
    var k = ccy && text(c.symbol) ? posKey(c.market, c.symbol.trim()) : null;
    var p = k ? a.positions[k] : null;
    var n = p ? p.tranches.length : 0;
    var last = n > 0 ? p.tranches[n - 1].decidedAt : null;
    if (last && isoTime(c.decidedAt) && Date.parse(c.decidedAt) <= Date.parse(last)) why.push('결정시각이 직전 회차 결정보다 앞섬');
    why = why.concat(gateReasons(c.gate, c, last));
    if (n >= POLICY.tranches) why.push('분할 회차 소진(최대 ' + POLICY.tranches + '회)');
    var filingId = null;
    if (n > 0 && POLICY.addOnRequiresNewFiling) {
      var f = c.newFiling || {};
      var used = p.tranches.map(function (t) { return t.filingId; }).concat(p.reviews.map(function (r) { return r.filingId; })).filter(text);
      if (!(f.kind === 'periodic' && text(f.id) && isoTime(f.publishedAt) && isoTime(c.decidedAt) && Date.parse(f.publishedAt) > Date.parse(last) && Date.parse(f.publishedAt) <= Date.parse(c.decidedAt)))
        why.push('추가 매수 근거 없음: 직전 결정 이후 공개된 새 정기 공시(식별자 포함) 필요(가격·뉴스는 새 근거 아님)');
      else if (used.indexOf(f.id.trim()) >= 0) why.push('추가 매수 근거 없음: 이미 사용한 공시 재사용');
      else filingId = f.id.trim();
    }
    if (c.conviction === true && CONVICTION_LOCKED) why.push('확신 종목 표시는 무시(신뢰 등록 경로 없음): 상한 ' + POLICY.capPct + '% 적용');
    var hard = why.filter(function (w) { return w.indexOf('확신 종목 표시는 무시') !== 0; });
    // CR-3: 정보가 쓸 수 있게 된 결정시각(거래소 현지일)과 신호일 중 늦은 날 이후 첫 거래일만.
    var fillDay = !hard.length ? nextTradingDay(c.calendar, maxDay(c.signalAsOf, decidedDay)) : null;
    if (!hard.length && !fillDay) hard.push('다음 거래일 없음(캘린더 부족)');
    if (!hard.length) hard = hard.concat(fillTimeReasons(a, fillDay));
    if (hard.length) return { action: 'PAPER_ENTRY_HOLD', reasons: why.length > hard.length ? why : hard, order: null };
    var eq = bucketEquity(a, ccy);
    var target = eq * POLICY.capPct / 100;
    var budget = target / POLICY.tranches;
    return { action: 'PAPER_ENTRY_PLANNED', reasons: why, order: null, plan: issuePlan('ENTRY', a.id, {
      market: c.market, ccy: ccy, symbol: c.symbol.trim(), sector: text(c.sector) ? c.sector : null, tranche: n + 1,
      decidedAt: c.decidedAt, signalAsOf: c.signalAsOf, decisionVersion: c.decisionVersion, fillRule: POLICY.fill, fillDay: fillDay,
      gateState: c.gate.state, gateEvaluatedAt: c.gate.evaluatedAt, filingId: filingId,
      budget: budget, capPct: POLICY.capPct, equityAtPlan: eq, riskLimitsAtPlan: Object.freeze(clone(rl)) }) };
  }

  function idemKey(a, plan, kind) { return [plan.market, a.id, plan.symbol, plan.decisionVersion, kind, plan.tranche].join('|'); }

  /* 체결 가정: 계획의 fillDay 종가로만. 다른 날짜·비합성 시세·상한/현금 하한 위반은 거부. 같은 키 재요청은 변화 없음(멱등). */
  function fillEntry(a, plan, bar) {
    if (!a || a.synthetic !== true || !plan) return { ok: false, reasons: ['계좌·계획 없음 또는 실제 자료 잠금'], account: a };
    var bad = acctReasons(a).concat(planReasons(a, plan, 'ENTRY'));
    if (bad.length) return { ok: false, reasons: bad, account: a };
    var key = idemKey(a, plan, 'BUY');
    if (a.keys[key]) return { ok: true, duplicate: true, reasons: ['같은 체결 키 — 변화 없음'], account: a };
    var why = [];
    // CR-2: 체결 시점 재검사(계획 이후 바뀐 계좌 상태 반영).
    var rl = a.riskLimits || {};
    if (rl.cashFloorPct == null || rl.dailyLossStopPct == null || rl.monthlyLossStopPct == null) why.push('위험 한도(현금 하한·일/월 손실 중지선) 미정: 체결 보류');
    if (a.halted && a.halted[plan.ccy]) why.push('손실 중지선 발동 중(' + a.halted[plan.ccy] + '): 계획 후 중지 — 체결 보류');
    // CR-7: 계획 발급 당시 한도보다 완화됐으면 거부(사용자 승인 경로 없음). 더 엄격해진 한도는 아래 검사에 그대로 적용.
    var was = plan.riskLimitsAtPlan || {};
    Object.keys(LOOSER).forEach(function (k) {
      if (rl[k] != null && (!finite(was[k]) || LOOSER[k](rl[k], was[k]))) why.push('계획 이후 위험 한도 완화(' + k + ' ' + was[k] + '→' + rl[k] + '): 사용자 승인 없는 완화 거부');
    });
    var cur = a.positions[posKey(plan.market, plan.symbol)];
    var curN = cur ? cur.tranches.length : 0;
    if (plan.tranche !== curN + 1 || plan.tranche > POLICY.tranches) why.push('계획 회차(' + plan.tranche + ')가 현재 보유 회차와 맞지 않음(이전 계획·중복 계획)');
    if (!bar || bar.synthetic !== true) why.push('실제 자료 잠금: 합성 종가만');
    bar = bar || {};
    if (bar.date !== plan.fillDay) why.push('체결일은 신호 다음 거래일(' + plan.fillDay + ')만 허용 — 유리한 날 고르기 금지');
    why = why.concat(fillTimeReasons(a, plan.fillDay));
    if (bar.priceType !== 'close') why.push('가격 종류가 종가 아님');
    if (bar.currency !== plan.ccy) why.push('통화 불일치');
    if (!pos(bar.close)) why.push('종가 값 오류');
    if (why.length) return { ok: false, reasons: why, account: a };
    var qty = Math.floor(plan.budget / bar.close);
    if (qty < 1) return { ok: false, reasons: ['회차 예산으로 1주도 못 삼(합성 예산 부족)'], account: a };
    var n = clone(a), k = posKey(plan.market, plan.symbol);
    var p = n.positions[k] || { market: plan.market, ccy: plan.ccy, symbol: plan.symbol, sector: plan.sector, qty: 0, cost: 0, tranches: [], reviews: [], exitReviewStreak: 0, lastPrice: bar.close };
    var amt = qty * bar.close;
    var cashAfter = n.cash[plan.ccy] - amt;
    var eqNow = bucketEquity(n, plan.ccy, (function () { var o = {}; o[k] = bar.close; return o; })());
    var posAfter = (p.qty + qty) * bar.close;
    if (cashAfter < 0) return { ok: false, reasons: ['현금 부족'], account: a };
    if (posAfter > eqNow * POLICY.capPct / 100 + 1e-9) return { ok: false, reasons: ['종목 상한 ' + POLICY.capPct + '% 초과'], account: a };
    if (cashAfter < eqNow * n.riskLimits.cashFloorPct / 100 - 1e-9) return { ok: false, reasons: ['현금 하한 ' + n.riskLimits.cashFloorPct + '% 위반'], account: a };
    p.qty += qty; p.cost += amt; p.lastPrice = bar.close;
    p.tranches.push({ tranche: plan.tranche, decidedAt: plan.decidedAt, fillDay: bar.date, qty: qty, price: bar.close, filingId: plan.filingId });
    n.positions[k] = p; n.cash[plan.ccy] = cashAfter;
    var ev = { contract: CONTRACT, seq: n.events.length + 1, kind: 'PAPER_BUY', idempotencyKey: key, market: plan.market, symbol: plan.symbol,
      tranche: plan.tranche, decidedAt: plan.decidedAt, signalAsOf: plan.signalAsOf, fillDay: bar.date, fillRule: POLICY.fill,
      price: bar.close, qty: qty, amount: amt, ccy: plan.ccy, decisionVersion: plan.decisionVersion, costStatus: POLICY.costStatus, policy: POLICY.version, synthetic: true };
    n.events.push(ev); n.keys[key] = ev.seq;
    return { ok: true, reasons: [], event: ev, account: reg(n) };
  }

  /* 새 정기 공시마다 강제 재평가 기록. DATA-UNAVAILABLE은 보류·증거 보존이지 청산 근거가 아니다(연속 횟수 불변).
     EXIT-REVIEW가 정책 횟수만큼 연속이면 가상 전량 청산 계획(EXIT도 동일). 체결은 다음 거래일 종가. */
  function recordReview(a, r) {
    if (!a || a.synthetic !== true || !r || r.synthetic !== true) return { ok: false, reasons: ['실제 자료 잠금: 합성 재평가만'], account: a };
    var ar = acctReasons(a);
    if (ar.length) return { ok: false, reasons: ar, account: a };
    var k = MARKETS[r.market] && text(r.symbol) ? posKey(r.market, r.symbol.trim()) : null;
    var p = k ? a.positions[k] : null;
    var why = [];
    if (!p || p.qty === 0) why.push('보유 가상 포지션 없음');
    if (OUTCOMES.indexOf(r.outcome) < 0) why.push('재평가 결과 값 오류');
    var hasFiling = r.outcome !== 'DATA-UNAVAILABLE';
    var fl = r.filing || {};
    if (hasFiling && !(fl.kind === 'periodic' && text(fl.id) && isoTime(fl.publishedAt))) why.push('재평가 근거 정기 공시(식별자·공개시각) 없음');
    if (!isoTime(r.reviewedAt)) why.push('재평가 시각 형식 오류');
    var tms = function (x) { return Date.parse(x); };
    if (p && p.reviews.length && isoTime(r.reviewedAt) && tms(r.reviewedAt) <= tms(p.reviews[p.reviews.length - 1].reviewedAt)) why.push('재평가 시각 역전');
    var lastBuy = p && p.tranches.length ? p.tranches[p.tranches.length - 1].decidedAt : null;
    if (lastBuy && isoTime(r.reviewedAt) && tms(r.reviewedAt) <= tms(lastBuy)) why.push('재평가 시각이 마지막 매수 결정보다 앞섬');
    if (!day(r.asOf)) why.push('재평가 기준일 형식 오류');
    var reviewDay = p ? localDay(r.reviewedAt, r.market) : null;
    if (p && isoTime(r.reviewedAt) && !reviewDay) why.push('재평가 시각 거래소 현지 날짜 변환 불가');
    if (reviewDay && day(r.asOf) && r.asOf > reviewDay) why.push('재평가 기준일이 재평가 시각보다 나중(미래 정보)');
    // CR-6: 계좌 시간축 — 마지막 체결일 이후(체결일 당일 제외: 종가 체결 전 재평가 방지), 마지막 평가일 이후, 기록된 마지막 시각 이후만.
    if (p && reviewDay) {
      var lastFill = p.tranches.length ? p.tranches[p.tranches.length - 1].fillDay : null;
      var ck = clock(a);
      if (lastFill && reviewDay <= lastFill) why.push('재평가가 가상 체결(' + lastFill + ' 종가) 이전·당일(거래소 현지일) — 체결 전 재평가 금지');
      if (lastFill && day(r.asOf) && r.asOf < lastFill) why.push('재평가 기준일이 가상 체결일보다 앞섬');
      if (ck.day && reviewDay < ck.day) why.push('계좌 시간축 역행: 이미 ' + ck.day + '까지 기록됨');
      if (ck.markDay && reviewDay <= ck.markDay) why.push('평가(' + ck.markDay + ') 이후 같은·과거 날 재평가 삽입 금지');
      if (ck.at && isoTime(r.reviewedAt) && tms(r.reviewedAt) <= tms(ck.at)) why.push('재평가 시각이 계좌의 마지막 기록 시각 이전');
    }
    // CR-3: 공시는 검토 시각 이전 공개분만, 같은 공시(식별자 또는 공개시각) 재사용 금지, 직전 사용 공시보다 새 것만.
    if (p && hasFiling && text(fl.id) && isoTime(fl.publishedAt) && isoTime(r.reviewedAt)) {
      if (tms(fl.publishedAt) > tms(r.reviewedAt)) why.push('재평가 공시가 검토 시각 이후 공개(미래 공시)');
      if (lastBuy && tms(fl.publishedAt) <= tms(lastBuy)) why.push('재평가 공시가 마지막 매수 결정 이전 공개(이미 반영된 공시)');
      var usedIds = p.tranches.map(function (t) { return t.filingId; }).concat(p.reviews.map(function (x) { return x.filingId; })).filter(text);
      var usedAt = p.reviews.map(function (x) { return x.filingPublishedAt; }).filter(isoTime);
      if (usedIds.indexOf(fl.id.trim()) >= 0 || usedAt.some(function (x) { return tms(x) === tms(fl.publishedAt); })) why.push('같은 공시 재사용(식별자·공개시각 중복)');
      else if (usedAt.length && tms(fl.publishedAt) < Math.max.apply(null, usedAt.map(tms))) why.push('직전 재평가 공시보다 오래된 공시');
    }
    if (why.length) return { ok: false, reasons: why, account: a };
    var n = clone(a), q = n.positions[k];
    if (r.outcome === 'EXIT-REVIEW') q.exitReviewStreak += 1;
    else if (r.outcome === 'HOLD') q.exitReviewStreak = 0;
    var exit = r.outcome === 'EXIT' || q.exitReviewStreak >= POLICY.exitReviewConsecutive;
    q.reviews.push({ reviewedAt: r.reviewedAt, outcome: r.outcome, filingId: hasFiling ? fl.id.trim() : null, filingPublishedAt: hasFiling ? fl.publishedAt : null, streak: q.exitReviewStreak, exitPlanned: exit });
    var ev = { contract: CONTRACT, seq: n.events.length + 1, kind: 'PAPER_REVIEW', market: r.market, symbol: q.symbol, outcome: r.outcome,
      reviewedAt: r.reviewedAt, reviewDay: reviewDay, streak: q.exitReviewStreak, exitPlanned: exit, policy: POLICY.version, synthetic: true };
    n.events.push(ev);
    var out = { ok: true, reasons: [], event: ev, account: reg(n), exitPlan: null };
    if (exit) {
      var fd = nextTradingDay(r.calendar, maxDay(r.asOf, reviewDay));
      if (!fd) { out.reasons.push('청산 계획: 다음 거래일 없음(캘린더 부족) — 보류'); return out; }
      out.exitPlan = issuePlan('EXIT', n.id, { market: r.market, ccy: q.ccy, symbol: q.symbol, qty: q.qty, fillRule: POLICY.fill, fillDay: fd, decidedAt: r.reviewedAt,
        decisionVersion: text(r.decisionVersion) ? r.decisionVersion : 'review', tranche: q.reviews.length, reviewIndex: q.reviews.length, reason: r.outcome === 'EXIT' ? 'EXIT' : 'EXIT-REVIEW x' + q.exitReviewStreak });
    }
    return out;
  }

  function fillExit(a, plan, bar) {
    if (!a || a.synthetic !== true || !plan) return { ok: false, reasons: ['계좌·계획 없음 또는 실제 자료 잠금'], account: a };
    var bad = acctReasons(a).concat(planReasons(a, plan, 'EXIT'));
    if (bad.length) return { ok: false, reasons: bad, account: a };
    var key = idemKey(a, plan, 'SELL');
    if (a.keys[key]) return { ok: true, duplicate: true, reasons: ['같은 체결 키 — 변화 없음'], account: a };
    var why = [];
    // CR-2: 계좌 기록상 청산 근거(해당 재평가가 마지막이고 청산 계획 표시)가 지금도 유효해야 함.
    var cp = a.positions[posKey(plan.market, plan.symbol)];
    var rv = cp && cp.reviews.length === plan.reviewIndex ? cp.reviews[plan.reviewIndex - 1] : null;
    if (!rv || rv.exitPlanned !== true || rv.reviewedAt !== plan.decidedAt) why.push('청산 근거 재검증 실패(이후 재평가가 있었거나 청산 조건 아님)');
    if (!bar || bar.synthetic !== true) why.push('실제 자료 잠금: 합성 종가만');
    bar = bar || {};
    if (bar.date !== plan.fillDay) why.push('청산일은 다음 거래일(' + plan.fillDay + ')만 허용');
    why = why.concat(fillTimeReasons(a, plan.fillDay));
    if (bar.priceType !== 'close') why.push('가격 종류가 종가 아님');
    if (bar.currency !== plan.ccy) why.push('통화 불일치');
    if (!pos(bar.close)) why.push('종가 값 오류');
    var k = posKey(plan.market, plan.symbol), p = a.positions[k];
    if (!p || p.qty !== plan.qty) why.push('보유 수량이 청산 계획과 다름');
    if (why.length) return { ok: false, reasons: why, account: a };
    var n = clone(a), q = n.positions[k], amt = q.qty * bar.close;
    var ev = { contract: CONTRACT, seq: n.events.length + 1, kind: 'PAPER_SELL', idempotencyKey: key, market: plan.market, symbol: plan.symbol,
      decidedAt: plan.decidedAt, fillDay: bar.date, fillRule: POLICY.fill, price: bar.close, qty: q.qty, amount: amt, ccy: plan.ccy,
      realizedGross: amt - q.cost, reason: plan.reason, costStatus: POLICY.costStatus, policy: POLICY.version, synthetic: true };
    n.cash[plan.ccy] += amt; q.realizedGross = (q.realizedGross || 0) + (amt - q.cost); q.qty = 0; q.cost = 0; q.lastPrice = bar.close;
    n.events.push(ev); n.keys[key] = ev.seq;
    return { ok: true, reasons: [], event: ev, account: reg(n) };
  }

  /* 평가(통화별 분리, 환산 합계 없음 — 환율 원천 미검증). 손실 중지선 판정: 직전 평가 대비(일), 해당 월 첫 평가 대비(월). */
  function markToMarket(a, date, prices) {
    if (!a || a.synthetic !== true || !prices || prices.synthetic !== true) return { ok: false, reasons: ['실제 자료 잠금: 합성 평가 가격만'], account: a };
    if (!day(date)) return { ok: false, reasons: ['평가일 형식 오류'], account: a };
    var ar = acctReasons(a);
    if (ar.length) return { ok: false, reasons: ar, account: a };
    var ck = clock(a);
    if (ck.day && date < ck.day) return { ok: false, reasons: ['계좌 시간축 역행: 이미 ' + ck.day + '까지 기록된 계좌에 ' + date + ' 평가 삽입 금지'], account: a };
    var lastMark = a.marks.length ? a.marks[a.marks.length - 1] : null;
    if (lastMark && date <= lastMark.date) return { ok: false, reasons: ['평가일 역전·중복'], account: a };
    var missing = [];
    Object.keys(a.positions).forEach(function (k) { if (a.positions[k].qty > 0 && !pos(prices[k])) missing.push(k); });
    if (missing.length) return { ok: false, reasons: ['평가 가격 누락(숨기지 않음): ' + missing.join(', ')], account: a };
    var n = clone(a), mark = { date: date, equity: {}, returnGrossPct: {} };
    Object.keys(n.positions).forEach(function (k) { if (n.positions[k].qty > 0) n.positions[k].lastPrice = prices[k]; });
    ['KRW', 'USD'].forEach(function (c) {
      if (!n.contributed[c]) return;
      var eq = bucketEquity(n, c);
      mark.equity[c] = round(eq, 4);
      mark.returnGrossPct[c] = round((eq / n.contributed[c] - 1) * 100, 4);
      var prev = lastMark && finite(lastMark.equity[c]) ? lastMark.equity[c] : null;
      var monthStart = null;
      for (var i = 0; i < n.marks.length; i++) if (n.marks[i].date.slice(0, 7) === date.slice(0, 7) && finite(n.marks[i].equity[c])) { monthStart = n.marks[i].equity[c]; break; }
      var rl = n.riskLimits;
      if (prev != null && rl.dailyLossStopPct != null && (1 - eq / prev) * 100 >= rl.dailyLossStopPct) n.halted[c] = n.halted[c] || ('일 손실 중지선 ' + rl.dailyLossStopPct + '% · ' + date);
      if (monthStart != null && rl.monthlyLossStopPct != null && (1 - eq / monthStart) * 100 >= rl.monthlyLossStopPct) n.halted[c] = n.halted[c] || ('월 손실 중지선 ' + rl.monthlyLossStopPct + '% · ' + date);
    });
    mark.costStatus = POLICY.costStatus; mark.label = LABEL;
    n.marks.push(mark);
    return { ok: true, reasons: [], mark: mark, account: reg(n) };
  }

  /* CR-5: 손실 중지 재개는 잠금. 사유 문자열·승인처럼 보이는 객체·다른 계좌 승인 모두 사용자 승인이 아니다.
     검증 가능한 순태씨 승인 경로(승인 출처·정책 버전·계좌·1회성)가 따로 설계·승인되기 전까지 항상 거부하고 계좌는 그대로 둔다. */
  function resume(a) {
    var why = ['손실 중지 재개 잠금(RESUME_LOCKED): 검증 가능한 순태씨 승인 경로 없음 — 사유 문자열은 승인 아님'];
    if (a && a.synthetic === true) why = why.concat(acctReasons(a));
    return { ok: false, reasons: why, account: a };
  }

  /* CR-7: 위험 한도 강화만 허용(현금 하한 올리기, 손실 중지선 낮추기). 미정(null) 한도 정하기·완화는 순태씨 결정 필요 → 거부. */
  function tightenRiskLimits(a, changes) {
    if (!a || a.synthetic !== true) return { ok: false, reasons: ['실제 자료 잠금: 합성 계좌만'], account: a };
    var why = acctReasons(a);
    if (why.length) return { ok: false, reasons: why, account: a };
    var ks = changes && typeof changes === 'object' ? Object.keys(changes) : [];
    if (!ks.length) why.push('바꿀 한도 없음');
    ks.forEach(function (k) {
      var now = a.riskLimits[k], v = changes[k];
      if (!LOOSER[k]) why.push('알 수 없는 한도: ' + k);
      else if (now == null) why.push(k + ' 미정: 숫자 결정은 순태씨 결정 필요(강화 경로로 설정 불가)');
      else if (!pct(v)) why.push(k + ' 범위 오류(0~100)');
      else if (LOOSER[k](v, now)) why.push(k + ' 완화(' + now + '→' + v + ') 거부: 사용자 승인 경로 없음');
    });
    if (why.length) return { ok: false, reasons: why, account: a };
    var n = clone(a), was = clone(a.riskLimits);
    ks.forEach(function (k) { n.riskLimits[k] = changes[k]; });
    n.events.push({ contract: CONTRACT, seq: n.events.length + 1, kind: 'PAPER_RISK_TIGHTEN', was: was, now: clone(n.riskLimits), policy: POLICY.version, synthetic: true });
    return { ok: true, reasons: [], account: reg(n) };
  }

  return Object.freeze({ CONTRACT: CONTRACT, POLICY: POLICY, REAL_DATA_LOCK: REAL_DATA_LOCK, CONVICTION_LOCKED: CONVICTION_LOCKED, RESUME_LOCKED: RESUME_LOCKED, REVIEW_STATES: REVIEW_STATES, LABEL: LABEL,
    nextTradingDay: nextTradingDay, localDay: localDay, createAccount: createAccount, planEntry: planEntry, fillEntry: fillEntry,
    recordReview: recordReview, fillExit: fillExit, markToMarket: markToMarket, resume: resume, tightenRiskLimits: tightenRiskLimits });
});
