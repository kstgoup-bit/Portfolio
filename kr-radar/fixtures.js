/* KST KR radar: fully fictional fixtures. Names, ids and codes are invented; no real company or price. */
'use strict';
const { copy } = require('./common.js');
const TODAY = '2026-10-29';
const ev = (extra = {}) => ({ source: 'https://example.com/demo/evidence', asOf: '2026-08-14', checkedAt: '2026-10-20', summary: '합성 근거 요약', counterEvidence: '합성 반대 근거', periodBasis: 'consolidated', ...extra });
const claim = (component, extra = {}) => ({ component, claim: '합성 ' + component + ' 판단', source: 'https://example.com/demo/' + component, asOf: '2026-08-14', period: { basis: 'consolidated', fiscalLabel: '2026 2분기(4~6월)', end: '2026-06-30' }, filing: { id: '20260814000001', kind: 'original', supersededBy: null }, counterScenario: '합성 반대 시나리오 ' + component, verification: 'demo', ...extra });
function instrument(extra = {}) { return { code: 'ZZ0001', name: '가상기업', market: 'KOSPI', securityType: '보통주', delisted: false, delistingReview: false, administrativeIssue: false, tradingHalt: false, investmentCaution: 'none', ...extra }; }
function buyInput(over = {}) {
  const base = {
    mode: 'synthetic', id: 'KR-DEMO-A', sector: 'general', instrument: instrument(),
    quote: { synthetic: true, asOf: '2026-10-28', close: 70, high52w: 100, high52wStart: '2025-10-28', high52wEnd: '2026-10-28', currency: 'KRW', timezone: 'Asia/Seoul', adjustment: 'adjusted-consistent', session: 'regular', tradingStatus: 'normal', source: { name: '합성 시세', url: 'https://example.com/demo/quote' } },
    performance: { start: '2026-07-28', end: '2026-10-28', stockPct: -22, marketPct: -2, sectorPct: -8, benchmark: 'KOSPI', sectorIndex: '합성 업종지수', adjustment: 'adjusted-consistent', currency: 'KRW' },
    assessment: {
      synthetic: true, verification: 'demo', asOf: '2026-08-14', riskFlags: [],
      components: { business: 16, financial: 16, event: 8, catalyst: 3 },
      claims: ['business', 'financial', 'event', 'catalyst'].map(c => claim(c)),
      valuation: { pbr: 0.6, per: 8, roe: 9, roeMedian: 10, epsTrend: 'flat', cyclePhase: 'mid', pbrHistory: { low: 0.55, median: 0.9, high: 1.4, years: 7 }, evidence: ev() },
      shareholder: { dividend: { yieldPct: 2.2, cut: false }, buyback: { executed: true }, cancellation: { executedPct: 1.0, filingId: '20260820000002', source: 'https://example.com/demo/cancel' }, governance: { concern: false }, evidence: ev() }
    }
  };
  return merge(base, over);
}
function sellInput(over = {}) {
  const base = {
    mode: 'synthetic', id: 'KR-DEMO-A', sector: 'general', role: 'satellite', instrument: instrument(),
    quote: { synthetic: true, asOf: '2026-10-28', close: 150, cost: 100, costBasis: 'same-adjustment-basis', currency: 'KRW', adjustment: 'adjusted-consistent', session: 'regular', tradingStatus: 'normal' },
    valuation: { kind: 'PBR', multiple: 1.0, historicalHigh: 1.4, historyYears: 7, growthPct: 5, outlookGrowthPct: 8, fcfYieldPct: 4, evidence: ev({ periodBasis: undefined }) },
    cycle: { phase: 'mid', earningsVsMid: 1.0, evidence: ev({ periodBasis: undefined }) },
    thesis: { factors: ['moat', 'earnings', 'cashflow', 'debt', 'marketShare'].map(name => ({ name, state: 'stable' })), evidence: ev({ periodBasis: undefined }) },
    shareholderReturn: { buybackWithoutCancellation: false, dividendCut: false, evidence: ev({ periodBasis: undefined }) },
    governance: { conflict: false, physicalSpinOff: false, evidence: ev({ periodBasis: undefined }) },
    positions: ['G', 'H', 'I', 'J'].map((sec, i) => ({ account: 'A' + (i % 2), stock: 'KR-DEMO-' + sec, sector: sec, value: 25, currency: 'BASE' })),
    approvedLimits: { account: 1, stock: 0.5, sector: 0.6 },
    replacement: { evidence: { source: 'https://example.com/demo/replace', asOf: '2026-10-10', checkedAt: '2026-10-20', summary: '합성', counterEvidence: '합성' }, currency: 'BASE', currentQuality: 60, alternativeQuality: 70, currentYield: 4, alternativeYield: 4, taxCost: 0.1, tradeCost: 0.1, cashNeed: 0, availableCash: 10, horizonYears: 3 }
  };
  return merge(base, over);
}
function merge(base, over) { const out = copy(base); for (const [k, v] of Object.entries(over)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? merge(out[k], v) : v; return out; }
// Performance fixture only: invented codes with a 'ZZ' prefix cannot be mistaken for the real candidate list.
function syntheticUniverse(n = 100) {
  return Array.from({ length: n }, (_, i) => ({ code: 'ZZ' + String(i + 1).padStart(4, '0'), name: '가상기업' + (i + 1), market: i % 3 === 0 ? 'KOSDAQ' : 'KOSPI', securityType: '보통주', group: 'stock', sector: 'general', synthetic: true }));
}
module.exports = { TODAY, ev, claim, instrument, buyInput, sellInput, merge, syntheticUniverse };
