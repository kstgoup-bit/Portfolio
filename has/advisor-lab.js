/* HAS 23단계 독립 시험 화면. 합성 데이터만 사용. 저장소·네트워크·타이머 사용 없음. 기존 앱(portfolio_v5.html)과 연결되지 않는다. */
(function () {
  'use strict';
  var Q = HASQuoteModel, W = HASWatchEngine, A = HASAdvisorCore, L = HASAlertsCore, J = HASAdviceJournal;
  var NOW = '2026-11-05T14:00:00+09:00', NEXT = '2026-11-13T14:00:00+09:00';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function raw(o) { return Object.assign({ kind: 'close', asOfDate: '2026-11-05', asOfTime: '2026-11-05T09:00:00+09:00', fetchedAt: NOW, source: '합성 시험 공급자', verification: 'independent-verified', synthetic: true }, o); }
  var HOLD = [{ ticker: 'SYN-KR1', name: '합성 국내 우량A', market: 'KR', currency: 'KRW', quantity: 10, avgPrice: 100 }, { ticker: 'SYN-US1', name: '합성 미국 성장B', market: 'US', currency: 'USD', quantity: 3, avgPrice: 100 }];
  var HOLD_SNAPSHOT = JSON.stringify(HOLD);
  var RAWS = {
    'SYN-KR1': raw({ ticker: 'SYN-KR1', market: 'KR', currency: 'KRW', price: 60 }), 'SYN-US1': raw({ ticker: 'SYN-US1', market: 'US', currency: 'USD', price: 92 }),
    'SYN-KR2': raw({ ticker: 'SYN-KR2', market: 'KR', currency: 'KRW', price: 55, verification: 'unverified' }), 'SYN-US2': raw({ ticker: 'SYN-US2', market: 'US', currency: 'USD', price: 60 }) };
  var FX = { rate: 1400, source: '합성 환율', appliedAt: '2026-11-05T09:00:00+09:00' };
  var common = { high52w: function (s) { return { price: 100, asOfDate: '2026-11-05', source: '합성 시험 공급자' }; }, returns: { stockPct: -30, benchPct: -5, periodDays: 20, asOfDate: '2026-11-05', source: '합성 시험 공급자' } };
  var FUND_OK = { asOfDate: '2026-09-30', source: '합성 재무', revenueGrowthPct: 8, freeCashFlow: 100, freeCashFlowPrev: 90, debtToEquity: 0.6, debtToEquityPrev: 0.6 };
  var META = {
    'SYN-KR1': { name: '합성 국내 우량A', market: 'KR', fundamentals: FUND_OK, thesis: { intact: true, note: '합성' }, held: HOLD[0] },
    'SYN-US1': { name: '합성 미국 성장B', market: 'US', fundamentals: Object.assign({}, FUND_OK, { freeCashFlow: -5 }), thesis: { intact: false, note: '합성: 핵심 제품 경쟁력 약화' }, held: HOLD[1] },
    'SYN-KR2': { name: '합성 국내 중형C(미검증 시세)', market: 'KR', fundamentals: FUND_OK, thesis: { intact: true, note: '합성' }, held: null },
    'SYN-US2': { name: '합성 미국 대형D(재무자료 없음)', market: 'US', fundamentals: null, thesis: null, held: null } };
  var CTX = { weightPct: 6, weightBasis: 'verified', cashPct: 20, cashBasis: 'verified', market: { vix: { level: 32, change5dPct: 10, asOfDate: '2026-11-05', source: '합성 시험 공급자' } } };
  var book = Q.emptyBook(), alertState = L.emptyState(), failMode = false, lastShown = [], entryObj = null;

  function fetchAll(simFail) { Object.keys(RAWS).forEach(function (t) { book = Q.applyFetch(book, t, simFail ? { ok: false, issues: ['합성: 네트워크 오류'] } : Q.normalize(RAWS[t]), NOW); }); }
  function stocks() { return Object.keys(META).map(function (t) { var m = META[t], v = Q.view(book, t, NOW), q = book.current[t] || null;
    return { ticker: t, name: m.name, market: m.market, quote: q, high52w: common.high52w(), returns: common.returns, fundamentals: m.fundamentals, thesis: m.thesis, held: m.held }; }); }
  function tag(text, kind) { return el('span', text, 'tag ' + (kind || '')); }

  function renderPrices() {
    var box = clear($('prices'));
    Object.keys(META).forEach(function (t) { var v = Q.view(book, t, NOW), d = el('div', null, 'stock'); d.setAttribute('data-testid', 'price-' + t);
      var r = el('div', null, 'row'); r.appendChild(el('b', META[t].name)); r.appendChild(el('span', t, 'kv')); d.appendChild(r);
      if (v.current) { var p = el('div', null, 'row'); p.appendChild(el('span', v.current.price + ' ' + book.current[t].currency, 'big'));
        var kt = tag(v.current.kind, v.current.kind === '미확인' ? 'warn' : 'blue'); kt.setAttribute('data-testid', 'kind-' + t); p.appendChild(kt); d.appendChild(p);
        d.appendChild(el('div', '기준일 ' + v.current.asOfDate + ' · 기준시각 ' + v.current.asOfTime + ' · 출처 ' + v.current.source, 'kv'));
        var vt = tag(v.current.verification, v.current.verification === '독립 대조 완료' ? 'ok' : 'warn'); d.appendChild(vt); }
      if (v.lastVerified) d.appendChild(el('div', '마지막 검증 가격 ' + v.lastVerified.price + ' (기준일 ' + v.lastVerified.asOfDate + ')', 'kv'));
      v.warnings.forEach(function (w) { d.appendChild(el('div', w, 'warnline')); });
      box.appendChild(d); });
    var fx = Q.fxView(FX, NOW); box.appendChild(el('div', fx.label, 'note'));
    var val = Q.valuation(HOLD, book, FX, NOW), vb = clear($('valuation'));
    vb.appendChild(el('div', '평가액 ' + val.totalKRW.toLocaleString() + '원' + (val.estimatedPartKRW ? ' (이 중 추정 ' + val.estimatedPartKRW.toLocaleString() + '원: 현재가가 아닌 값)' : ''), 'big'));
    vb.appendChild(el('div', '보유 기록 변경: ' + (JSON.stringify(HOLD) === HOLD_SNAPSHOT ? '없음' : '있음(오류)') + ' — 조회가 실패해도 투자기록은 바뀌지 않습니다', 'kv'));
    var rb = el('div', val.rows.map(function (r) { return r.ticker + ' ' + r.basis; }).join(' · '), 'note'); rb.setAttribute('data-testid', 'val-basis'); vb.appendChild(rb);
  }
  function evaluateAll() { return stocks().map(function (s) { var c = Object.assign({}, CTX, { weightPct: s.held ? (s.ticker === 'SYN-US1' ? 31 : 6) : null }); var w = W.evaluateStock(s, c, NOW), adv = A.analyze(s, w, c, NOW); return { s: s, w: w, adv: adv, c: c }; }); }
  var LAB = { evals: null };
  function renderCounts(ev) { var cnt = W.activeWatchCount(stocks(), NOW), box = clear($('counts'));
    box.appendChild(el('div', '실제 활성 감시 종목: ' + cnt.activeReal + '개', 'big')); box.lastChild.setAttribute('data-testid', 'real-active');
    box.appendChild(el('div', '합성 시험 종목: ' + cnt.activeSynthetic + '개 활성 / ' + cnt.inactive + '개 자료 부족으로 비활성 (전체 ' + cnt.total + ')', 'kv')); box.lastChild.setAttribute('data-testid', 'synth-active');
    box.appendChild(el('div', '실제 외부 호출: 0회 · 약 200개 감시 목록은 장기 목표이며 검증되지 않은 종목은 활성으로 세지 않습니다', 'note')); }
  function renderSignals(evals) { var box = clear($('signals'));
    evals.forEach(function (e) { var d = el('div', null, 'stock'); d.setAttribute('data-testid', 'sig-' + e.s.ticker); d.appendChild(el('b', e.s.name));
      if (!e.w.signals.length) d.appendChild(el('div', '확인된 신호 없음', 'kv'));
      e.w.signals.forEach(function (g) { var li = el('div', null, 'kv'); li.appendChild(tag(g.type, 'warn')); li.appendChild(el('span', ' ' + g.evidence.join(' / ') + ' (기준일 ' + g.asOfDate + ', 출처 ' + g.source + ')')); d.appendChild(li); });
      e.w.missing.forEach(function (m) { d.appendChild(el('div', '미확인: ' + m, 'warnline')); }); box.appendChild(d); });
    var pf = W.evaluatePortfolio(CTX, NOW); var d2 = el('div', null, 'stock'); d2.appendChild(el('b', '시장·포트폴리오')); pf.signals.forEach(function (g) { d2.appendChild(el('div', g.type + ': ' + g.evidence.join(' / '), 'kv')); }); if (!pf.signals.length) d2.appendChild(el('div', '확인된 신호 없음', 'kv')); box.appendChild(d2); }
  function list(title, arr) { var f = document.createDocumentFragment(); if (!arr || !arr.length) return f; f.appendChild(el('div', title, 'kv')); var u = el('ul'); arr.forEach(function (x) { u.appendChild(el('li', typeof x === 'string' ? x : x.text + (x.source ? ' [출처: ' + x.source + ']' : ''))); }); f.appendChild(u); return f; }
  function renderAdvice(evals) { var box = clear($('advice'));
    evals.forEach(function (e) { var a = e.adv, v = A.validateAdvice(a, NOW), d = el('div', null, 'stock'); d.setAttribute('data-testid', 'adv-' + e.s.ticker);
      var r = el('div', null, 'row'); r.appendChild(el('b', e.s.name)); var op = tag(a.opinion, a.opinion === '매수 검토' ? 'ok' : (a.opinion === '비중 축소 검토' ? 'bad' : 'warn')); op.setAttribute('data-testid', 'opinion-' + e.s.ticker); r.appendChild(op); d.appendChild(r);
      d.appendChild(el('div', '기준시각 ' + a.asOf + ' · 검증 ' + (v.ok ? '통과' : '실패: ' + v.errors.join(', ')), 'kv'));
      var det = el('details'); det.appendChild(el('summary', '근거·위험·조건 보기'));
      det.appendChild(el('div', '공격형 관점: ' + a.aggressive.stance + ' / 방어형 관점: ' + a.defensive.stance, 'kv'));
      det.appendChild(list('확인된 사실', a.facts)); det.appendChild(list('추정(확인되지 않음)', a.estimates)); det.appendChild(list('의견의 근거', a.reasonsFor)); det.appendChild(list('반대 근거', a.reasonsAgainst));
      det.appendChild(list('확인되지 않은 정보', a.unknown)); det.appendChild(list('주요 위험', a.risks)); det.appendChild(el('div', '현재 보유 비중 ' + (a.holding.weightPct === null ? '해당 없음' : a.holding.weightPct + '%') + ' · 현금 ' + (a.holding.cashPct === null ? '미확인' : a.holding.cashPct + '%'), 'kv'));
      det.appendChild(list('검토할 매수 조건', a.conditions.buyReview)); det.appendChild(list('검토할 매도 조건', a.conditions.sellReview)); det.appendChild(list('추가 확인이 필요한 사항', a.checks)); det.appendChild(el('div', a.notice, 'note'));
      d.appendChild(det); box.appendChild(d); }); }
  function candidatesFrom(evals) { var items = [];
    evals.forEach(function (e) { e.w.signals.forEach(function (g) { var kind = g.type === 'drawdown' ? null : g.type; if (kind) items.push({ id: g.id, kind: kind, ticker: e.s.ticker, level: g.level, dataOk: e.w.dataGate.ok, evidence: g.evidence, asOfDate: g.asOfDate, source: g.source });
      }); if (e.adv.opinion === '매수 검토') { var dg = e.w.signals.filter(function (x) { return x.type === 'drawdown'; })[0]; if (dg) items.push({ id: 'oq|' + e.s.ticker, kind: 'drawdown+advice', ticker: e.s.ticker, level: dg.level, dataOk: true, evidence: dg.evidence, asOfDate: dg.asOfDate, source: dg.source }); } });
    W.evaluatePortfolio(CTX, NOW).signals.forEach(function (g) { items.push({ id: g.id, kind: g.type, ticker: null, level: g.level, dataOk: true, evidence: g.evidence, asOfDate: g.asOfDate, source: g.source }); });
    return items; }
  function runAlerts(nowISO) { var evals = evaluateAll(), cands = L.candidates(candidatesFrom(evals), nowISO), r = L.select(cands.candidates, nowISO, alertState); alertState = r.state; lastShown = r.shown;
    var box = clear($('alerts')); if (!r.shown.length) box.appendChild(el('div', '새로 표시할 알림 없음', 'kv'));
    r.shown.forEach(function (a) { var d = el('div', null, 'stock'); d.setAttribute('data-testid', 'alert'); var row = el('div', null, 'row'); row.appendChild(el('b', a.label + (a.ticker ? ' · ' + a.ticker : ''))); row.appendChild(tag('단계 ' + a.level, 'warn')); d.appendChild(row); d.appendChild(el('div', a.evidence.join(' / ') + ' (기준일 ' + a.asOfDate + ', 출처 ' + a.source + ')', 'kv')); box.appendChild(d); });
    var log = $('alert-log'); log.textContent = '표시 ' + r.shown.length + '건 · 억제 ' + r.suppressed.length + '건' + (r.suppressed.length ? ' (' + r.suppressed.map(function (x) { return x.reason; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ')' : '') + ' · 알림 제외 ' + cands.rejected.length + '건(알림 유형 아님 또는 자료 불충분)'; }
  function renderJournal(evals) { var kr = evals.filter(function (e) { return e.s.ticker === 'SYN-KR1'; })[0], box = clear($('journal'));
    var rec = J.record(kr.adv, { priceAtAdvice: 60, weightPct: 6, inputsUsed: [{ name: '시세', asOfDate: '2026-11-05', source: '합성 시험 공급자' }, { name: '재무', asOfDate: '2026-09-30', source: '합성 재무' }] }, NOW);
    entryObj = rec.entry; box.appendChild(el('div', '기록: ' + entryObj.id + ' · 의견 ' + entryObj.opinion + ' · 당시 가격 ' + entryObj.priceAtAdvice + ' · 사용자 결정 ' + entryObj.userDecision, 'kv'));
    box.appendChild(el('div', '사용한 자료: ' + entryObj.inputsUsed.map(function (x) { return x.name + '(' + x.asOfDate + ')'; }).join(', ') + ' — 조언일 이후 자료는 기록에 넣을 수 없습니다(누출 방지). 투자 원장과 분리된 기록입니다.', 'note')); }
  function renderEval() { var b = clear($('eval')); var later = { benchAtAdvice: 1000, prices: [{ date: '2026-11-12', price: 66 }, { date: '2026-11-20', price: 58 }, { date: '2026-12-05', price: 72 }], bench: [{ date: '2026-12-05', price: 1030 }] };
    var r = J.evaluate(entryObj, later, 30); b.appendChild(el('div', r.scored ? '수익률 ' + r.returnPct + '% · 시장 ' + r.benchPct + '% · 초과 ' + r.excessPct + '%p · 최대낙폭 ' + r.maxDrawdownPct + '% · 적중 ' + (r.hit ? '예' : '아니오') : '평가 불가: ' + r.reason, 'kv')); b.appendChild(el('div', '합성 사후 자료입니다. 단순 상승 여부가 아니라 시장 대비·낙폭으로 평가합니다.', 'note')); }
  function renderAll() { var ev = evaluateAll(); renderCounts(ev); renderPrices(); renderSignals(ev); renderAdvice(ev); }
  $('btn-fail').addEventListener('click', function () { fetchAll(true); renderAll(); });
  $('btn-retry').addEventListener('click', function () { fetchAll(false); renderAll(); });
  $('btn-again').addEventListener('click', function () { runAlerts(NOW); });
  $('btn-nextday').addEventListener('click', function () { runAlerts(NEXT); });
  $('btn-eval').addEventListener('click', renderEval);
  $('push-note').textContent = L.DELIVERY_NOTICE;
  fetchAll(false); renderAll(); runAlerts(NOW); renderJournal(evaluateAll());
})();
