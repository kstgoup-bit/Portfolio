'use strict';
/* 19단계 작업 A: 시험이 외부 네트워크에 나가지 못함을 구조적으로 보증한다. 외부로 실제 요청을 보내지 않고(차단 장치가 예외를 던짐) 확인한다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process'), dns = require('node:dns');
const G = require('./lib/no-network.cjs'), ROOT = path.join(__dirname, '..');
const before = () => G.attempts.length;
test('차단 장치: 외부 호스트로의 http·fetch·dns·tls는 예외(NO_EXTERNAL_NETWORK), 기록됨', async () => {
  const n0 = before();
  a.throws(() => http.get('http://api.tiingo.com/x', () => { }), e => e.code === 'NO_EXTERNAL_NETWORK');
  await a.rejects(async () => fetch('https://api.tiingo.com/x'), e => e.code === 'NO_EXTERNAL_NETWORK');
  a.throws(() => dns.lookup('api.tiingo.com', () => { }), e => e.code === 'NO_EXTERNAL_NETWORK');
  a.throws(() => require('node:tls').connect({ host: 'api.tiingo.com', port: 443 }), e => e.code === 'NO_EXTERNAL_NETWORK');
  a.equal(G.attempts.length - n0, 4); if (process.env.HAS_BLOCK_LOG) require('fs').appendFileSync(process.env.HAS_BLOCK_LOG, G.attempts.slice(n0).map(x => 'DELIBERATE ' + x).join('\n') + '\n'); G.attempts.length = n0;   // 의도된 차단 4건은 비워서 종료 시 경고가 나오지 않게 함
});
test('차단 장치: 127.0.0.1 로컬 서버와는 정상 통신', async () => {
  const srv = http.createServer((q, s) => s.end('ok')); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const body = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: srv.address().port }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej)); srv.close(); a.equal(body, 'ok');
  const s2 = http.createServer((q, r) => r.end('1')); await new Promise(r => s2.listen(0, '127.0.0.1', r)); const res = await fetch('http://127.0.0.1:' + s2.address().port); a.equal(await res.text(), '1'); s2.close(); if (s2.closeAllConnections) s2.closeAllConnections();
});
test('실행 모드 분리: 시험 모드에서는 모든 관문을 통과해도 실제 공급자 주소로 live 실행 불가(종료코드 4, 접속 0)', () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'has-')), today = new Date().toISOString().slice(0, 10), ap = path.join(tmp, 'a.json');
  fs.writeFileSync(ap, JSON.stringify({ approvedBy: 'user', approvedAt: today, provider: 'tiingo', termsConfirmedByUser: true, termsUrl: 'https://example.invalid/terms', termsCheckedAt: today, freeNoPayment: true, tickers: ['MSFT'], maxPerDay: 1, maxTotal: 1 }));
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'us-pilot-runner.cjs'), '--live', '--approval=' + ap, '--state=' + path.join(tmp, 's.json'), '--out-dir=' + path.join(tmp, 'o'), '--today=' + today], { env: { PATH: process.env.PATH, HAS_TEST_NO_NETWORK: '1', HAS_PRICE_KEY: 'DUMMYDUMMY12' }, encoding: 'utf8' });
  a.equal(r.status, 4, r.stderr); a.ok(!fs.existsSync(path.join(tmp, 's.json')), '호출 장부도 만들어지지 않음(호출 시도 전에 거부)');
});
test('실제 공급자 주소는 실행기(tools/us-pilot-runner.cjs) 한 곳에만 있다(시험·모듈·앱 코드에 하드코딩 금지)', () => {
  const hits = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.git', 'test-results', 'docs'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|cjs|html|json)$/.test(e.name) && !/(bundle)\.js$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); if (/api\.tiingo\.com|api\.twelvedata\.com|api\.polygon\.io|api\.massive\.com/.test(t)) hits.push(path.relative(ROOT, p)); } } };
  walk(ROOT); const allowed = ['tools/us-pilot-runner.cjs', 'tests/network-guard-stage19.test.cjs', 'tests/us-pilot-stage18.test.cjs', 'kr-radar/price-normalizers.js', 'tests/kr-normalizers-stage16.test.cjs'];
  a.deepEqual(hits.filter(h => !allowed.includes(h)), [], '허용되지 않은 위치에 공급자 주소');
  a.ok(!hits.includes('portfolio_v5.html'), '앱에는 신규 공급자 주소 없음');
});
test('모든 브라우저 시험 파일은 외부 요청을 차단(route abort)하고 서버는 127.0.0.1에만 바인딩', () => {
  for (const f of fs.readdirSync(__dirname).filter(x => /^mobile.*\.cjs$/.test(x))) { const t = fs.readFileSync(path.join(__dirname, f), 'utf8'); a.ok(/route\(/.test(t), f + ' route 차단 없음'); a.ok(!/listen\(\s*0\s*,\s*['"]0\.0\.0\.0/.test(t), f); if (/listen\(/.test(t)) a.ok(/127\.0\.0\.1/.test(t), f + ' 로컬 바인딩 확인 불가'); }
});
test('npm test 스크립트가 차단 장치를 항상 불러온다', () => { a.match(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts.test, /--require \.\/tests\/lib\/no-network\.cjs/); });
