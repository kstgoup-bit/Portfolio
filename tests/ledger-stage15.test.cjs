'use strict';
const { test } = require('node:test'), a = require('node:assert/strict');
const L = require('../invest/ledger.js'), CASES = require('./fixtures/ledger-cases.cjs');
const close = (x, y, m = '', tol = 1e-6) => a.ok(Math.abs(x - y) <= tol * Math.max(1, Math.abs(y)), `${m}: ${x} ≠ ${y}`);
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const t = (id, type, date, o = {}) => ({ id, type, date, account: 'dom', ticker: 'AAA', currency: 'KRW', ...o });
const buy = (id, date, qty, price, o = {}) => t(id, 'buy', date, { qty, price, ...o }), sell = (id, date, qty, price, o = {}) => t(id, 'sell', date, { qty, price, ...o });

for (const c of CASES) test('검증표 사례: ' + c.name, () => {
  const r = L.compute(c.trades, c.options || {}); a.equal(r.ok, true, JSON.stringify(r.errors));
  const v = L.valuate(r, { prices: c.prices || {}, fxUsd: c.fxNow ?? null }), k = c.key || 'dom|AAA', p = r.positions.find(x => x.account + '|' + x.ticker === k), row = v.rows.find(x => x.account + '|' + x.ticker === k);
  const map = { qty: p.qty, avgKRW: p.avgKRW, costKRW: p.costKRW, realizedKRW: p.realizedKRW, realizedLocal: p.realizedLocal, dividendsKRW: p.dividendsKRW, withholdingKRW: p.withholdingKRW, feesKRW: p.feesKRW, unrealizedKRW: row.unrealizedKRW, valueKRW: row.valueKRW, totalPnLKRW: v.totals.totalPnLKRW, simpleReturnPct: v.totals.simpleReturnPct };
  for (const [name, exp] of Object.entries(c.expected)) { a.notEqual(map[name], undefined, name); close(map[name], exp, name); }
});
test('입력 불변: 동결된 입력을 넣어도 계산이 오류 없이 끝나고 결과가 같다', () => {
  const trades = deepFreeze(CASES[0].trades.map(x => ({ ...x }))), a1 = L.compute(trades), a2 = L.compute(trades); a.deepEqual(a1, a2); a.equal(JSON.stringify(trades), JSON.stringify(CASES[0].trades));
});
test('입력 순서가 달라도(날짜 기준) 같은 결과, 같은 날은 입력 순서 유지', () => {
  const tr = CASES[0].trades, shuffled = [tr[2], tr[0], tr[1]]; a.deepEqual(L.compute(shuffled).positions, L.compute(tr).positions);
});
test('검증 오류: 중복 id·날짜·계좌·수량·가격·통화·환율·수수료 → 계산 불가, 정상 종목은 계속 계산', () => {
  const bads = [buy('1', '2026-02-30', 1, 1), buy('2', '2026-01-01', 0, 1), buy('3', '2026-01-01', 1, -1), buy('4', '2026-01-01', 1, 1, { account: 'xx' }), buy('5', '2026-01-01', 1, 1, { currency: 'EUR' }), buy('6', '2026-01-01', 1, 1, { currency: 'USD' }), buy('7', '2026-01-01', 1, 1, { fx: 1300 }), buy('8', '2026-01-01', 1, 1, { fee: -1 }), buy('9', '2026-01-01', NaN, 1), { id: 'x' }, null, buy('', '2026-01-01', 1, 1), t('10', 'split', '2026-01-01', { ratio: 1 }), t('11', 'rename', '2026-01-01', {}), t('12', 'dividend', '2026-01-01', { amount: 5, withholding: 6 }), t('13', 'deposit', '2026-01-01', { amount: 0 })];
  const r = L.compute(bads); a.equal(r.ok, false); a.equal(r.errors.length, bads.length); a.equal(r.positions.length, 0);
  const dup = L.compute([buy('1', '2026-01-01', 1, 1), buy('1', '2026-01-02', 1, 1)]); a.equal(dup.errors[0].code, 'duplicate-id');
  const mix = L.compute([buy('1', '2026-01-01', 1, 100), sell('2', '2026-01-02', 5, 100), buy('3', '2026-01-01', 1, 10, { ticker: 'OK' })]); a.equal(mix.ok, false);
  a.equal(mix.positions.find(p => p.ticker === 'AAA').calculable, false); a.equal(mix.positions.find(p => p.ticker === 'OK').calculable, true);
  const v = L.valuate(mix, { prices: { AAA: 1, OK: 10 } }); a.equal(v.totals.complete, false); a.equal(v.totals.totalPnLKRW, null); a.equal(v.totals.simpleReturnPct, null);
});
test('초과 매도(over-sell)는 숫자를 만들지 않고 이후 기록도 계산하지 않는다', () => {
  const r = L.compute([buy('1', '2026-01-01', 1, 100), sell('2', '2026-01-02', 2, 100), buy('3', '2026-01-03', 5, 100)]); const p = r.positions[0];
  a.equal(r.errors[0].code, 'over-sell'); a.equal(p.calculable, false); a.equal(p.qty, 1); a.equal(p.realizedKRW, 0);
});
test('통화 변경·종목 변경 충돌·빈 포지션 분할은 오류/경고로 처리', () => {
  a.equal(L.compute([buy('1', '2026-01-01', 1, 1), buy('2', '2026-01-02', 1, 1, { currency: 'USD', fx: 1300 })]).errors[0].code, 'currency-change');
  a.equal(L.compute([buy('1', '2026-01-01', 1, 1), buy('2', '2026-01-01', 1, 1, { ticker: 'BBB' }), t('3', 'rename', '2026-01-02', { newTicker: 'BBB' })]).errors[0].code, 'rename-collision');
  a.equal(L.compute([t('1', 'split', '2026-01-01', { ratio: 2 })]).warnings[0].code, 'split-empty'); a.equal(L.compute([t('1', 'rename', '2026-01-01', { newTicker: 'Z' })]).warnings[0].code, 'rename-empty');
  a.equal(L.compute([buy('1', '2026-01-01', 7, 1), t('2', 'split', '2026-01-02', { ratio: 0.3 })]).warnings.some(w => w.code === 'fractional'), true);
  a.equal(L.compute([buy('1', '2026-01-02', 1, 1), sell('2', '2026-01-02', 1, 1)]).warnings.some(w => w.code === 'same-day-buy-sell'), true);
  a.equal(L.compute('x').ok, false); a.equal(L.compute([], { feeOnBuy: 'zzz' }).ok, false);
});
test('손익통산·계좌 분리: 같은 종목 코드라도 계좌별로 따로 계산, 연금은 과세이연 표기', () => {
  const r = L.compute([buy('1', '2026-01-01', 10, 100), buy('2', '2026-01-01', 10, 200, { account: 'pen' }), sell('3', '2026-02-01', 10, 150, { account: 'pen' }), sell('4', '2026-02-01', 10, 90)]);
  const d = r.positions.find(p => p.account === 'dom'), p = r.positions.find(p => p.account === 'pen'); close(d.realizedKRW, -100, 'dom'); close(p.realizedKRW, -500, 'pen');
  a.equal(r.realized.find(x => x.account === 'pen').taxTreatment, 'deferred'); a.equal(L.taxTreatment('dom', 'KR').kind, 'domestic'); a.equal(L.taxTreatment('ov', 'US').kind, 'overseas-cgt');
});
test('해외주식 양도세 추정: 연 단위 손익통산·공제·추정 표시, 연금/국내는 제외', () => {
  const o = (id, p, ex) => [buy(id + 'b', '2026-01-02', 100, 10, { account: 'ov', ticker: id, currency: 'USD', fx: 1000 }), sell(id + 's', '2026-06-02', 100, p, { account: 'ov', ticker: id, currency: 'USD', fx: 1000 })];
  const r = L.compute([...o('A', 40), ...o('B', 5), ...buy('9', '2026-01-02', 1, 1) ? [buy('d1', '2026-01-02', 10, 100), sell('d2', '2026-02-01', 10, 900)] : []]);   // A +3,000,000 / B −500,000 / 국내 제외
  const tax = L.estimateOverseasTax(r); a.equal(tax.estimated, true); a.equal(tax.rows.length, 1); close(tax.rows[0].netRealizedKRW, 2500000); close(tax.rows[0].taxableKRW, 0); close(tax.rows[0].estimatedTaxKRW, 0);
  const r2 = L.compute([...o('A', 40), ...o('C', 30)]); const t2 = L.estimateOverseasTax(r2); close(t2.rows[0].netRealizedKRW, 5000000); close(t2.rows[0].taxableKRW, 2500000); close(t2.rows[0].estimatedTaxKRW, 550000);
  a.equal(L.estimateOverseasTax(r2, { rate: 2 }).ok, false); a.match(t2.note, /확정 세액 아님/); a.match(t2.params.source, /미확인/);
  const y = L.compute([...o('A', 40), { ...sell('x', '2027-02-02', 0.0001, 99999, { account: 'ov', ticker: 'A', currency: 'USD', fx: 1000 }) }]); a.equal(y.ok, false);
});
test('XIRR: 알려진 값(1년 +10%), 해 없음/한쪽 방향만/형식 오류는 값을 만들지 않는다', () => {
  const x = L.xirr([{ date: '2026-01-01', amount: -1000 }, { date: '2027-01-01', amount: 1100 }]); a.equal(x.ok, true); close(x.rate, 0.1, 'xirr', 1e-8);
  const y = L.xirr([{ date: '2026-01-01', amount: -1000 }, { date: '2026-07-01', amount: -500 }, { date: '2027-01-01', amount: 1800 }]); a.equal(y.ok, true);
  const t0 = '2026-01-01'; const npv = [[-1000, '2026-01-01'], [-500, '2026-07-01'], [1800, '2027-01-01']].reduce((s, [m, d]) => s + m / Math.pow(1 + y.rate, (Date.parse(d) - Date.parse(t0)) / 86400000 / 365), 0); close(npv, 0, 'npv', 1e-6);
  for (const bad of [[{ date: '2026-01-01', amount: -1 }], [{ date: '2026-01-01', amount: -1 }, { date: '2026-02-01', amount: -2 }], [{ date: 'x', amount: -1 }, { date: '2026-02-01', amount: 2 }], null, [{ date: '2026-01-01', amount: 1e12 }, { date: '2026-01-02', amount: -1 }]]) a.equal(L.xirr(bad).ok, false);
  const loss = L.xirr([{ date: '2026-01-01', amount: -1000 }, { date: '2027-01-01', amount: 500 }]); close(loss.rate, -0.5, 'loss', 1e-8);
});
test('거래기록 기반 XIRR: 평가 자료·기준일 조건 충족 시에만', () => {
  const r = L.compute([buy('1', '2026-01-01', 10, 100), sell('2', '2026-07-01', 5, 120)]), v = L.valuate(r, { prices: { AAA: 130 } });
  const x = L.xirrOf(r, v, '2027-01-01'); a.equal(x.ok, true); a.ok(x.rate > 0);
  a.equal(L.xirrOf(r, L.valuate(r, { prices: {} }), '2027-01-01').ok, false); a.equal(L.xirrOf(r, v, '2026-03-01').ok, false); a.equal(L.xirrOf(L.compute([{ id: 'x' }]), v, '2027-01-01').ok, false);
});
test('TWR: 입금이 있어도 시간가중 수익률(10% 후 입금 50, 최종 165 → 15%)', () => {
  const w = L.twr([{ date: '2026-01-01', value: 100 }, { date: '2026-02-01', value: 110 }, { date: '2026-03-01', value: 165 }], [{ date: '2026-03-01', amount: 50 }]); a.equal(w.ok, true); close(w.twrPct, 15, 'twr'); close(w.periods[1].returnPct, (115 / 110 - 1) * 100);
  a.equal(L.twr([{ date: '2026-01-01', value: 100 }]).ok, false); a.equal(L.twr([{ date: '2026-01-01', value: 0 }, { date: '2026-02-01', value: 5 }]).ok, false); a.equal(L.twr([{ date: '2026-01-01', value: 1 }, { date: '2026-01-01', value: 2 }]).ok, false);
  a.equal(L.twr([{ date: '2026-01-01', value: -1 }, { date: '2026-02-01', value: 2 }]).ok, false);
});
test('앱 보유 현황 읽기 전용 변환: 실현손익은 "계산 불가", 환율/현재가/평균단가 누락은 표시', () => {
  const stocks = deepFreeze([{ id: 1, name: 'A', ticker: 'MSFT', quantity: 2, avgPrice: 400, currentPrice: 440 }, { id: 2, name: 'B', ticker: 'X', quantity: 1, avgPrice: 0, currentPrice: 0 }, { id: 3, name: 'C', ticker: 'Y', quantity: 0, avgPrice: 1, currentPrice: 1 }]);
  const r = L.fromAppHoldings(stocks, 'ov', { fxUsd: 1400 }); a.equal(r.rows.length, 2); const m = r.rows[0]; close(m.valueKRW, 2 * 440 * 1400); close(m.unrealizedPct, 10); a.equal(m.realizedKRW, null); a.match(m.realizedNote, /계산 불가/); a.ok(m.notes.some(n => /근사/.test(n)));
  a.equal(r.rows[1].valueKRW, null); a.ok(r.rows[1].notes.length >= 2); a.equal(L.fromAppHoldings(stocks, 'ov').rows[0].valueKRW, null); a.equal(L.fromAppHoldings(null, 'ov').ok, false); a.equal(L.fromAppHoldings([], 'zz').ok, false);
});
test('거래기록 ↔ 앱 보유 대조: 일치/수량/평균단가/한쪽 누락', () => {
  const r = L.compute([buy('1', '2026-01-01', 10, 100), buy('2', '2026-01-01', 5, 50, { ticker: 'BBB' }), buy('3', '2026-01-01', 1, 10, { ticker: 'CCC' }), buy('4', '2026-01-01', 3, 10, { ticker: 'EEE' })]);
  const app = [{ account: 'dom', ticker: 'AAA', qty: 10, avgLocal: 100 }, { account: 'dom', ticker: 'BBB', qty: 4, avgLocal: 50 }, { account: 'dom', ticker: 'CCC', qty: 1, avgLocal: 12 }, { account: 'dom', ticker: 'DDD', qty: 1, avgLocal: 1 }, { account: 'dom', ticker: 'EEE', qty: 3, avgLocal: 10.01 }];
  const s = Object.fromEntries(L.reconcile(r.positions, app).map(x => [x.key.split('|')[1], x.status])); a.deepEqual(s, { AAA: 'match', BBB: 'qty-mismatch', CCC: 'avg-mismatch', DDD: 'missing-in-ledger', EEE: 'match' });
  a.equal(L.reconcile(L.compute([buy('1', '2026-01-01', 1, 1)]).positions, []).at(0).status, 'missing-in-app');
});
test('가져오기/내보내기: CSV·JSON 왕복에서 누락·중복·변형 없음, 원본 불변', () => {
  const trades = deepFreeze([buy('t1', '2026-01-02', 10, 100.5, { name: '이름, 쉼표 "따옴표"', fee: 1.25 }), t('t2', 'split', '2026-02-01', { ratio: 2 }), buy('t3', '2026-01-02', 1, 5, { account: 'ov', ticker: 'MSFT', currency: 'USD', fx: 1300.5 }), t('t4', 'deposit', '2026-01-01', { amount: 1000000 }), t('t5', 'dividend', '2026-03-01', { amount: 7, withholding: 1, currency: 'USD', fx: 1300 })]);
  const csv = L.exportTradeCsv(trades), back = L.parseTradeCsv(csv); a.equal(back.ok, true); a.equal(back.trades.length, 5);
  const norm = x => JSON.parse(L.exportTradeJson(x)).trades; a.deepEqual(norm(back.trades), norm(trades));
  const js = L.parseTradeJson(L.exportTradeJson(trades)); a.equal(js.ok, true); a.deepEqual(norm(js.trades), norm(trades));
  a.deepEqual(L.compute(back.trades).positions, L.compute(trades).positions); a.equal(L.exportTradeCsv(back.trades), csv);
});
test('가져오기 거부: 알 수 없는 열·필수 열 없음·열 개수·숫자 오류·빈 파일·잘못된 JSON/버전', () => {
  for (const bad of ['', 'foo,id\n1,2', 'id,type,date\n1,buy,2026-01-01', 'id,type,date,account,qty\n1,buy,2026-01-01,dom', 'id,type,date,account,qty\n1,buy,2026-01-01,dom,abc', null]) a.equal(L.parseTradeCsv(bad).ok, false, String(bad));
  for (const bad of ['{', '{}', JSON.stringify({ format: 'kst-trade-log', schemaVersion: 2, trades: [] }), JSON.stringify({ format: 'kst-trade-log', schemaVersion: 1, trades: 'x' })]) a.equal(L.parseTradeJson(bad).ok, false);
});
test('병합: 새 기록만 추가, 동일 id 동일 내용은 중복, 동일 id 다른 내용은 충돌(덮어쓰지 않음)', () => {
  const ex = deepFreeze([buy('1', '2026-01-01', 1, 1), buy('2', '2026-01-02', 1, 1)]), inc = [buy('2', '2026-01-02', 1, 1), buy('1', '2026-01-01', 9, 1), buy('3', '2026-01-03', 1, 1)];
  const m = L.mergeTrades(ex, inc); a.deepEqual(m.added, ['3']); a.deepEqual(m.duplicates, ['2']); a.deepEqual(m.conflicts, ['1']); a.equal(m.merged.length, 3); a.equal(m.merged.find(x => x.id === '1').qty, 1);
  const again = L.mergeTrades(m.merged, inc); a.deepEqual(again.added, []);
});
test('정적 검사: ledger.js 는 네트워크·저장소·타이머·동적 코드·DOM 접근 없음', () => {
  const s = require('node:fs').readFileSync(require.resolve('../invest/ledger.js'), 'utf8');
  for (const w of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'eval(', 'new Function', 'document.', 'window.', 'process.', 'require(']) a.ok(!s.includes(w), w);
});
