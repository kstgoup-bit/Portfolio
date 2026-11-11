'use strict';
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../has/alerts-core.js'), J = require('../has/advice-journal.js'), A = require('../has/advisor-core.js'), W = require('../has/watch-engine.js'), F = require('./lib/fixtures-stage23.cjs');
const item = (kind, ticker, level, o) => Object.assign({ id: kind + '|' + ticker, kind, ticker, level, dataOk: true, evidence: ['근거'], asOfDate: '2026-11-05', source: 'S' }, o);
const D = (n) => '2026-11-' + String(n).padStart(2, '0') + 'T09:00:00+09:00';
test('알림 후보: 근거·자료 충분한 것만, 6가지 유형 라벨', () => {
  const r = L.candidates([item('drawdown+advice', 'A', 30), item('fundamental-deterioration', 'B', 2), item('concentration', 'C', 31), item('cash-low', null, 5), item('market-risk', null, 35), item('thesis-broken', 'D', 1),
    item('drawdown+advice', 'E', 30, { dataOk: false }), item('cash-low', null, 5, { evidence: [] }), item('unknown-kind', 'F', 1)], D(5));
  a.equal(r.candidates.length, 6); a.equal(r.rejected.length, 3); a.deepEqual(r.candidates.map(c => c.label).sort(), Object.values(L.TYPES).map(t => t.label).sort());
  a.ok(r.rejected.some(x => x.reason.includes('자료 불충분'))); a.ok(r.rejected.some(x => x.reason === '근거 없음'));
});
test('반복 알림 제한: 쿨다운 중 동일 단계 억제, 단계 상승은 통과, 쿨다운 후 재알림', () => {
  const c1 = L.candidates([item('drawdown+advice', 'A', 30)], D(5)).candidates; let r = L.select(c1, D(5), L.emptyState()); a.equal(r.shown.length, 1);
  const st = r.state; const r2 = L.select(c1, D(6), st); a.equal(r2.shown.length, 0); a.match(r2.suppressed[0].reason, /쿨다운/);
  const up = L.candidates([item('drawdown+advice', 'A', 35)], D(6)).candidates; a.equal(L.select(up, D(6), st).shown.length, 1);
  a.equal(L.select(c1, D(13), st).shown.length, 1);                      // 7일 뒤
  a.equal(L.select(c1, D(5), L.emptyState()).shown.length, 1); a.equal(JSON.stringify(st), JSON.stringify(r.state));   // 상태 불변
});
test('하루 상한 5건: 우선순위 낮은 것부터 보류, 다음 날 초기화', () => {
  const items = ['market-risk|', 'thesis-broken|A', 'fundamental-deterioration|B', 'concentration|C', 'drawdown+advice|D', 'cash-low|'].map(s => { const [k, t] = s.split('|'); return item(k, t || null, 1); });
  const c = L.candidates(items, D(5)).candidates, r = L.select(c, D(5), L.emptyState()); a.equal(r.shown.length, 5); a.equal(r.suppressed.length, 1); a.match(r.suppressed[0].reason, /하루 상한/); a.equal(r.suppressed[0].key.startsWith('cash-low'), true);
  a.equal(r.shown[0].type, 'market-risk');
  const next = L.select(c.filter(x => x.type === 'cash-low'), D(6), r.state); a.equal(next.shown.length, 1);
});
test('같은 실행 중복 제거, 푸시 한계 고지문', () => { const c = L.candidates([item('cash-low', null, 5), item('cash-low', null, 5)], D(5)).candidates; a.equal(L.select(c, D(5), L.emptyState()).shown.length, 1); a.match(L.DELIVERY_NOTICE, /항상 보장되지 않습니다/); });
test('신호→알림 흐름(합성): 감시 신호+조언에서 자료 불충분은 알림 안 됨', () => {
  const s = F.stock({ quote: F.quote({ price: 60, verification: 'unverified' }) }), w = W.evaluateStock(s, F.ctx(), F.NOW); a.equal(w.signals.some(x => x.type === 'drawdown'), false);
});
const entry = o => J.record(Object.assign({ ticker: 'SYN-A', asOf: D(5), opinion: '매수 검토', reasonsFor: ['r'], reasonsAgainst: ['c'], risks: [] }, o && o.advice), Object.assign({ priceAtAdvice: 100, weightPct: 5, inputsUsed: [{ name: '시세', asOfDate: '2026-11-05', source: 'S' }, { name: '재무', asOfDate: '2026-09-30', source: 'F' }] }, o && o.ctx), D(5));
test('판단 기록: 미래 자료 혼입(누출)·출처/기준일/당시가격 없음 거부, 원장과 분리', () => {
  a.ok(entry().ok); a.equal(entry().entry.separateFromLedger, true); a.equal(entry().entry.userDecision, 'undecided');
  const leak = entry({ ctx: { inputsUsed: [{ name: '미래실적', asOfDate: '2026-11-20', source: 'F' }] } }); a.equal(leak.ok, false); a.match(leak.errors[0], /데이터 누출/);
  a.equal(entry({ ctx: { inputsUsed: [{ name: 'x', asOfDate: '2026-11-01' }] } }).ok, false); a.equal(entry({ ctx: { inputsUsed: [{ name: 'x', source: 'S' }] } }).ok, false); a.equal(entry({ ctx: { priceAtAdvice: 0 } }).ok, false);
  a.equal(J.decide(entry().entry, 'followed').userDecision, 'followed'); a.equal(J.decide(entry().entry, 'bogus').userDecision, 'undecided');
  a.equal(J.DESIGN.writtenInThisStage, false); a.equal(J.DESIGN.separateFromLedger, true);
  const src = fs.readFileSync(path.join(__dirname, '../has/advice-journal.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); a.ok(!/ledger/i.test(src.replace(/separateFromLedger/g, '')));
});
test('사후 평가: 벤치마크 초과·최대낙폭 기준, 기간 밖 자료 무시, 판단 보류는 비평가', () => {
  const e = entry().entry, up = { benchAtAdvice: 1000, prices: [{ date: '2026-11-20', price: 110 }, { date: '2026-12-05', price: 120 }, { date: '2026-12-10', price: 300 }], bench: [{ date: '2026-12-05', price: 1050 }, { date: '2026-12-10', price: 5000 }] };
  let r = J.evaluate(e, up, 30); a.equal(r.scored, true); a.equal(r.returnPct, 20); a.equal(r.benchPct, 5); a.equal(r.excessPct, 15); a.equal(r.maxDrawdownPct, 0); a.equal(r.hit, true);   // 12-10 자료는 무시
  const dip = { benchAtAdvice: 1000, prices: [{ date: '2026-11-10', price: 90 }, { date: '2026-12-05', price: 105 }], bench: [{ date: '2026-12-05', price: 1100 }] };
  r = J.evaluate(e, dip, 30); a.equal(r.returnPct, 5); a.equal(r.excessPct, -5); a.equal(r.maxDrawdownPct, 10); a.equal(r.returnPerDrawdown, 0.5); a.equal(r.hit, false); a.ok(r.errorCauses[0].includes('벤치마크 하회'));
  const rise = { benchAtAdvice: 1000, prices: [{ date: '2026-12-05', price: 108 }], bench: [{ date: '2026-12-05', price: 1200 }] }; r = J.evaluate(e, rise, 30); a.equal(r.hit, false);     // 오르기만 해도 시장보다 못하면 적중 아님
  const red = entry({ advice: { opinion: '비중 축소 검토' } }).entry; a.equal(J.evaluate(red, rise, 30).hit, true);
  a.equal(J.evaluate(entry({ advice: { opinion: '판단 보류' } }).entry, up, 30).scored, false);
  a.equal(J.evaluate(e, { benchAtAdvice: 1000, prices: [], bench: [] }, 30).scored, false); a.equal(J.evaluate(e, { prices: up.prices, bench: up.bench }, 30).scored, false);
  a.equal(J.evaluate(e, { benchAtAdvice: 1000, prices: [{ date: '2026-11-12', price: 101 }], bench: [{ date: '2026-11-12', price: 1001 }] }, 30).scored, false);   // 기간 끝까지 자료 없음
  const before = JSON.stringify(e); J.evaluate(e, up, 30); a.equal(JSON.stringify(e), before);
});
