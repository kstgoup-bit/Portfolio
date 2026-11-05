'use strict';
/* 24단계 제2과제: 투자기록·백업 보호 10개 상황(합성 데이터). 각 시험은 원본 저장소의 SHA-256을 전후 비교하고, 백업 파일은 해시로 무결성을 확인한다. */
const { test } = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const B = require('../backup/core.js'), Bridge = require('../has/advisor-bridge.js');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const stock = (id, t, q = 2, p = 100) => ({ id, name: '합성 ' + t, ticker: t, quantity: q, avgPrice: p, currentPrice: p * 1.1 });
function memory(seed = {}) { const m = new Map(Object.entries(seed)); return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), all: () => Object.fromEntries(m) }; }
function seeded() { return memory({ v5_gen: JSON.stringify([stock(1, 'AAA'), { id: 2, name: '예수금', ticker: 'DEP_GEN', quantity: 1, avgPrice: 1, currentPrice: 500000 }]), v5_dom: JSON.stringify([stock(3, 'BBB', 3, 10000)]), v5_ov: JSON.stringify([stock(4, 'CCC', 1, 90)]), v5_pen: JSON.stringify([stock(5, 'DDD', 5, 20000)]),
  v5_fx: '1370', v5_div: JSON.stringify([{ date: '2026-10-01', amount: 1000 }]), v5_ledger: JSON.stringify({ '2026-10': { income: [{ name: '합성 급여', amount: 1000 }], expense: [], invest: [] } }) }); }
const state = s => sha(JSON.stringify(Object.entries(s.all()).sort()));
const backupText = s => JSON.stringify(B.create(s), null, 2);

