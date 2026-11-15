/* 위대한 기업 시험 화면용 가상 자료(합성) — 실제 기업·실제 공시·실제 보유가 아님. ORDER GPT-20261115-1326 3절 5).
 * SEC companyfacts 모양의 가상 숫자를 만들어 재무 필터(normalize)를 거친 뒤 위대한 기업 엔진 입력(hasGreatCompanyInput.v1)으로 준다.
 * 평가 기준시각은 가상 고정값(NOW)이다. 실제 날짜로 평가하면 가상 기준일이 오래돼 결과가 바뀌므로 화면도 이 값으로 평가한다.
 * 네트워크·저장소·DOM 사용 없음. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fundamental-filter.js'));
  else root.HASGreatCompaniesFixtures = factory(root.HASFundamentalFilter || null);
})(typeof window !== 'undefined' ? window : this, function (F) {
  'use strict';
  var NOW_ISO = '2026-11-15T00:00:00Z', NOW = Date.parse(NOW_ISO);
  function facts(years, name) {
    var g = {};
    function put(tag, end, val, flow) {
      if (val === null || val === undefined) return;
      g[tag] = g[tag] || { units: { USD: [] } };
      var y = +end.slice(0, 4), e = { end: end, val: val, form: '10-K', fp: 'FY', fy: y, filed: (y + 1) + '-02-15', accn: '0000000000-' + y };
      if (flow) e.start = y + '-01-01';
      g[tag].units.USD.push(e);
    }
    years.forEach(function (r, i) {
      var end = (2025 - i) + '-12-31';
      put('Revenues', end, r.rev, true); put('OperatingIncomeLoss', end, r.op, true); put('NetIncomeLoss', end, r.ni, true);
      put('NetCashProvidedByUsedInOperatingActivities', end, r.ocf, true); put('PaymentsToAcquirePropertyPlantAndEquipment', end, r.capex, true);
      put('InterestExpense', end, r.int, true); put('StockholdersEquity', end, r.eq, false); put('CashAndCashEquivalentsAtCarryingValue', end, r.cash, false); put('LongTermDebt', end, r.debt, false);
    });
    return { cik: 123, entityName: name, facts: { 'us-gaap': g } };
  }
  /* 성장하는 우량 가상 기업: 매출 연 8% 성장, 영업이익률 25% */
  function great() { return [0, 1, 2, 3, 4].map(function (i) { var rev = Math.round(1000 / Math.pow(1.08, i)); return { rev: rev, op: Math.round(rev * 0.25), ni: Math.round(rev * 0.2), ocf: Math.round(rev * 0.26), capex: Math.round(rev * 0.06), int: 10, eq: 1000, cash: 300, debt: 400 }; }); }
  /* 장기 훼손 가상 기업: 매출 감소, 이익률 3년 연속 하락, 부채 증가 */
  function eroding() { return [{ rev: 800, op: 40, ni: 20, ocf: 30, capex: 60, int: 30, eq: 500, cash: 50, debt: 900 }, { rev: 900, op: 90, ni: 60, ocf: 80, capex: 60, int: 28, eq: 550, cash: 60, debt: 850 }, { rev: 1000, op: 150, ni: 100, ocf: 140, capex: 60, int: 25, eq: 600, cash: 60, debt: 800 }, { rev: 1050, op: 210, ni: 150, ocf: 190, capex: 60, int: 20, eq: 650, cash: 80, debt: 700 }, { rev: 1100, op: 250, ni: 180, ocf: 220, capex: 60, int: 20, eq: 700, cash: 90, debt: 650 }]; }
  function dip() { var y = great(); y[0].op = Math.round(y[0].rev * 0.12); return y; }
  function norm(years, ticker, name) { return F ? F.normalize(facts(years, name), { ticker: ticker }) : null; }
  var MOAT = { text: '가상: 전환비용 높은 업무 소프트웨어', confirmedAt: '2026-10-01', sourceRefs: ['가상 10-K Item 1'] };
  var CAPITAL = { text: '가상: 희석 억제·FCF 안에서 환원', confirmedAt: '2026-10-01', sourceRefs: ['가상 주주서한'] };
  function capAlloc() { return [0, 1, 2, 3, 4].map(function (i) { return { end: (2025 - i) + '-12-31', buybacks: 60, dividends: 40, acquisitions: 0, dilutedShares: 100 + i * 0.5 }; }); }
  function thesis(over) { return Object.assign({ text: '가상 투자논리', logic: '가상', logicBreak: '점유율 2년 연속 하락', logicState: 'maintained', checkpoints: ['점유율', '이익률'], nextCheckDate: '2027-03-01', moat: MOAT, capital: CAPITAL }, over || {}); }
  function val(ticker, current, asOf) { return { ticker: ticker, metric: 'P/FCF', current: current, history: [14, 18, 22, 26, 30], asOf: asOf || '2026-11-14', source: '가상 밸류에이션 입력(합성)' }; }
  function price(dd, w, extra) { return Object.assign({ asOf: '2026-11-14T07:00:00Z', drawdownPct: dd, weightPct: w, conviction: false }, extra || {}); }
  function input(ticker, name, o) {
    return {
      schema: 'hasGreatCompanyInput.v1', generatedAt: NOW_ISO, synthetic: true,
      company: { ticker: ticker, market: 'US', name: name, listType: 'holding', kind: 'company' },
      fundamental: o.fundamental === null ? null : norm(o.years || great(), ticker, name),
      capitalAllocation: capAlloc(), thesis: thesis(o.thesis),
      price: o.price === undefined ? price(-12, 6) : o.price,
      valuation: o.valuation === undefined ? val(ticker, 20) : o.valuation,
      previous: o.previous || null
    };
  }
  /* 지시서 5절 합성 시나리오에 맞춘 화면용 가상 사례(이름은 모두 '가상') */
  var SCENARIOS = [
    { id: 'SYNA', label: '① 경쟁력 유지 · 가격 급락', make: function () { return input('SYNA', '가상 기업 A', { price: price(-28, 6) }); } },
    { id: 'SYNB', label: '② 경쟁력 훼손 · 가격 급락', make: function () { return input('SYNB', '가상 기업 B', { years: eroding(), thesis: { logicState: 'broken' }, price: price(-35, 6) }); } },
    { id: 'SYNC', label: '③ 고점권 · 비중 한도 이내', make: function () { return input('SYNC', '가상 기업 C', { price: price(-1, 8) }); } },
    { id: 'SYND', label: '④ 밸류에이션 높은 편 · 집중위험', make: function () { return input('SYND', '가상 기업 D', { valuation: val('SYND', 40), price: price(-2, 18) }); } },
    { id: 'SYNE', label: '⑤ 일시 실적 악화 · 직전 평가 대비 하락', make: function () { return input('SYNE', '가상 기업 E', { years: dip(), previous: { state: 'priority', evaluatedAt: '2026-08-15T00:00:00Z', domains: { moat: 'pass', growth: 'pass', returns: 'pass', balance: 'pass', capital: 'pass', durability: 'pass' } } }); } },
    { id: 'SYNF', label: '⑥ 재무 공시 없음(미연결)', make: function () { return input('SYNF', '가상 기업 F', { fundamental: null }); } },
    { id: 'SYNG', label: '⑥ 밸류에이션 기준일 오래됨', make: function () { return input('SYNG', '가상 기업 G', { valuation: val('SYNG', 20, '2026-10-01'), price: price(-2, 6) }); } },
    { id: 'SYNH', label: '⑦ 경쟁력 훼손인데 주가 상승', make: function () { return input('SYNH', '가상 기업 H', { years: eroding(), thesis: { logicState: 'weakened' }, price: price(-2, 6) }); } },
    { id: 'SYNI', label: '⑧ 신호 상충(급락·고평가·비중 초과)', make: function () { return input('SYNI', '가상 기업 I', { valuation: val('SYNI', 40), price: price(-30, 14) }); } },
    { id: 'SYNJ', label: '가격 기준일 오래됨 · 밸류에이션 미연결', make: function () { return input('SYNJ', '가상 기업 J', { valuation: null, price: price(-8, 12, { asOf: '2026-10-20T07:00:00Z' }) }); } }
  ];
  function scenarios() { return SCENARIOS.map(function (s) { return { id: s.id, label: s.label, input: s.make() }; }); }
  return Object.freeze({ NOW: NOW, NOW_ISO: NOW_ISO, scenarios: scenarios, ids: SCENARIOS.map(function (s) { return s.id; }) });
});
