'use strict';
/* 12단계 A1/C: 로컬 실행기 CLI 게이트와 키 유출 방지. 네트워크는 --require 로 주입한 차단기가 막고 시도 흔적을 기록한다. 실호출 0. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const ROOT = path.join(__dirname, '..'), CLI = path.join(ROOT, 'tools/krx-live-runner.cjs'), TRAP = path.join(__dirname, 'fixtures/no-net.cjs');
const KEY = 'FAKEKEY-abc123+zzCLI0000';
function sandbox() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'krx-cli-')); return { d, marker: path.join(d, 'net-attempts.txt'), out: path.join(d, 'out'), approval: path.join(d, 'ok.approval.json') }; }
const approvalBody = (o = {}) => JSON.stringify({ approvedBy: 'user', approvedAt: '2026-10-29', basDt: '20261028', maxCalls: 3, scope: '시험(가짜 키, 네트워크 차단기)', ...o });
function run(args, env, sb) { return cp.spawnSync(process.execPath, ['--require', TRAP, CLI, ...args], { env: { PATH: process.env.PATH, NO_NET_MARKER: sb.marker, ...env }, encoding: 'utf8', timeout: 60000 }); }
const attempts = sb => fs.existsSync(sb.marker) ? fs.readFileSync(sb.marker, 'utf8').trim().split('\n') : [];
const flat = r => r.stdout + r.stderr;

test('default run is OFF: prints a plan, reads no key, makes zero network attempts', () => {
  const sb = sandbox(), r = run(['--basDt=20261028', '--today=2026-10-29'], { KRX_SERVICE_KEY: KEY }, sb);
  a.equal(r.status, 0); a.match(r.stdout, /OFF\(dry-run\)/); a.match(r.stdout, /"networkCalls": 0/); a.match(r.stdout, /"keyRead": false/); a.deepEqual(attempts(sb), []); a.doesNotMatch(flat(r), /FAKEKEY/);
});
test('--live is refused (exit 3) until EVERY gate is satisfied, and nothing touches the network', () => {
  const sb = sandbox(); fs.writeFileSync(sb.approval, approvalBody());
  const cases = [
    ['no approval flag', ['--basDt=20261028', '--live', '--out-dir=' + sb.out], { KRX_SERVICE_KEY: KEY }],
    ['approval file missing', ['--basDt=20261028', '--live', '--approval=' + path.join(sb.d, 'none.json'), '--out-dir=' + sb.out], { KRX_SERVICE_KEY: KEY }],
    ['no key in env', ['--basDt=20261028', '--live', '--approval=' + sb.approval, '--out-dir=' + sb.out], {}],
    ['short key', ['--basDt=20261028', '--live', '--approval=' + sb.approval, '--out-dir=' + sb.out], { KRX_SERVICE_KEY: 'abc' }],
    ['no out-dir', ['--basDt=20261028', '--live', '--approval=' + sb.approval], { KRX_SERVICE_KEY: KEY }],
    ['out-dir inside repo', ['--basDt=20261028', '--live', '--approval=' + sb.approval, '--out-dir=' + path.join(ROOT, 'krx-out')], { KRX_SERVICE_KEY: KEY }],
    ['basDt differs from approval', ['--basDt=20261027', '--live', '--approval=' + sb.approval, '--out-dir=' + sb.out], { KRX_SERVICE_KEY: KEY }],
    ['bad plan', ['--basDt=bad', '--live', '--approval=' + sb.approval, '--out-dir=' + sb.out], { KRX_SERVICE_KEY: KEY }]
  ];
  for (const [name, args, env] of cases) { const r = run([...args, '--today=2026-10-29'], env, sb); a.equal(r.status, 3, name); a.doesNotMatch(flat(r), /FAKEKEY/, name); }
  a.deepEqual(attempts(sb), []); a.equal(fs.existsSync(path.join(ROOT, 'krx-out')), false);
});
test('approval files that are not user-made/valid/unexpired/within 20 calls are refused', () => {
  const sb = sandbox();
  for (const body of [approvalBody({ approvedBy: 'claude' }), approvalBody({ maxCalls: 21 }), approvalBody({ scope: '' }), approvalBody({ expiresAt: '2026-10-01' }), approvalBody({ approvedAt: '2030-01-01' }), '{bad json']) {
    fs.writeFileSync(sb.approval, body); const r = run(['--basDt=20261028', '--live', '--approval=' + sb.approval, '--out-dir=' + sb.out, '--today=2026-10-29'], { KRX_SERVICE_KEY: KEY }, sb); a.equal(r.status, 3, body); }
  a.deepEqual(attempts(sb), []);
});
test('an approval file inside the repository is refused (commit accident guard)', () => {
  const sb = sandbox(), inRepo = path.join(ROOT, 'tmp-test.approval.json'); fs.writeFileSync(inRepo, approvalBody());
  try { const r = run(['--basDt=20261028', '--live', '--approval=' + inRepo, '--out-dir=' + sb.out, '--today=2026-10-29'], { KRX_SERVICE_KEY: KEY }, sb); a.equal(r.status, 3); a.deepEqual(attempts(sb), []); } finally { fs.rmSync(inRepo, { force: true }); }
});
test('the key is never accepted on the command line, even without --live', () => {
  const sb = sandbox();
  for (const flag of ['--key=' + KEY, '--serviceKey=' + KEY, '--service-key=' + KEY, '--token=' + KEY]) { const r = run(['--basDt=20261028', flag], {}, sb); a.equal(r.status, 2, flag); a.doesNotMatch(flat(r), /FAKEKEY/); }
  a.deepEqual(attempts(sb), []);
});
test('only when all gates pass does the runner reach the transport; the blocker stops it; the fake key leaks nowhere', () => {
  const sb = sandbox(); fs.writeFileSync(sb.approval, approvalBody());
  const r = run(['--basDt=20261028', '--live', '--approval=' + sb.approval, '--out-dir=' + sb.out, '--today=2026-10-29'], { KRX_SERVICE_KEY: KEY }, sb);
  a.equal(r.status, 4, flat(r)); a.ok(attempts(sb).length >= 1 && attempts(sb).every(x => x === 'https.get'), '게이트 통과 후에만 https 시도(차단기가 막음): ' + attempts(sb));
  a.match(r.stdout, /"status": "failed"/); a.doesNotMatch(flat(r), /FAKEKEY|abc123/);
  for (const f of (function* w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* w(p); else yield p; } })(sb.d)) a.doesNotMatch(fs.readFileSync(f, 'utf8'), /FAKEKEY|abc123/, f);
});
test('runner source: https is loaded only after the gates, host is pinned, no key flag parsing, outputs are 0600/0700', () => {
  const s = fs.readFileSync(CLI, 'utf8');
  a.ok(s.indexOf("require('node:https')") > s.indexOf('KRX_SERVICE_KEY') && s.indexOf("require('node:https')") > s.indexOf('--out-dir'));
  a.match(s, /apis\.data\.go\.kr/); a.match(s, /0o600/); a.match(s, /0o700/); a.doesNotMatch(s, /opt\('key'\)|opt\('serviceKey'\)/); a.doesNotMatch(s, /console\.log\([^)]*process\.env/);
});
