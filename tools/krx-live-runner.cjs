/* KST 12단계 — 금융위원회_KRX상장종목정보 "개인 PC 전용" 조회 실행기. 기본은 OFF(계획만 출력, 네트워크 0회).
   실제 호출은 아래 게이트를 모두 통과할 때만 일어난다. 이 파일을 실행한다고 승인이 생기지 않는다.
     1) --live 플래그
     2) 사용자가 저장소 밖에 직접 만든 승인 파일(--approval=경로): {approvedBy:"user", approvedAt, basDt, maxCalls(1~20), scope}
     3) 환경변수 KRX_SERVICE_KEY (명령행 인자로 키를 받지 않음 — --key/--serviceKey 는 거부)
     4) 출력 폴더(--out-dir)가 저장소 밖
   usage: node tools/krx-live-runner.cjs --basDt=YYYYMMDD                         (계획 출력)
          node tools/krx-live-runner.cjs --basDt=YYYYMMDD --live --approval=승인.json --out-dir=저장소밖폴더 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const RUN = require('../kr-radar/krx-run.js'), K = require('../kr-radar/krx-api.js'), ST = require('../kr-radar/krx-status.js');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), opt = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : ''; };
const outside = p => { const r = path.relative(ROOT, path.resolve(p)); return r.startsWith('..') || path.isAbsolute(r); };
const say = (o, key) => console.log(RUN.maskSecrets(typeof o === 'string' ? o : JSON.stringify(o, null, 2), key));
const refuse = (code, msg) => { console.error(RUN.maskSecrets('거부: ' + msg, process.env.KRX_SERVICE_KEY)); process.exit(code); };
if (args.some(a => /^--(key|serviceKey|service-key|token)\b/i.test(a))) refuse(2, '인증키는 명령행 인자로 받지 않습니다(환경변수 KRX_SERVICE_KEY만).');
const basDt = opt('basDt'), today = opt('today') || new Date().toISOString().slice(0, 10);
const plan = RUN.planCalls({ basDt, maxCalls: Number(opt('max-calls')) || RUN.HARD_MAX_CALLS });
if (!args.includes('--live')) {
  say({ mode: 'OFF(dry-run)', networkCalls: 0, keyRead: false, plan, howToGoLive: 'docs/krx-local-runner-guide-stage12.md 참고 — 별도 승인 후에만' });
  process.exit(plan.ok ? 0 : 2);
}
// ---- live 게이트 (https 는 모든 게이트 통과 후에만 로드) ----
if (!plan.ok) refuse(3, '계획 오류: ' + plan.errors.join('; '));
const apPath = opt('approval'); if (!apPath) refuse(3, '--approval=승인파일 필요(사용자가 직접 작성)');
if (!outside(apPath)) refuse(3, '승인 파일은 저장소 밖에 두어야 합니다(커밋 사고 방지).');
let approval; try { approval = JSON.parse(fs.readFileSync(apPath, 'utf8')); } catch { refuse(3, '승인 파일을 읽을 수 없습니다.'); }
const ae = RUN.validateApproval(approval, today); if (ae.length) refuse(3, '승인 파일 오류: ' + ae.join('; '));
if (approval.basDt !== basDt) refuse(3, '승인된 basDt와 요청 basDt가 다릅니다.');
const key = process.env.KRX_SERVICE_KEY; if (typeof key !== 'string' || key.length < 8) refuse(3, '환경변수 KRX_SERVICE_KEY 가 설정되지 않았습니다.');
const outDir = opt('out-dir'); if (!outDir || !outside(outDir)) refuse(3, '--out-dir 은 저장소 밖 폴더여야 합니다(원본 응답 비공개 보관).');
(async () => {
  const https = require('node:https'), crypto = require('node:crypto');
  const transport = ({ url, timeoutMs }) => new Promise((resolve, reject) => {
    const u = new URL(url); if (u.hostname !== 'apis.data.go.kr' || u.protocol !== 'https:') return reject(new Error('허용되지 않은 호스트'));
    const req = https.get(u, { timeout: timeoutMs }, res => { let b = ''; res.setEncoding('utf8'); res.on('data', d => { b += d; if (b.length > 12 * 1024 * 1024) req.destroy(new Error('응답 크기 초과')); }); res.on('end', () => resolve({ status: res.statusCode, text: b })); });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', e => reject(new Error(RUN.maskSecrets(e.message, key))));
  });
  const wait = ms => new Promise(r => setTimeout(r, ms)), sha256 = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
  const res = await RUN.runPlan({ basDt, maxCalls: Math.min(approval.maxCalls, RUN.HARD_MAX_CALLS), key, transport, wait, sha256, queriedAt: today, origin: 'user-supplied-official' });
  const rawDir = path.join(outDir, 'raw', basDt), normDir = path.join(outDir, 'normalized', basDt);
  fs.mkdirSync(rawDir, { recursive: true, mode: 0o700 }); fs.mkdirSync(normDir, { recursive: true, mode: 0o700 });
  for (const r of res.raw) fs.writeFileSync(path.join(rawDir, 'page-' + r.pageNo + '.xml'), r.text, { mode: 0o600 });
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'kr-radar/data/universe.json'), 'utf8'));
  const summary = { status: res.status, reason: res.reason, transportCalls: res.transportCalls, attempts: res.attempts, missingPages: res.missingPages, warnings: res.warnings, verifierVersion: res.verifierVersion, queriedAt: today, basDt };
  if (res.status === 'complete') {
    const cmp = K.compareCandidates(data, res.listing, { today, expectedBaseDate: `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}` });
    const st = ST.toStates(cmp); summary.totals = st.totals; summary.realPriceVerifiedCount = 0; summary.actualActiveMonitoredCount = 0;
    fs.writeFileSync(path.join(normDir, 'verification-log.json'), RUN.maskSecrets(JSON.stringify({ summary, entries: st.entries, log: cmp.log }, null, 2), key), { mode: 0o600 });
  } else if (res.resume) fs.writeFileSync(path.join(normDir, 'resume-state.json'), RUN.maskSecrets(JSON.stringify({ basDt, totalCount: res.resume.totalCount, missing: res.resume.missing }), key), { mode: 0o600 });
  say(summary, key); process.exit(res.status === 'complete' ? 0 : 4);
})().catch(e => { console.error(RUN.maskSecrets('실행 실패: ' + (e && e.message), key)); process.exit(4); });
