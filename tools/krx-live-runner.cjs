/* KST 13단계 — 금융위원회_KRX상장종목정보 "개인 PC 전용" 조회 실행기. 기본은 OFF(계획만 출력, 네트워크 0회, 키 읽지 않음).
   모드
     (기본)        계획 출력                         node tools/krx-live-runner.cjs --basDt=20261028
     --preflight   실행 전 점검(네트워크 0회, 키 값은 출력하지 않고 "있음/없음/형식"만)
     --rehearsal   합성 응답으로 처음부터 끝까지 리허설(네트워크 0회, 어떤 종목도 VERIFIED 불가)
     --live        실제 조회. 아래 게이트를 모두 통과할 때만. 이 파일을 실행한다고 승인이 생기지 않는다.
   live 게이트: (1) --live  (2) 저장소 밖에 사용자가 직접 만든 승인 파일 --approval=  {approvedBy:"user", approvedAt, basDt, maxCalls(1~20), scope}
               (3) 환경변수 KRX_SERVICE_KEY (명령행 인자로 키를 받지 않음)  (4) 저장소 밖 --out-dir=
   공통 옵션: --basDt=YYYYMMDD --result-type=xml|json --today=YYYY-MM-DD --max-calls=N */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const RUN = require('../kr-radar/krx-run.js'), K = require('../kr-radar/krx-api.js'), ST = require('../kr-radar/krx-status.js'), RH = require('../kr-radar/rehearsal.js');
const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));
const args = process.argv.slice(2), opt = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : ''; };
/* 저장소 밖 판정: 존재하는 가장 가까운 상위 폴더의 실제 경로(심볼릭 링크 해석)로 비교. '..foo' 같은 폴더명을 상위 이동으로 오인하지 않는다. */
function realOutside(p) {
  let cur = path.resolve(p); const tail = [];
  while (!fs.existsSync(cur)) { const up = path.dirname(cur); if (up === cur) break; tail.unshift(path.basename(cur)); cur = up; }
  const real = path.join(fs.realpathSync(cur), ...tail), rel = path.relative(ROOT, real);
  return !(rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)));
}
const normKey = k => { if (typeof k !== 'string') return { ok: false, why: '없음' }; const t = k.replace(/^[\s﻿]+|[\s﻿]+$/g, ''); if (t.length < 8 || t.length > 512) return { ok: false, why: '길이(8~512)' }; if (/[\s"'<>]/.test(t)) return { ok: false, why: '공백·따옴표·꺾쇠 포함(붙여넣기 오류 가능)' }; return { ok: true, key: t }; };
const say = (o, key) => console.log(RUN.maskSecrets(typeof o === 'string' ? o : JSON.stringify(o, null, 2), key));
const refuse = (code, msg) => { console.error(RUN.maskSecrets('거부: ' + msg, process.env.KRX_SERVICE_KEY)); process.exit(code); };
if (Number(process.versions.node.split('.')[0]) < 18) refuse(2, 'Node.js 18 이상이 필요합니다(현재 ' + process.versions.node + ').');
if (args.some(a => /^--(key|serviceKey|service-key|token)\b/i.test(a))) refuse(2, '인증키는 명령행 인자로 받지 않습니다(환경변수 KRX_SERVICE_KEY만).');
const basDt = opt('basDt'), today = opt('today') || new Date().toISOString().slice(0, 10), resultType = opt('result-type') || 'xml';
const maxCalls = Number(opt('max-calls')) || RUN.HARD_MAX_CALLS;
const plan = RUN.planCalls({ basDt, maxCalls, resultType, queriedAt: today });
const isoOf = b => `${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`;
const universe = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'kr-radar/data/universe.json'), 'utf8'));
const sha256 = t => require('node:crypto').createHash('sha256').update(t, 'utf8').digest('hex');

function writeOutputs(res, outDir, key, extra = {}) {
  const rawDir = path.join(outDir, 'raw', basDt), normDir = path.join(outDir, 'normalized', basDt);
  fs.mkdirSync(rawDir, { recursive: true, mode: 0o700 }); fs.mkdirSync(normDir, { recursive: true, mode: 0o700 });
  for (const r of res.raw) fs.writeFileSync(path.join(rawDir, 'page-' + r.pageNo + '.' + resultType), r.text, { mode: 0o600 });
  const summary = { status: res.status, reason: res.reason, acquisition: res.acquisition, transportCalls: res.transportCalls, attempts: res.attempts, missingPages: res.missingPages, warnings: [...(plan.warnings || []), ...res.warnings], verifierVersion: res.verifierVersion, queriedAt: today, basDt, ...extra };
  if (res.status === 'complete') {
    const cmp = K.compareCandidates(universe(), res.listing, { today, expectedBaseDate: isoOf(basDt) }), st = ST.toStates(cmp);
    summary.totals = st.totals; summary.fixtureMatchedNotCounted = cmp.counts.fixtureMatchedNotCounted; summary.realPriceVerifiedCount = 0; summary.actualActiveMonitoredCount = 0;
    fs.writeFileSync(path.join(normDir, 'verification-log.json'), RUN.maskSecrets(JSON.stringify({ summary, entries: st.entries, log: cmp.log }, null, 2), key), { mode: 0o600 });
  } else if (res.resume) fs.writeFileSync(path.join(normDir, 'resume-state.json'), RUN.maskSecrets(JSON.stringify({ basDt, totalCount: res.resume.totalCount, missing: res.resume.missing }), key), { mode: 0o600 });
  return summary;
}
const noWait = async () => {};

