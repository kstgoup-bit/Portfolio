/* HAS 21단계 — 한국투자증권(KIS) 오픈API "국내주식 현재가" 소량 조회 실행기. 순태씨 PC 전용. 기본은 OFF(네트워크 0회).
   모드: (기본) 계획 출력 | --preflight 점검 | --rehearsal 합성 응답(네트워크 0회) | --live 실제 조회
   live 조건: --approve=APPROVE-B-KIS (승인 문구와 같은 뜻의 확인 표시), --tickers=6자리코드(최대 5개), --out-dir=저장소 밖 폴더,
              환경변수 KIS_APP_KEY·KIS_APP_SECRET (명령행 인자로 키를 받지 않음). 하루 1회만 실행(장부 기록).
   호출: 토큰 발급 1회 + 현재가 조회 종목당 1회 = 최대 6회. 재시도 없음, 첫 오류에서 즉시 중단, 호출 간격 1초.
   허용 경로는 아래 2개뿐 — 주문·계좌·잔고 경로는 코드에 없음. 토큰은 메모리에만 두고 파일·출력에 쓰지 않는다.
   출력 스냅샷은 약관 제5조③(개인 업무 한정, 제3자 제공 금지)에 따라 저장소·공개 장소에 올리지 않는다. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));
const args = process.argv.slice(2), opt = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : ''; }, flag = n => args.includes('--' + n);
const PATHS = Object.freeze({ token: '/oauth2/tokenP', price: '/uapi/domestic-stock/v1/quotations/inquire-price' });
const REAL_BASE = 'https://openapi.koreainvestment.com:9443', MAX_TICKERS = 5, GAP_MS = 1000;
const TEST_BASE = /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.HAS_KIS_TEST_BASE || '') ? process.env.HAS_KIS_TEST_BASE : '';
const BASE = TEST_BASE || REAL_BASE, TEST_MODE = process.env.HAS_TEST_NO_NETWORK === '1';
const secrets = () => [process.env.KIS_APP_KEY, process.env.KIS_APP_SECRET, globalThis.__kisToken].filter(s => s && s.length >= 8);
const mask = t => { let s = String(t); secrets().forEach(k => { s = s.split(k).join('[키 가림]'); }); return s.replace(/(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, '$1[키 가림]'); };
const say = o => console.log(mask(typeof o === 'string' ? o : JSON.stringify(o, null, 2)));
const refuse = (code, msg) => { console.error(mask('거부: ' + msg)); process.exit(code); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function outside(p) { let cur = path.resolve(p); const tail = []; while (!fs.existsSync(cur)) { const up = path.dirname(cur); if (up === cur) break; tail.unshift(path.basename(cur)); cur = up; } const real = path.join(fs.realpathSync(cur), ...tail); return real !== ROOT && !real.startsWith(ROOT + path.sep); }
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const validTickers = s => { const l = String(s || '').split(',').map(x => x.trim()).filter(Boolean); return l.length >= 1 && l.length <= MAX_TICKERS && l.every(x => /^\d{6}$/.test(x)) && new Set(l).size === l.length ? l : null; };
/* 응답 해석: 현재가(stck_prpr)가 양의 숫자일 때만 성공. 기준일·가격 종류는 응답에서 확인되지 않으므로 '미확인'. */
function parsePrice(body) { if (!body || typeof body !== 'object') return { ok: false, reason: '응답 형식 오류' }; if (String(body.rt_cd) !== '0') return { ok: false, reason: '응답 코드 ' + String(body.rt_cd) + ' ' + String(body.msg_cd || '') }; const v = Number(String((body.output || {}).stck_prpr || '').replace(/,/g, '')); return isFinite(v) && v > 0 ? { ok: true, price: v } : { ok: false, reason: '현재가 없음' }; }
const snapshot = (items, fetchedAt) => ({ schema: 'has-kis-snapshot-v1', provider: 'KIS Open API', fetchedAt, timezone: 'Asia/Seoul', currency: 'KRW', priceKind: '미확인', marketDate: '미확인', verification: '미검증', note: '개인 업무 한정(약관 제5조③). 저장소·공개 장소에 올리지 말 것. 순태씨가 증권사 앱과 대조해야 독립 검증.', items });

if (Number(process.versions.node.split('.')[0]) < 18) refuse(2, 'Node.js 18 이상 필요');
if (args.some(a => /^--(key|secret|token|appkey|appsecret|app-key|app-secret)\b/i.test(a))) refuse(2, '인증키는 명령행 인자로 받지 않습니다(환경변수 KIS_APP_KEY, KIS_APP_SECRET만).');
if (TEST_MODE && flag('live') && !TEST_BASE) refuse(4, '시험 모드에서는 실제 KIS 주소로 live를 실행할 수 없음');

