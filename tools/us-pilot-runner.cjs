/* HAS 18단계 — 미국 5종목 실가격 파일럿 "개인 PC 전용" 실행기. 기본은 OFF: 네트워크 0회, 키 읽지 않음.
   모드  (기본) 계획 출력 | --preflight 점검(키 값 비출력) | --rehearsal 합성 응답 리허설(네트워크 0회) | --live 실제 조회(아래 게이트 전부 필요)
   live 게이트: (1) --live (2) 저장소 밖 승인 파일 --approval= (약관 확인 증빙·무료 확인·종목·한도 포함, 사용자가 직접 작성)
               (3) 환경변수 HAS_PRICE_KEY (명령행 인자로 키를 받지 않음) (4) 저장소 밖 --state=(호출 장부), --out-dir=(원문 보관)
               (5) 기준값 파일 --reference= (선택, 독립 출처의 같은 날짜 종가). 없으면 "독립 검증 미완료".
   이 파일을 실행한다고 승인이 생기지 않는다. 응답 원문은 재배포 금지 조항이 있을 수 있어 저장소·보고서에 넣지 않는다. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const P = require('../kr-radar/us-pilot.js');
const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));
const args = process.argv.slice(2), opt = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : ''; }, flag = n => args.includes('--' + n);
const key = () => process.env.HAS_PRICE_KEY || '';
const say = o => console.log(P.maskSecrets(typeof o === 'string' ? o : JSON.stringify(o, null, 2), key()));
const refuse = (code, msg) => { console.error(P.maskSecrets('거부: ' + msg, key())); process.exit(code); };
function outside(p) { let cur = path.resolve(p); const tail = []; while (!fs.existsSync(cur)) { const up = path.dirname(cur); if (up === cur) break; tail.unshift(path.basename(cur)); cur = up; } const real = path.join(fs.realpathSync(cur), ...tail), rel = path.relative(ROOT, real); return !(rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep))); }
if (Number(process.versions.node.split('.')[0]) < 18) refuse(2, 'Node.js 18 이상 필요');
if (args.some(a => /^--(key|token|apikey|api-key)\b/i.test(a))) refuse(2, '인증키는 명령행 인자로 받지 않습니다(환경변수 HAS_PRICE_KEY만).');
/* 시험 전용: 로컬(127.0.0.1) 가짜 서버로만 바꿀 수 있다. 그 외 주소는 무시한다. */
const BASE = /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.HAS_PILOT_TEST_BASE || '') ? process.env.HAS_PILOT_TEST_BASE : 'https://api.tiingo.com';
/* 19단계: 시험 환경(HAS_TEST_NO_NETWORK=1)에서는 실제 공급자 주소로 가는 live를 구조적으로 거부한다(기본값이 실제 주소여도 우발 실행 불가). */
const TEST_MODE = process.env.HAS_TEST_NO_NETWORK === '1';
if (TEST_MODE && flag('live') && BASE !== process.env.HAS_PILOT_TEST_BASE) refuse(4, '시험 모드에서는 실제 공급자 주소로 live를 실행할 수 없음(로컬 가짜 서버 주소만 허용)');
const today = opt('today') || new Date().toISOString().slice(0, 10);

