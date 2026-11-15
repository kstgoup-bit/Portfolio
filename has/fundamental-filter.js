/* 재무 필터(2차 우량주 판정) — 순수 계산 모듈. 네트워크·저장소·주문 없음.
 * 목적: 곡소리 후보가 '싸진 것'인지 '망가진 것'인지 구분하는 근거를 만든다. 매수·매도 권유를 만들지 않는다.
 * 입력: SEC EDGAR XBRL companyfacts 모양 JSON(https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json).
 * 임계값은 2026-11-15 순태씨 승인(큰 틀) 제안값이며 백테스트로 검증되지 않았다(미검증).
 * 라벨: strong(우량 근거 충분) / mixed(혼재) / weak(취약) / insufficient(공시 부족). 최종 결정은 순태씨. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASFundamentalFilter = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var VERSION = 'has-fundamental-v1', DAY = 86400000, YEARS = 5, STALE_DAYS = 550, TARGET_DRAWDOWN = -20, DEEP_DRAWDOWN = -30;
  var TAGS = {
    revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
    operatingIncome: ['OperatingIncomeLoss'],
    netIncome: ['NetIncomeLoss'],
    ocf: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
    capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
    interest: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'],
    equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
    cash: ['CashAndCashEquivalentsAtCarryingValue'],
    debtTotal: ['LongTermDebt'],
    debtNoncurrent: ['LongTermDebtNoncurrent'],
    debtCurrent: ['LongTermDebtCurrent'],
    deposits: ['Deposits']
  };
  var FLOW = { revenue: 1, operatingIncome: 1, netIncome: 1, ocf: 1, capex: 1, interest: 1 };
  var LABELS = { strong: '우량 근거 충분', mixed: '혼재', weak: '취약', insufficient: '공시 부족' };
  function plain(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function day(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function num(x) { return typeof x === 'number' && Number.isFinite(x); }
  function annualEntries(facts, tag, flow) {
    var f = facts[tag], u = plain(f) && plain(f.units) ? f.units.USD : null, out = {};
    if (!Array.isArray(u)) return out;
    u.forEach(function (e) {
      if (!plain(e) || !num(e.val) || !day(e.end) || !day(e.filed) || e.form !== '10-K' && e.form !== '10-K/A' || e.fp !== 'FY') return;
      if (flow) { if (!day(e.start)) return; var d = (Date.parse(e.end) - Date.parse(e.start)) / DAY; if (d < 350 || d > 380) return; }
      else if (e.start !== undefined) return;
      var old = out[e.end];
      if (!old || e.filed > old.filed) out[e.end] = { val: e.val, filed: e.filed, tag: tag, accn: typeof e.accn === 'string' ? e.accn : null };
    });
    return out;
  }
  function pick(facts, field) {
    var list = TAGS[field], merged = {};
    for (var i = 0; i < list.length; i++) {
      var got = annualEntries(facts, list[i], !!FLOW[field]);
      Object.keys(got).forEach(function (end) { if (!merged[end]) merged[end] = got[end]; });
    }
    return merged;
  }
  /* companyfacts → 연도별 표. 실패는 예외 대신 {ok:false, reason}. */
  function normalize(raw, options) {
    var o = options || {};
    if (!plain(raw) || !plain(raw.facts)) return { ok: false, reason: 'invalid-companyfacts' };
    var gaap = raw.facts['us-gaap'];
    if (!plain(gaap)) return { ok: false, reason: plain(raw.facts['ifrs-full']) ? 'ifrs-filer' : 'no-us-gaap' };
    var series = {}, ends = {};
    Object.keys(TAGS).forEach(function (k) { series[k] = pick(gaap, k); });
    Object.keys(series.netIncome).forEach(function (e) { ends[e] = 1; });
    Object.keys(series.revenue).forEach(function (e) { ends[e] = 1; });
    var years = Object.keys(ends).sort().reverse().slice(0, YEARS).map(function (end) {
      function v(k) { var x = series[k][end]; return x ? x.val : null; }
      var debt = v('debtTotal');
      if (debt === null && v('debtNoncurrent') !== null) debt = v('debtNoncurrent') + (v('debtCurrent') || 0);
      var filed = Object.keys(series).reduce(function (m, k) { var x = series[k][end]; return x && x.filed > m ? x.filed : m; }, '');
      return { end: end, filed: filed, revenue: v('revenue'), operatingIncome: v('operatingIncome'), netIncome: v('netIncome'), ocf: v('ocf'), capex: v('capex'), interest: v('interest'), equity: v('equity'), cash: v('cash'), debt: debt };
    });
    var financial = o.financial === true || Object.keys(series.deposits).length > 0;
    return { ok: true, version: VERSION, financial: financial, cik: num(raw.cik) || typeof raw.cik === 'string' ? String(raw.cik) : null, name: typeof raw.entityName === 'string' ? raw.entityName.slice(0, 120) : null, ticker: typeof o.ticker === 'string' ? o.ticker : null, years: years };
  }
  function pct(x) { return Math.round(x * 1000) / 10; }
  function avg(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function check(id, name, status, value, evidence, counter) { return { id: id, name: name, status: status, value: value, evidence: evidence, counter: counter }; }
  function na(id, name, why) { return check(id, name, 'na', null, why, '자료가 없어 판정에서 제외했습니다.'); }
  function assess(norm, options) {
    var o = options || {}, now = num(o.now) ? o.now : Date.now();
    var base = { version: VERSION, signalHold: true, opinion: '판단 보류', ticker: norm && norm.ticker || null, name: norm && norm.name || null, checks: [], asOf: null, filed: null, years: 0 };
    function out(label, reason) { base.label = label; base.labelKo = LABELS[label]; base.reason = reason || null; base.reviewEligible = label === 'strong'; return base; }
    if (!norm || !norm.ok) return out('insufficient', norm && norm.reason === 'ifrs-filer' ? '해외 기업 공시(IFRS·20-F) — 별도 확인 필요' : '재무 자료 형식 확인 필요');
    var y = norm.years.filter(function (r) { return num(r.netIncome); });
    base.years = y.length;
    if (y.length) { base.asOf = y[0].end; base.filed = y[0].filed; }
    if (norm.financial) return out('insufficient', '금융업(은행 등 예금 수취) — 영업현금흐름·부채 항목이 맞지 않아 별도 기준 필요');
    if (y.length < 3) return out('insufficient', '연간 공시 3년 미만');
    if (now - Date.parse(y[0].end) > STALE_DAYS * DAY) return out('insufficient', '최근 연간 공시가 18개월 이상 지남');
    var c = base.checks;
    /* 시점 항목(부채·이자)은 가장 최근 연도에 값이 없으면 바로 전 해까지 본다(일부 태그가 늦게 반영되는 경우). 어느 결산일인지 근거에 표시. */
    function latestWith(keys) { for (var i = 0; i < Math.min(2, y.length); i++) { if (keys.every(function (k) { return num(y[i][k]); })) return y[i]; } return null; }
    function at(r) { return r && r.end !== y[0].end ? ' [' + r.end + ' 결산 기준]' : ''; }
    // 1. 수익성: 평균 ROE
    var roe = y.filter(function (r) { return num(r.equity) && r.equity > 0; }).map(function (r) { return r.netIncome / r.equity; });
    if (y.some(function (r) { return num(r.equity) && r.equity <= 0; })) c.push(check('roe', '수익성(ROE)', 'warn', null, '자기자본이 0 이하인 해가 있어 ROE를 계산할 수 없습니다.', '대규모 자사주 매입으로 자본이 음수인 우량 기업도 있습니다.'));
    else if (roe.length < 3) c.push(na('roe', '수익성(ROE)', '자기자본 자료 3년 미만'));
    else { var r = avg(roe); c.push(check('roe', '수익성(ROE)', r >= 0.12 ? 'pass' : r < 0.05 ? 'fail' : 'warn', pct(r), roe.length + '년 평균 ROE ' + pct(r) + '% (제안 기준: 12% 이상 양호, 5% 미만 취약)', '부채로 높인 ROE일 수 있고, 업종마다 정상 수준이 다릅니다.')); }
    // 2. 영업이익률 추세
    var mr = y.filter(function (r) { return num(r.operatingIncome) && num(r.revenue) && r.revenue > 0; }), m = mr.map(function (r) { return r.operatingIncome / r.revenue; });
    if (m.length < 3) c.push(na('margin', '영업이익률 추세', '매출·영업이익 자료 3년 미만'));
    else { var gap = m[0] - avg(m.slice(1)); c.push(check('margin', '영업이익률 추세', gap < -0.05 ? 'fail' : gap < -0.02 ? 'warn' : 'pass', pct(m[0]), '최근 ' + pct(m[0]) + '% · 이전 평균 대비 ' + (gap >= 0 ? '+' : '') + pct(gap) + '%p (제안 기준: 5%p 넘게 하락 시 취약)' + at(mr[0]), '일회성 비용이나 투자 확대로 일시 하락했을 수 있습니다.')); }
    // 3. 안정성: 순부채 / 영업현금흐름
    var L = latestWith(['debt', 'cash', 'ocf']);
    if (!L) c.push(na('leverage', '안정성(순부채/영업현금흐름)', '부채·현금·영업현금흐름 중 빠진 값'));
    else { var nd = L.debt - L.cash, lv = L.ocf > 0 ? nd / L.ocf : null;
      c.push(check('leverage', '안정성(순부채/영업현금흐름)', nd <= 0 ? 'pass' : lv === null || lv > 5 ? 'fail' : lv > 3 ? 'warn' : 'pass', lv === null ? null : Math.round(lv * 10) / 10, nd <= 0 ? '순현금(현금이 장기부채보다 많음)' + at(L) : lv === null ? '영업현금흐름이 0 이하인데 순부채가 있음' : '순부채가 영업현금흐름의 ' + (Math.round(lv * 10) / 10) + '배 (제안 기준: 3배 이하 양호, 5배 초과 취약)' + at(L), '리스부채·단기차입금은 포함하지 않았습니다(장기부채 기준).')); }
    // 4. 이자보상배율
    var I = latestWith(['interest', 'operatingIncome']);
    if (!I || I.interest <= 0) c.push(na('interest', '이자보상배율', '이자비용 공시 없음 또는 0'));
    else { var ic = I.operatingIncome / I.interest; c.push(check('interest', '이자보상배율', ic >= 5 ? 'pass' : ic < 2 ? 'fail' : 'warn', Math.round(ic * 10) / 10, '영업이익이 이자비용의 ' + (Math.round(ic * 10) / 10) + '배 (제안 기준: 5배 이상 양호, 2배 미만 취약)' + at(I), '금리 상승기에는 이자비용이 빠르게 늘 수 있습니다.')); }
    // 5. 현금창출: FCF 흑자 연수
    var f = y.filter(function (r) { return num(r.ocf) && num(r.capex); });
    if (f.length < 3) c.push(na('fcf', '현금창출(FCF 흑자 연수)', '영업현금흐름·설비투자 자료 3년 미만'));
    else { var pos = f.filter(function (r) { return r.ocf - r.capex > 0; }).length, need = f.length;
      c.push(check('fcf', '현금창출(FCF 흑자 연수)', pos >= need - 1 && pos >= 3 ? 'pass' : pos >= need - 2 ? 'warn' : 'fail', pos, need + '년 중 ' + pos + '년 잉여현금흐름 흑자 (제안 기준: 1년 이하 적자 양호)', '성장 투자기에는 설비투자로 FCF가 일시 적자일 수 있습니다.')); }
    // 6. 이익의 질: 영업현금흐름 / 순이익
    var q = y.filter(function (r) { return num(r.ocf) && r.netIncome > 0; });
    if (q.length < 3) c.push(na('quality', '이익의 질(영업현금흐름/순이익)', '흑자 연도의 영업현금흐름 자료 3년 미만'));
    else { var qa = avg(q.map(function (r) { return r.ocf / r.netIncome; })); c.push(check('quality', '이익의 질(영업현금흐름/순이익)', qa >= 0.8 ? 'pass' : qa < 0.5 ? 'fail' : 'warn', Math.round(qa * 100) / 100, '평균 ' + (Math.round(qa * 100) / 100) + '배 (제안 기준: 0.8배 이상 양호, 0.5배 미만 취약)', '운전자본 증가(외상매출) 같은 일시 요인일 수 있습니다.')); }
    // 7. 이익 안정성: 흑자 연수
    var prof = y.filter(function (r) { return r.netIncome > 0; }).length;
    c.push(check('stability', '이익 안정성(흑자 연수)', prof === y.length ? 'pass' : prof >= y.length - 1 ? 'warn' : 'fail', prof, y.length + '년 중 ' + prof + '년 순이익 흑자', '구조조정 같은 일회성 손실이 섞였을 수 있습니다.'));
    // 8. 밸류에이션: 가격 연결 전
    c.push(na('valuation', '밸류에이션(자기 과거 대비)', '주가·주식 수 연결 전 — 다음 단계'));
    var used = c.filter(function (x) { return x.status !== 'na'; }), fails = used.filter(function (x) { return x.status === 'fail'; }).length, warns = used.filter(function (x) { return x.status === 'warn'; }).length;
    if (used.length < 4) return out('insufficient', '판정 가능한 항목 4개 미만');
    if (fails >= 2) return out('weak', '취약 항목 ' + fails + '개 — 곡소리가 아니라 기업가치 훼손일 수 있음(탈출 신호 가능)');
    if (fails === 0 && warns <= 1 && used.length < 5) return out('mixed', '취약 항목 없음 · 판정 가능 항목 ' + used.length + '개뿐 — 근거 부족');
    if (fails === 0 && warns <= 1) return out('strong', '취약 항목 없음 · 주의 ' + warns + '개 — 밸류에이션 확인 전');
    return out('mixed', '취약 ' + fails + '개 · 주의 ' + warns + '개');
  }
  /* 재무 판정 대상: 52주 고점 대비 -20% 이하(곡소리 후보) ∪ 보유종목(환호성용). 미국만(1단계). */
  function targets(summaryItems, holdings, options) {
    var o = options || {}, cut = num(o.threshold) ? o.threshold : TARGET_DRAWDOWN, seen = {}, out = [];
    function add(t, why, dd) { var k = 'US:' + t; if (seen[k]) { if (why === 'holding') seen[k].holding = true; return; } seen[k] = { ticker: t, market: 'US', fear: why === 'fear', holding: why === 'holding', deep: num(dd) && dd <= DEEP_DRAWDOWN, drawdownPct: num(dd) ? dd : null }; out.push(seen[k]); }
    (Array.isArray(summaryItems) ? summaryItems : []).forEach(function (r) { if (plain(r) && r.market === 'US' && typeof r.ticker === 'string' && r.status === 'reference' && num(r.drawdownPct) && r.drawdownPct <= cut) add(r.ticker, 'fear', r.drawdownPct); });
    (Array.isArray(holdings) ? holdings : []).forEach(function (h) { if (plain(h) && h.market === 'US' && typeof h.ticker === 'string') add(h.ticker, 'holding', null); });
    return out;
  }
  /* 새 공시가 나왔을 때만 다시 받기: 마지막으로 확인한 공시일(checkedFiled, 없으면 filed)보다 새 공시가 있으면 true. */
  function needsRefresh(cached, latestFiled) {
    var seen = cached && (day(cached.checkedFiled) ? cached.checkedFiled : cached.filed);
    if (!day(seen)) return true;
    return day(latestFiled) && latestFiled > seen;
  }
  return Object.freeze({ VERSION: VERSION, LABELS: LABELS, TARGET_DRAWDOWN: TARGET_DRAWDOWN, DEEP_DRAWDOWN: DEEP_DRAWDOWN, normalize: normalize, assess: assess, targets: targets, needsRefresh: needsRefresh });
});