// ---------- 모드: 기본(OFF) ----------
if (!args.includes('--live') && !args.includes('--preflight') && !args.includes('--rehearsal')) {
  say({ mode: 'OFF(dry-run)', networkCalls: 0, keyRead: false, plan, howToGoLive: 'docs/krx-one-page-guide-stage13.md 참고 — 별도 승인 후에만' });
  process.exit(plan.ok ? 0 : 2);
}
// ---------- 모드: 리허설 (합성 응답, 네트워크 0회) ----------
if (args.includes('--rehearsal') && !args.includes('--live')) {
  if (!plan.ok) refuse(2, '계획 오류: ' + plan.errors.join('; '));
  const outDir = opt('out-dir'); if (outDir && !realOutside(outDir)) refuse(3, '--out-dir 은 저장소 밖 폴더여야 합니다.');
  const fault = opt('fault') || 'none', t = RH.createRehearsalTransport(universe(), { basDt, format: resultType, fault });
  RUN.runPlan({ basDt, maxCalls, key: undefined, transport: t, wait: noWait, sha256, queriedAt: today, origin: 'fixture', resultType }).then(res => {
    const summary = outDir ? writeOutputs(res, outDir, undefined, { rehearsal: true, fault }) : { status: res.status, reason: res.reason, transportCalls: res.transportCalls, attempts: res.attempts, rehearsal: true, fault };
    summary.networkCalls = 0; summary.officialVerified = 0; summary.note = '합성 응답 리허설 — 공식 조회가 아니며 어떤 종목도 VERIFIED 로 인정되지 않음';
    say(summary); process.exit(res.status === 'complete' ? 0 : 4);
  });
} else {
  // ---------- live / preflight 공통 게이트 점검 ----------
  const checks = []; const check = (name, ok, why) => { checks.push({ name, ok: !!ok, detail: ok ? 'OK' : why }); return !!ok; };
  check('Node.js 18 이상', true, '');
  check('계획(basDt/호출 상한)', plan.ok, plan.errors.join('; '));
  const apPath = opt('approval'); let approval = null;
  if (check('--approval 지정', apPath, '승인 파일 경로 없음')) {
    if (check('승인 파일이 저장소 밖', realOutside(apPath), '저장소 안의 승인 파일은 커밋 사고 위험')) {
      try { approval = JSON.parse(fs.readFileSync(apPath, 'utf8')); } catch { check('승인 파일 읽기', false, '읽을 수 없음/JSON 오류'); }
      if (approval) { const ae = RUN.validateApproval(approval, today); check('승인 파일 내용', ae.length === 0, ae.join('; ')); check('승인 basDt = 요청 basDt', approval.basDt === basDt, '다름'); }
    }
  }
  const nk = normKey(process.env.KRX_SERVICE_KEY); check('환경변수 KRX_SERVICE_KEY', nk.ok, nk.why);
  const outDir = opt('out-dir'); check('--out-dir 이 저장소 밖', outDir && realOutside(outDir), '저장소 밖 폴더 필요(원본 응답 비공개 보관)');
  const allOk = checks.every(c => c.ok);
  if (args.includes('--preflight') && !args.includes('--live')) { say({ mode: 'PREFLIGHT', networkCalls: 0, keyValuePrinted: false, ready: allOk, checks, warnings: plan.warnings }); process.exit(allOk ? 0 : 3); }
  if (!allOk) refuse(3, checks.filter(c => !c.ok).map(c => c.name + ': ' + c.detail).join(' | '));
  const key = nk.key;
  (async () => {
    const https = require('node:https');   // 모든 게이트 통과 후에만 로드
    const transport = ({ url, timeoutMs }) => new Promise((resolve, reject) => {
      const u = new URL(url); if (u.hostname !== 'apis.data.go.kr' || u.protocol !== 'https:') return reject(new Error('허용되지 않은 호스트'));
      const req = https.get(u, { timeout: timeoutMs }, res => { let b = ''; res.setEncoding('utf8'); res.on('data', d => { b += d; if (b.length > 12 * 1024 * 1024) req.destroy(new Error('응답 크기 초과')); }); res.on('end', () => resolve({ status: res.statusCode, text: b })); });
      req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', e => reject(new Error(RUN.maskSecrets(e.message, key))));
    });
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const res = await RUN.runPlan({ basDt, maxCalls: Math.min(approval.maxCalls, maxCalls, RUN.HARD_MAX_CALLS), key, transport, wait, sha256, queriedAt: today, origin: 'user-supplied-official', resultType });
    const summary = writeOutputs(res, outDir, key); say(summary, key); process.exit(res.status === 'complete' ? 0 : 4);
  })().catch(e => { console.error(RUN.maskSecrets('실행 실패: ' + (e && e.message), process.env.KRX_SERVICE_KEY)); process.exit(4); });
}