test('1 정상 백업→복원: 백업 해시 고정, 복원 후 투자기록 동일', () => {
  const a = seeded(), t = backupText(a), h = sha(t); const b = memory(); for (const k of ['v5_gen', 'v5_dom', 'v5_ov', 'v5_pen']) b.setItem(k, '[]');
  B.apply(b, B.parse(t)); for (const k of Object.keys(a.all())) assert.equal(b.getItem(k), a.getItem(k), k); assert.equal(sha(t), h);
});
test('2 구버전(v5·v4) 백업: 지원 키만 교체, 없는 계좌는 현재 값 유지', () => {
  const s = seeded(), cur = s.getItem('v5_gen'); B.apply(s, B.parse(JSON.stringify({ version: 'v5', domStocks: [stock(9, 'ZZZ')] })));
  assert.equal(s.getItem('v5_gen'), cur); assert.equal(JSON.parse(s.getItem('v5_dom'))[0].ticker, 'ZZZ');
  const s4 = seeded(); B.apply(s4, B.parse(JSON.stringify({ version: 'v4', stocks: [{ ...stock(7, 'KRX1'), market: 'KR' }, { ...stock(8, 'USX1'), market: 'US' }] }))); assert.equal(JSON.parse(s4.getItem('v5_ov'))[0].ticker, 'USX1');
});
test('3 데이터 일부 누락: 새 형식은 4계좌 누락 거절(원본 해시 불변), 구버전은 누락 항목 유지', () => {
  const s = seeded(), before = state(s), b = B.create(s); delete b.storage.v5_pen; assert.throws(() => B.parse(JSON.stringify(b))); assert.equal(state(s), before);
  B.apply(s, B.parse(JSON.stringify({ version: 'v5', penStocks: [stock(11, 'PEN2')] }))); assert.ok(s.getItem('v5_ledger'));
});
test('4 손상된 백업: 잘림·타입오류·악성 문자열·프로토타입 오염 모두 거절, 원본 해시 불변', () => {
  const s = seeded(), before = state(s), good = backupText(s);
  const bad = [good.slice(0, good.length >> 1), '{', '[]', 'null', JSON.stringify({ format: 'kst-portfolio-backup', schemaVersion: 6, storage: { v5_gen: '[{"id":1,"name":"<img onerror=x>","ticker":"A","quantity":1,"avgPrice":1,"currentPrice":1}]', v5_dom: '[]', v5_ov: '[]', v5_pen: '[]' } }),
    '{"version":"v5","genStocks":[],"__proto__":{"x":1}}', JSON.stringify({ version: 'v5', genStocks: [{ ...stock(1, 'A'), quantity: 'NaN' }] }), JSON.stringify({ version: 'v5', genStocks: [stock(1, 'A'), stock(1, 'B')] })];
  for (const t of bad) assert.throws(() => B.parse(t)); assert.equal(state(s), before);
});
test('5 복원 도중 오류: 일부 키 기록 후 실패해도 전부 원복(해시 동일)', () => {
  const s = seeded(), before = state(s), set = s.setItem; let n = 0; s.setItem = (k, v) => { if (k === 'v5_ov' && !n++) throw Error('quota'); set(k, v); };
  assert.throws(() => B.apply(s, B.parse(JSON.stringify({ version: 'v5', genStocks: [], domStocks: [], ovStocks: [] }))), /복구했습니다/);
  delete s.setItem; const keep = s.all(); delete keep[B.JOURNAL]; assert.equal(sha(JSON.stringify(Object.entries(keep).sort())), before);
});
test('6 동일 백업 반복 복원: 투자기록 해시 불변(멱등)', () => {
  const s = seeded(), p = B.parse(backupText(s)), core = () => { const k = s.all(); delete k[B.JOURNAL]; return sha(JSON.stringify(Object.entries(k).sort())); };
  B.apply(s, p); const once = core(); B.apply(s, p); B.apply(s, p); assert.equal(core(), once); assert.equal(B.readJournal(s).status, 'applied');
});
test('7 앱 업데이트 전후: 저장소를 읽기만 하는 새 모듈(읽기 추출·AI 연결)을 돌려도 해시 동일', () => {
  const s = seeded(), before = state(s), get = k => s.getItem(k); Bridge.run(get, {}, '2026-11-05T14:00:00+09:00', { basis: 'synthetic' });
  require('../has/portfolio-reader.js').read(get); assert.equal(state(s), before);
});
test('8 저장공간 부족: 사본 저장 실패 시 계좌 변경 전 중단(해시 동일)', () => {
  const s = seeded(), before = state(s), set = s.setItem; s.setItem = (k, v) => { if (k === B.JOURNAL) throw Error('QuotaExceededError'); set(k, v); };
  assert.throws(() => B.apply(s, B.parse(JSON.stringify({ version: 'v5', genStocks: [] })))); delete s.setItem; assert.equal(state(s), before);
});
test('9 복원 취소(미리보기만): 미리보기·해석은 저장소를 건드리지 않음, 적용 후에도 되돌리기로 원본 복귀', () => {
  const s = seeded(), before = state(s), plan = B.parse(JSON.stringify({ version: 'v5', genStocks: [], domStocks: [] })); B.preview(s, plan); assert.equal(state(s), before);
  B.apply(s, plan); assert.notEqual(state(s), before); B.undo(s); const k = s.all(); delete k[B.JOURNAL]; assert.equal(sha(JSON.stringify(Object.entries(k).sort())), before);
});
test('10 신규 AI 모듈 오류: getter 예외·분석 예외·검증 실패에도 던지지 않고 투자기록 해시 불변', () => {
  const s = seeded(), before = state(s);
  const boom = Bridge.run(() => { throw new Error('저장소 읽기 실패'); }, {}, '2026-11-05T14:00:00+09:00', { basis: 'synthetic' }); assert.equal(boom.status, 'error'); assert.deepEqual(boom.advices, []);
  const bad = Bridge.run(k => s.getItem(k), { quotes: { AAA: { get verification() { throw new Error('시세 모듈 오류'); } } } }, '2026-11-05T14:00:00+09:00', { basis: 'synthetic' });
  assert.equal(bad.status, 'partial'); assert.equal(bad.advices[0].opinion, '판단 보류'); assert.equal(bad.writes, 'none'); assert.equal(state(s), before);
});
