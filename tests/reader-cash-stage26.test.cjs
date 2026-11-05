const test = require('node:test'), a = require('node:assert/strict'), R = require('../has/portfolio-reader.js'), M = require('../has/briefing-model.js');
const S = (id, ticker, q, avg, cur) => ({ id, name: ticker, ticker, quantity: q, avgPrice: avg, currentPrice: cur });
const src = o => k => (k in o ? (typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k])) : null);
test('CMA만 있고 계좌 예수금 기록이 없으면 현금은 "일부만 기록"으로 표시한다(전체 현금으로 단정하지 않음)', () => {
  const p = R.read(src({ v5_fx: '1400', v5_cma_amount: '2000000', v5_gen: [S(1, 'AAA', 10, 100, 120)], v5_dom: [S(2, 'BBB', 5, 100, 100)], v5_ov: [], v5_pen: [] }));
  a.equal(p.cashRecorded, true); a.deepEqual([...p.cashMissingAccounts], ['일반', 'ISA']); a.ok(p.issues.some(x => /예수금 기록이 없는 계좌: 일반·ISA/.test(x)));
});
test('모든 보유 계좌에 예수금 행이 있으면 부분 기록 경고가 없다', () => {
  const p = R.read(src({ v5_fx: '1400', v5_gen: [S(1, 'AAA', 10, 100, 120), S(9, 'DEP_GEN_신한', 1, 1, 500000)], v5_dom: [], v5_ov: [], v5_pen: [] }));
  a.deepEqual([...p.cashMissingAccounts], []); a.ok(!p.issues.some(x => /예수금 기록이 없는 계좌/.test(x)));
});
test('브리핑은 부분 현금 기록을 데이터 부족 위험으로 올린다', () => {
  const p = R.read(src({ v5_fx: '1400', v5_cma_amount: '2000000', v5_gen: [S(1, 'AAA', 10, 100, 120)], v5_dom: [], v5_ov: [], v5_pen: [] }));
  const b = M.build(p, { advices: [], portfolioSignals: [], portfolioMissing: [] }, '2026-11-06T00:00:00Z');
  a.ok(b.risks.some(r => r.id === 'cash-partial' && /일반/.test(r.text)), JSON.stringify(b.risks)); a.deepEqual([...b.state.cashMissingAccounts], ['일반']);
});
