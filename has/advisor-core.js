/* HAS 23단계 — AI 투자참모의 "규칙·검증" 핵심(순수 함수). 이것은 규칙 기반 합성 분석이며 Gemini 등 실제 AI 호출은 하지 않는다.
   실제 AI가 나중에 붙더라도 그 출력은 validateAdvice()를 통과해야 표시된다.
   원칙: 가격 하락만으로 '매수 검토'를 내지 않는다 · 자료가 오래됐거나 못 믿으면 '판단 보류' · 사실과 추정을 나눈다 ·
         공격형/방어형은 같은 엔진의 두 역할이다(독립된 AI 모델 두 개의 검증이라고 쓰지 않는다) · 주문·실행 기능 없음. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./watch-engine.js')); else root.HASAdvisorCore = factory(root.HASWatchEngine); })(typeof globalThis !== 'undefined' ? globalThis : this, function (W) {
  'use strict';
  var OPINIONS = Object.freeze(['매수 검토', '보유', '비중 축소 검토', '판단 보류']);
  var INDEPENDENCE = 'same-engine-two-roles';
  var NOTICE = '공격형·방어형은 같은 분석 엔진의 서로 다른 역할입니다. 독립된 두 AI 모델이 검증한 결과가 아닙니다. 매수·매도 결정과 주문은 사용자가 직접 합니다.';
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  var DEF = Object.freeze({ targetWeightPct: 10, minCashPct: 10, aggressiveDrawdown: 20, defensiveDrawdown: 35, buyDrawdown: 30 });

  /* stock/w(evaluateStock 결과)/ctx{weightPct,cashPct,cashBasis}로 조언 한 건을 만든다. */
  function analyze(stock, w, ctx, nowISO, settings) {
    // Re-evaluate current inputs: a cached/caller-supplied watch result is not evidence.
    stock = stock && typeof stock === 'object' ? stock : {};
    w = W.evaluateStock(stock, ctx, nowISO, settings && settings.watchSettings);
    var s = Object.assign({}, DEF, settings || {}), q = stock.quote, held = !!stock.held;
    var wt = ctx && fin(ctx.weightPct) ? ctx.weightPct : null, cash = ctx && fin(ctx.cashPct) ? ctx.cashPct : null;
    var adv = { ticker: stock.ticker, name: stock.name || stock.ticker, asOf: nowISO, opinion: '판단 보류', aggressive: null, defensive: null,
      facts: [], estimates: [], reasonsFor: [], reasonsAgainst: [], unknown: w.missing.slice(), risks: [], holding: { held: held, weightPct: wt, cashPct: cash },
      conditions: { buyReview: [], sellReview: [] }, checks: [], dataQuality: { ok: w.dataGate.ok, why: w.dataGate.why.slice() }, independence: INDEPENDENCE, notice: NOTICE, source: q && q.source || null };
    if (!w.dataGate.ok) { adv.reasonsAgainst.push('시세를 신뢰할 수 없어 판단하지 않습니다: ' + w.dataGate.why.join(', ')); adv.checks.push('시세 출처·기준일·독립 대조 확인'); adv.aggressive = { stance: '판단 보류', why: ['자료 부족'] }; adv.defensive = { stance: '판단 보류', why: ['자료 부족'] }; return adv; }
    adv.facts.push({ text: '현재가 ' + q.price + ' ' + q.currency + ' (' + q.asOfDate + ')', source: q.source });
    w.signals.forEach(function (g) { adv.facts.push({ text: g.evidence.join(' / '), source: g.source || '신호 계산' }); });
    var dd = w.drawdownPct, f = w.fundamentalsStatus, t = w.thesisStatus;
    var sg = function (type) { return w.signals.some(function (x) { return x.type === type; }); };
    if (f === 'deteriorated') adv.risks.push('재무 악화 신호'); if (t === 'broken') adv.risks.push('투자 논리 훼손'); if (sg('concentration')) adv.risks.push('보유 비중 과다'); if (sg('loss-risk')) adv.risks.push('손실 위험 증가');
    if (cash !== null && cash < s.minCashPct) adv.risks.push('현금 비중 부족');
    // 매수 검토 조건 문구(항상 제시)
    adv.conditions.buyReview = ['52주 고점 대비 -' + s.buyDrawdown + '% 이상 하락', '재무 악화 신호 없음(최신 재무자료 확인)', '투자 논리 유지 확인', '종목 비중 ' + s.targetWeightPct + '% 미만이고 매수 후에도 현금 ' + s.minCashPct + '% 이상'];
    adv.conditions.sellReview = ['투자 논리 훼손 또는 재무 악화 확인', '손실 -20% 이하이면서 비중 10% 이상', '비중 한도(25%) 초과'];
    // 공격형
    var aBuy = dd !== null && dd >= s.aggressiveDrawdown && f === 'ok' && t === 'intact' && (wt === null || wt < s.targetWeightPct);
    // 방어형: 더 큰 하락 + 매수 후 현금 여력 + 비중 여유
    var dBuy = dd !== null && dd >= s.defensiveDrawdown && f === 'ok' && t === 'intact' && wt !== null && wt < s.targetWeightPct && cash !== null && cash >= s.minCashPct + 2;
    var reduce = held && (t === 'broken' || (f === 'deteriorated' && (sg('loss-risk') || sg('concentration'))) || sg('concentration'));
    var incomplete = f !== 'ok' || t !== 'intact';
    adv.aggressive = { stance: aBuy ? '매수 검토' : (reduce ? '비중 축소 검토' : (held && !incomplete ? '보유' : '판단 보류')), why: [] };
    adv.defensive = { stance: dBuy ? '매수 검토' : (reduce ? '비중 축소 검토' : (held && !incomplete ? '보유' : '판단 보류')), why: [] };
    if (aBuy) adv.aggressive.why.push('하락 ' + dd + '% 이상이고 재무·투자 논리 이상 없음'); if (!dBuy && aBuy) adv.defensive.why.push('방어형은 하락 ' + s.defensiveDrawdown + '% 이상과 현금 여력(' + (s.minCashPct + 2) + '% 이상)이 필요');
    if (reduce) { adv.opinion = '비중 축소 검토'; adv.reasonsFor.push('위험 신호: ' + adv.risks.join(', ')); adv.reasonsAgainst.push('가격 하락이 일시적일 수 있음(추정)'); adv.estimates.push({ text: '일시 하락 가능성', basis: '자료로 확인되지 않은 일반론' }); }
    else if (incomplete) { adv.opinion = '판단 보류'; adv.reasonsAgainst.push((dd !== null && dd >= s.buyDrawdown ? '가격만 하락했고 ' : '') + '재무(' + f + ')·투자 논리(' + t + ') 근거가 부족해 긍정적인 판단을 내지 않습니다'); adv.checks.push('최신 재무자료와 투자 논리 점검'); }
    else if (aBuy && dBuy) { adv.opinion = '매수 검토'; adv.reasonsFor.push('고점 대비 -' + dd + '%, 재무·투자 논리 이상 없음'); adv.reasonsAgainst.push('하락 원인이 구조적일 가능성은 자료로 완전히 배제되지 않음'); adv.checks.push('매수 전 최신 공시·실적 확인'); }
    else if (held) { adv.opinion = '보유'; adv.reasonsFor.push('매도·매수 조건에 해당하는 확인된 신호 없음'); if (aBuy) adv.reasonsAgainst.push('공격형은 매수 검토, 방어형 조건 미충족 → 의견 불일치로 보유'); }
    else { adv.opinion = '판단 보류'; adv.reasonsAgainst.push('뚜렷한 신호 없음(관찰 유지)'); if (aBuy) adv.reasonsAgainst.push('공격형만 매수 검토, 방어형 조건 미충족'); }
    if (!adv.reasonsAgainst.length) adv.reasonsAgainst.push('반대 근거는 자료에서 확인되지 않음(검토 필요)');
    adv.unknown = w.missing.slice();
    if (!adv.checks.length) adv.checks.push('다음 실적 발표·공시 일정과 최신 재무자료를 확인');
    return adv;
  }
  /* 외부(AI) 출력 포함 모든 조언의 표시 전 검증. 오류가 있으면 표시하지 않는다. */
  function validateAdvice(a, nowISO) {
    var e = [], need = ['ticker', 'asOf', 'opinion', 'facts', 'estimates', 'reasonsFor', 'reasonsAgainst', 'unknown', 'risks', 'holding', 'conditions', 'checks', 'dataQuality', 'independence'];
    if (!a || typeof a !== 'object') return { ok: false, errors: ['형식 오류'] };
    need.forEach(function (k) { if (a[k] === undefined) e.push('필드 없음: ' + k); });
    if (OPINIONS.indexOf(a.opinion) < 0) e.push('허용되지 않은 의견: ' + a.opinion);
    if (a.opinion !== '판단 보류') {
      if (!a.dataQuality || a.dataQuality.ok !== true) e.push('자료가 신뢰되지 않는데 판단 의견을 냄');
      if (!Array.isArray(a.reasonsAgainst) || !a.reasonsAgainst.length) e.push('반대 근거 없음');
      if (!Array.isArray(a.facts) || !a.facts.length) e.push('확인된 사실 없음');
    }
    if (Array.isArray(a.facts) && a.facts.some(function (x) { return !x || !x.source; })) e.push('출처 없는 사실이 있음');
    if (a.independence !== INDEPENDENCE && !(a.independence === 'two-independent-models' && Array.isArray(a.verifiedBy) && new Set(a.verifiedBy).size >= 2)) e.push('독립 검증 표현이 근거 없음');
    if (a.asOf && nowISO && Date.parse(a.asOf) > Date.parse(nowISO) + 60000) e.push('조언 시각이 미래');
    if (/자동\s*(매수|매도|주문)|주문(을)?\s*실행/.test(JSON.stringify(a))) e.push('주문 실행 표현 금지');
    return { ok: e.length === 0, errors: e };
  }
  return Object.freeze({ OPINIONS: OPINIONS, NOTICE: NOTICE, INDEPENDENCE: INDEPENDENCE, DEFAULTS: DEF, analyze: analyze, validateAdvice: validateAdvice });
});
