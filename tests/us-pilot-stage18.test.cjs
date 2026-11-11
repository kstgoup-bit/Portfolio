'use strict';
/* 18단계: 미국 5종목 파일럿의 규칙·실행기 시험. 실제 외부 호출 0회(로컬 가짜 서버만 사용). */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process');
const P = require('../kr-radar/us-pilot.js'), RUNNER = path.join(__dirname, '..', 'tools', 'us-pilot-runner.cjs');
const OK = { approvedBy: 'user', approvedAt: '2026-10-29', provider: 'tiingo', termsConfirmedByUser: true, termsUrl: 'https://www.tiingo.com/about/terms', termsCheckedAt: '2026-10-29', freeNoPayment: true, tickers: ['MSFT', 'JPM'], maxPerDay: 10, maxTotal: 200 };
const rows = (o = {}) => [{ date: '2026-10-27T00:00:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 5, adjClose: 101, divCash: 0, splitFactor: 1 }, { date: '2026-10-28T00:00:00.000Z', open: 101, high: 105, low: 100, close: 104, volume: 6, adjClose: 104, divCash: 0, splitFactor: 1, ...o }];

test('승인 파일: 정상 통과, 한도는 지시서 상한과 공급자 하한 중 낮은 값', () => {
  const v = P.validateApproval(OK, '2026-10-29'); a.equal(v.ok, true, v.errors.join()); a.deepEqual(v.effective, { provider: 'tiingo', tickers: ['MSFT', 'JPM'], perDay: 10, total: 200 });
  a.equal(P.validateApproval({ ...OK, providerLowerLimit: 3 }, '2026-10-29').effective.perDay, 3);
});
test('승인 파일: 하나라도 빠지면 거부(약관 증빙·무료 확인·종목·한도·사용자 승인·구현 공급자)', () => {
  const bad = [{ approvedBy: 'claude' }, { termsConfirmedByUser: false }, { termsUrl: 'http://x' }, { termsCheckedAt: undefined }, { freeNoPayment: false }, { tickers: ['MSFT', 'AAPL'] }, { tickers: [] }, { maxPerDay: 11 }, { maxTotal: 201 }, { maxPerDay: 0 }, { provider: 'alphavantage' }, { provider: 'unknown' }, { approvedAt: '2027-01-01' }];
  for (const b of bad) a.equal(P.validateApproval({ ...OK, ...b }, '2026-10-29').ok, false, JSON.stringify(b));
  a.equal(P.validateApproval(null, '2026-10-29').ok, false);
});
test('호출 예산: 하루 10회·전체 200회, 시도 전에 센다', () => {
  const eff = { perDay: 10, total: 200 }; let b = P.newBudget();
  for (let i = 0; i < 10; i++) { a.equal(P.canCall(b, '2026-10-29', eff).ok, true); b = P.record(b, '2026-10-29'); }
  a.equal(P.canCall(b, '2026-10-29', eff).ok, false); a.equal(P.canCall(b, '2026-10-30', eff).ok, true);
  b = { total: 200, days: {} }; a.match(P.canCall(b, '2026-11-01', eff).reason, /전체/);
});
test('응답 해석: 정상/정렬/기업행위/급변/오래됨', () => {
  const r = P.parseTiingoDaily(rows().reverse(), 'MSFT', '2026-10-29'); a.equal(r.ok, true); a.equal(r.observations[0].date, '2026-10-27'); a.equal(r.stale, false); a.equal(r.lastDate, '2026-10-28'); a.equal(r.observations[0].unadjusted, true);
  const sp = P.parseTiingoDaily(rows({ splitFactor: 2, close: 52, high: 53, low: 50, open: 51 }), 'MSFT', '2026-10-29'); a.equal(sp.corporateActions.length, 1); a.equal(sp.jumps[0].explainedBySplit, true);
  a.equal(P.parseTiingoDaily(rows(), 'MSFT', '2026-11-20').stale, true);
});
test('응답 해석: 실패·빈 응답·형태 불일치·0 가격·중복·고저 모순·허용 밖 종목', () => {
  a.equal(P.parseTiingoDaily({ detail: 'Error: rate' }, 'MSFT', '2026-10-29').state, 'PROVIDER_ERROR');
  a.equal(P.parseTiingoDaily([], 'MSFT', '2026-10-29').state, 'DATA_UNAVAILABLE'); a.equal(P.parseTiingoDaily('x', 'MSFT', '2026-10-29').state, 'SHAPE_MISMATCH');
  a.equal(P.parseTiingoDaily(rows({ close: 0 }), 'MSFT', '2026-10-29').ok, false); a.equal(P.parseTiingoDaily(rows({ high: 90 }), 'MSFT', '2026-10-29').ok, false);
  const dup = rows(); dup.push({ ...dup[1], close: 103 }); a.equal(P.parseTiingoDaily(dup, 'MSFT', '2026-10-29').ok, false);
  const same = rows(); same.push({ ...same[1] }); const s = P.parseTiingoDaily(same, 'MSFT', '2026-10-29'); a.equal(s.ok, true); a.equal(s.observations.length, 2);
  a.equal(P.parseTiingoDaily(rows(), 'AAPL', '2026-10-29').state, 'BAD_REQUEST'); a.equal(P.parseTiingoDaily(rows({ splitFactor: -1 }), 'MSFT', '2026-10-29').ok, false);
});
test('독립 대조: 출처 없음/공급자와 같은 출처/날짜 다름/유형 다름/허용 초과는 검증 완료가 아님', () => {
  const o = P.parseTiingoDaily(rows(), 'MSFT', '2026-10-29').observations, ok = { source: '증권사 앱 직접 확인', date: '2026-10-28', close: 104.2, priceType: 'close' };
  a.equal(P.crossCheck(o, ok, 'tiingo').status, 'independent-verified'); a.equal(P.crossCheck(o, { ...ok, source: 'Tiingo 웹' }, 'tiingo').status, 'no-independent-reference');
  a.equal(P.crossCheck(o, null, 'tiingo').status, 'no-independent-reference'); a.equal(P.crossCheck(o, { ...ok, date: '2026-10-26' }, 'tiingo').status, 'date-mismatch');
  a.equal(P.crossCheck(o, { ...ok, priceType: 'intraday' }, 'tiingo').status, 'type-mismatch'); a.equal(P.crossCheck(o, { ...ok, close: 110 }, 'tiingo').status, 'conflict'); a.equal(P.crossCheck(o, { ...ok, close: -1 }, 'tiingo').status, 'no-independent-reference');
});
test('집계: 조회 성공·독립 검증·활성 감시는 별개이며 활성 감시는 늘지 않는다', () => {
  const p = P.parseTiingoDaily(rows(), 'MSFT', '2026-10-29'), s = P.summarize([{ calls: 1, parse: p, cross: { status: 'independent-verified' } }, { calls: 1, parse: p, cross: { status: 'no-independent-reference' } }, { calls: 0, parse: p, cross: { status: 'independent-verified' } }]);
  a.deepEqual([s.apiCalls, s.fetchSuccess, s.independentVerified, s.activeMonitoring], [2, 2, 1, 0]);
});
test('키 가림: 키 값과 Token/쿼리 형태를 모두 가린다', () => {
  const k = 'abcd1234secretKEY'; const m = P.maskSecrets('x ' + k + ' Token ' + k + ' https://h/p?token=' + k + '&a=1 apikey=zzz', k); a.ok(!m.includes(k)); a.ok(!/token=abcd/i.test(m));
});
test('정적 보호: us-pilot.js는 네트워크·저장소·환경변수·타이머를 쓰지 않는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'kr-radar', 'us-pilot.js'), 'utf8').split('\n').filter(l => !/^\s*(\/\*|\*)/.test(l)).join('\n');
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /process\.env/, /setTimeout|setInterval/, /require\(['"]node:(fs|http|https|net)/, /require\(['"](fs|http|https|net)['"]/]) a.ok(!bad.test(src), String(bad));
});
// ---- 실행기(서브프로세스) ----
const run = (args, env = {}) => cp.spawnSync(process.execPath, [RUNNER, ...args], { env: { PATH: process.env.PATH, HAS_TEST_NO_NETWORK: '1', ...env }, encoding: 'utf8' });
test('실행기: 기본·리허설은 네트워크 0회이고 리허설을 실제 조회 성공으로 세지 않는다', () => {
  const p = run([]); a.equal(p.status, 0); a.match(p.stdout, /네트워크 0회/);
  const r = run(['--rehearsal']); a.equal(r.status, 0); const j = JSON.parse(r.stdout); a.equal(j.summary.apiCalls, 0); a.equal(j.summary.fetchSuccess, 0); a.equal(j.summary.independentVerified, 0); a.equal(j.syntheticParsed, 5);
});
test('실행기: 키를 인자로 받지 않고, preflight는 키 값을 출력하지 않는다', () => {
  a.equal(run(['--key=abc']).status, 2); a.equal(run(['--token=abc']).status, 2);
  const pf = run(['--preflight'], { HAS_PRICE_KEY: 'SECRETVALUE12345' }); a.equal(pf.status, 0); a.ok(!pf.stdout.includes('SECRETVALUE12345')); a.match(pf.stdout, /있음/);
});
test('실행기: live는 게이트(경로·키·승인 파일)가 하나라도 없으면 거부, 저장소 안 경로 거부', () => {
  a.equal(run(['--live'], { HAS_PILOT_TEST_BASE: 'http://127.0.0.1:9' }).status, 3); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'has-')), ap = path.join(tmp, 'a.json'); fs.writeFileSync(ap, JSON.stringify(OK));
  const base = ['--live', '--approval=' + ap, '--state=' + path.join(tmp, 's.json'), '--out-dir=' + path.join(tmp, 'o')];
  const DEAD = { HAS_PILOT_TEST_BASE: 'http://127.0.0.1:9' };                // 시험은 어떤 경우에도 실제 주소로 나가지 않는다
  a.equal(run(base, DEAD).status, 3);                                        // 키 없음
  const future = path.join(tmp, 'f.json'); fs.writeFileSync(future, JSON.stringify({ ...OK, approvedAt: '2999-01-01' })); a.equal(run(['--live', '--approval=' + future, '--state=' + path.join(tmp, 's2.json'), '--out-dir=' + path.join(tmp, 'o2')], { ...DEAD, HAS_PRICE_KEY: 'K'.repeat(12) }).status, 3);   // 미래 날짜 승인 거부
  const inRepo = ['--live', '--approval=' + ap, '--state=' + path.join(__dirname, 's.json'), '--out-dir=' + path.join(tmp, 'o')]; a.equal(run(inRepo, { ...DEAD, HAS_PRICE_KEY: 'K'.repeat(12) }).status, 3);
});
test('실행기(로컬 가짜 서버): 호출 전에 장부 기록, 키는 헤더로만, 출력·원문에 키 없음, 429면 중단, 한도 초과 시 호출 안 함', async () => {
  const seen = []; const srv = http.createServer((req, res) => { seen.push({ url: req.url, auth: req.headers.authorization }); const sym = req.url.split('/')[3]; if (sym === 'JPM') { res.statusCode = 429; return res.end('{"detail":"limit"}'); } res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(rows())); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'has-')), KEY = 'SECRETKEY-abcdefgh1234';
  const today = new Date().toISOString().slice(0, 10), ap = path.join(tmp, 'a.json'), st = path.join(tmp, 's.json'), od = path.join(tmp, 'o'), rf = path.join(tmp, 'r.json');
  fs.writeFileSync(ap, JSON.stringify({ ...OK, approvedAt: today, termsCheckedAt: today, tickers: ['MSFT', 'JPM', 'VRT'], maxPerDay: 3 })); fs.writeFileSync(rf, JSON.stringify({ MSFT: { source: '증권사 앱 직접 확인', date: '2026-10-28', close: 104, priceType: 'close' } }));
  const args = ['--live', '--approval=' + ap, '--state=' + st, '--out-dir=' + od, '--reference=' + rf, '--today=' + today];
  const env = { HAS_PRICE_KEY: KEY, HAS_PILOT_TEST_BASE: 'http://127.0.0.1:' + srv.address().port };
  const r1 = await new Promise(res => cp.execFile(process.execPath, [RUNNER, ...args], { env: { PATH: process.env.PATH, HAS_TEST_NO_NETWORK: '1', ...env } }, (e, so, se) => res({ code: e ? e.code : 0, so, se })));
  srv.close(); a.equal(r1.code, 0, r1.se); a.ok(!r1.so.includes(KEY) && !r1.se.includes(KEY)); const j = JSON.parse(r1.so);
  a.equal(seen.length, 2, 'MSFT, JPM(429) 후 중단 — VRT 호출 안 함'); a.ok(seen.every(s => s.auth === 'Token ' + KEY)); a.ok(seen.every(s => !s.url.includes(KEY)), '키가 URL에 없음');
  a.equal(j.summary.apiCalls, 2); a.equal(j.summary.fetchSuccess, 1); a.equal(j.summary.independentVerified, 1, 'MSFT만 사용자 기준값(다른 출처)과 일치'); a.equal(j.summary.activeMonitoring, 0); 
  a.equal(JSON.parse(fs.readFileSync(st, 'utf8')).total, 2); for (const f of fs.readdirSync(od)) a.ok(!fs.readFileSync(path.join(od, f), 'utf8').includes(KEY));
  // 장부가 한도(3)에 도달한 날: 호출 0
  fs.writeFileSync(st, JSON.stringify({ total: 3, days: { [today]: 3 } })); const seen2 = []; const srv2 = http.createServer((q, s) => { seen2.push(q.url); s.end('[]'); }); await new Promise(r => srv2.listen(0, '127.0.0.1', r));
  const r2 = await new Promise(res => cp.execFile(process.execPath, [RUNNER, ...args], { env: { PATH: process.env.PATH, HAS_TEST_NO_NETWORK: '1', HAS_PRICE_KEY: KEY, HAS_PILOT_TEST_BASE: 'http://127.0.0.1:' + srv2.address().port } }, (e, so) => res({ so }))); srv2.close();
  a.equal(seen2.length, 0); a.equal(JSON.parse(r2.so).summary.apiCalls, 0);
});