async function main() {
  if (flag('rehearsal')) {   // 합성 응답으로 처음부터 끝까지. 네트워크 0회.
    const synth = s => [{ date: '2026-10-27T00:00:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 10, adjClose: 101, divCash: 0, splitFactor: 1 }, { date: '2026-10-28T00:00:00.000Z', open: 101, high: 105, low: 100, close: 104, volume: 12, adjClose: 104, divCash: 0, splitFactor: 1 }];
    const results = P.ALLOWLIST.map(t => { const parse = P.parseTiingoDaily(synth(t), t, '2026-10-29'); return { symbol: t, calls: 0, parse, cross: P.crossCheck(parse.observations, null, 'tiingo') }; });
    return say({ mode: 'rehearsal(합성, 네트워크 0회)', summary: P.summarize(results), syntheticParsed: results.filter(r => r.parse.ok).length, results: results.map(r => ({ symbol: r.symbol, ok: r.parse.ok, cross: r.cross.status })), warning: '합성 값입니다. 어떤 종목도 실제 조회·검증으로 세지 않습니다.' });
  }
  if (flag('preflight')) { const k = key(); return say({ mode: 'preflight(네트워크 0회)', key: k ? '있음(길이 ' + k.length + ', 값 비출력)' : '없음', approvalArg: !!opt('approval'), stateArg: !!opt('state'), outDirArg: !!opt('outDir'), limits: P.LIMITS, tickers: P.ALLOWLIST }); }
  if (!flag('live')) return say({ mode: 'plan(네트워크 0회)', limits: P.LIMITS, tickers: P.ALLOWLIST, providers: P.IMPLEMENTED_PROVIDERS, next: '약관 확인 후 승인 파일을 저장소 밖에 직접 작성 → --preflight → --live', plannedCallsPerTicker: 1 });
  // ---- live 게이트 ----
  const ap = opt('approval'), st = opt('state'), od = opt('out-dir'), refp = opt('reference');
  if (!ap || !st || !od) refuse(3, '--approval=, --state=, --out-dir= 모두 필요'); for (const p of [ap, st, od]) if (!outside(p)) refuse(3, '승인·장부·출력 경로는 저장소 밖이어야 함');
  if (!key()) refuse(3, '환경변수 HAS_PRICE_KEY 없음');
  let approval; try { approval = JSON.parse(fs.readFileSync(ap, 'utf8')); } catch { refuse(3, '승인 파일을 읽을 수 없음'); }
  const v = P.validateApproval(approval, today); if (!v.ok) refuse(3, '승인 파일 불충분: ' + v.errors.join('; '));
  let budget = P.newBudget(); if (fs.existsSync(st)) { try { budget = JSON.parse(fs.readFileSync(st, 'utf8')); } catch { refuse(3, '호출 장부 손상 — 자동 초기화하지 않음'); } }
  let refs = {}; if (refp) { if (!outside(refp)) refuse(3, '기준값 파일도 저장소 밖'); refs = JSON.parse(fs.readFileSync(refp, 'utf8')); }
  fs.mkdirSync(od, { recursive: true, mode: 0o700 }); const results = [];
  const start = new Date(Date.parse(today) - 40 * 86400000).toISOString().slice(0, 10);
  for (const t of v.effective.tickers) {
    const g = P.canCall(budget, today, v.effective); if (!g.ok) { results.push({ symbol: t, calls: 0, parse: { ok: false, state: 'BUDGET', issues: [g.reason] } }); continue; }
    budget = P.record(budget, today); fs.writeFileSync(st, JSON.stringify(budget), { mode: 0o600 });          // 호출 "전에" 장부 기록
    let status = 0, body = null;
    try { const res = await fetch(BASE + '/tiingo/daily/' + encodeURIComponent(t) + '/prices?startDate=' + start + '&endDate=' + today, { headers: { Authorization: 'Token ' + key(), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) }); status = res.status; const text = await res.text(); try { body = JSON.parse(text); } catch { body = null; } fs.writeFileSync(path.join(od, t + '-' + today + '.json'), P.maskSecrets(text, key()), { mode: 0o600 }); }
    catch (e) { results.push({ symbol: t, calls: 1, parse: { ok: false, state: 'NETWORK_ERROR', issues: [P.maskSecrets(String(e && e.message), key())] } }); continue; }
    if (status === 429) { results.push({ symbol: t, calls: 1, parse: { ok: false, state: 'RATE_LIMITED', issues: ['HTTP 429 — 중단'] } }); break; }   // 429면 남은 종목도 중단
    if (status !== 200) { results.push({ symbol: t, calls: 1, parse: { ok: false, state: 'HTTP_' + status, issues: ['HTTP ' + status] } }); continue; }
    const parse = P.parseTiingoDaily(body, t, today); results.push({ symbol: t, calls: 1, parse, cross: P.crossCheck(parse.observations, refs[t], approval.provider) });
  }
  say({ mode: 'live', provider: approval.provider, queriedAt: today, summary: P.summarize(results), budget, results: results.map(r => ({ symbol: r.symbol, calls: r.calls, state: r.parse.state, ok: r.parse.ok, lastDate: r.parse.lastDate, stale: r.parse.stale, corporateActions: r.parse.corporateActions, jumps: r.parse.jumps, issues: r.parse.issues, cross: r.cross })) });
}
main().catch(e => refuse(1, '예외: ' + P.maskSecrets(String(e && e.message), key())));
