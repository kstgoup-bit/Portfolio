'use strict';
/* 23단계 합성 시험 자료. 모두 가짜(synthetic) — 실제 시세·보유·재무가 아니다. */
const Q = require('../../has/quote-model.js');
const NOW = '2026-11-05T14:00:00+09:00';
const quote = (o = {}) => Q.normalize(Object.assign({ ticker: 'SYN-A', market: 'KR', price: 70, currency: 'KRW', kind: 'close', asOfDate: '2026-11-05', asOfTime: '2026-11-05T09:00:00+09:00', fetchedAt: NOW, source: 'SYNTHETIC-TEST', verification: 'independent-verified', synthetic: true }, o)).quote;
const fund = (o = {}) => Object.assign({ asOfDate: '2026-09-30', source: 'SYNTHETIC-FIN', revenueGrowthPct: 8, freeCashFlow: 100, freeCashFlowPrev: 90, debtToEquity: 0.6, debtToEquityPrev: 0.6 }, o);
const stock = (o = {}) => Object.assign({ ticker: 'SYN-A', name: '합성A', market: 'KR', quote: quote(), high52w: { price: 100, asOfDate: '2026-11-05', source: 'SYNTHETIC-TEST' },
  returns: { stockPct: -30, benchPct: -5, periodDays: 20, asOfDate: '2026-11-05', source: 'SYNTHETIC-TEST' }, fundamentals: fund(), thesis: { intact: true, note: '합성' }, held: null }, o);
const ctx = (o = {}) => Object.assign({ weightPct: 5, weightBasis: 'verified', cashPct: 20, cashBasis: 'verified', market: { vix: { level: 18, change5dPct: 2, asOfDate: '2026-11-05', source: 'SYNTHETIC-TEST' } } }, o);
module.exports = { NOW, quote, fund, stock, ctx };
