'use strict';
const test = require('node:test'), assert = require('node:assert');
const V = require('../has/valuation-v1.js');
const mk = (y, ni, rev, ocf, cap) => ({ end: y + '-12-31', netIncome: ni, revenue: rev, ocf, capex: cap });
const years = [2025, 2024, 2023, 2022, 2021].map((y, i) => mk(y, 100 + i, 1000 + i * 10, 150, -50));
const shares = { latest: null, annual: years.map(y => ({ end: y.end, value: 10 })) };
const hist = [2025, 2024, 2023, 2022, 2021].map((y, i) => ({ date: y + '-12-30', close: [50, 40, 30, 20, 10][i] }));
test('extractShares: 희석 주식 수·최신 발행 주식 수 추출', () => {
  const raw = { facts: { dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-01-01', val: 5 }, { end: '2026-06-01', val: 6 }] } } },
    'us-gaap': { WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [{ end: '2025-12-31', val: 10, fp: 'FY', form: '10-K' }, { end: '2025-09-30', val: 9, fp: 'Q3', form: '10-Q' }] } } } } };
  const r = V.extractShares(raw);
  assert.deepStrictEqual(r.latest, { end: '2026-06-01', value: 6 });
  assert.strictEqual(r.annual.length, 1);
  assert.deepStrictEqual(V.extractShares(null), { latest: null, annual: [] });
});
test('과거 대비 가장 비싼 현재가 → 아주 비싸다', () => {
  const r = V.compute({ years, shares, price: 60, priceHistory: hist });
  assert.strictEqual(r.metrics[0].grade, '아주 비싸다');
  assert.strictEqual(r.overall, '자기 과거 대비 비싼 편');
  assert.ok(r.counter && r.limits.length >= 3);
});
test('과거 대비 가장 싼 현재가 → 아주 싸다(FCF 수익률은 반대 방향)', () => {
  const r = V.compute({ years, shares, price: 5, priceHistory: hist });
  assert.strictEqual(r.metrics[0].grade, '아주 싸다');
  assert.strictEqual(r.metrics[2].grade, '아주 싸다');
  assert.strictEqual(r.overall, '자기 과거 대비 싼 편');
});
test('과거 3개 미만·가격 없음 → 판정 불가', () => {
  assert.strictEqual(V.compute({ years: years.slice(0, 2), shares, price: 30, priceHistory: hist }).overall, '판정 불가');
  assert.strictEqual(V.compute({ years, shares, price: null, priceHistory: hist }).overall, '판정 불가');
  assert.strictEqual(V.compute({}).overall, '판정 불가');
});
test('적자 해는 PER 비교에서 빠진다', () => {
  const ys = years.map((y, i) => i >= 2 ? Object.assign({}, y, { netIncome: -5 }) : y);
  const m = V.compute({ years: ys, shares, price: 30, priceHistory: hist }).metrics[0];
  assert.strictEqual(m.grade, '판정 불가');
});
test('경기민감은 기준이 좁아진다', () => {
  const normal = V.compute({ years, shares, price: 25, priceHistory: hist }).metrics[1].grade;
  const cyc = V.compute({ years, shares, price: 25, priceHistory: hist, cyclical: true }).metrics[1].grade;
  assert.ok(['보통', '비싸다', '아주 비싸다', '싸다', '아주 싸다'].includes(normal) && ['보통', '싸다', '아주 싸다', '비싸다', '아주 비싸다'].includes(cyc));
});
