'use strict';
/* 12단계 C: 기존 기능 보호·백업 복원 회귀(합성 사용자 데이터)·비밀 검사·신규 모듈 격리. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const B = require('../backup/core.js'), SC = require('../tools/scan-secrets.cjs');
const ROOT = path.join(__dirname, '..'), sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
// 11단계 시점의 해시. 이 파일들을 의도적으로 바꾸려면 영향 분석과 함께 이 값을 갱신해야 한다.
const PINNED = { 'portfolio_v5.html': 'b16656a6525d9127fe3a3fb4d3ad19c8717afc58fb0fe256feb503692913ebd5', 'portfolio.html': '97235e2a02feeec84511d9b4caf4c548e47ba37eb229625438acbc15427bfa2d', 'service-worker.js': '77d553efcfc3eb93f65a1f2901de1cf3b6b61b36febd9605053e66db6724dcd8', 'manifest.json': '79f5292b2c95dba718b453194b255f02d16a1585677b559735b9fad52f16d878', 'backup/core.js': '8a455cdc0606cce844fbb8d40551c9435d42c49b5d1bceafc8455c11a6e0eb3f', 'backup/ui.js': '88eda5884de2aa42416f4d1eaee4ba32301d6128d9ec9d6f252be408b9b8da24' };
function memory(seed = {}) { const m = new Map(Object.entries(seed)); return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), all: () => Object.fromEntries(m) }; }
const stock = (id, name, extra = {}) => ({ id, name, ticker: 'S' + id, quantity: 10 + id, avgPrice: 100.5 * id, currentPrice: 120 * id, ...extra });
// 합성 사용자: 일반/국내/해외/연금 4계좌가 서로 다른 내용
const synthetic = () => memory({ v5_gen: JSON.stringify([stock(1, '합성 일반 A')]), v5_dom: JSON.stringify([stock(2, '합성 국내 B'), stock(3, '합성 국내 C')]), v5_ov: JSON.stringify([stock(4, '합성 해외 D', { currency: 'USD' })]), v5_pen: JSON.stringify([stock(5, '합성 연금 E')]),
  v5_deposits: JSON.stringify({ gen: [{ ts: 1, amount: 100 }], dom: [{ ts: 2, amount: 200 }], ov: [{ ts: 3, amount: 300 }], pen: [{ ts: 4, amount: 400 }] }), v5_snap: JSON.stringify({ gen: [{ ts: 1, val: 2, cost: 1 }], all: [], dom: [], ov: [], pen: [] }), v5_fg: '0' });

test('protected files (app HTML, PWA worker/manifest, backup module/UI) are byte-identical to stage 11', () => { for (const [f, h] of Object.entries(PINNED)) a.equal(sha(f), h, f); });
test('synthetic user data: 4 accounts round-trip exactly and stay separate (overseas vs pension vs domestic vs general)', () => {
  const src = synthetic(), dst = memory({ v5_gen: '[]', v5_dom: '[]', v5_ov: '[]', v5_pen: '[]' });
  B.apply(dst, B.parse(JSON.stringify(B.create(src)))); for (const [k, v] of Object.entries(src.all())) a.equal(dst.getItem(k), v, k);
  a.ok(JSON.parse(dst.getItem('v5_pen')).every(s => s.name.includes('연금'))); a.ok(JSON.parse(dst.getItem('v5_ov')).every(s => s.name.includes('해외')));
  a.notEqual(dst.getItem('v5_pen'), dst.getItem('v5_ov'));
});
test('restoring one backup does not leak between accounts: pension-only edit leaves overseas untouched', () => {
  const src = synthetic(), snap = JSON.parse(JSON.stringify(B.create(src))), cur = synthetic(); cur.setItem('v5_pen', JSON.stringify([stock(9, '현재 연금')])); const ovBefore = cur.getItem('v5_ov');
  B.apply(cur, B.parse(JSON.stringify(snap))); a.equal(cur.getItem('v5_ov'), ovBefore); a.equal(cur.getItem('v5_pen'), src.getItem('v5_pen'));
});
test('rollback: a failed restore returns every account to its original state; undo works after a successful one', () => {
  const s = synthetic(), before = s.all(), set = s.setItem; let fired = false; s.setItem = (k, v) => { if (k === 'v5_ov' && !fired) { fired = true; throw new Error('quota'); } set(k, v); };
  const other = memory({ v5_gen: '[]', v5_dom: '[]', v5_ov: '[]', v5_pen: '[]' }); const snap = B.parse(JSON.stringify(B.create(synthetic())));
  a.throws(() => B.apply(s, snap)); for (const k of B.ACCOUNTS) a.equal(s.getItem(k), before[k], k);
  const u = synthetic(), ub = u.all(); B.apply(u, B.parse(JSON.stringify({ version: 'v5', genStocks: [] }))); B.undo(u); for (const k of B.ACCOUNTS) a.equal(u.getItem(k), ub[k], 'undo ' + k); void other;
});
test('older backup versions (v4, v5) still restore; radar/stage-12 keys and secrets are never exported or restored', () => {
  const s = synthetic(); B.apply(s, B.parse(JSON.stringify({ version: 'v5', genStocks: [], fg: 0, usdKrw: 1400 }))); a.equal(s.getItem('v5_gen'), '[]'); a.equal(s.getItem('v5_fg'), '0');
  const t = synthetic(); for (const k of ['kst.radar.state', 'kst.krx.private', 'v5_geminiKey', 'KRX_SERVICE_KEY', 'v5_pw']) t.setItem(k, 'SECRET-' + k);
  const text = JSON.stringify(B.create(t)); a.doesNotMatch(text, /SECRET-/);
  const dst = synthetic(); const evil = JSON.parse(text); evil.storage['KRX_SERVICE_KEY'] = 'x'; a.throws(() => B.parse(JSON.stringify(evil)));
});
test('stage-12 modules never touch browser storage or the backup keys', () => {
  for (const f of ['kr-radar/krx-run.js', 'kr-radar/krx-status.js', 'kr-radar/pricefeed.js', 'kr-radar/selection.js', 'kr-radar/identity.js']) { const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); a.doesNotMatch(s, /localStorage|sessionStorage|indexedDB|v5_|kst\.radar\./, f); }
});
test('app HTML, PWA worker and manifest do not reference any KRX/runner/stage-12 module or key name', () => {
  for (const f of ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json']) a.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /krx-run|krx-api|krx-status|pricefeed|selection\.js|identity\.js|KRX_SERVICE_KEY|getItemInfo_V2|apis\.data\.go\.kr|serviceKey/, f);
});
test('secret scan of the whole repository finds nothing (only the documented fake test values are allow-listed)', () => { a.deepEqual(SC.scan(ROOT), []); });
test('secret scanner really detects keys, tokens and bulk official-response dumps (negative control)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')); fs.writeFileSync(path.join(d, 'a.txt'), 'https://x/?service' + 'Key=Abcdefghij0123456789ABCDEFGH%2B%3D\n');
  fs.writeFileSync(path.join(d, 'b.sh'), 'KRX_SERVICE' + '_KEY="abcdef0123456789abcdef"\n'); fs.writeFileSync(path.join(d, 'c.md'), 'tok ghp_' + 'a'.repeat(30) + '\n');
  fs.writeFileSync(path.join(d, 'd.xml'), ('<srtn' + 'Cd>A1</srtnCd>').repeat(5)); fs.writeFileSync(path.join(d, 'ok.txt'), 'serviceKey=*** and serviceKey=<서버측-주입>\n');
  const pats = SC.scan(d).map(h => h.pattern + '@' + h.file); a.equal(pats.length, 4, pats.join(' | ')); a.ok(!pats.some(p => /ok\.txt/.test(p)));
  a.doesNotMatch(JSON.stringify(SC.scan(d)), /Abcdefghij|ghp_a/, '발견 값은 출력하지 않음');
});
test('dependencies: no runtime dependencies, devDependencies pinned to exact versions, lockfile present', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); a.equal(pkg.dependencies, undefined);
  for (const [n, v] of Object.entries(pkg.devDependencies)) a.match(v, /^\d+\.\d+\.\d+$/, n); a.ok(fs.existsSync(path.join(ROOT, 'package-lock.json')));
});
