const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path'), G = require('../has/galaxy-test-guard.js');
const st = o => ({ getItem: k => (k in o ? o[k] : null) }), rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const loc = (protocol, hostname, host) => ({ protocol, hostname, host: host || hostname });
test('공개 주소·https·github.io 는 어떤 저장 상태에서도 거절(실제 앱과 저장공간 공유 가능)', () => {
  for (const l of [loc('https:', 'kstgoup-bit.github.io'), loc('https:', 'example.com'), loc('http:', 'example.com'), loc('http:', '8.8.8.8'), loc('http:', '172.32.0.1'), loc('http:', '192.169.0.1'), loc('http:', 'localhost.evil.com')]) a.equal(G.decide(l, st({})).reason, 'unsafe-origin', l.hostname);
});
test('파일·localhost·사설망 주소만 허용', () => {
  for (const l of [loc('file:', ''), loc('http:', 'localhost', 'localhost:8080'), loc('http:', '127.0.0.1'), loc('http:', '192.168.0.12'), loc('http:', '10.0.0.5'), loc('http:', '172.16.3.4'), loc('http:', '172.31.255.1')]) a.equal(G.decide(l, st({})).allowed, true, l.hostname + l.protocol);
});
test('앱을 열기만 해서 생기는 기본값(수량 0 종목·빈 목록·환율)은 사용자 기록으로 보지 않는다', () => {
  a.equal(G.decide(loc('file:', ''), st({ v5_gen: '[]', v5_dom: JSON.stringify([{ ticker: 'X', quantity: 0 }]), v5_ledger: '{}', v5_div: '[]', v5_fx: '1370', v5_cma_amount: '0' })).allowed, true);
});
test('의미 있는 사용자 기록이 하나라도 있으면 거절(시험 표시가 없을 때)', () => {
  const cases = { gen: { v5_gen: JSON.stringify([{ quantity: 1 }]) }, ledger: { v5_ledger: JSON.stringify({ '2026-10': { income: [{ name: 'x', amount: 1 }], expense: [], invest: [] } }) }, cma: { v5_cma_amount: '1' }, div: { v5_div: JSON.stringify([{ date: 'x', amount: 1 }]) }, memo: { v5_memos: JSON.stringify([{ text: 'x' }]) }, broken: { v5_gen: 'not json' }, deposits: { v5_deposits: JSON.stringify({ gen: [{ ts: 1, amount: 5 }] }) } };
  for (const [n, o] of Object.entries(cases)) a.equal(G.decide(loc('file:', ''), st(o)).reason, 'existing-data', n);
});
test('시험 표시가 있으면(이전에 시험 자료를 넣은 주소) 다시 허용', () => { a.equal(G.decide(loc('file:', ''), st({ [G.MARKER]: '1', v5_gen: JSON.stringify([{ quantity: 5 }]) })).reason, 'refresh-synthetic'); });
test('저장공간을 읽을 수 없으면 거절', () => { a.equal(G.decide(loc('file:', ''), { getItem() { throw new Error('denied'); } }).reason, 'storage-unreadable'); });
test('시험 자료는 전부 합성 표시이고 백업 검증 형식을 통과한다', () => {
  global.window = {}; require('../has/galaxy-test-data.js'); const D = globalThis.HASGalaxyTestData, B = require('../backup/core.js'); a.ok(D);
  for (const k of ['v5_gen', 'v5_dom', 'v5_ov', 'v5_pen']) for (const s of D.DATA[k]) a.ok(/합성/.test(s.name), s.name);
  const store = new Map(Object.entries(D.DATA).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])), fake = { getItem: k => store.has(k) ? store.get(k) : null, setItem() {}, removeItem() {}, key: i => [...store.keys()][i] ?? null, get length() { return store.size; } };
  const b = B.create(fake); a.equal(b.schemaVersion, 6);
});
test('시험·리허설 화면 코드: 네트워크·쿠키·세션저장·IndexedDB·eval·innerHTML 없음, 리허설은 localStorage 자체를 쓰지 않음', () => {
  for (const f of ['has/galaxy-test.js', 'has/galaxy-test-guard.js', 'has/galaxy-test-data.js', 'has/restore-rehearsal.js']) { const s = rd(f); for (const w of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'document.cookie', 'sessionStorage', 'indexedDB', 'eval(', 'new Function', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'serviceWorker']) a.ok(!s.includes(w), f + ' ' + w); }
  a.ok(!/localStorage/.test(rd('has/restore-rehearsal.js')), '리허설이 localStorage 사용');
  for (const f of ['has/galaxy-test.html', 'has/restore-rehearsal.html']) { const h = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); a.ok(/connect-src 'none'/.test(h) && /default-src 'none'/.test(h), f + ' CSP'); a.ok(!/https?:\/\//.test(h.replace(/<meta[^>]*Content-Security[^>]*>/, '')), f + ' 외부 주소'); }
  const g = rd('has/galaxy-test.js'); const keys = g.match(/localStorage\.\w+\(/g) || []; a.ok(keys.every(x => /getItem|setItem|removeItem/.test(x)), keys.join());
});
