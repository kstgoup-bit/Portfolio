'use strict';
/* 12단계 A: 조회 오케스트레이션(실행 계획·재시도·상한·마스킹·부분 실패 재개). 전송은 모두 가짜 transport, 실호출 0. */
const { test } = require('node:test'), a = require('node:assert/strict'), crypto = require('node:crypto');
const R = require('../kr-radar/krx-run.js'), K = require('../kr-radar/krx-api.js');
const KEY = 'FAKEKEY-abc123+/==zzTEST', QA = '2026-10-29', BAS = '20261028';
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const isinOf = code => { const body = 'KR7' + code + '00'; const d = [...body].map(c => /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)).join(''); for (let k = 0; k < 10; k++) { const s = d + k; let sum = 0, dbl = false; for (let i = s.length - 1; i >= 0; i--) { let n = s.charCodeAt(i) - 48; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; } if (sum % 10 === 0) return body + k; } };
const mkItems = (n, o = {}) => Array.from({ length: n }, (_, i) => { const code = 'Z' + String(i).padStart(5, '0'); return { basDt: o.basDt || BAS, srtnCd: 'A' + code, isinCd: isinOf(code), mrktCtg: 'KOSPI', itmsNm: '합성' + i }; });
const page = (items, rows, pageNo, total) => `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><numOfRows>${rows}</numOfRows><pageNo>${pageNo}</pageNo><totalCount>${total}</totalCount><items>${items.map(i => '<item>' + Object.entries(i).map(([k, v]) => `<${k}>${v}</${k}>`).join('') + '</item>').join('')}</items></body></response>`;
/* 서버 모사: 전체 목록 all 을 numOfRows/pageNo 로 잘라 준다. hooks[callNo] 로 실패 주입. */
function server(all, hooks = {}) {
  const log = []; let n = 0;
  const fn = async ({ url }) => {
    n++; const u = new URL(url); log.push(url); const rows = Number(u.searchParams.get('numOfRows')), pg = Number(u.searchParams.get('pageNo'));
    if (hooks[n]) { const h = hooks[n]; if (h instanceof Error) throw h; return h; }
    const slice = all.slice((pg - 1) * rows, pg * rows); return { status: 200, text: page(slice, rows, pg, all.length) };
  };
  fn.log = log; fn.calls = () => n; return fn;
}
const waits = []; const wait = async ms => { waits.push(ms); };
const run = (t, o = {}) => R.runPlan({ basDt: BAS, key: KEY, transport: t, wait, sha256: sha, queriedAt: QA, origin: 'fixture', ...o });

