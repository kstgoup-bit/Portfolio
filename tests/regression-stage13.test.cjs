'use strict';
/* 13단계 C: 합성 계좌의 매수·매도 이력, 구버전 호환, 손상 복구, 비밀키 비포함, 공개 PWA 노출, 로그 마스킹. 실제 localStorage는 열지 않는다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const B = require('../backup/core.js'), R = require('../kr-radar/krx-run.js');
const ROOT = path.join(__dirname, '..');
function memory(seed = {}) { const m = new Map(Object.entries(seed)); return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), all: () => Object.fromEntries(m) }; }
const stock = (id, name, o = {}) => ({ id, name, ticker: 'T' + id, quantity: 10, avgPrice: 100, currentPrice: 110, ...o });
const ledger = { '2026-10': { income: [{ id: 1, amount: 1000, name: '합성 입금' }], expense: [], invest: [{ id: 2, amount: 500, name: '합성 매수' }, { id: 3, amount: -200, name: '합성 매도' }] } };
const base = () => memory({ v5_gen: JSON.stringify([stock(1, '합성 일반')]), v5_dom: '[]', v5_ov: JSON.stringify([stock(2, '합성 해외', { currency: 'USD' })]), v5_pen: JSON.stringify([stock(3, '합성 연금')]),
  v5_ledger: JSON.stringify(ledger), v5_deposits: JSON.stringify({ gen: [{ ts: 1, amount: 100 }], dom: [], ov: [], pen: [{ ts: 2, amount: 50 }] }),
  v5_alphaVantageKey: 'SYNTH-KEY-SHOULD-NOT-EXPORT', v5_geminiKey: 'SYNTH-KEY-2', v5_pw: 'SYNTH-PW', v5_gas: 'https://example.invalid/exec' });

test('매수·매도 이력(ledger invest +/-)이 왕복에서 바이트 단위로 보존', () => {
  const src = base(), dst = memory({ v5_gen: '[]', v5_dom: '[]', v5_ov: '[]', v5_pen: '[]' });
  B.apply(dst, B.parse(JSON.stringify(B.create(src)))); a.equal(dst.getItem('v5_ledger'), src.getItem('v5_ledger'));
  a.equal(JSON.parse(dst.getItem('v5_ledger'))['2026-10'].invest.length, 2);
});
test('백업 파일에 API 키·비밀번호·GAS 주소가 들어가지 않는다 (키는 저장소에 있어도 제외)', () => {
  const text = JSON.stringify(B.create(base()));
  for (const w of ['SYNTH-KEY', 'SYNTH-PW', 'example.invalid', 'v5_alphaVantageKey', 'v5_geminiKey', 'v5_pw', 'v5_gas']) a.ok(!text.includes(w), w);
});
test('복원이 현재 기기의 키·비밀번호를 지우지 않는다', () => {
  const cur = base(); B.apply(cur, B.parse(JSON.stringify(B.create(base())))); a.equal(cur.getItem('v5_pw'), 'SYNTH-PW'); a.equal(cur.getItem('v5_geminiKey'), 'SYNTH-KEY-2');
});
test('백업에 비밀 키를 직접 끼워 넣은 변조 파일은 거부', () => {
  const env = B.create(base()); env.storage.v5_pw = 'x'; a.throws(() => B.parse(JSON.stringify(env)));
  const env2 = B.create(base()); env2.storage.v5_geminiKey = 'x'; a.throws(() => B.parse(JSON.stringify(env2)));
});
test('구버전 v4/v5 형식 호환 + 미래/알 수 없는 버전 거부', () => {
  const old = { version: 'v4', stocks: [{ ...stock(1, '구 국내'), market: 'KR' }, { ...stock(2, '구 해외'), market: 'US' }], pension: [stock(3, '구 연금')], usdKrw: 1400 };
  const p = B.parse(JSON.stringify(old)); a.equal(p.legacy, true); a.deepEqual(Object.keys(p.values).sort(), ['v5_dom', 'v5_fx', 'v5_ov', 'v5_pen']);
  a.equal(JSON.parse(p.values.v5_ov)[0].name, '구 해외'); a.equal(JSON.parse(p.values.v5_pen)[0].name, '구 연금');
  for (const v of ['v6', 'v99', 7, null]) a.throws(() => B.parse(JSON.stringify({ version: v, stocks: [] })), undefined, String(v));
  a.throws(() => B.parse(JSON.stringify({ version: 'v4', stocks: [{ ...stock(1, 'x'), market: 'JP' }] })));
});
test('손상 입력: 깨진 JSON·프로토타입 오염·스크립트 문자열·NaN·중복 ID·과대 크기', () => {
  const good = JSON.stringify(B.create(base()));
  a.throws(() => B.parse(good.slice(0, -5)));
  a.throws(() => B.parse('{"version":"v5","__proto__":{"x":1},"genStocks":[]}'));
  a.throws(() => B.parse(JSON.stringify({ version: 'v5', genStocks: [stock(1, '<script>alert(1)</script>')] })));
  a.throws(() => B.parse(JSON.stringify({ version: 'v5', genStocks: [stock(1, 'dup'), stock(1, 'dup2')] })));
  a.throws(() => B.parse(JSON.stringify({ version: 'v5', genStocks: [stock(1, 'x', { quantity: 'abc' })] })));
  a.throws(() => B.parse('x'.repeat(21 * 1024 * 1024)));
  a.throws(() => B.parse(JSON.stringify({ version: 'v5', ledger: { '2026-10': { bogus: [] } } })));
});
test('복원 중 저장 실패(용량) → 모든 계좌·가계부 원상복구, 이후 undo/recover 동작', () => {
  const s = base(), before = s.all(), orig = s.setItem; let n = 0;
  s.setItem = (k, v) => { if (k === 'v5_ledger' && n++ === 0) throw new Error('QuotaExceeded'); orig(k, v); };
  const plan = B.parse(JSON.stringify(B.create(base()))); s.setItem('v5_gen', JSON.stringify([stock(9, '변경 전')])); const mid = s.all();
  a.throws(() => B.apply(s, plan));
  for (const k of ['v5_gen', 'v5_dom', 'v5_ov', 'v5_pen', 'v5_ledger']) a.equal(s.getItem(k), mid[k], k);
  a.equal(s.getItem('v5_pw'), before.v5_pw);
});
test('중단된 복원(prepared 저널) → recover 가 원상복구', () => {
  const s = base(); B.apply(s, B.parse(JSON.stringify(B.create(base())))); const j = B.readJournal(s); a.ok(j);
  const crashed = base(); const orig = crashed.all(); crashed.setItem(B.JOURNAL, JSON.stringify({ version: 1, status: 'prepared', savedAt: new Date().toISOString(), before: { v5_gen: orig.v5_gen, v5_ledger: orig.v5_ledger } }));
  crashed.setItem('v5_gen', JSON.stringify([stock(7, '반쯤 복원됨')])); a.equal(B.recover(crashed), true); a.equal(crashed.getItem('v5_gen'), orig.v5_gen);
  a.equal(B.recover(crashed), false);
});
test('계좌 분리: 해외(USD)·연금·일반이 복원 후에도 서로 섞이지 않음', () => {
  const src = base(), dst = base(); dst.setItem('v5_pen', '[]'); B.apply(dst, B.parse(JSON.stringify(B.create(src))));
  a.equal(JSON.parse(dst.getItem('v5_ov'))[0].currency, 'USD'); a.equal(JSON.parse(dst.getItem('v5_pen'))[0].name, '합성 연금'); a.equal(JSON.parse(dst.getItem('v5_gen')).length, 1);
});

test('공개 PWA: 서비스워커 캐시 목록은 앱 4개 파일뿐이며 모두 존재하고 데이터·문서·키 파일 없음', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8'); const list = [...new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]))];
  a.deepEqual(list.sort(), ['icon-192.png', 'icon-512.png', 'manifest.json', 'portfolio_v5.html']);
  for (const f of list) a.ok(fs.existsSync(path.join(ROOT, f)), f);
  for (const bad of ['kr-radar', 'tools', 'tests', 'docs', 'data', '.env', 'krx', 'approval']) a.ok(!list.some(f => f.includes(bad)), bad);
});
test('앱 HTML은 신규 13단계 모듈/KRX/시세 공급자를 참조하지 않는다 (앱 연동 0)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8');
  for (const w of ['kr-radar', 'krx-live-runner', 'apis.data.go.kr', 'twelvedata', 'provider.js', 'KRX_SERVICE_KEY']) a.ok(!html.includes(w), w);
});
test('신규 소스·문서에 키 형태 비밀값 없음 (스캐너 재실행)', () => {
  const SC = require('../tools/scan-secrets.cjs'); a.deepEqual(SC.scan(ROOT), []);
});
test('오류 로그 마스킹: 키 원문·URL 인코딩·serviceKey= 형태 모두 가림', () => {
  const key = 'AbC+123/xyz=='; const enc = encodeURIComponent(key);
  for (const t of ['fail ' + key, 'GET /x?serviceKey=' + enc + '&a=1', 'serviceKey=' + key, 'raw ' + enc]) { const m = R.maskSecrets(t, key); a.ok(!m.includes(key) && !m.includes(enc), t); }
  a.equal(R.maskSecrets('no key here', key), 'no key here');
  a.doesNotThrow(() => R.maskSecrets('x', undefined)); a.doesNotThrow(() => R.maskSecrets(undefined, key));
});
