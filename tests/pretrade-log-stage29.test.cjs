'use strict';
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path');
const P = require('../has/pretrade-log.js');
const NOW = '2026-11-09T12:00:00.000Z';
const full = (side) => { const checks = {}; P.required(side).forEach(k => { checks[k] = { done: true, note: P.CHECKS[k].research ? '로이터 기사 확인' : '' }; }); return checks; };
const mk = (o) => Object.assign({ id: 'MSFT@' + NOW, createdAt: NOW, name: 'MSFT', side: 'buy', checks: full('buy'), reasonFor: '일시적 과잉 하락', reasonAgainst: '구조적 약화일 수 있음', emotion: 'calm', plan: '3회 분할', decision: 'proceed', review: null }, o || {});
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m }; };

test('점검표: 매수와 매도는 필수 항목이 다르고 순태씨 4단계 조사는 둘 다 필수다', () => {
  ['news', 'earnings', 'consensus', 'community', 'weightCash'].forEach(k => { a.ok(P.required('buy').includes(k)); a.ok(P.required('sell').includes(k)); a.ok(P.required('trim').includes(k)); });
  a.ok(P.required('buy').includes('moat') && !P.required('sell').includes('moat'));
  a.ok(P.required('sell').includes('greatCompany') && !P.required('buy').includes('greatCompany'));
});
test('완전한 기록은 complete, 경고 없음', () => {
  const v = P.validate(mk()); a.ok(v.ok); const r = P.assess(v.entry); a.equal(r.complete, true); a.deepEqual([...r.warnings], []);
});
test('조사 항목은 출처 메모가 비면 완료로 보지 않는다', () => {
  const c = full('buy'); c.news = { done: true, note: ' ' }; const r = P.assess(P.validate(mk({ checks: c })).entry);
  a.equal(r.complete, false); a.ok(r.missing.some(s => s.includes('최신 뉴스') && s.includes('출처')));
});
test('점검이 비어도 기록은 되고, 진행으로 기록하면 점검 미완료 진행으로 집계된다', () => {
  const e = P.validate(mk({ checks: {}, reasonAgainst: '' })).entry; const r = P.assess(e);
  a.equal(r.complete, false); a.equal(r.proceededIncomplete, true); a.ok(r.warnings.some(w => w.includes('점검이 끝나지 않은 채')));
  a.ok(r.missing.some(s => s.includes('반대 근거')));
});
test('공포·탐욕 상태는 경고만 하고 막지 않는다', () => {
  const r = P.assess(P.validate(mk({ emotion: 'fear' })).entry); a.equal(r.complete, true); a.ok(r.warnings.some(w => w.includes('하루 뒤')));
});
test('요약: 점검 완료 진행·미완료 진행·감정 진행을 센다', () => {
  const es = [mk({ id: '1' }), mk({ id: '2', checks: {} }), mk({ id: '3', emotion: 'greed' }), mk({ id: '4', decision: 'wait' })].map(x => P.validate(x).entry);
  const s = P.summarize(es); a.equal(s.total, 4); a.equal(s.proceed, 3); a.equal(s.proceedComplete, 2); a.equal(s.proceedIncomplete, 1); a.equal(s.emotionalProceed, 1); a.equal(s.wait, 1);
});
test('적대 입력: 알 수 없는 키·잘못된 열거·긴 문자열·prototype 키·비객체 거부', () => {
  [null, 1, 'x', [], mk({ extra: 1 }), mk({ side: 'short' }), mk({ emotion: 'x' }), mk({ decision: 'x' }), mk({ name: '' }), mk({ name: 'x'.repeat(41) }), mk({ reasonFor: 'x'.repeat(501) }),
    mk({ checks: { bogus: { done: true, note: '' } } }), mk({ checks: { news: { done: 'yes', note: '' } } }), mk({ checks: { news: { done: true, note: 'x'.repeat(201) } } }),
    mk({ checks: { news: { done: true, note: '', extra: 1 } } }), mk({ createdAt: '2026-11-09' }), mk({ review: { at: NOW, note: 1 } })]
    .forEach(x => a.equal(P.validate(x).ok, false));
  const polluted = JSON.parse('{"__proto__":{"x":1},"id":"a","createdAt":"' + NOW + '","name":"A","side":"buy","checks":{},"reasonFor":"","reasonAgainst":"","emotion":"calm","plan":"","decision":"wait"}');
  a.equal(P.validate(polluted).ok, false); a.equal(({}).x, undefined);
});
test('검증 결과는 동결되고 입력 객체와 분리된다', () => {
  const src = mk(); const v = P.validate(src); a.ok(Object.isFrozen(v.entry) && Object.isFrozen(v.entry.checks));
  src.reasonFor = '바뀜'; a.notEqual(v.entry.reasonFor, '바뀜');
});
test('저장소: 추가·읽기, 이 모듈의 키 하나만 쓴다', () => {
  const s = mem(); s.setItem('v5_gen', 'LEDGER'); const st = P.createStore(s);
  a.equal(st.add(mk()).ok, true); a.equal(st.load().entries.length, 1);
  a.deepEqual([...s._m.keys()].sort(), ['has_pretrade_log_v1', 'v5_gen']); a.equal(s.getItem('v5_gen'), 'LEDGER');
});
test('저장소: 같은 id 중복·가득 참·잘못된 기록은 거부하고 기존 기록을 유지한다', () => {
  const s = mem(), st = P.createStore(s); st.add(mk());
  a.equal(st.add(mk()).error, 'duplicate-id'); a.equal(st.add(mk({ id: 'z', side: 'zzz' })).error, 'invalid'); a.equal(st.load().entries.length, 1);
  for (let i = 0; i < P.MAX_ENTRIES - 1; i++) st.add(mk({ id: 'k' + i }));
  a.equal(st.add(mk({ id: 'over' })).error, 'full');
});
test('저장소: 손상된 저장값은 덮어쓰지 않고 오류를 알린다(기존 기록 보호)', () => {
  const s = mem(); s.setItem(P.KEY, '{broken'); const st = P.createStore(s);
  a.equal(st.load().ok, false); a.equal(st.add(mk()).ok, false); a.equal(s.getItem(P.KEY), '{broken');
});
test('저장소: 일부만 잘못된 항목은 버리고 개수를 알린다', () => {
  const s = mem(); const good = P.validate(mk()).entry; s.setItem(P.KEY, JSON.stringify({ v: 1, entries: [good, { bad: 1 }] }));
  const r = P.createStore(s).load(); a.equal(r.ok, true); a.equal(r.entries.length, 1); a.equal(r.dropped, 1);
});
test('저장소: 쓰기 오류·읽기 오류·storage 없음에서 예외 없이 실패한다', () => {
  a.equal(P.createStore(null).load().error, 'storage-unavailable'); a.equal(P.createStore({}).add(mk()).ok, false);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } }; a.equal(P.createStore(bad).load().error, 'read-failed');
  const wr = { getItem: () => null, setItem() { throw new Error('quota'); } }; a.equal(P.createStore(wr).add(mk()).error, 'write-failed');
  const big = { getItem: () => 'x'.repeat(200001), setItem() { } }; a.equal(P.createStore(big).load().ok, false);
});
test('사후 메모: 추가되고 다른 기록은 그대로다', () => {
  const s = mem(), st = P.createStore(s); st.add(mk()); st.add(mk({ id: 'B' }));
  a.equal(st.addReview('B', '결과 메모', '2026-12-01T00:00:00.000Z').ok, true);
  const es = st.load().entries; a.equal(es.find(e => e.id === 'B').review.note, '결과 메모'); a.equal(es.find(e => e.id !== 'B').review, null);
  a.equal(st.addReview('nope', 'x', NOW).error, 'not-found'); a.equal(st.addReview('B', 'x'.repeat(501), NOW).ok, false);
});
test('정적 보호: 투자 원장 키·네트워크·동적 실행·HTML 주입 구문이 없고 저장 키는 하나다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'has', 'pretrade-log.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ['v5_', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'eval(', 'new Function', 'innerHTML', 'localStorage', 'sessionStorage', 'indexedDB', 'document.'].forEach(w => a.ok(!src.includes(w), w));
  a.equal((src.match(/has_pretrade_log_v1/g) || []).length, 1);
});
test('주문·추천 표현이 없다: 이 모듈은 매수·매도를 권하지 않는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'has', 'pretrade-log.js'), 'utf8');
  a.ok(!/매수하세요|매도하세요|사세요|파세요|주문 ?전송/.test(src));
});
