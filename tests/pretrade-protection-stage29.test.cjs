'use strict';
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs');
const P = require('../has/pretrade-log.js');
const NOW = '2026-11-09T12:00:00.000Z';
const entry = (id = 'a') => ({ id, createdAt: NOW, name: '  기존 이름  ', side: 'sell', checks: {}, reasonFor: '기존 사유', reasonAgainst: '반대', emotion: 'calm', plan: '계획', decision: 'wait' });
const packed = entries => JSON.stringify({ v: 1, entries });
function memory(initial) {
  let raw = initial, writes = 0;
  return { getItem(k) { a.equal(k, P.KEY); return raw; }, setItem(k, v) { a.equal(k, P.KEY); writes++; raw = v; }, raw: () => raw, writes: () => writes };
}
for (const [label, raw] of [
  ['malformed', '{broken'],
  ['unknown envelope', JSON.stringify({ v: 1, entries: [entry()], future: 'must preserve' })],
  ['unknown prototype envelope', '{"v":1,"entries":[],"__proto__":{"keep":true}}'],
  ['bad entry', packed([entry(), { bad: true }])],
  ['duplicate', packed([entry(), entry()])],
  ['prototype duplicate', packed([entry('__proto__'), entry('__proto__')])],
  ['constructor duplicate', packed([entry('constructor'), entry('constructor')])],
  ['overflow', packed(Array.from({ length: 301 }, (_, i) => entry(String(i))))],
  ['UTF8 input limit', packed(Array.from({ length: 150 }, (_, i) => ({ ...entry(String(i)), reasonFor: '가'.repeat(500) })))],
]) {
  test(label + ': both failed mutations preserve exact original bytes', () => {
    const s = memory(raw), st = P.createStore(s);
    a.equal(st.load().ok, false);
    a.equal(st.add(entry('new')).ok, false);
    a.equal(st.addReview('a', '메모', NOW).ok, false);
    a.equal(s.raw(), raw); a.equal(s.writes(), 0);
  });
}
test('special property names are valid distinct IDs, not inherited duplicates', () => {
  const s = memory(packed([entry('__proto__'), entry('constructor'), entry('toString')])), st = P.createStore(s);
  a.equal(st.load().ok, true); a.equal(st.load().entries.length, 3);
  a.equal(st.add(entry('normal')).ok, true);
});
test('invalid mutations and missing target leave original formatting untouched', () => {
  const raw = ' \n' + packed([entry()]) + '\n', s = memory(raw), st = P.createStore(s);
  a.equal(st.add({ ...entry('new'), side: 'invalid' }).error, 'invalid');
  for (const [note, time] of [[1, NOW], ['x'.repeat(501), NOW], ['note', 'bad-date']]) a.equal(st.addReview('a', note, time).error, 'invalid');
  a.equal(st.addReview('missing', 'note', NOW).error, 'not-found');
  a.equal(s.raw(), raw); a.equal(s.writes(), 0);
});
test('successful append and review preserve stored user text and old v1 shape', () => {
  const old = entry(), s = memory(packed([old])), st = P.createStore(s);
  a.equal(st.add(entry('new')).ok, true);
  a.deepEqual(JSON.parse(s.raw()).entries[0], old);
  a.equal(st.addReview('a', '새 메모', NOW).ok, true);
  a.deepEqual(JSON.parse(s.raw()).entries[0], { ...old, review: { at: NOW, note: '새 메모' } });
  a.equal(JSON.parse(s.raw()).v, 1);
});
for (const mode of ['add', 'review']) {
  test(mode + ': concurrent modification is detected before writing', () => {
    const original = packed([entry()]), changed = packed([entry(), entry('other-tab')]);
    let reads = 0, writes = 0, raw = original;
    const st = P.createStore({ getItem() { if (++reads === 2) raw = changed; return raw; }, setItem() { writes++; } });
    const r = mode === 'add' ? st.add(entry('new')) : st.addReview('a', 'note', NOW);
    a.equal(r.error, 'storage-changed'); a.equal(raw, changed); a.equal(writes, 0);
  });
  test(mode + ': write exception preserves original bytes', () => {
    const raw = packed([entry()]);
    const st = P.createStore({ getItem() { return raw; }, setItem() { throw new Error('quota'); } });
    a.equal((mode === 'add' ? st.add(entry('new')) : st.addReview('a', 'note', NOW)).error, 'write-failed');
    a.equal(st.load().entries.length, 1);
  });
}
test('UTF8 output byte limit rejects append even when JS character length fits', () => {
  const es = []; let raw = packed(es);
  while (true) {
    const next = [...es, { ...entry(String(es.length)), reasonFor: '😀'.repeat(250) }];
    if (Buffer.byteLength(packed(next), 'utf8') > 200000) break;
    es.push(next[next.length - 1]); raw = packed(es);
  }
  a.ok(raw.length < 200000); a.ok(es.length < 300);
  const s = memory(raw), st = P.createStore(s);
  a.equal(st.add({ ...entry('extra'), reasonFor: '😀'.repeat(250) }).error, 'full');
  a.equal(s.raw(), raw); a.equal(s.writes(), 0);
});
test('sell and trim consider valuation, financials, competitiveness, concentration and holding/reentry costs', () => {
  for (const side of ['sell', 'trim']) {
    const labels = P.required(side).map(k => P.CHECKS[k].label).join(' ');
    for (const term of ['밸류에이션', '재무', '경쟁력', '집중도', '세금', '수수료', '환율', '기회비용', '재진입', '보유할 위험']) a.ok(labels.includes(term), term);
  }
});
test('panel makes damaged store read-only and discloses backup and execution limits', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="panel-pretrade"></div>', { url: 'https://example.test', runScripts: 'outside-only' });
  const w = dom.window, raw = packed([entry(), { bad: true }]);
  w.localStorage.setItem(P.KEY, raw); w.HASPretradeLog = P;
  w.eval(fs.readFileSync(require.resolve('../has/pretrade-panel.js'), 'utf8'));
  w.HASPretradePanel.onTabChange('pretrade');
  a.equal(w.document.querySelector('[data-testid="pt-save"]').disabled, true);
  a.equal(w.document.querySelectorAll('[data-testid="pt-review-save"]').length, 0);
  a.equal(w.document.querySelectorAll('[data-testid="pt-entry"]').length, 1);
  a.match(w.document.body.textContent, /읽기 전용/);
  a.match(w.document.body.textContent, /기존 백업에 아직 포함되지 않습니다/);
  a.match(w.document.body.textContent, /주문 실행 승인이 아닙니다/);
  a.match(w.document.body.textContent, /완료 여부는 현재 점검표 기준/);
  a.equal(w.localStorage.getItem(P.KEY), raw); dom.window.close();
});
for (const [label, raw] of [
  ['envelope entries', '{"v":1,"entries":[{"bad":1}],"entries":[]}'],
  ['envelope escaped entries', '{"v":1,"entries":[{"bad":1}],"entr\\u0069es":[]}'],
  ['version', '{"v":2,"v":1,"entries":[]}'],
  ['entry reason', packed([entry()]).replace('"reasonFor":', '"reasonFor":"lost","reasonFor":')],
  ['escaped entry reason', packed([entry()]).replace('"reasonFor":', '"reason\\u0046or":"lost","reasonFor":')],
  ['nested checks', packed([{ ...entry(), checks: { news: { done: true, note: '' } } }]).replace('"done":true', '"done":false,"done":true')],
  ['nested review', packed([{ ...entry(), review: { at: NOW, note: 'kept' } }]).replace('"note":"kept"', '"note":"lost","note":"kept"')],
  ['prototype key', '{"v":1,"entries":[],"__proto__":1,"__proto__":2}'],
]) {
  test('duplicate JSON key ' + label + ' rejects load and every mutation without writes', () => {
    const s = memory(raw), st = P.createStore(s);
    a.equal(st.load().error, 'duplicate-key');
    a.equal(st.add(entry('new')).error, 'duplicate-key');
    a.equal(st.addReview('a', 'note', NOW).error, 'duplicate-key');
    a.equal(s.raw(), raw); a.equal(s.writes(), 0);
  });
}
test('duplicate-key scanner permits repeated keys in separate objects and escaped value text', () => {
  const original = [{ ...entry(), reasonFor: '"x":1, "x":2 \\ { [ ] } 😀' }, entry('b')];
  const s = memory(packed(original)), st = P.createStore(s);
  a.equal(st.load().ok, true); a.equal(st.add(entry('new')).ok, true);
  a.deepEqual(JSON.parse(s.raw()).entries.slice(0, 2), original);
});
