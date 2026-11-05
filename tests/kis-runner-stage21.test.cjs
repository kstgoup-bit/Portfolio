'use strict';
const test = require('node:test'), a = require('node:assert/strict'), cp = require('node:child_process'), http = require('node:http'), fs = require('fs'), os = require('os'), path = require('path');
const RUNNER = path.join(__dirname, '../tools/kis-quote-runner.cjs'), KEY = 'TESTAPPKEY1234567890', SEC = 'TESTAPPSECRET1234567890', TOK = 'TESTTOKEN1234567890abcdef';
const base = { PATH: process.env.PATH, HAS_TEST_NO_NETWORK: '1' };
const run = (args, env = {}) => new Promise(res => cp.execFile(process.execPath, [RUNNER, ...args], { env: { ...base, ...env }, timeout: 60000 }, (e, so, se) => res({ code: e ? e.code : 0, so, se })));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kis-'));
const serve = (h) => new Promise(r => { const seen = []; const s = http.createServer((q, p) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { seen.push({ m: q.method, u: q.url, h: q.headers, b }); h(q, p, seen.length); }); }); s.listen(0, '127.0.0.1', () => r({ s, seen, env: { KIS_APP_KEY: KEY, KIS_APP_SECRET: SEC, HAS_KIS_TEST_BASE: 'http://127.0.0.1:' + s.address().port } })); });
const ok = (q, p) => { p.setHeader('content-type', 'application/json'); if (q.url.startsWith('/oauth2/tokenP')) return p.end(JSON.stringify({ access_token: TOK })); p.end(JSON.stringify({ rt_cd: '0', output: { stck_prpr: '71,500' } })); };
test('기본·rehearsal·preflight는 네트워크 0회, 키 값 비출력', async () => {
  for (const m of [[], ['--rehearsal'], ['--preflight', '--tickers=005930']]) { const r = await run(m, { KIS_APP_KEY: KEY, KIS_APP_SECRET: SEC }); a.equal(r.code, 0); a.ok(!r.so.includes(KEY) && !r.so.includes(SEC)); }
});
test('live 거부 조건: 승인 표시 없음/종목 형식/6개/저장소 안/키 없음/키 인자', async () => {
  const od = tmp(), ENV = { KIS_APP_KEY: KEY, KIS_APP_SECRET: SEC, HAS_KIS_TEST_BASE: 'http://127.0.0.1:9' };
  a.equal((await run(['--live', '--tickers=005930', '--out-dir=' + od], ENV)).code, 3);
  a.equal((await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=ABC', '--out-dir=' + od], ENV)).code, 3);
  a.equal((await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=000001,000002,000003,000004,000005,000006', '--out-dir=' + od], ENV)).code, 3);
  a.equal((await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930', '--out-dir=' + path.join(__dirname, '../zz-out')], ENV)).code, 3);
  a.equal((await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930', '--out-dir=' + od], { HAS_KIS_TEST_BASE: 'http://127.0.0.1:9' })).code, 3);
  a.equal((await run(['--live', '--appkey=' + KEY], ENV)).code, 2);
  a.ok(!fs.existsSync(path.join(__dirname, '../zz-out')));
});
test('시험 모드에서 실제 KIS 주소로 live 불가(종료 4)', async () => { const r = await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930', '--out-dir=' + tmp()], { KIS_APP_KEY: KEY, KIS_APP_SECRET: SEC }); a.equal(r.code, 4); });
test('가짜 서버: 토큰 1회+종목별 1회, 허용 경로 2개만, 스냅샷·출력에 키 없음, 같은 날 재실행 거부', async () => {
  const { s, seen, env } = await serve(ok), od = tmp();
  const r = await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930,000660', '--out-dir=' + od], env); s.close();
  a.equal(r.code, 0, r.se); a.equal(seen.length, 3);
  a.ok(seen[0].m === 'POST' && seen[0].u === '/oauth2/tokenP'); a.ok(seen.slice(1).every(x => x.m === 'GET' && x.u.startsWith('/uapi/domestic-stock/v1/quotations/inquire-price?')));
  a.equal(seen[1].h.authorization, 'Bearer ' + TOK); a.equal(seen[1].h.tr_id, 'FHKST01010100'); a.equal(seen[1].h.appkey, KEY);
  const snap = fs.readdirSync(od).filter(f => f.endsWith('.kis-snapshot.json')); a.equal(snap.length, 1);
  const txt = fs.readFileSync(path.join(od, snap[0]), 'utf8'), j = JSON.parse(txt); a.equal(j.items.length, 2); a.equal(j.items[0].price, 71500); a.equal(j.verification, '미검증'); a.equal(j.priceKind, '미확인');
  for (const t of [r.so, r.se, txt, fs.readFileSync(path.join(od, 'kis-call-ledger.json'), 'utf8')]) a.ok(!t.includes(KEY) && !t.includes(SEC) && !t.includes(TOK));
  const r2 = await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930', '--out-dir=' + od], env); a.equal(r2.code, 3);
});
test('첫 오류에서 중단·재시도 없음(HTTP 500, rt_cd≠0, 토큰 실패)', async () => {
  let n = 0; let { s, seen, env } = await serve((q, p) => { if (q.url.startsWith('/oauth2')) return ok(q, p); n++; p.statusCode = 500; p.end('{}'); });
  let r = await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930,000660,035720', '--out-dir=' + tmp()], env); s.close(); a.equal(seen.length, 2); a.equal(r.code, 0); a.match(r.so, /HTTP 500/);
  ({ s, seen, env } = await serve((q, p) => { if (q.url.startsWith('/oauth2')) return ok(q, p); p.end(JSON.stringify({ rt_cd: '1', msg_cd: 'EGW00201' })); }));
  r = await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930,000660', '--out-dir=' + tmp()], env); s.close(); a.equal(seen.length, 2); a.match(r.so, /응답 코드 1/);
  ({ s, seen, env } = await serve((q, p) => { p.statusCode = 403; p.end('{}'); }));
  r = await run(['--live', '--approve=APPROVE-B-KIS', '--tickers=005930', '--out-dir=' + tmp()], env); s.close(); a.equal(seen.length, 1); a.equal(r.code, 5);
});
test('코드에 주문·계좌·잔고 경로 없음, 허용 경로 2개', () => {
  const s = fs.readFileSync(RUNNER, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  a.ok(!/order|inquire-balance|trading\/|inquire-psbl|cash|계좌번호|CANO/i.test(s)); a.equal((s.match(/\/uapi\//g) || []).length, 1);
});
