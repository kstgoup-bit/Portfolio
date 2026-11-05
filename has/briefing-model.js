/* HAS 25단계 — "오늘의 투자 브리핑" 계산(순수 함수). 입력: portfolio-reader 결과 + advisor-bridge 결과. 저장소·네트워크·DOM 없음, 입력을 바꾸지 않는다.
   원칙: 앱에 입력된 현재가는 출처·기준시각을 알 수 없으므로 '확인된 시세'가 아니다 → 비중·집중도 같은 "내 기록 기준 점검"은 보여주되(기록 기준 표기),
   매수·매도 의견은 검증된 시세가 있을 때만 규칙 엔진이 만든다(없으면 판단 보류). 실제 시장을 지속 감시한다고 표시하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./watch-engine.js')); else root.HASBriefingModel = factory(root.HASWatchEngine); })(typeof globalThis !== 'undefined' ? globalThis : this, function (W) {
  'use strict';
  var MONITOR_NOTICE = '이 화면은 앱을 연 시점에 내 기록을 한 번 점검한 결과입니다. 실제 시장을 지속적으로 감시하지 않으며, 검증된 시세·재무자료가 없으면 매수·매도 의견을 내지 않고 판단 보류로 표시합니다.';
  var PRICE_NOTE = '앱에 입력된 현재가는 출처·기준시각을 확인할 수 없어 \'확인된 시세\'가 아닙니다. 아래 비중·손익은 내 기록 기준의 참고값입니다.';
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  function build(p, bridge, nowISO) {
    var D = W.DEFAULTS, risks = [], total = p.totalKRW, held = p.holdings.slice().sort(function (a, b) { return (b.weightPct || 0) - (a.weightPct || 0); });
    var partial = !p.complete;
    var state = { totalKRW: total, holdingsCount: held.length, accounts: p.accounts.map(function (a) { return { id: a.id, label: a.label, ok: a.ok !== false, valueKRW: a.valueKRW, weightPct: a.ok !== false && total > 0 && fin(a.valueKRW) ? Math.round(a.valueKRW / total * 1000) / 10 : null }; }),
      cashKnown: !!p.cashRecorded, cashMissingAccounts: p.cashMissingAccounts || [], cashPct: p.cashPct, cashKRW: p.cashKRW, spearPct: p.spearPct, shieldPct: p.shieldPct, zeroQty: p.zeroQty || 0, weights: held.reduce(function (o, h) { o[h.ticker] = h.weightPct; return o; }, {}), top: held.slice(0, 5).map(function (h) { return { ticker: h.ticker, account: h.account, weightPct: h.weightPct, role: h.role }; }) };
    held.forEach(function (h) {
      if (fin(h.weightPct) && h.weightPct > D.concentrationPct) risks.push({ id: 'concentration|' + h.ticker, type: 'concentration', ticker: h.ticker, text: h.ticker + ' 비중 ' + h.weightPct + '% (한도 ' + D.concentrationPct + '%)' + (partial ? ' — 일부 자료 제외, 참고용' : ''), basis: '내 기록 기준' });
      if (fin(h.avgPrice) && h.avgPrice > 0 && fin(h.weightPct) && h.weightPct >= D.lossRiskMinWeightPct) { var cur = h.market === 'KR' ? h.valueKRW / h.quantity : (fin(p.fx) && p.fx > 0 ? h.valueKRW / p.fx / h.quantity : null); if (cur !== null) { var pnl = (cur - h.avgPrice) / h.avgPrice * 100; if (pnl <= -D.lossRiskPct) risks.push({ id: 'loss|' + h.ticker, type: 'loss', ticker: h.ticker, text: h.ticker + ' 평균단가 대비 ' + (Math.round(pnl * 10) / 10) + '% (앱 입력 현재가 기준, 미검증)', basis: '미검증 가격 기준' }); } }
    });
    if (p.cashRecorded && fin(p.cashPct) && p.cashPct < D.minCashPct) risks.push({ id: 'cash-low', type: 'cash-low', ticker: null, text: '현금 비중 ' + p.cashPct + '% (최소 ' + D.minCashPct + '%)', basis: '내 기록 기준' });
    if (p.cashRecorded && p.cashMissingAccounts && p.cashMissingAccounts.length) risks.push({ id: 'cash-partial', type: 'data', ticker: null, text: '예수금 기록이 없는 계좌: ' + p.cashMissingAccounts.join('·') + ' — 현금 비중은 기록된 금액(CMA 등) 기준이며 실제는 더 클 수 있음', basis: '데이터 부족' });
    if (!p.cashRecorded) risks.push({ id: 'cash-unknown', type: 'data', ticker: null, text: '예수금·CMA 기록이 없어 현금 비중을 알 수 없음', basis: '데이터 부족' });
    p.issues.forEach(function (m, i) { if (/^수량 0/.test(m) || /^예수금 기록이 없는 계좌/.test(m)) return; // 예수금 안내는 cash-partial 항목이 대신 표시(중복 방지)
       risks.push({ id: 'data|' + i, type: 'data', ticker: null, text: m, basis: '데이터 부족' }); });
    if (held.length) { var pf = p.priceFreshness, kst = function (iso) { return iso ? new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(11, 16) : null; };
      var ptxt = !pf || !pf.fresh ? '보유 ' + held.length + '종목의 현재가는 출처·기준시각 미확인 — 이번 접속에서 갱신되지 않은 저장값(오래되었는지 알 수 없음)' : (pf.fresh === held.length ? '보유 ' + held.length + '종목 전부 이번 접속에서 구글 시트(GAS)로 갱신(' + kst(pf.oldestAt) + (kst(pf.oldestAt) === kst(pf.newestAt) ? '' : '~' + kst(pf.newestAt)) + ' KST)' : '보유 ' + held.length + '종목 중 ' + pf.fresh + '종목만 이번 접속에서 갱신(' + kst(pf.oldestAt) + (kst(pf.oldestAt) === kst(pf.newestAt) ? '' : '~' + kst(pf.newestAt)) + ' KST). 나머지는 저장값: ' + pf.staleTickers.join('·')) + ' — 단일 출처·가격 종류(실시간/지연) 미확인·독립 대조 불가';
      if (pf && pf.fresh) ptxt += pf.fxAt ? ' / 환율은 이번 접속 갱신(' + kst(pf.fxAt) + ' KST)' : ' / 환율은 갱신 기록 없음(입력값)';
      risks.push({ id: 'price-unverified', type: 'stale', ticker: null, text: ptxt, basis: '시세 최신성' }); }
    var advices = bridge && bridge.advices || [], held2 = advices.filter(function (a) { return a.holding && a.holding.held; }), watch = advices.filter(function (a) { return !(a.holding && a.holding.held); });
    var cnt = {}; advices.forEach(function (a) { cnt[a.opinion] = (cnt[a.opinion] || 0) + 1; });
    var buy = watch.filter(function (a) { return a.opinion === '매수 검토'; });
    var headline = held.length || advices.length ? Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ') + (Object.keys(cnt).length ? ' · ' : '') + '위험 ' + risks.filter(function (r) { return r.type === 'concentration' || r.type === 'loss' || r.type === 'cash-low'; }).length : '보유종목 없음 — 분석할 대상이 없습니다';
    return { basis: p.basis, readOnly: true, generatedAt: nowISO, monitoring: MONITOR_NOTICE, priceNote: PRICE_NOTE, status: bridge ? bridge.status : 'not-run', state: state, risks: risks, buyCandidates: buy,
      watchlistNote: watch.length ? null : '관심종목 목록이 없어 매수 기회 후보를 만들지 않습니다(앱에는 관심종목 기능이 없습니다).', opinions: held2, counts: cnt, headline: headline, errors: bridge ? bridge.errors : [] };
  }
  return Object.freeze({ MONITOR_NOTICE: MONITOR_NOTICE, PRICE_NOTE: PRICE_NOTE, build: build });
});
