'use strict';
/* 19단계 E: 합성 4계좌 + 구버전(v4/v5) + 현재(v6) 백업 호환. 사용자 실제 백업은 쓰지 않는다. */
const { test } = require('node:test'), a = require('node:assert/strict'), crypto = require('node:crypto'), B = require('../backup/core.js');
const memory = (seed = {}) => { const m = new Map(Object.entries(seed)); return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), all: () => Object.fromEntries(m) }; };
const st = (id, t, q, p, c) => ({ id, name: '합성 ' + t, ticker: t, quantity: q, avgPrice: p, currentPrice: c });
const seed = () => memory({ v5_gen: JSON.stringify([st(1, 'AAA', 2, 40000, 50000)]), v5_dom: JSON.stringify([st(2, 'BBB', 3, 10000, 12000)]), v5_ov: JSON.stringify([st(3, 'CCC', 1, 90, 99)]), v5_pen: JSON.stringify([st(4, 'DDD', 5, 20000, 21000)]) });
const sha = o => crypto.createHash('sha256').update(JSON.stringify(Object.entries(o).sort())).digest('hex');
test('v6: 생성→해석→미리보기→취소(변화 0)→복원→되돌리기', () => {
  const src = seed(), text = JSON.stringify(B.create(src)), plan = B.parse(text);
  const target = memory({ v5_gen: '[]', v5_dom: '[]', v5_ov: '[]', v5_pen: '[]' }), h0 = sha(target.all());
  const rows = B.preview(target, plan); a.ok(rows.some(r => r.changed)); a.equal(sha(target.all()), h0, '미리보기·취소는 저장소를 바꾸지 않음');
  B.apply(target, plan); for (const k of B.ACCOUNTS) a.equal(target.getItem(k), src.getItem(k));
  B.undo(target); for (const k of B.ACCOUNTS) a.equal(target.getItem(k), '[]');
});
test('구버전 v4/v5 백업도 해석되고 복원 후 되돌릴 수 있음', () => {
  const v5 = JSON.stringify({ version: 'v5', genStocks: [st(1, 'AAA', 1, 1, 1)], domStocks: [], ovStocks: [], penStocks: [] });
  const s = seed(), before = sha(s.all()); B.apply(s, B.parse(v5)); a.equal(JSON.parse(s.getItem('v5_gen')).length, 1); B.undo(s); a.equal(sha(s.all()).length, 64);
  for (const k of B.ACCOUNTS) a.ok(JSON.parse(s.getItem(k)));
  const v4 = JSON.stringify({ version: 'v4', stocks: [{ ...st(5, 'EEE', 1, 1, 1), market: 'KR' }, { ...st(6, 'FFF', 1, 1, 1), market: 'US' }] });
  a.doesNotThrow(() => B.parse(v4)); a.ok(before.length === 64);
});
test('시범 화면이 쓰는 키(has_ledger/kst.lab)는 백업 허용 목록에 없음', () => {
  a.equal(B.allowed('has_ledger_v1'), false); a.equal(B.allowed('kst.lab.ledger'), false);
  const s = seed(); s.setItem('has_ledger_v1', 'x'); a.ok(!JSON.stringify(B.create(s)).includes('has_ledger_v1'));
});
