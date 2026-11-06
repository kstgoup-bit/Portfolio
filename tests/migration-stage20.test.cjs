'use strict';
/* 20단계 A: 보유→원장 이전 미리보기(합성)와 원장 엔진 오류 시나리오. 어떤 저장소에도 쓰지 않는다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const L = require('../invest/ledger.js'), S = require('../has/migration-sim.js');
const H = () => ({ gen: [{ id: 1, name: '합성A', ticker: 'AAA', quantity: 10, avgPrice: 1000, currentPrice: 1200 }], dom: [], ov: [{ id: 3, name: '합성C', ticker: 'CCC', quantity: 2, avgPrice: 50, currentPrice: 60 }], pen: [{ id: 4, name: '합성D', ticker: 'DDD', quantity: 0, avgPrice: 10, currentPrice: 10 }] });
const buy = (id, date, t, q, p, x = {}) => ({ id, type: 'buy', date, account: 'gen', ticker: t, qty: q, price: p, currency: 'KRW', ...x });
const sell = (id, date, t, q, p, x = {}) => ({ id, type: 'sell', date, account: 'gen', ticker: t, qty: q, price: p, currency: 'KRW', ...x });

test('미리보기: 기초잔액만 만들고 거래 이력·실현손익을 만들지 않으며 쓰기 0', () => {
  const h = H(), snap = JSON.stringify(h), p = S.preview(h, { fxUsd: 1300 });
  a.equal(JSON.stringify(h), snap, '입력 불변'); a.equal(p.writes, 0); a.equal(p.design.writtenInThisStage, false);
  a.equal(p.rows.length, 2); a.ok(p.rows.every(r => r.kind === 'opening-balance' && r.realizedKRW === null && r.historyStatus === '이력 미확인'));
  a.ok(!JSON.stringify(p).includes('"type":"buy"'));
  a.equal(p.rows[0].costKRWApprox, 10000); a.equal(p.rows[1].costKRWApprox, 130000); a.ok(p.rows[1].notes.join().includes('근사'));
  a.equal(p.excluded.length, 1); a.match(p.excluded[0].reason, /수량/);
});
test('미리보기: 환율 없으면 원화 원가 null, 평균단가 없으면 계산 불가 표시, 중복 종목 자동 병합 안 함', () => {
  const p = S.preview({ ov: [{ id: 1, ticker: 'X', quantity: 1, avgPrice: 5 }, { id: 2, ticker: 'X', quantity: 1 }], gen: [{ id: 1, ticker: 'G', quantity: 1, avgPrice: 100 }, { id: 1, ticker: 'G2', quantity: 1, avgPrice: 1 }] });
  a.equal(p.rows.find(r => r.ticker === 'X').costKRWApprox, null); a.equal(p.rows.filter(r => r.ticker === 'X').length, 2);
  a.ok(p.warnings.some(w => w.includes('중복'))); a.ok(p.rows.filter(r => r.ticker === 'X')[1].notes.join().includes('평균단가 없음'));
  a.ok(p.warnings.some(w => w.includes('id 중복')));
});
test('미리보기: 잘못된 입력은 거부·제외하고 던지지 않음', () => {
  a.equal(S.preview(null).ok, false); const p = S.preview({ gen: 'x', dom: [null, { ticker: '', quantity: 1 }, { ticker: 'Z', quantity: NaN }] });
  a.equal(p.rows.length, 0); a.equal(p.excluded.length, 3); a.ok(p.warnings.some(w => w.includes('형식')));
});
test('대응표에 "없음" 항목이 명시되고 이력은 만들어 채우지 않음', () => {
  a.ok(S.FIELD_MAP.filter(f => f.status === '없음').length >= 4); a.ok(S.FIELD_MAP.some(f => /이력 미확인/.test(f.note)));
});
test('엔진 오류 시나리오: 중복 id·초과 매도·매수 전 매도·잘못된 날짜·USD 환율 없음은 계산 거부', () => {
  const code = ev => { const o = L.compute(ev); return o.ok ? 'ok' : o.errors[0].code; };
  a.equal(code([buy('a', '2026-01-01', 'A', 1, 100), buy('a', '2026-01-02', 'A', 1, 100)]), 'duplicate-id');
  a.equal(code([buy('a', '2026-01-01', 'A', 1, 100), sell('s', '2026-03-01', 'A', 2, 150)]), 'over-sell');
  a.equal(code([sell('s', '2026-01-01', 'A', 1, 150), buy('a', '2026-02-01', 'A', 1, 100)]), 'over-sell');
  a.equal(code([buy('a', '2026-02-30', 'A', 1, 1)]), 'date');
  a.equal(code([buy('a', '2026-01-01', 'A', 1, 1, { currency: 'USD' })]), 'fx');
  a.equal(code([{ id: 'c', type: 'cancel', date: '2026-01-01', account: 'gen', ticker: 'A' }]), 'type');   // 취소·정정 유형은 미지원으로 거부(조용히 무시하지 않음)
});
test('엔진 시나리오: 종목코드 변경 후 부분 매도, 부동소수점 소액 거래, 주식 분할 후 매도', () => {
  const r1 = L.compute([buy('a', '2026-01-01', 'A', 2, 100), { id: 'r', type: 'rename', date: '2026-02-01', account: 'gen', ticker: 'A', newTicker: 'B' }, sell('s', '2026-03-01', 'B', 1, 150)]);
  a.ok(r1.ok); const p = r1.positions.find(x => x.ticker === 'B'); a.equal(p.qty, 1); a.equal(p.costKRW, 100); a.equal(p.realizedKRW, 50);
  const r2 = L.compute([buy('a', '2026-01-01', 'A', 3, 0.1), buy('b', '2026-01-02', 'A', 3, 0.2), sell('s', '2026-03-01', 'A', 3, 0.3)]);
  const q = r2.positions[0]; a.ok(Math.abs(q.realizedKRW - 0.45) < 1e-9 && Math.abs(q.costKRW - 0.45) < 1e-9);
  const r3 = L.compute([buy('a', '2026-01-01', 'A', 10, 100), { id: 'sp', type: 'split', date: '2026-02-01', account: 'gen', ticker: 'A', ratio: 2 }, sell('s', '2026-03-01', 'A', 5, 60)]);
  const w = r3.positions[0]; a.equal(w.qty, 15); a.equal(w.costKRW, 750); a.equal(w.realizedKRW, 5 * 60 - 250);
});
test('엔진 시나리오: 해외 배당 원천징수와 환율 적용, 계좌 독립', () => {
  const ev = [{ id: 'o1', type: 'buy', date: '2026-01-05', account: 'ov', ticker: 'C', qty: 2, price: 50, currency: 'USD', fx: 1300 }, { id: 'o2', type: 'dividend', date: '2026-02-05', account: 'ov', ticker: 'C', currency: 'USD', fx: 1400, amount: 2, withholding: 0.3 }, buy('g1', '2026-01-05', 'C', 1, 10)];
  const o = L.compute(ev); a.ok(o.ok); const ov = o.positions.find(p => p.account === 'ov'), gen = o.positions.find(p => p.account === 'gen');
  a.equal(ov.costKRW, 130000); a.equal(ov.dividendsKRW, (2 - 0.3) * 1400); a.equal(gen.qty, 1); a.equal(gen.dividendsKRW, 0);
});
test('정적 검사: 이전 시뮬레이터는 저장소·네트워크·타이머·원장 키를 쓰지 않음', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'has', 'migration-sim.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'setItem', 'setTimeout', 'setInterval', 'document.cookie', 'sendBeacon', 'require(']) a.ok(!src.includes(bad), bad);
  a.ok(!/has_ledger_v1['"]\s*\)/.test(src));
});
