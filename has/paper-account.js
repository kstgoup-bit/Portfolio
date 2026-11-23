/* HAS 가상 계좌(PAPER ACCOUNT) P2 순수 계산 모듈 v0 — 합성 자료 전용, 연구용.
   근거: 설계 CLAUDE-DEV-PAPER-ACCOUNT-20261123.md(지피 0829 APPROVE) + 순태씨 2026-11-23 대화창 결정
   ("8번 승인, 나머지 추천대로").
   - 네트워크·저장소·투자기록·백업을 읽거나 쓰지 않는다. 입력 객체를 바꾸지 않는다(새 상태를 돌려준다).
   - 실제 자료 잠금(REAL_DATA_LOCK): synthetic:true 가 아닌 계좌·후보·시세는 모두 거부한다. 실종목 기록은 G0 이후 별도 승인.
   - 주문·자동매매·실제 수량을 만들지 않는다. 모든 체결은 '연구용 체결 가정'이며 실현 가능 성과가 아니다.
   - 진입 전제: 매수 검토 게이트(has/buy-review-gate.js)가 발급한 매수 검토 상태만. 가격 하락만으로는 진입하지 않는다.
   - 비용(수수료·세금·환전)은 미확정 → 0으로 대입하지 않고 결과에 costStatus:'unconfirmed'로 표시한다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASPaperAccount = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
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
    return { ok: true, reasons: [], account: acct };
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
    if (!c || c.synthetic !== true) why.push('실제 자료 잠금: 합성 후보만(실종목은 G0 이후 별도 승인)');
    c = c || {};
    var ccy = MARKETS[c.market];
    if (!ccy) why.push('시장 KR/US 아님');
    if (!text(c.symbol)) why.push('종목 없음');
    if (!isoTime(c.decidedAt)) why.push('결정시각 형식 오류');
    if (!day(c.signalAsOf)) why.push('신호 기준일 형식 오류');
    if (isoTime(c.decidedAt) && day(c.signalAsOf) && c.decidedAt.slice(0, 10) < c.signalAsOf) why.push('결정시각이 신호 기준일보다 앞섬');
    var g = c.gate || {};
    if (g.buyReview !== true || REVIEW_STATES.indexOf(g.state) < 0) why.push('매수 검토 게이트 발급 결과 아님(가격 하락만으로 진입 금지)');
    if (g.synthetic !== true) why.push('게이트 결과가 합성 검증 경로가 아님');
    if (!text(c.decisionVersion)) why.push('결정 버전 없음');
    // 위험 한도 숫자 미정이면 진입 보류(fail-closed).
    var rl = a.riskLimits;
    if (rl.cashFloorPct == null || rl.dailyLossStopPct == null || rl.monthlyLossStopPct == null) why.push('위험 한도(현금 하한·일/월 손실 중지선) 미정: 순태씨 결정 전 진입 보류');
    if (ccy && a.halted[ccy]) why.push('손실 중지선 발동 중(' + a.halted[ccy] + '): 신규 가상 매수 중지');
    var k = ccy && text(c.symbol) ? posKey(c.market, c.symbol.trim()) : null;
    var p = k ? a.positions[k] : null;
    var n = p ? p.tranches.length : 0;
    if (n >= POLICY.tranches) why.push('분할 회차 소진(최대 ' + POLICY.tranches + '회)');
    if (n > 0 && POLICY.addOnRequiresNewFiling) {
      var last = p.tranches[n - 1].decidedAt;
      var f = c.newFiling || {};
      if (!(f.kind === 'periodic' && isoTime(f.publishedAt) && Date.parse(f.publishedAt) > Date.parse(last) && Date.parse(f.publishedAt) <= Date.parse(c.decidedAt)))
        why.push('추가 매수 근거 없음: 직전 결정 이후 공개된 새 정기 공시 필요(가격·뉴스는 새 근거 아님)');
    }
    if (c.conviction === true && CONVICTION_LOCKED) why.push('확신 종목 표시는 무시(신뢰 등록 경로 없음): 상한 ' + POLICY.capPct + '% 적용');
    var hard = why.filter(function (w) { return w.indexOf('확신 종목 표시는 무시') !== 0; });
    var fillDay = nextTradingDay(c.calendar, c.signalAsOf);
    if (!hard.length && !fillDay) hard.push('다음 거래일 없음(캘린더 부족)');
    if (hard.length) return { action: 'PAPER_ENTRY_HOLD', reasons: why.length > hard.length ? why : hard, order: null };
    var eq = bucketEquity(a, ccy);
    var target = eq * POLICY.capPct / 100;
    var budget = target / POLICY.tranches;
    return { action: 'PAPER_ENTRY_PLANNED', reasons: why, order: null, plan: {
      market: c.market, ccy: ccy, symbol: c.symbol.trim(), sector: text(c.sector) ? c.sector : null, tranche: n + 1,
      decidedAt: c.decidedAt, signalAsOf: c.signalAsOf, decisionVersion: c.decisionVersion, fillRule: POLICY.fill, fillDay: fillDay,
      budget: budget, capPct: POLICY.capPct, equityAtPlan: eq } };
  }

  function idemKey(a, plan, kind) { return [plan.market, a.id, plan.symbol, plan.decisionVersion, kind, plan.tranche].join('|'); }

  /* 체결 가정: 계획의 fillDay 종가로만. 다른 날짜·비합성 시세·상한/현금 하한 위반은 거부. 같은 키 재요청은 변화 없음(멱등). */
  function fillEntry(a, plan, bar) {
    if (!a || a.synthetic !== true || !plan) return { ok: false, reasons: ['계좌·계획 없음 또는 실제 자료 잠금'], account: a };
    var key = idemKey(a, plan, 'BUY');
    if (a.keys[key]) return { ok: true, duplicate: true, reasons: ['같은 체결 키 — 변화 없음'], account: a };
    var why = [];
    if (!bar || bar.synthetic !== true) why.push('실제 자료 잠금: 합성 종가만');
    bar = bar || {};
    if (bar.date !== plan.fillDay) why.push('체결일은 신호 다음 거래일(' + plan.fillDay + ')만 허용 — 유리한 날 고르기 금지');
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
    p.tranches.push({ tranche: plan.tranche, decidedAt: plan.decidedAt, fillDay: bar.date, qty: qty, price: bar.close });
    n.positions[k] = p; n.cash[plan.ccy] = cashAfter;
    var ev = { contract: CONTRACT, seq: n.events.length + 1, kind: 'PAPER_BUY', idempotencyKey: key, market: plan.market, symbol: plan.symbol,
      tranche: plan.tranche, decidedAt: plan.decidedAt, signalAsOf: plan.signalAsOf, fillDay: bar.date, fillRule: POLICY.fill,
      price: bar.close, qty: qty, amount: amt, ccy: plan.ccy, decisionVersion: plan.decisionVersion, costStatus: POLICY.costStatus, policy: POLICY.version, synthetic: true };
    n.events.push(ev); n.keys[key] = ev.seq;
    return { ok: true, reasons: [], event: ev, account: n };
  }

  /* 새 정기 공시마다 강제 재평가 기록. DATA-UNAVAILABLE은 보류·증거 보존이지 청산 근거가 아니다(연속 횟수 불변).
     EXIT-REVIEW가 정책 횟수만큼 연속이면 가상 전량 청산 계획(EXIT도 동일). 체결은 다음 거래일 종가. */
  function recordReview(a, r) {
    if (!a || a.synthetic !== true || !r || r.synthetic !== true) return { ok: false, reasons: ['실제 자료 잠금: 합성 재평가만'], account: a };
    var k = MARKETS[r.market] && text(r.symbol) ? posKey(r.market, r.symbol.trim()) : null;
    var p = k ? a.positions[k] : null;
    var why = [];
    if (!p || p.qty === 0) why.push('보유 가상 포지션 없음');
    if (OUTCOMES.indexOf(r.outcome) < 0) why.push('재평가 결과 값 오류');
    if (r.outcome !== 'DATA-UNAVAILABLE' && !(r.filing && r.filing.kind === 'periodic' && isoTime(r.filing.publishedAt))) why.push('재평가 근거 정기 공시 없음');
    if (!isoTime(r.reviewedAt)) why.push('재평가 시각 형식 오류');
    if (p && p.reviews.length && isoTime(r.reviewedAt) && r.reviewedAt <= p.reviews[p.reviews.length - 1].reviewedAt) why.push('재평가 시각 역전');
    if (!day(r.asOf)) why.push('재평가 기준일 형식 오류');
    if (why.length) return { ok: false, reasons: why, account: a };
    var n = clone(a), q = n.positions[k];
    if (r.outcome === 'EXIT-REVIEW') q.exitReviewStreak += 1;
    else if (r.outcome === 'HOLD') q.exitReviewStreak = 0;
    q.reviews.push({ reviewedAt: r.reviewedAt, outcome: r.outcome, filingPublishedAt: r.filing ? r.filing.publishedAt : null, streak: q.exitReviewStreak });
    var exit = r.outcome === 'EXIT' || q.exitReviewStreak >= POLICY.exitReviewConsecutive;
    var ev = { contract: CONTRACT, seq: n.events.length + 1, kind: 'PAPER_REVIEW', market: r.market, symbol: q.symbol, outcome: r.outcome,
      reviewedAt: r.reviewedAt, streak: q.exitReviewStreak, exitPlanned: exit, policy: POLICY.version, synthetic: true };
    n.events.push(ev);
    var out = { ok: true, reasons: [], event: ev, account: n, exitPlan: null };
    if (exit) {
      var fd = nextTradingDay(r.calendar, r.asOf);
      if (!fd) { out.reasons.push('청산 계획: 다음 거래일 없음(캘린더 부족) — 보류'); return out; }
      out.exitPlan = { market: r.market, ccy: q.ccy, symbol: q.symbol, qty: q.qty, fillRule: POLICY.fill, fillDay: fd, decidedAt: r.reviewedAt,
        decisionVersion: text(r.decisionVersion) ? r.decisionVersion : 'review', tranche: q.reviews.length, reason: r.outcome === 'EXIT' ? 'EXIT' : 'EXIT-REVIEW x' + q.exitReviewStreak };
    }
    return out;
  }

  function fillExit(a, plan, bar) {
    if (!a || a.synthetic !== true || !plan) return { ok: false, reasons: ['계좌·계획 없음 또는 실제 자료 잠금'], account: a };
    var key = idemKey(a, plan, 'SELL');
    if (a.keys[key]) return { ok: true, duplicate: true, reasons: ['같은 체결 키 — 변화 없음'], account: a };
    var why = [];
    if (!bar || bar.synthetic !== true) why.push('실제 자료 잠금: 합성 종가만');
    bar = bar || {};
    if (bar.date !== plan.fillDay) why.push('청산일은 다음 거래일(' + plan.fillDay + ')만 허용');
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
    return { ok: true, reasons: [], event: ev, account: n };
  }

  /* 평가(통화별 분리, 환산 합계 없음 — 환율 원천 미검증). 손실 중지선 판정: 직전 평가 대비(일), 해당 월 첫 평가 대비(월). */
  function markToMarket(a, date, prices) {
    if (!a || a.synthetic !== true || !prices || prices.synthetic !== true) return { ok: false, reasons: ['실제 자료 잠금: 합성 평가 가격만'], account: a };
    if (!day(date)) return { ok: false, reasons: ['평가일 형식 오류'], account: a };
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
    return { ok: true, reasons: [], mark: mark, account: n };
  }

  /* 순태씨 재개 확인 전까지 중지 유지. 재개도 합성 계좌에서만, 사유 기록. */
  function resume(a, ccy, note) {
    if (!a || a.synthetic !== true || (ccy !== 'KRW' && ccy !== 'USD') || !text(note)) return { ok: false, account: a };
    var n = clone(a); n.events.push({ contract: CONTRACT, seq: n.events.length + 1, kind: 'PAPER_RESUME', ccy: ccy, was: n.halted[ccy], note: note, synthetic: true });
    n.halted[ccy] = null; return { ok: true, account: n };
  }

  return Object.freeze({ CONTRACT: CONTRACT, POLICY: POLICY, REAL_DATA_LOCK: REAL_DATA_LOCK, CONVICTION_LOCKED: CONVICTION_LOCKED, REVIEW_STATES: REVIEW_STATES, LABEL: LABEL,
    nextTradingDay: nextTradingDay, createAccount: createAccount, planEntry: planEntry, fillEntry: fillEntry,
    recordReview: recordReview, fillExit: fillExit, markToMarket: markToMarket, resume: resume });
});
