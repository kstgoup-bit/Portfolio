'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const D = require('../invest/draft-store.js');
class Store { constructor(o = {}) { this.m = new Map(Object.entries(o)); this.reads = []; this.writes = []; this.fail = null; } getItem(k) { this.reads.push(k); return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.writes.push(k); if (this.fail) throw this.fail; this.m.set(k, String(v)); } removeItem(k) { this.writes.push(k); this.m.delete(k); } snap() { return JSON.stringify([...this.m].sort()); } }
const APP = { v5_gen: '[{"id":1}]', v5_dom: '[]', v5_ov: '[]', v5_pen: '[]', v5_userThemeMap: '{"A":"x"}', 'kst.portfolio.restoreJournal': '{"a":1}' };
const P = { tradesJson: '{"format":"kst-trade-log"}', thesesJson: null, themeText: 'AAA=반도체', thresholds: { tickerMaxPct: 30 } };
test('저장 → 복원 왕복: 같은 내용, 기록 날짜 보존', () => { const s = new Store(); const r = D.save(s, P, '2026-10-29'); a.equal(r.ok, true); const p = D.peek(s); a.equal(p.ok, true); a.equal(p.savedAt, '2026-10-29'); a.deepEqual(p.state.thresholds, { tickerMaxPct: 30 }); a.equal(p.state.themeText, 'AAA=반도체'); a.equal(p.state.tradesJson, P.tradesJson); a.equal(p.state.thesesJson, null); });
test('앱 투자기록·백업 키는 읽지도 쓰지도 않고 저장/복원/삭제 후에도 그대로(키는 하나뿐)', () => {
  const s = new Store(APP), before = JSON.stringify(Object.entries(APP).sort()); D.save(s, P, '2026-10-29'); D.peek(s); D.discard(s);
  a.deepEqual([...new Set([...s.reads, ...s.writes])], [D.KEY]); a.equal(JSON.stringify([...s.m].sort()), before); D.save(s, P, '2026-10-29'); a.deepEqual([...s.m.keys()].sort(), [...Object.keys(APP), D.KEY].sort()); for (const [k, v] of Object.entries(APP)) a.equal(s.m.get(k), v);
});
test('저장 실패(용량·차단·알 수 없음): 기존 초안 유지 + 복구 안내, 예외를 밖으로 던지지 않음', () => {
  const s = new Store(); D.save(s, P, '2026-10-28'); const before = s.snap();
  for (const [err, code] of [[Object.assign(new Error('x'), { name: 'QuotaExceededError' }), 'quota'], [Object.assign(new Error('The quota has been exceeded'), { name: 'Error' }), 'quota'], [Object.assign(new Error('x'), { name: 'SecurityError' }), 'denied'], [new Error('boom'), 'unknown']]) { s.fail = err; const r = D.save(s, { ...P, themeText: 'new' }, '2026-10-29'); a.equal(r.ok, false); a.equal(r.code, code); a.match(r.message, /내보내기/); a.match(r.message, /기존 임시 저장은 바뀌지 않았습니다/); a.equal(s.snap(), before); }
  s.fail = null; a.equal(D.peek(s).state.themeText, 'AAA=반도체');
});
test('저장 확인 실패(쓰기는 성공했으나 읽으면 다름) 감지', () => { const s = new Store(); s.setItem = function (k, v) { this.m.set(k, 'x' + v); }; const r = D.save(s, P, '2026-10-29'); a.equal(r.ok, false); a.equal(r.code, 'verify-failed'); });
test('손상·형식 오류·버전 불일치는 복원하지 않고 삭제도 하지 않음(알림만)', () => {
  const s = new Store(); const cases = [['{broken', 'corrupt'], ['"str"', 'corrupt'], [JSON.stringify({ format: 'other' }), 'corrupt'], [JSON.stringify({ format: D.FORMAT, schemaVersion: 2, savedAt: '2026-10-29', themeText: '', thresholds: {} }), 'version'], [JSON.stringify({ format: D.FORMAT, schemaVersion: 1, savedAt: 'x', themeText: '', thresholds: {} }), 'corrupt'], [JSON.stringify({ format: D.FORMAT, schemaVersion: 1, savedAt: '2026-10-29', themeText: 5, thresholds: {} }), 'corrupt'], [JSON.stringify({ format: D.FORMAT, schemaVersion: 1, savedAt: '2026-10-29', themeText: '', thresholds: {}, tradesJson: 5 }), 'corrupt']];
  for (const [raw, code] of cases) { s.m.set(D.KEY, raw); const p = D.peek(s); a.equal(p.ok, false, raw); a.equal(p.code, code, raw); a.equal(s.m.get(D.KEY), raw); }
  a.equal(D.peek(new Store()).code, 'none');
});
test('입력 검증: 잘못된 날짜·형식·너무 큰 내용 거부, 저장소 없음/기능 없음 처리', () => {
  const s = new Store(); a.equal(D.save(s, P, '2026-02-30').code, 'bad-input'); a.equal(D.save(s, null, '2026-10-29').code, 'bad-input'); a.equal(D.save(s, { tradesJson: 5 }, '2026-10-29').code, 'bad-input'); a.equal(D.save(s, { tradesJson: 'x'.repeat(D.MAX_BYTES) }, '2026-10-29').code, 'too-large'); a.equal(s.writes.length, 0);
  a.equal(D.save(null, P, '2026-10-29').code, 'unavailable'); a.equal(D.save({}, P, '2026-10-29').code, 'unavailable'); a.equal(D.peek(null).code, 'unavailable'); a.equal(D.discard(null).code, 'unavailable');
  const thr = { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} }; a.equal(D.peek(thr).code, 'unavailable');
});
test('삭제는 이 키만 지움', () => { const s = new Store(APP); D.save(s, P, '2026-10-29'); a.equal(D.discard(s).ok, true); a.equal(D.peek(s).code, 'none'); a.equal(s.m.size, Object.keys(APP).length); });
test('정적 검사: 전역 저장소·네트워크·타이머 직접 접근 없음, 키는 lab 전용 접두어', () => { const s = fs.readFileSync(path.join(__dirname, '../invest/draft-store.js'), 'utf8'); for (const w of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'setTimeout', 'Date.now', 'v5_', 'eval(']) a.ok(!s.replace(/v5_\*/g, '').includes(w), w); a.match(D.KEY, /^kst\.lab\.s16\./); });
