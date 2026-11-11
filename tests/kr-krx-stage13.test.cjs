'use strict';
/* 13단계 A: 실행기 재검토 결과의 부정시험 — 게이트웨이 오류, JSON/XML 양쪽 리허설, 구조 점검, 공유 요약, preflight/rehearsal CLI. 실호출 0. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const K = require('../kr-radar/krx-api.js'), R = require('../kr-radar/krx-run.js'), RH = require('../kr-radar/rehearsal.js'), SH = require('../kr-radar/shape.js'), SU = require('../kr-radar/share.js');
const universe = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
const ROOT = path.join(__dirname, '..'), CLI = path.join(ROOT, 'tools/krx-live-runner.cjs'), SHARE = path.join(ROOT, 'tools/krx-share.cjs'), TRAP = path.join(__dirname, 'fixtures/no-net.cjs');
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex'), wait = async () => {}, BAS = '20261028', QA = '2026-10-29';
const KEY = 'FAKEKEY-abc123+zzSTAGE13';
const run = (t, o = {}) => R.runPlan({ basDt: BAS, key: KEY, transport: t, wait, sha256: sha, queriedAt: QA, origin: 'fixture', ...o });

test('gateway error codes (assumed mapping, not from the guide) are classified without retry; unknown codes become gateway-error', () => {
  const gw = c => `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>${c}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
  for (const [c, cat] of [['30', 'unauthorized'], ['31', 'unauthorized'], ['20', 'forbidden'], ['22', 'quota-exceeded'], ['10', 'bad-request'], ['99', 'gateway-error']]) { const f = K.classifyFailure({ httpStatus: 200, text: gw(c) }); a.equal(f.category, cat, c); a.equal(f.retryable, false); a.equal(f.assumedMapping, true); }
  a.equal(K.classifyFailure({ httpStatus: 200, text: '{"response":{"header":{"resultCode":"00"}}}' }).category, 'unknown', '정상 응답의 resultCode 를 오류로 오인하지 않음');
  const p = K.parseResponse(gw('30'), { responseSha256: 'a'.repeat(64) }); a.equal(p.ok, false); a.equal(p.failure.category, 'unauthorized');
});
test('a gateway-error / result-code / bad-request response halts the whole run immediately (no hammering the remaining pages)', async () => {
  for (const text of ['<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>E</errMsg><returnReasonCode>99</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>', '<response><header><resultCode>30</resultCode><resultMsg>x</resultMsg></header><body><numOfRows>1</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount></body></response>']) {
    let n = 0; const r = await run(async () => { n++; return { status: 200, text }; }); a.equal(r.status, 'blocked', text.slice(0, 20)); a.equal(n, 1);
  }
});
test('JSON and XML rehearsals both run end to end with identical results (JSON shape remains an unconfirmed assumption)', async () => {
  const x = await run(RH.createRehearsalTransport(universe, { basDt: BAS, format: 'xml' }), { resultType: 'xml' }), j = await run(RH.createRehearsalTransport(universe, { basDt: BAS, format: 'json' }), { resultType: 'json' });
  a.equal(x.status, 'complete'); a.equal(j.status, 'complete'); a.equal(x.listing.rows.length, j.listing.rows.length); a.equal(x.transportCalls, 2); a.equal(j.transportCalls, 2);
  const urls = []; await run(async req => { urls.push(req.url); return RH.createRehearsalTransport(universe, { basDt: BAS, format: 'json' })(req); }, { resultType: 'json' }); a.ok(urls.every(u => new URL(u).searchParams.get('resultType') === 'json'));
  a.equal(R.planCalls({ basDt: BAS, resultType: 'csv' }).ok, false);
});
test('rehearsal can NEVER produce VERIFIED: states show MISMATCH from injected renames/market moves and PENDING otherwise', async () => {
  const r = await run(RH.createRehearsalTransport(universe, { basDt: BAS })), cmp = K.compareCandidates(universe, r.listing, { today: QA, expectedBaseDate: '2026-10-28' }), st = require('../kr-radar/krx-status.js').toStates(cmp);
  a.equal(st.totals.stock.VERIFIED + st.totals.etf.VERIFIED, 0); a.ok(st.totals.stock.MISMATCH > 0); a.equal(st.totals.stock.total, 73); a.equal(st.totals.etf.total, 5); a.ok(cmp.counts.fixtureMatchedNotCounted > 0); a.equal(cmp.officialVerifiedCount, 0);
});
test('rehearsal faults: 401 blocks; 429 recovers after one retry; garbage page leaves a resumable partial', async () => {
  const r1 = await run(RH.createRehearsalTransport(universe, { basDt: BAS, fault: '401' })); a.equal(r1.status, 'blocked'); a.equal(r1.transportCalls, 1);
  const r2 = await run(RH.createRehearsalTransport(universe, { basDt: BAS, fault: '429' })); a.equal(r2.status, 'complete'); a.equal(r2.transportCalls, 3);
  const r3 = await run(RH.createRehearsalTransport(universe, { basDt: BAS, fault: 'garbage' })); a.equal(r3.status, 'partial'); a.deepEqual(r3.missingPages, [1]); a.deepEqual(r3.resume.missing, [1]);
  const r4 = await run(RH.createRehearsalTransport(universe, { basDt: BAS, fault: 'gateway30' })); a.equal(r4.status, 'blocked');
});
test('plan warnings: weekend base date, too-recent base date, impossible calendar date, future base date', () => {
  a.ok(R.planCalls({ basDt: '20261031', queriedAt: '2026-11-05' }).warnings.some(w => /주말/.test(w)));
  a.ok(R.planCalls({ basDt: '20261028', queriedAt: '2026-10-29' }).warnings.some(w => /아직 없을 수/.test(w)));
  a.deepEqual(R.planCalls({ basDt: '20261023', queriedAt: '2026-10-29' }).warnings, []);
  a.equal(R.planCalls({ basDt: '20261340', queriedAt: QA }).ok, false); a.equal(R.planCalls({ basDt: '20260230', queriedAt: QA }).ok, false); a.equal(R.planCalls({ basDt: '20261105', queriedAt: QA }).ok, false);
});
test('shape describer reports structure only (never values) and compares with the guide/assumption', () => {
  const secret = '비밀종목명QQQ', xml = `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><numOfRows>1</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount><items><item><basDt>20261028</basDt><srtnCd>A123456</srtnCd><isinCd>KR7123456000</isinCd><mrktCtg>KOSPI</mrktCtg><itmsNm>${secret}</itmsNm><crno>1234567890123</crno><corpNm>x(주)</corpNm></item></items></body></response>`;
  const s = SH.describeShape(xml), c = SH.compareToExpectation(s); a.equal(s.ok, true); a.equal(s.format, 'xml'); a.equal(s.itemCount, 1); a.equal(c.matchesExpectation, true); a.equal(c.assumedStatus, 'guide-example-based'); a.deepEqual(c.unexpectedFields, []);
  a.doesNotMatch(JSON.stringify(s), /비밀종목|A123456|KR7123456|1234567890123/);
  const miss = SH.compareToExpectation(SH.describeShape(xml.replace(/<isinCd>.*?<\/isinCd>/, '').replace('<numOfRows>1</numOfRows>', ''))); a.equal(miss.matchesExpectation, false); a.deepEqual(miss.missingRequired, ['isinCd']); a.equal(miss.headerBodyOk, false);
  const j = SH.describeShape(JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'x' }, body: { numOfRows: 1, pageNo: 1, totalCount: 1, items: { item: { basDt: '20261028', srtnCd: 'A1', isinCd: 'K', mrktCtg: 'KOSPI', itmsNm: secret, newField: 1 } } } } }));
  a.equal(SH.compareToExpectation(j).assumedStatus, 'assumed-unconfirmed'); a.deepEqual(SH.compareToExpectation(j).unexpectedFields, ['newField']); a.doesNotMatch(JSON.stringify(j), /비밀종목/);
  for (const bad of ['', '   ', 'Unauthorized secret-text', '{', '<response', null]) { const b = SH.describeShape(bad); a.equal(b.ok, false); a.doesNotMatch(JSON.stringify(b), /secret-text/); }
});
test('share summary keeps totals/source/dates/hashes and drops codes, names, ISINs, URLs; leaks make it refuse', async () => {
  const r = await run(RH.createRehearsalTransport(universe, { basDt: BAS })), cmp = K.compareCandidates(universe, r.listing, { today: QA, expectedBaseDate: '2026-10-28' }), st = require('../kr-radar/krx-status.js').toStates(cmp);
  const log = { summary: { status: 'complete', acquisition: 'fixture', transportCalls: 2, attempts: r.attempts, missingPages: [], warnings: [], verifierVersion: R.VERIFIER_VERSION, queriedAt: QA, basDt: BAS, totals: st.totals }, entries: st.entries, log: cmp.log };
  const out = SU.buildShareSummary(log), text = JSON.stringify(out); a.deepEqual(out.totals, st.totals); a.ok(out.responseHashes.every(h => /^[0-9a-f]{64}$/.test(h))); a.equal(out.realPriceVerifiedCount, 0);
  for (const e of st.entries.slice(0, 40)) { a.ok(!text.includes(e.name), e.name); a.ok(!text.includes(e.code) || e.code.length < 6 || !new RegExp('"' + e.code + '"').test(text)); }
  a.doesNotMatch(text, /KR7|https?:|serviceKey/);
  const leak = JSON.parse(JSON.stringify(log)); leak.summary.warnings = ['문제 종목 ' + st.entries[0].name]; a.throws(() => SU.buildShareSummary(leak), /식별정보/);
  const leak2 = JSON.parse(JSON.stringify(log)); leak2.summary.reason = 'x'; leak2.summary.warnings = ['https://x/?serviceKey=abc']; a.throws(() => SU.buildShareSummary(leak2), /URL|키/);
  a.throws(() => SU.buildShareSummary({}), /형식/); a.throws(() => SU.buildShareSummary(null), /형식/);
});

// ---- CLI ----
function sandbox() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'krx13-')); return { d, marker: path.join(d, 'net.txt'), out: path.join(d, 'out'), approval: path.join(d, 'ok.approval.json') }; }
const approvalBody = (o = {}) => JSON.stringify({ approvedBy: 'user', approvedAt: '2026-10-29', basDt: BAS, maxCalls: 3, scope: '시험', ...o });
const cli = (args, env, sb, bin = CLI) => cp.spawnSync(process.execPath, ['--require', TRAP, bin, ...args], { env: { PATH: process.env.PATH, NO_NET_MARKER: sb.marker, ...env }, encoding: 'utf8', timeout: 60000 });
const nets = sb => fs.existsSync(sb.marker) ? fs.readFileSync(sb.marker, 'utf8').trim().split('\n') : [];
const flat = r => r.stdout + r.stderr;
test('preflight: all gates OK -> ready, exit 0, zero network, key value never printed; each missing gate is named', () => {
  const sb = sandbox(); fs.writeFileSync(sb.approval, approvalBody());
  const base = ['--basDt=' + BAS, '--today=' + QA, '--preflight', '--approval=' + sb.approval, '--out-dir=' + sb.out];
  const ok = cli(base, { KRX_SERVICE_KEY: KEY }, sb); a.equal(ok.status, 0, flat(ok)); a.match(ok.stdout, /"ready": true/); a.doesNotMatch(flat(ok), /FAKEKEY|abc123/); a.deepEqual(nets(sb), []);
  const noKey = cli(base, {}, sb); a.equal(noKey.status, 3); a.match(noKey.stdout, /KRX_SERVICE_KEY/); a.match(noKey.stdout, /"ready": false/);
  const noAp = cli(['--basDt=' + BAS, '--today=' + QA, '--preflight', '--out-dir=' + sb.out], { KRX_SERVICE_KEY: KEY }, sb); a.equal(noAp.status, 3); a.match(noAp.stdout, /--approval/);
  const bad = cli(['--basDt=' + BAS, '--today=' + QA, '--preflight', '--approval=' + sb.approval, '--out-dir=' + path.join(ROOT, 'oops')], { KRX_SERVICE_KEY: KEY }, sb); a.equal(bad.status, 3); a.match(bad.stdout, /저장소 밖/);
  a.deepEqual(nets(sb), []); a.equal(fs.existsSync(path.join(ROOT, 'oops')), false);
});
test('key hygiene: pasted keys with spaces/quotes/angle brackets or too short are rejected; CR/LF and spaces around a valid key are trimmed', () => {
  const sb = sandbox(); fs.writeFileSync(sb.approval, approvalBody()); const a0 = ['--basDt=' + BAS, '--today=' + QA, '--preflight', '--approval=' + sb.approval, '--out-dir=' + sb.out];
  for (const k of ['abc def ghijklmn', '"quotedkeyquoted1"', '<여기에키>', 'short', 'a'.repeat(600)]) { const r = cli(a0, { KRX_SERVICE_KEY: k }, sb); a.equal(r.status, 3, k.slice(0, 12)); a.doesNotMatch(flat(r), /quotedkey|abc def/); }
  for (const k of [KEY + '\r\n', '  ' + KEY + ' ', '﻿' + KEY]) { const r = cli(a0, { KRX_SERVICE_KEY: k }, sb); a.equal(r.status, 0, JSON.stringify(k)); }
  a.deepEqual(nets(sb), []);
});
test('--live with a whitespace-padded key trims it and only then reaches the (blocked) transport', () => {
  const sb = sandbox(); fs.writeFileSync(sb.approval, approvalBody());
  const r = cli(['--basDt=' + BAS, '--today=' + QA, '--live', '--approval=' + sb.approval, '--out-dir=' + sb.out], { KRX_SERVICE_KEY: KEY + '\r\n' }, sb); a.equal(r.status, 4); a.deepEqual([...new Set(nets(sb))], ['https.get']); a.doesNotMatch(flat(r), /FAKEKEY|abc123/);
});
test('rehearsal CLI: exit 0, zero network, writes raw/normalized separately, VERIFIED stays 0, JSON mode works, faults exit 4', () => {
  const sb = sandbox(), base = ['--basDt=' + BAS, '--today=' + QA, '--rehearsal', '--out-dir=' + sb.out];
  const r = cli(base, {}, sb); a.equal(r.status, 0, flat(r)); a.deepEqual(nets(sb), []); const o = JSON.parse(r.stdout); a.equal(o.networkCalls, 0); a.equal(o.officialVerified, 0); a.equal(o.totals.stock.VERIFIED, 0); a.equal(o.totals.etf.VERIFIED, 0); a.equal(o.acquisition, 'fixture');
  a.ok(fs.existsSync(path.join(sb.out, 'raw', BAS, 'page-1.xml'))); a.ok(fs.existsSync(path.join(sb.out, 'normalized', BAS, 'verification-log.json')));
  const j = cli(['--basDt=' + BAS, '--today=' + QA, '--rehearsal', '--result-type=json', '--out-dir=' + sb.out + '-j'], {}, sb); a.equal(j.status, 0, flat(j)); a.ok(fs.existsSync(path.join(sb.out + '-j', 'raw', BAS, 'page-1.json')));
  for (const f of ['401', 'gateway30']) a.equal(cli([...base, '--fault=' + f], {}, sb).status, 4, f);
  a.equal(cli([...base, '--fault=garbage'], {}, sb).status, 4);
  const s = cli(['summary', path.join(sb.out, 'normalized', BAS, 'verification-log.json')], {}, sb, SHARE); a.equal(s.status, 0, s.stderr); a.equal(JSON.parse(s.stdout).kind, 'krx-share-summary'); a.deepEqual(nets(sb), []);
  const sh = cli(['shape', path.join(sb.out, 'raw', BAS, 'page-1.xml')], {}, sb, SHARE); a.equal(sh.status, 0); a.match(sh.stdout, /"matchesExpectation": true/);
});
test('out-dir hardening: repo-internal paths, look-alike "..name" folders and symlinks into the repo are all refused', () => {
  const sb = sandbox(), a0 = ['--basDt=' + BAS, '--today=' + QA, '--rehearsal'];
  const sneaky = path.join(ROOT, '..sneaky13'); const link = path.join(sb.d, 'linkinrepo'); fs.symlinkSync(ROOT, link);
  try {
    for (const out of [path.join(ROOT, 'krx-out13'), path.join(sneaky, 'out'), path.join(link, 'via-link'), ROOT]) { const r = cli([...a0, '--out-dir=' + out], {}, sb); a.equal(r.status, 3, out); }
    a.equal(fs.existsSync(path.join(ROOT, 'krx-out13')), false); a.equal(fs.existsSync(sneaky), false); a.equal(fs.existsSync(path.join(ROOT, 'via-link')), false);
  } finally { fs.rmSync(sneaky, { recursive: true, force: true }); fs.rmSync(path.join(ROOT, 'krx-out13'), { recursive: true, force: true }); }
});
test('OFF default still makes zero network attempts and does not read the key, also with --result-type=json', () => {
  const sb = sandbox(); for (const extra of [[], ['--result-type=json']]) { const r = cli(['--basDt=' + BAS, '--today=' + QA, ...extra], { KRX_SERVICE_KEY: KEY }, sb); a.equal(r.status, 0); a.match(r.stdout, /"keyRead": false/); a.doesNotMatch(flat(r), /FAKEKEY/); }
  a.deepEqual(nets(sb), []); a.equal(cli(['--basDt=' + BAS, '--result-type=csv'], {}, sb).status, 2);
});