test('plan is a specification only and enforces the 20-call ceiling', () => {
  const p = R.planCalls({ basDt: BAS }); a.equal(p.ok, true); a.equal(p.minimumCalls, 2);
  a.equal(R.planCalls({ basDt: BAS, maxCalls: 21 }).ok, false); a.equal(R.planCalls({ basDt: BAS, maxCalls: 0 }).ok, false); a.equal(R.planCalls({ basDt: '2026-10-28' }).ok, false);
  a.equal(R.planCalls({ basDt: BAS, maxCalls: 3, totalCount: 30001 }).ok, false, '1+4쪽 > 3');
  a.equal(R.planCalls({ basDt: BAS, maxCalls: 20, totalCount: 10000 }).pages, 1); a.equal(R.planCalls({ basDt: BAS, totalCount: 10001 }).pages, 2);
  a.match(p.note, /실제 호출은/);
});
test('success path: 1 probe + 1 page = 2 calls, listing assembled, dates agree, key never in attempts/result', async () => {
  waits.length = 0; const t = server(mkItems(30)), r = await run(t);
  a.equal(r.status, 'complete'); a.equal(r.transportCalls, 2); a.equal(t.calls(), 2); a.equal(r.listing.ok, true); a.equal(r.listing.rows.length, 30); a.equal(r.listing.baseDate, '2026-10-28'); a.equal(waits.length, 0);
  a.equal(r.acquisition, 'fixture'); a.equal(r.verifierVersion, R.VERIFIER_VERSION);
  a.doesNotMatch(JSON.stringify({ ...r, raw: undefined, pages: undefined }), /FAKEKEY|serviceKey|https:/); a.ok(r.raw.every(x => /^[0-9a-f]{64}$/.test(x.sha256)));
});
test('10,001 rows need 2 pages -> 3 calls', async () => { const t = server(mkItems(10001)), r = await run(t); a.equal(r.status, 'complete'); a.equal(r.transportCalls, 3); a.equal(r.listing.rows.length, 10001); });
test('429 is retried with exponential backoff 1s then succeeds', async () => {
  waits.length = 0; const t = server(mkItems(5), { 2: { status: 429, text: 'API rate limit exceeded' } }), r = await run(t);
  a.equal(r.status, 'complete'); a.equal(r.transportCalls, 3); a.deepEqual(waits, [1000]); a.deepEqual(r.attempts.map(x => x.category), ['ok', 'rate-limited', 'ok']);
});
test('persistent 5xx: at most 3 tries (2 retries) with 1s,2s backoff, then stops', async () => {
  waits.length = 0; const bad = { status: 503, text: 'Error forwarding request to backend server' }, t = server(mkItems(5), { 1: bad, 2: bad, 3: bad }), r = await run(t);
  a.equal(r.status, 'failed'); a.equal(r.transportCalls, 3); a.deepEqual(waits, [1000, 2000]); a.match(r.reason, /탐색 호출 실패/);
});
test('401 / 403 / quota stop immediately without retry or backoff', async () => {
  for (const [res, cat] of [[{ status: 401, text: 'Unauthorized' }, 'unauthorized'], [{ status: 403, text: 'Forbidden' }, 'forbidden'], [{ status: 200, text: 'API token quota exceeded' }, 'quota-exceeded']]) {
    waits.length = 0; const t = server(mkItems(5), { 1: res }), r = await run(t); a.equal(r.status, 'blocked', cat); a.equal(r.transportCalls, 1); a.equal(waits.length, 0); a.equal(r.attempts[0].category, cat); a.doesNotMatch(JSON.stringify(r), /FAKEKEY/);
  }
});
test('timeouts/network errors are transient; error text carrying the key is masked', async () => {
  waits.length = 0; const leaky = new Error('timeout while GET https://x/?serviceKey=' + KEY + '&a=1'), t = server(mkItems(5), { 1: leaky, 2: leaky, 3: leaky }), r = await run(t);
  a.equal(r.status, 'failed'); a.equal(r.transportCalls, 3); a.ok(r.attempts.every(x => x.category === 'timeout')); a.doesNotMatch(JSON.stringify(r), /FAKEKEY|abc123/);
});
test('call budget is a hard ceiling including retries', async () => {
  const t = server(mkItems(5), { 1: { status: 429, text: 'API rate limit exceeded' }, 2: { status: 429, text: 'API rate limit exceeded' } }), r = await run(t, { maxCalls: 2 });
  a.ok(r.transportCalls <= 2); a.notEqual(r.status, 'complete');
  const big = server(mkItems(20001)), r2 = await run(big, { maxCalls: 2 }); a.equal(r2.status, 'blocked'); a.match(r2.reason, /상한/); a.equal(big.calls(), 1);
  const r3 = await run(server(mkItems(3)), { maxCalls: 99 }); a.equal(r3.status, 'blocked');
});
test('partial failure keeps good pages and resumes by fetching ONLY the missing page', async () => {
  const all = mkItems(20001), bad = { status: 200, text: '<response><header>' };
  const t1 = server(all, { 3: bad, 4: bad, 5: bad }), r1 = await run(t1);   // 탐색(1) + 1쪽(2) + 2쪽 실패(3,4,5)
  a.equal(r1.status, 'partial'); a.deepEqual(r1.missingPages, [2, 3].filter(p => r1.missingPages.includes(p))); a.ok(r1.missingPages.includes(2)); a.equal(r1.raw.length, 1);
  const t2 = server(all), r2 = await run(t2, { resume: r1.resume }); // 1쪽 재사용, 누락만 요청
  a.equal(r2.status, 'complete'); a.equal(r2.listing.rows.length, 20001);
  a.ok(t2.log.every(u => new URL(u).searchParams.get('pageNo') !== '1'), '이미 받은 1쪽은 재요청하지 않음');
  a.equal(t2.calls(), r1.missingPages.length, '누락 쪽 수만큼만 호출');
});
test('a server that repeats page 1 for page 2 (duplicate/missing page) is rejected', async () => {
  const all = mkItems(10001), t = async ({ url }) => { const u = new URL(url), rows = Number(u.searchParams.get('numOfRows')); return { status: 200, text: page(all.slice(0, rows), rows, 1, all.length) }; };
  const r = await run(t); a.equal(r.status, 'failed'); a.match(r.reason, /쪽 합치기 실패/);
});
test('basDt mismatch between request and response blocks; empty data fails; same-day base date warns', async () => {
  const r1 = await run(server(mkItems(5, { basDt: '20261027' }))); a.equal(r1.status, 'blocked'); a.match(r1.reason, /basDt 불일치/);
  const r2 = await run(server([])); a.equal(r2.status, 'failed');
  const r3 = await R.runPlan({ basDt: '20261029', key: KEY, transport: server(mkItems(5, { basDt: '20261029' })), wait, sha256: sha, queriedAt: QA, origin: 'fixture' }); a.equal(r3.status, 'complete'); a.ok(r3.warnings.length);
});
test('missing key blocks a non-fixture run before any call; missing injections block', async () => {
  const t = server(mkItems(5)), r = await run(t, { origin: 'user-supplied-official', key: undefined }); a.equal(r.status, 'blocked'); a.equal(t.calls(), 0);
  a.equal((await R.runPlan({ basDt: BAS, key: KEY, queriedAt: QA })).status, 'blocked'); a.equal((await run(t, { queriedAt: 'x' })).status, 'blocked'); a.equal(t.calls(), 0);
});
test('wrong key: server answers Unauthorized -> blocked, no key in any output', async () => {
  const t = server(mkItems(5), { 1: { status: 401, text: 'Unauthorized ' + KEY } }), r = await run(t); a.equal(r.status, 'blocked'); a.doesNotMatch(JSON.stringify(r), /FAKEKEY|abc123/);
});
test('maskSecrets hides raw, URL-encoded and serviceKey= forms', () => {
  const enc = encodeURIComponent(KEY), s = R.maskSecrets(`a ${KEY} b ${enc} c https://h/p?serviceKey=${enc}&x=1 d serviceKey=${KEY}`, KEY);
  a.doesNotMatch(s, /FAKEKEY|abc123/); a.match(s, /serviceKey=\*\*\*/); a.equal(R.maskSecrets(null, KEY), ''); a.equal(R.maskSecrets('x serviceKey=ZZZ', undefined), 'x serviceKey=***');
});
test('approval validation: user-made, dated, bounded, unexpired', () => {
  const ok = { approvedBy: 'user', approvedAt: '2026-10-29', basDt: BAS, maxCalls: 3, scope: '1회 소규모 조회' };
  a.deepEqual(R.validateApproval(ok, QA), []);
  for (const bad of [null, {}, { ...ok, approvedBy: 'claude' }, { ...ok, approvedAt: '2027-01-01' }, { ...ok, basDt: '2026-10-28' }, { ...ok, maxCalls: 21 }, { ...ok, maxCalls: 0 }, { ...ok, scope: ' ' }, { ...ok, expiresAt: '2026-10-01' }]) a.ok(R.validateApproval(bad, QA).length > 0, JSON.stringify(bad));
});
test('every call parameter goes through the validated request builder (no free-form query)', async () => {
  const t = server(mkItems(5)); await run(t); for (const u of t.log) { const p = new URL(u).searchParams; a.deepEqual([...p.keys()].sort(), ['basDt', 'numOfRows', 'pageNo', 'resultType', 'serviceKey'].sort()); a.equal(new URL(u).origin + new URL(u).pathname, K.SERVICE.baseUrl); }
});
