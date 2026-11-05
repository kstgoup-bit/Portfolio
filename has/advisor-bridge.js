/* HAS 24단계 — 포폴앱 ↔ AI 투자참모 읽기 전용 연결(순수 함수, 저장소·네트워크·타이머 없음).
   역할 구분: 이 모듈과 23단계 엔진은 '규칙 기반 점검'이다. 기존 앱의 Gemini 자문(공격형/방어형 서술)은 별도 기능이며 이 모듈이 대체하지 않는다.
   안전 계약: ① 저장소 대신 getter 만 받는다(쓰기 불가) ② 어떤 오류도 던지지 않고 {status:'error'}로 돌려준다 ③ 시세·재무 자료가 없으면 '판단 보류'
   ④ 실제/합성 구분(basis)을 결과에 그대로 싣는다 ⑤ 판단기록(원장과 분리)은 호출자가 별도로 저장하며 여기서는 쓰지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./portfolio-reader.js'), require('./watch-engine.js'), require('./advisor-core.js'), require('./advice-guard.js')); else root.HASAdvisorBridge = factory(root.HASPortfolioReader, root.HASWatchEngine, root.HASAdvisorCore, root.HASAdviceGuard); })(typeof globalThis !== 'undefined' ? globalThis : this, function (R, W, A, G) {
  'use strict';
  var ROLES = Object.freeze({
    gemini: '기존 Gemini 자문: 사용자가 요청할 때 서술형 의견을 만든다. 근거 수치를 이 모듈이 검증하지 않는다.',
    rules: '신규 규칙 점검: 확인된 시세·재무·보유 비중만으로 신호와 4가지 의견(매수 검토/보유/비중 축소 검토/판단 보류)을 만든다. 자료가 부족하면 판단 보류.'
  });
  function hold(ticker, name, why, basis, nowISO, heldFlag) {
    return { ticker: ticker, name: name || ticker, asOf: nowISO, opinion: '판단 보류', aggressive: { stance: '판단 보류', why: [] }, defensive: { stance: '판단 보류', why: [] }, facts: [], estimates: [],
      reasonsFor: [], reasonsAgainst: ['판단에 필요한 자료가 없습니다: ' + why], unknown: [why], risks: [], holding: { held: heldFlag !== false }, conditions: { buyReview: [], sellReview: [] },
      checks: ['시세·재무 자료를 확인된 출처로 준비'], dataQuality: { ok: false, why: [why] }, independence: A.INDEPENDENCE, notice: A.NOTICE, source: null, basis: basis };
  }
  /* getter: key→문자열|null (읽기 전용). external: {quotes,high52w,returns,fundamentals,thesis,market} 모두 선택. opts: {basis, now} */
  function run(getter, external, nowISO, opts) {
    var out = { status: 'ok', basis: opts && opts.basis || 'unspecified', roles: ROLES, portfolio: null, advices: [], errors: [], notices: [], writes: 'none', journalKey: null, portfolioSignals: [], portfolioMissing: [] };
    try {
      var p = R.read(getter, { basis: out.basis, asOf: nowISO }); out.basis = p.basis;
      out.portfolio = R.minimalForAdvisor(p);
      if (!p.holdings.length) { out.status = 'insufficient'; out.notices.push('분석할 보유종목이 없습니다.'); return out; }
      if (!p.complete) { out.notices.push('보유자료 일부가 불완전합니다: ' + p.issues.join('; ')); }
      var ex = external || {};
      var targets = p.holdings.map(function (h) { return { ticker: h.ticker, market: h.market, name: null, weightPct: h.weightPct, held: { quantity: h.quantity, avgPrice: h.avgPrice } }; });
      var have = {}; targets.forEach(function (t) { have[t.ticker] = 1; });
      (ex.watchlist || []).forEach(function (w) { if (w && typeof w.ticker === 'string' && !have[w.ticker]) targets.push({ ticker: w.ticker, market: w.market, name: w.name || null, weightPct: p.complete ? 0 : null, held: null }); }); // 관심종목(미보유)
      targets.forEach(function (h) {
        try {
          var q = ex.quotes && ex.quotes[h.ticker];
          if (!q) { out.advices.push(hold(h.ticker, h.name, '확인된 시세 없음', out.basis, nowISO, !!h.held)); return; }
          var stock = { ticker: h.ticker, name: h.name || h.ticker, market: h.market, quote: q, high52w: ex.high52w && ex.high52w[h.ticker] || null, returns: ex.returns && ex.returns[h.ticker] || null,
            fundamentals: ex.fundamentals && ex.fundamentals[h.ticker] || null, thesis: ex.thesis && ex.thesis[h.ticker] || null, held: h.held };
          var ctx = { weightPct: h.weightPct, weightBasis: 'app-entered', cashPct: p.cashPct, cashBasis: 'app-entered', market: ex.market || null };
          var w = W.evaluateStock(stock, ctx, nowISO), a = A.analyze(stock, w, ctx, nowISO), g = G.guard(a, nowISO);
          if (!g.ok) { out.errors.push(h.ticker + ': 조언 검증 실패 — ' + g.errors.join(' | ')); out.advices.push(hold(h.ticker, h.name, '조언 검증 실패로 표시하지 않음', out.basis, nowISO, !!h.held)); return; }
          a.basis = out.basis; a.signals = w.signals; out.advices.push(a);
        } catch (e) { out.errors.push(h.ticker + ': 분석 모듈 오류 — ' + (e && e.message || e)); out.advices.push(hold(h.ticker, h.name, '분석 모듈 오류', out.basis, nowISO, !!h.held)); }
      });
      var pf = W.evaluatePortfolio({ cashPct: p.cashPct, market: ex.market || null, fx: ex.fx || null }, nowISO); out.portfolioSignals = pf.signals; out.portfolioMissing = pf.missing;
      if (out.errors.length) out.status = 'partial';
    } catch (e) { out.status = 'error'; out.errors.push('연결 모듈 오류 — ' + (e && e.message || e)); out.advices = []; }
    return out;
  }
  return Object.freeze({ ROLES: ROLES, run: run });
});
