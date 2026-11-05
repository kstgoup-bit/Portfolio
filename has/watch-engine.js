/* HAS 23단계 — 시장 감시 엔진(순수 함수). 입력 데이터만으로 "신호"를 만든다. 추천·주문은 만들지 않는다(가격 하락만으로 매수 추천 금지).
   신호는 반드시 근거(evidence)·기준일·출처를 가진다. 사용할 수 없는 시세(미검증·오래됨·출처/기준일 없음·종류 미확인)면 가격 기반 신호를 만들지 않고 missing에 이유를 남긴다.
   '활성 감시' 수는 합성(synthetic) 시세를 제외하고 센다. 저장소·네트워크·타이머 없음. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./quote-model.js')); else root.HASWatchEngine = factory(root.HASQuoteModel); })(typeof globalThis !== 'undefined' ? globalThis : this, function (Q) {
  'use strict';
  var DEFAULTS = Object.freeze({ drawdownLevels: [20, 30, 35], relativeOverdropPp: 10, fundamentalsMaxAgeDays: 180, concentrationPct: 25, lossRiskPct: 20, lossRiskMinWeightPct: 10, minCashPct: 10, fxShockPct: 3, vixLevel: 30, vixSpikePct: 30 });
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  var daysBetween = function (a, nowISO) { return Math.floor((Date.parse(String(nowISO).slice(0, 10)) - Date.parse(a)) / 86400000); };
  var dateOk = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); };
  function cfg(o) { return Object.assign({}, DEFAULTS, o || {}); }
  function sig(type, ticker, level, evidence, asOf, source) { return { id: type + '|' + (ticker || '*'), type: type, ticker: ticker || null, level: level, evidence: evidence, asOfDate: asOf || null, source: source || null }; }

  /* 한 종목 평가. stock: {ticker,name,market,quote,high52w:{price,asOfDate,source},returns:{stockPct,benchPct,periodDays,asOfDate,source},
     fundamentals:{asOfDate,source,revenueGrowthPct,freeCashFlow,freeCashFlowPrev,debtToEquity,debtToEquityPrev}, thesis:{intact,note}, held:{quantity,avgPrice}} ctx: {weightPct,weightBasis} */
  function evaluateStock(stock, ctx, nowISO, settings) {
    var c = cfg(settings), out = { ticker: stock.ticker, held: !!stock.held, signals: [], missing: [], dataGate: null, drawdownPct: null, fundamentalsStatus: 'missing', thesisStatus: 'unknown' };
    var use = Q.usableForSignals(stock.quote, nowISO); out.dataGate = { ok: use.ok, why: use.why };
    var q = stock.quote;
    // 1) 52주 고점 대비 하락
    if (!use.ok) out.missing.push('가격 기반 신호 보류: ' + use.why.join(', '));
    else if (!stock.high52w || !fin(stock.high52w.price) || stock.high52w.price <= 0 || !dateOk(stock.high52w.asOfDate)) out.missing.push('52주 고점 자료 없음');
    else if (daysBetween(stock.high52w.asOfDate, nowISO) > 4) out.missing.push('52주 고점 자료가 오래됨(' + stock.high52w.asOfDate + ')');
    else {
      var dd = (stock.high52w.price - q.price) / stock.high52w.price * 100; out.drawdownPct = Math.round(dd * 10) / 10;
      var lvl = null; c.drawdownLevels.forEach(function (L) { if (dd >= L) lvl = L; });
      if (lvl !== null) out.signals.push(sig('drawdown', stock.ticker, lvl, ['52주 고점 ' + stock.high52w.price + ' 대비 현재 ' + q.price + ' (-' + out.drawdownPct + '%)', '시세 출처 ' + q.source + ', 기준일 ' + q.asOfDate], q.asOfDate, q.source));
    }
    // 2) 시장 대비 상대적 과잉 하락
    var r = stock.returns;
    if (!r || !fin(r.stockPct) || !fin(r.benchPct) || !dateOk(r.asOfDate)) out.missing.push('시장 대비 수익률 자료 없음');
    else if (daysBetween(r.asOfDate, nowISO) > 4) out.missing.push('시장 대비 수익률 자료가 오래됨');
    else if (r.stockPct < 0 && r.stockPct - r.benchPct <= -c.relativeOverdropPp) out.signals.push(sig('relative-overdrop', stock.ticker, Math.round((r.stockPct - r.benchPct) * 10) / 10, ['최근 ' + (r.periodDays || '?') + '일 종목 ' + r.stockPct + '% / 시장 ' + r.benchPct + '% (초과 하락 ' + Math.round((r.benchPct - r.stockPct) * 10) / 10 + '%p)'], r.asOfDate, r.source));
    // 3) 실적·현금흐름·부채·성장성
    var f = stock.fundamentals;
    if (!f || !dateOk(f.asOfDate)) { out.missing.push('재무자료 없음'); }
    else if (daysBetween(f.asOfDate, nowISO) > c.fundamentalsMaxAgeDays) { out.fundamentalsStatus = 'stale'; out.missing.push('재무자료가 오래됨(' + f.asOfDate + ')'); }
    else {
      var ev = [];
      if (fin(f.revenueGrowthPct) && f.revenueGrowthPct < 0) ev.push('매출 성장률 ' + f.revenueGrowthPct + '% (역성장)');
      if (fin(f.freeCashFlow) && (f.freeCashFlow < 0 || (fin(f.freeCashFlowPrev) && f.freeCashFlowPrev > 0 && f.freeCashFlow < f.freeCashFlowPrev * 0.7))) ev.push('잉여현금흐름 악화(' + f.freeCashFlowPrev + ' → ' + f.freeCashFlow + ')');
      if (fin(f.debtToEquity) && fin(f.debtToEquityPrev) && f.debtToEquityPrev > 0 && f.debtToEquity > f.debtToEquityPrev * 1.3 && f.debtToEquity > 1.5) ev.push('부채비율 상승(' + f.debtToEquityPrev + ' → ' + f.debtToEquity + ')');
      var known = fin(f.revenueGrowthPct) || fin(f.freeCashFlow) || fin(f.debtToEquity);
      if (!known) { out.missing.push('재무 항목 값 없음'); }
      else if (ev.length) { out.fundamentalsStatus = 'deteriorated'; out.signals.push(sig('fundamental-deterioration', stock.ticker, ev.length, ev, f.asOfDate, f.source)); }
      else out.fundamentalsStatus = 'ok';
    }
    // 4) 투자 논리
    if (!stock.thesis || typeof stock.thesis.intact !== 'boolean') out.missing.push('투자 논리 기록 없음');
    else if (stock.thesis.intact === false) { out.thesisStatus = 'broken'; out.signals.push(sig('thesis-broken', stock.ticker, 1, ['투자 논리 훼손 기록: ' + (stock.thesis.note || '사유 미기록')], nowISO.slice(0, 10), '사용자 기록')); }
    else out.thesisStatus = 'intact';
    // 5) 보유 비중·손실 위험(보유 종목만)
    if (stock.held) {
      var w = ctx && fin(ctx.weightPct) ? ctx.weightPct : null, basisOk = ctx && ctx.weightBasis === 'verified';
      if (w === null) out.missing.push('보유 비중 자료 없음');
      else {
        if (w > c.concentrationPct) out.signals.push(sig('concentration', stock.ticker, w, ['보유 비중 ' + w + '% (한도 ' + c.concentrationPct + '%)' + (basisOk ? '' : ' — 평가액에 미검증·추정 가격 포함')], nowISO.slice(0, 10), '보유 계산'));
        if (use.ok && stock.held && fin(stock.held.avgPrice) && stock.held.avgPrice > 0) {
          var pnl = (q.price - stock.held.avgPrice) / stock.held.avgPrice * 100;
          if (pnl <= -c.lossRiskPct && w >= c.lossRiskMinWeightPct) out.signals.push(sig('loss-risk', stock.ticker, Math.round(pnl * 10) / 10, ['평균단가 대비 ' + (Math.round(pnl * 10) / 10) + '%, 보유 비중 ' + w + '%'], q.asOfDate, q.source));
        }
      }
    }
    return out;
  }
  /* 포트폴리오·시장 신호. ctx: {cashPct, cashBasis, market:{vix:{level,change5dPct,asOfDate,source}}} */
  function evaluatePortfolio(ctx, nowISO, settings) {
    var c = cfg(settings), out = { signals: [], missing: [] };
    if (!ctx || !fin(ctx.cashPct)) out.missing.push('현금 비중 자료 없음');
    else if (ctx.cashPct < c.minCashPct) out.signals.push(sig('cash-low', null, ctx.cashPct, ['현금 비중 ' + ctx.cashPct + '% (최소 ' + c.minCashPct + '%)'], nowISO.slice(0, 10), '보유 계산'));
    var v = ctx && ctx.market && ctx.market.vix;
    if (!v || !fin(v.level) || !dateOk(v.asOfDate) || !v.source) out.missing.push('시장 위험 지표(VIX 등) 출처·기준일 없음');
    else if (daysBetween(v.asOfDate, nowISO) > 4) out.missing.push('시장 위험 지표가 오래됨');
    else if (v.level >= c.vixLevel || (fin(v.change5dPct) && v.change5dPct >= c.vixSpikePct)) out.signals.push(sig('market-risk', null, v.level, ['변동성 지표 ' + v.level + (fin(v.change5dPct) ? ' (5일 ' + v.change5dPct + '%)' : '')], v.asOfDate, v.source));
    // 환율 급변(24단계): 출처·두 시점이 모두 있어야 신호. 없으면 '자료 없음'으로 두고 만들어내지 않는다.
    var x = ctx && ctx.fx, lim = c.fxShockPct;
    if (!x || !fin(x.rate) || !fin(x.prevRate) || x.prevRate <= 0 || !dateOk(x.asOfDate) || !dateOk(x.prevAsOfDate) || !x.source) out.missing.push('환율 변동 자료(출처·두 시점) 없음');
    else if (daysBetween(x.asOfDate, nowISO) > 4) out.missing.push('환율 자료가 오래됨');
    else { var ch = Math.round((x.rate - x.prevRate) / x.prevRate * 1000) / 10; if (Math.abs(ch) >= lim) { var g = sig('market-risk', null, Math.abs(ch), ['원/달러 ' + x.prevRate + ' → ' + x.rate + ' (' + (ch > 0 ? '+' : '') + ch + '%, ' + x.prevAsOfDate + '~' + x.asOfDate + ')'], x.asOfDate, x.source); g.id = 'market-risk|fx'; g.scope = 'fx'; out.signals.push(g); } }
    return out;
  }
  /* 활성 감시 집계: 사용 가능한 실제(비합성) 시세로 평가 가능한 종목만 '실제 활성'. 합성은 따로 센다. */
  function activeWatchCount(stocks, nowISO) {
    var real = 0, synth = 0, held = 0, total = 0;
    (stocks || []).forEach(function (s) { total++; var u = Q.usableForSignals(s.quote, nowISO); if (u.ok) { if (s.quote.synthetic) synth++; else real++; } });
    return { total: total, activeReal: real, activeSynthetic: synth, inactive: total - real - synth };
  }
  return Object.freeze({ DEFAULTS: DEFAULTS, evaluateStock: evaluateStock, evaluatePortfolio: evaluatePortfolio, activeWatchCount: activeWatchCount });
});
