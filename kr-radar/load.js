/* KST (stage8): 100-symbol SYNTHETIC load check. This proves the pure functions handle 100 inputs; it is NOT real monitoring. */
'use strict';
const { evaluateBuy } = require('./buy.js'), F = require('./fixtures.js');
function syntheticLoad(n = 100, today = F.TODAY) {
  const uni = F.syntheticUniverse(n), counts = {};
  for (let i = 0; i < uni.length; i++) {
    const drop = i % 4 === 0 ? { close: 100 } : {};
    const r = evaluateBuy(F.buyInput({ id: 'KR-DEMO-L' + i, instrument: F.instrument({ code: uni[i].code, name: uni[i].name, market: uni[i].market }), quote: drop }), { today });
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  return { kind: 'synthetic-load', evaluated: uni.length, statusCounts: counts, actualActiveCount: 0, realPriceValidated: 0, realApiRequests: 0, note: '합성 100건 처리 확인이며 실제 100종목 감시가 아닙니다.' };
}
module.exports = { syntheticLoad };
