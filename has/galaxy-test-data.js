/* HAS 26단계 — 갤럭시 시험용 합성 자료(전부 가짜). 앱의 백업 검증 형식에 맞춰 만들어 시험 모드에서도 백업 내려받기·복원 리허설을 할 수 있다. */
(function (root) {
  'use strict';
  var S = function (id, name, ticker, q, avg, cur, role) { return { id: id, name: name, ticker: ticker, quantity: q, avgPrice: avg, currentPrice: cur, role: role || 'spear' }; };
  var DATA = {
    v5_gen: [S(1, '합성 일반 성장주', 'SYNG1', 120, 52000, 61000), S(2, '합성 일반 배당주', 'SYNG2', 300, 8000, 7600, 'shield'), S(3, '합성 아주 길고 긴 이름의 종목 — 줄바꿈과 말줄임이 잘 되는지 확인하기 위한 가짜 종목명', 'SYNLONG', 10, 1000, 1100), S(90, '예수금(합성)', 'DEP_GEN_신한', 1, 1, 1500000, 'shield')],
    v5_dom: [S(11, '합성 ISA ETF A', 'SYNI1', 80, 15000, 16200), S(12, '합성 ISA ETF B', 'SYNI2', 40, 22000, 20500), S(91, '예수금(합성)', 'DEP_DOM', 1, 1, 400000, 'shield')],
    v5_ov: [S(21, '합성 미국 성장주', 'SYNU1', 15, 150, 182), S(22, '합성 미국 ETF', 'SYNU2', 25, 80, 77), S(92, '달러 예수금(합성)', 'DEP_OV_신한', 1, 1, 1800.5, 'shield')],
    v5_pen: [S(31, '합성 연금 펀드', 'SYNP1', 200, 11000, 11800), S(93, '예수금(합성)', 'DEP_PEN_세공', 1, 1, 600000, 'shield')],
    v5_div: [{ date: '2026-09-15', amount: 52000, name: '합성 배당', ticker: 'SYNG2' }, { date: '2026-10-15', amount: 48000, name: '합성 배당', ticker: 'SYNG2' }],
    v5_ledger: { '2026-10': { income: [{ name: '합성 급여', amount: 3200000, date: '2026-10-25', cat: '급여' }], expense: [{ name: '합성 식비', amount: 420000, date: '2026-10-05', cat: '식비' }], invest: [{ name: '합성 적립', amount: 500000, date: '2026-10-07', broker: '', cat: '' }] } },
    v5_cma_amount: '1200000', v5_fx: '1380'
  };
  root.HASGalaxyTestData = Object.freeze({ DATA: DATA, KEYS: Object.keys(DATA) });
})(typeof globalThis !== 'undefined' ? globalThis : this);
