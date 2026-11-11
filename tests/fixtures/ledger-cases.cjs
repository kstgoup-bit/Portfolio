'use strict';
/* 15단계 A: 합성 사례별 "손으로 계산한 기대값". 시험(tests/ledger-stage15.test.cjs)과 검증표 도구(tools/ledger-verification-table.cjs)가 공유한다. 모든 자료는 합성이다. */
const t = (id, type, date, o = {}) => ({ id, type, date, account: 'dom', ticker: 'AAA', currency: 'KRW', ...o });
const buy = (id, date, qty, price, o = {}) => t(id, 'buy', date, { qty, price, ...o });
const sell = (id, date, qty, price, o = {}) => t(id, 'sell', date, { qty, price, ...o });
const usd = (fx, o = {}) => ({ account: 'ov', ticker: 'USX', currency: 'USD', fx, ...o });
module.exports = [
  { name: '평균단가·부분매도·수수료·세금', trades: [buy('1', '2026-01-02', 10, 100), buy('2', '2026-01-05', 10, 120), sell('3', '2026-02-01', 5, 130, { fee: 5, tax: 2 })], prices: { AAA: 125 },
    expected: { qty: 15, avgKRW: 110, costKRW: 1650, realizedKRW: 93, unrealizedKRW: 225, valueKRW: 1875, totalPnLKRW: 318, simpleReturnPct: 318 / 2200 * 100 } },
  { name: '매수 수수료 취득가 포함(기본)', trades: [buy('1', '2026-01-02', 10, 100, { fee: 10 })], prices: { AAA: 100 }, expected: { qty: 10, avgKRW: 101, costKRW: 1010, unrealizedKRW: -10, feesKRW: 10 } },
  { name: '매수 수수료 비용 처리(옵션)', options: { feeOnBuy: 'expense' }, trades: [buy('1', '2026-01-02', 10, 100, { fee: 10 })], prices: { AAA: 100 }, expected: { qty: 10, avgKRW: 100, costKRW: 1000, unrealizedKRW: 0, feesKRW: 10 } },
  { name: '해외(USD) 매수·부분매도 — 매매시점 환율 반영', key: 'ov|USX', fxNow: 1350, prices: { USX: 130 },
    trades: [buy('1', '2026-01-02', 10, 100, usd(1300, { fee: 1 })), sell('2', '2026-03-02', 4, 120, usd(1400, { fee: 1 }))],
    expected: { qty: 6, costKRW: 780780, realizedKRW: 150080, realizedLocal: 78.6, valueKRW: 1053000, unrealizedKRW: 272220 } },
  { name: '주식분할 2:1 후 매도', trades: [buy('1', '2026-01-02', 10, 100), t('2', 'split', '2026-02-01', { ratio: 2 }), sell('3', '2026-03-01', 10, 60)], prices: { AAA: 60 },
    expected: { qty: 10, avgKRW: 50, costKRW: 500, realizedKRW: 100 } },
  { name: '병합 1:10 (ratio 0.1)', trades: [buy('1', '2026-01-02', 100, 10), t('2', 'split', '2026-02-01', { ratio: 0.1 })], prices: { AAA: 100 }, expected: { qty: 10, avgKRW: 100, costKRW: 1000, unrealizedKRW: 0 } },
  { name: '전량 매도 후 재매수(평균단가 초기화)', trades: [buy('1', '2026-01-02', 10, 100), sell('2', '2026-02-01', 10, 110), buy('3', '2026-03-01', 5, 200)], prices: { AAA: 200 },
    expected: { qty: 5, avgKRW: 200, costKRW: 1000, realizedKRW: 100, unrealizedKRW: 0 } },
  { name: '배당(해외, 원천징수)', trades: [buy('1', '2026-01-02', 10, 100, usd(1300)), t('2', 'dividend', '2026-04-01', { ...usd(1400), amount: 10, withholding: 1.5 })], key: 'ov|USX', fxNow: 1300, prices: { USX: 100 },
    expected: { dividendsKRW: 11900, withholdingKRW: 2100 } },
  { name: '종목 변경(코드 이전)', trades: [buy('1', '2026-01-02', 10, 100), t('2', 'rename', '2026-02-01', { newTicker: 'BBB' })], prices: { BBB: 110 }, key: 'dom|BBB', expected: { qty: 10, avgKRW: 100, unrealizedKRW: 100 } },
  { name: '같은 날짜 입력 순서 유지(매수→매도)', trades: [buy('1', '2026-01-02', 10, 100), sell('2', '2026-01-02', 10, 110)], prices: {}, expected: { qty: 0, realizedKRW: 100 } },
];