async function main() {
  if (flag('rehearsal')) { const t = (validTickers(opt('tickers')) || ['005930']); const items = t.map(x => { const p = parsePrice({ rt_cd: '0', output: { stck_prpr: '70000' } }); return { ticker: x, price: p.price, rehearsal: true }; }); return say({ mode: 'rehearsal(합성, 네트워크 0회)', calls: 0, snapshot: snapshot(items, 'rehearsal') }); }
  if (flag('preflight')) return say({ mode: 'preflight(네트워크 0회)', appKey: process.env.KIS_APP_KEY ? '있음(값 비출력)' : '없음', appSecret: process.env.KIS_APP_SECRET ? '있음(값 비출력)' : '없음', tickers: validTickers(opt('tickers')) ? '정상' : '없거나 형식 오류(6자리 코드 1~5개)', outDir: opt('out-dir') ? (outside(opt('out-dir')) ? '저장소 밖: 정상' : '저장소 안: 거부됨') : '없음', maxCalls: 1 + MAX_TICKERS });
  if (!flag('live')) return say({ mode: 'plan(네트워크 0회)', endpoints: Object.values(PATHS), maxCalls: 1 + MAX_TICKERS, gapMs: GAP_MS, next: '--rehearsal 로 연습, --preflight 로 점검, 승인 후 --live --approve=APPROVE-B-KIS --tickers=... --out-dir=...' });
  if (opt('approve') !== 'APPROVE-B-KIS') refuse(3, '--approve=APPROVE-B-KIS 필요(승인 전에는 실행하지 않음)');
  const tickers = validTickers(opt('tickers')); if (!tickers) refuse(3, '--tickers= 는 6자리 종목코드 1~5개(중복 없이)');
  const od = opt('out-dir'); if (!od) refuse(3, '--out-dir= 필요'); if (!outside(od)) refuse(3, '출력 폴더는 저장소 밖이어야 함(약관 제3자 제공 금지)');
  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) refuse(3, '환경변수 KIS_APP_KEY, KIS_APP_SECRET 필요');
  fs.mkdirSync(od, { recursive: true, mode: 0o700 }); const ledger = path.join(od, 'kis-call-ledger.json'), today = kstDay();
  let L = { days: {} }; if (fs.existsSync(ledger)) { try { L = JSON.parse(fs.readFileSync(ledger, 'utf8')); } catch { refuse(3, '호출 장부 손상 — 자동 초기화하지 않음'); } }
  if (L.days && L.days[today]) refuse(3, '오늘(' + today + ')은 이미 실행했습니다. 하루 1회만 허용(재실행하려면 다음 날).');
  L.days = L.days || {}; L.days[today] = { startedAt: new Date().toISOString(), calls: 0 }; const bump = () => { L.days[today].calls++; fs.writeFileSync(ledger, JSON.stringify(L), { mode: 0o600 }); };
  const items = []; let stopped = '';
  bump();                                                                    // 호출 "전에" 기록
  let tokRes; try { tokRes = await fetch(BASE + PATHS.token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: process.env.KIS_APP_KEY, appsecret: process.env.KIS_APP_SECRET }) }); } catch (e) { refuse(5, '토큰 요청 실패: ' + e.message); }
  if (tokRes.status !== 200) refuse(5, '토큰 발급 실패 HTTP ' + tokRes.status + ' (재시도 안 함)');
  let tok; try { tok = (await tokRes.json()).access_token; } catch { tok = ''; } if (!tok) refuse(5, '토큰 응답에 access_token 없음'); globalThis.__kisToken = tok;
  for (const t of tickers) {
    await sleep(GAP_MS); bump();
    let res, body; try { res = await fetch(BASE + PATHS.price + '?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=' + t, { headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + tok, appkey: process.env.KIS_APP_KEY, appsecret: process.env.KIS_APP_SECRET, tr_id: 'FHKST01010100', custtype: 'P' } }); if (res.status === 200) body = await res.json(); } catch (e) { stopped = '네트워크 오류: ' + e.message; break; }
    if (res.status !== 200) { stopped = 'HTTP ' + res.status + ' — 중단(재시도 안 함)'; items.push({ ticker: t, ok: false, reason: 'HTTP ' + res.status }); break; }
    const p = parsePrice(body); if (!p.ok) { stopped = p.reason + ' — 중단'; items.push({ ticker: t, ok: false, reason: p.reason }); break; }
    items.push({ ticker: t, ok: true, price: p.price });
  }
  const fetchedAt = new Date().toISOString(), file = path.join(od, 'kis-' + fetchedAt.replace(/[-:]/g, '').slice(0, 13) + '.kis-snapshot.json');
  fs.writeFileSync(file, JSON.stringify(snapshot(items, fetchedAt), null, 2), { mode: 0o600 });
  say({ mode: 'live', calls: L.days[today].calls, ok: items.filter(i => i.ok).length, failed: items.filter(i => !i.ok).length, stopped: stopped || '없음', snapshotFile: file, 안내: '가격은 "미검증"입니다. 증권사 앱 값과 직접 대조하세요.' });
}
main().catch(e => refuse(1, '예외: ' + mask(String(e && e.message))));
