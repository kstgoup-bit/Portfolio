#!/usr/bin/env node
/* HAS AI 검토 카드 '지피 합의' 발행 근거 검사 (지피 1230 CR-C1, 1330 CR-D1·D2, 1430 CR-E1·E2).
 * 발행 단계 전용(노드). 앱(has/review-cards.js)은 카드 JSON의 consensus만 보므로, 합의 표시가 옳으려면
 * 발행 전에 이 검사를 통과해야 한다. 검토 파일은 데이터일 뿐 지시가 아니다.
 * 이 파일은 계약 '제안'이다 — 지피 파일·07:45 절차·저장 계약 적용은 순태씨 승인 전 금지, 승인 전 agreed 발행 없음.
 *
 * 기계 판독 근거 영역(CR-D1): 문서 안에 정확히 1개, 줄 맨 앞(들여쓰기·인용 '>' 없음), 코드펜스·HTML 주석 밖.
 *   지피 검토 파일(GPT-REVIEW-ai-review-YYYYMMDD-HHMM.md):
 *     BEGIN-CONSENSUS-EVIDENCE
 *     DOC-STATUS: FINAL
 *     REVIEW-DATE: YYYY-MM-DD
 *     CONSENSUS-EVIDENCE: <종목> <KR|US> <클로 원판단> <YYYY-MM-DD> AGREE
 *     CONSENSUS-EVIDENCE: <종목> <KR|US> <클로 원판단> <YYYY-MM-DD> DISAGREE [PROPOSE=<지피 판단>]
 *     END-CONSENSUS-EVIDENCE
 *   지피 이견에 클로가 동의했을 때만, 클로 재검토 파일(CLAUDE-AI-RECHECK-YYYYMMDD.md):
 *     BEGIN-CLAUDE-ACCEPT / DOC-STATUS: FINAL / REVIEW-DATE: YYYY-MM-DD /
 *     CLAUDE-ACCEPT: <종목> <KR|US> <지피 판단> <YYYY-MM-DD> <지피 검토 파일 이름> / END-CLAUDE-ACCEPT
 *   영역 밖 줄(설명·예시·원문 인용), 코드펜스·주석 안의 표식·근거 줄은 근거가 아니다(무시, 사람용 설명은 보존).
 *   영역 0개·2개 이상·닫히지 않음·초안(DOC-STATUS≠FINAL)·검토일 불일치·영역 안 다른 줄 → 실패(발행 보류).
 *   문서 문법은 일부러 좁게 제한한다(CR-E1): 코드펜스는 들여쓰기 0~3칸 + 같은 문자(` 또는 ~) 3개 이상으로 열고,
 *   같은 문자·여는 길이 이상·뒤 공백만인 줄로만 닫는다. 펜스 안의 '펜스처럼 생긴 다른 줄'(다른 문자·짧은 길이·뒤 글자),
 *   닫히지 않은 펜스·주석, 주석 안의 '<!--', 정보 문자열에 `가 있는 여는 줄은 애매한 문맥 → 그 문서 전체 실패.
 *   즉 근거 문서에는 펜스 안에 펜스를 넣는 예시를 쓰지 않는다(쓰면 합의 발행 보류). 파서를 더 넓히지 않는다.
 *
 * 카드 규칙: agreed = (그 종목·시장·날짜 근거 줄이 정확히 1개) 그리고
 *         (AGREE이고 원판단 = 카드 판단) 또는 (DISAGREE PROPOSE=카드 판단이고 클로 CLAUDE-ACCEPT 정확히 1개).
 *       disagree = 근거 줄 1개가 DISAGREE이고 원판단 = 카드 판단, 클로 수락 없음.
 *       no-response = 지피 파일이 없거나, 유효한 영역에 그 종목 줄이 없음.
 *
 * 원문 고정(CR-D2): --gpt-ref / --claude-ref(또는 둘 다 --ref)는 40자리 커밋 SHA, 저장소에 실제 커밋이 있어야 한다.
 *   지피 원문과 클로 수락 원문은 서로 다른 커밋일 수 있으므로 각각 고정한다. ref 없이 돌리면 작업 트리(고정 안 됨, 발행용 아님).
 *   이 검사는 '파일명·영역 줄이 계약에 맞다'만 증명한다. 실제 두 AI가 작성했다는 출처 증명은 아니다.
 *
 * 진단 모드와 발행 검사 모드(CR-E2, 제안):
 *   기본(진단) — ref 없이도 돈다. 종료 0은 '이 입력에 계약 위반 없음'일 뿐 발행 허가가 아니다(출력에 명시).
 *   --publish — 발행 검사. --gpt-ref·--claude-ref(또는 --ref) 둘 다 필수, 없으면 종료 2. 성공 줄은 'PUBLISH-CHECK OK'.
 *   모든 모드: ref는 정확히 commit 객체(git cat-file -t = commit, 주석 태그 SHA 거부),
 *   원문 조회는 '확인된 부재'(그 커밋 트리에 경로 없음)와 '조회 장애'(git 오류·blob 아님·객체 읽기 실패)를 구분 — 장애는 종료 2.
 *   실제 07:45 예약·카드 스키마·프로토콜 연결은 순태씨 승인 전 금지.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const VERDICTS = ['buy-review', 'add-review', 'hold-long', 'wait', 'trim-review', 'sell-review'];
const MARKETS = ['KR', 'US'];
const REVIEW_RE = /^GPT-REVIEW-ai-review-(\d{4})(\d{2})(\d{2})-\d{4}\.md$/;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const FENCE_LIKE = /^ {0,3}(`{3,}|~{3,})(.*)$/; // 펜스처럼 생긴 줄(여는·닫는·애매한 줄 모두)

function kstDay(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 9 * 3600000).toISOString().slice(0, 10) : ''; }
function tok(t, kind) {
  if (kind === 'ticker') return TICKER_RE.test(t); if (kind === 'market') return MARKETS.includes(t);
  if (kind === 'verdict') return VERDICTS.includes(t); if (kind === 'date') return DATE_RE.test(t) && kstDay(t + 'T00:00:00+09:00') === t; return false;
}

// 문서 → 코드펜스·HTML 주석 밖의 줄만 [{s, n}] (n = 1부터 줄 번호). 표식은 원문 그대로(앞뒤 공백 없이) 비교한다.
// 애매한 문맥은 { ok:false, reason, line } (CR-E1 실패 폐쇄).
function plainScan(body) {
  const out = [], all = String(body == null ? '' : body).split(/\r?\n/);
  let fence = null, comment = 0;
  for (let i = 0; i < all.length; i++) {
    const raw = all[i], n = i + 1;
    if (comment) {
      if (raw.includes('<!--')) return { ok: false, reason: 'ambiguous-comment', line: n };
      if (raw.includes('-->')) comment = 0;
      continue;
    }
    const m = FENCE_LIKE.exec(raw);
    if (fence) {
      if (!m) continue;
      if (m[1][0] === fence.ch && m[1].length >= fence.len && m[2].trim() === '') { fence = null; continue; }
      return { ok: false, reason: 'ambiguous-fence', line: n }; // 다른 문자·짧은 길이·뒤 글자 → 닫힘인지 내용인지 애매
    }
    if (m) {
      if (m[1][0] === '`' && m[2].includes('`')) return { ok: false, reason: 'ambiguous-fence', line: n };
      fence = { ch: m[1][0], len: m[1].length, line: n }; continue;
    }
    const o = raw.lastIndexOf('<!--');
    if (o >= 0) { if (raw.lastIndexOf('-->') < o + 4) comment = n; continue; } // 주석이 걸친 줄은 근거로 쓰지 않는다
    if (raw.includes('-->')) continue; // 짝 없는 닫힘 줄도 근거 아님
    out.push({ s: raw, n });
  }
  if (fence) return { ok: false, reason: 'unterminated-fence', line: fence.line };
  if (comment) return { ok: false, reason: 'unterminated-comment', line: comment };
  return { ok: true, lines: out };
}
function plainLines(body) { const r = plainScan(body); if (!r.ok) throw Error(r.reason + ' at line ' + r.line); return r.lines; }

// 단일 기계 판독 영역 추출. kind: 'gpt' | 'claude'. date: 기대 검토일(YYYY-MM-DD).
function extractRegion(body, kind, date) {
  const B = kind === 'gpt' ? 'BEGIN-CONSENSUS-EVIDENCE' : 'BEGIN-CLAUDE-ACCEPT', E = kind === 'gpt' ? 'END-CONSENSUS-EVIDENCE' : 'END-CLAUDE-ACCEPT';
  const P = kind === 'gpt' ? 'CONSENSUS-EVIDENCE:' : 'CLAUDE-ACCEPT:';
  const regions = []; let cur = null;
  const scan = plainScan(body);
  if (!scan.ok) return { ok: false, reason: scan.reason, line: scan.line };
  for (const l of scan.lines) {
    if (l.s === B) { if (cur) return { ok: false, reason: 'nested-region', line: l.n }; cur = { start: l.n, rows: [] }; continue; }
    if (l.s === E) { if (!cur) return { ok: false, reason: 'end-without-begin', line: l.n }; cur.end = l.n; regions.push(cur); cur = null; continue; }
    if (cur) cur.rows.push(l);
  }
  if (cur) return { ok: false, reason: 'unterminated-region', line: cur.start };
  // 코드펜스·주석이 영역 안에서 열리면 그 줄들이 빠져 영역이 조용히 바뀔 수 있다 → 원문 기준으로 영역 안이 깨끗한지 다시 확인
  if (regions.length === 1) {
    const all = String(body).split(/\r?\n/), r = regions[0];
    for (let n = r.start + 1; n < r.end; n++) { const s = all[n - 1]; if (FENCE_LIKE.test(s) || s.includes('<!--') || s.includes('-->')) return { ok: false, reason: 'markup-in-region', line: n }; }
  }
  if (!regions.length) return { ok: false, reason: 'no-region' };
  if (regions.length > 1) return { ok: false, reason: 'duplicate-region', line: regions[1].start };
  const rows = regions[0].rows.filter((l) => l.s.trim() !== '');
  const st = rows.filter((l) => l.s.startsWith('DOC-STATUS:')), rd = rows.filter((l) => l.s.startsWith('REVIEW-DATE:'));
  if (st.length !== 1 || rd.length !== 1) return { ok: false, reason: 'header-missing-or-duplicate' };
  if (st[0].s !== 'DOC-STATUS: FINAL') return { ok: false, reason: 'not-final', line: st[0].n };
  if (rd[0].s !== 'REVIEW-DATE: ' + date || !tok(date, 'date')) return { ok: false, reason: 'review-date-mismatch', line: rd[0].n };
  const items = [], malformed = [];
  for (const l of rows) {
    if (l === st[0] || l === rd[0]) continue;
    if (!l.s.startsWith(P)) { malformed.push(l.n); continue; }
    const it = kind === 'gpt' ? gptRow(l.s.slice(P.length)) : claudeRow(l.s.slice(P.length));
    if (it) items.push(Object.assign(it, { line: l.n })); else malformed.push(l.n);
  }
  if (malformed.length) return { ok: false, reason: 'malformed-row', lines: malformed };
  return { ok: true, items };
}
function gptRow(rest) {
  if (!/^ \S/.test(rest)) return null;
  const p = rest.trim().split(/\s+/), [ticker, market, verdict, date, decision, extra] = p;
  if (p.length < 5 || p.length > 6 || !tok(ticker, 'ticker') || !tok(market, 'market') || !tok(verdict, 'verdict') || !tok(date, 'date') || !(decision === 'AGREE' || decision === 'DISAGREE')) return null;
  let propose = null;
  if (extra !== undefined) { const m = /^PROPOSE=(.+)$/.exec(extra); if (!(decision === 'DISAGREE' && m && tok(m[1], 'verdict') && m[1] !== verdict)) return null; propose = m[1]; }
  return { ticker, market, verdict, date, decision, propose };
}
function claudeRow(rest) {
  if (!/^ \S/.test(rest)) return null;
  const p = rest.trim().split(/\s+/), [ticker, market, verdict, date, review] = p;
  return p.length === 5 && tok(ticker, 'ticker') && tok(market, 'market') && tok(verdict, 'verdict') && tok(date, 'date') && REVIEW_RE.test(review) ? { ticker, market, verdict, date, review } : null;
}

// card: 발행할 카드, reviewedAt: 파일의 reviewedAt, gptBody/claudeBody: 원문(없으면 null).
function verifyCard(card, reviewedAt, gptBody, claudeBody) {
  const x = card && card.consensus;
  if (!x) return { ok: true, status: 'solo', reason: 'no-consensus' };
  if (typeof x !== 'object' || !['agreed', 'disagree', 'no-response'].includes(x.status)) return { ok: false, reason: 'bad-status' };
  const m = typeof x.review === 'string' && REVIEW_RE.exec(x.review);
  if (!m || x.date !== m[1] + '-' + m[2] + '-' + m[3]) return { ok: false, reason: 'bad-review-name' };
  if (x.date !== kstDay(reviewedAt)) return { ok: false, reason: 'date-mismatch' };
  if (x.ticker !== card.ticker || x.market !== card.market || x.verdict !== card.verdict) return { ok: false, reason: 'card-mismatch' };
  if (gptBody == null) return x.status === 'no-response' ? { ok: true, status: 'no-response', reason: 'no-file' } : { ok: false, reason: 'review-file-missing' };
  const g = extractRegion(gptBody, 'gpt', x.date);
  if (!g.ok) return { ok: false, reason: 'gpt-' + g.reason, line: g.line, lines: g.lines };
  const mine = g.items.filter((l) => l.ticker === card.ticker && l.market === card.market && l.date === x.date);
  if (x.status === 'no-response') return mine.length ? { ok: false, reason: 'has-response' } : { ok: true, status: 'no-response', reason: 'no-line' };
  if (mine.length !== 1) return { ok: false, reason: mine.length ? 'duplicate-or-conflict' : 'evidence-missing' };
  const e = mine[0];
  let acc = [];
  if (claudeBody != null) {
    const c = extractRegion(claudeBody, 'claude', x.date);
    if (!c.ok) return { ok: false, reason: 'claude-' + c.reason, line: c.line, lines: c.lines };
    acc = c.items.filter((l) => l.ticker === card.ticker && l.market === card.market && l.date === x.date);
  }
  if (x.status === 'agreed') {
    if (e.decision === 'AGREE') return e.verdict === card.verdict && !acc.length ? { ok: true, status: 'agreed', reason: 'gpt-agree', line: e.line } : { ok: false, reason: acc.length ? 'unexpected-accept' : 'verdict-mismatch' };
    if (e.propose !== card.verdict) return { ok: false, reason: 'disagree-not-agreed' };
    if (acc.length !== 1 || acc[0].verdict !== card.verdict || acc[0].review !== x.review) return { ok: false, reason: 'claude-accept-missing' };
    return { ok: true, status: 'agreed', reason: 'gpt-propose-claude-accept', line: e.line };
  }
  if (e.decision !== 'DISAGREE' || e.verdict !== card.verdict) return { ok: false, reason: 'not-disagree' };
  if (acc.length) return { ok: false, reason: 'accepted-not-disagree' };
  return { ok: true, status: 'disagree', reason: 'gpt-disagree', line: e.line };
}

function git(root, args) { return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
// ref 검증: 40자리 + 저장소에 실제 commit 객체(주석 태그·트리·blob SHA 거부, CR-E2). 카드가 0건이어도 먼저 검사한다(CR-D2).
function checkRef(root, ref) {
  if (!SHA_RE.test(String(ref))) throw Error('ref must be a full 40-hex commit SHA: ' + ref);
  let t = ''; try { t = git(root, ['cat-file', '-t', ref]).trim(); } catch (e) { t = ''; }
  if (t !== 'commit') throw Error('ref is not a commit in this repository: ' + ref + (t ? ' (type ' + t + ')' : ''));
  return ref;
}
function normRefs(root, refs) {
  const r = typeof refs === 'string' ? { gpt: refs, claude: refs } : Object.assign({ gpt: null, claude: null }, refs || {});
  if (r.gpt) checkRef(root, r.gpt); if (r.claude) checkRef(root, r.claude);
  return r;
}
// 원문 읽기. ref가 있으면 그 커밋의 docs/team/<name>(작업 트리 수정과 무관).
// null = 확인된 부재(그 커밋 트리에 경로 없음). 조회 장애(git 오류·blob 아님·객체 읽기 실패)는 예외(lookup-error) — 부재로 보지 않는다.
function readTeam(root, name, ref) {
  if (!name) return null;
  const rel = 'docs/team/' + name;
  if (ref) {
    let ls; try { ls = git(root, ['ls-tree', '-z', ref, '--', rel]); } catch (e) { throw Error('lookup-error: ls-tree ' + rel + ' @' + ref); }
    if (ls === '') return null;
    const mm = /^(\d{6}) (\w+) ([0-9a-f]{40})\t([^\0]*)\0$/.exec(ls);
    if (!mm || mm[4] !== rel || mm[2] !== 'blob') throw Error('lookup-error: not a single blob ' + rel + ' @' + ref);
    try { return git(root, ['cat-file', 'blob', mm[3]]); } catch (e) { throw Error('lookup-error: cannot read blob ' + rel + ' @' + ref); }
  }
  const p = path.join(root, 'docs/team', name);
  let st; try { st = fs.statSync(p); } catch (e) { if (e && e.code === 'ENOENT') return null; throw Error('lookup-error: stat ' + rel); }
  if (!st.isFile()) throw Error('lookup-error: not a file ' + rel);
  return fs.readFileSync(p, 'utf8');
}
// 반환: 카드별 결과 배열. 파일 구조가 잘못되면 실패 항목 1개(빈 성공을 내지 않는다).
function verifyFile(json, root, refs) {
  const r = normRefs(root, refs);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [{ ticker: '-', market: '-', ok: false, reason: 'bad-json-object' }];
  if (!Array.isArray(json.cards)) return [{ ticker: '-', market: '-', ok: false, reason: 'cards-not-array' }];
  const out = [];
  for (const c of json.cards) {
    if (!c || typeof c !== 'object') { out.push({ ticker: '-', market: '-', ok: false, reason: 'bad-card' }); continue; }
    if (!c.consensus) { out.push({ ticker: c.ticker, market: c.market, ok: true, status: 'solo', reason: 'no-consensus' }); continue; }
    const x = c.consensus, day = typeof x.date === 'string' ? x.date.replace(/-/g, '') : '';
    const gpt = REVIEW_RE.test(String(x.review)) ? readTeam(root, x.review, r.gpt) : null;
    const cla = /^\d{8}$/.test(day) ? readTeam(root, 'CLAUDE-AI-RECHECK-' + day + '.md', r.claude) : null;
    out.push(Object.assign({ ticker: c.ticker, market: c.market }, verifyCard(c, json.reviewedAt, gpt, cla)));
  }
  return out;
}

// CLI. 종료 코드: 0 통과, 1 근거 실패, 2 사용법·ref·입력·조회 장애. 성공 출력에 검사 건수·원문 고정 여부·모드를 반드시 적는다.
// 진단 모드의 0은 발행 허가가 아니다. 발행 검사는 --publish(두 ref 필수)이고 성공 줄은 'PUBLISH-CHECK OK'로 시작한다.
function main(argv, root, log) {
  const refs = {}, files = []; let publish = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ref' || a === '--gpt-ref' || a === '--claude-ref') { const v = argv[++i]; if (!v) { log('usage: missing value for ' + a); return 2; } if (a !== '--claude-ref') refs.gpt = v; if (a !== '--gpt-ref') refs.claude = v; continue; }
    if (a === '--publish') { publish = true; continue; }
    if (a.startsWith('-')) { log('usage: unknown option ' + a); return 2; }
    files.push(a);
  }
  if (!files.length) { log('usage: consensus-evidence.cjs [--gpt-ref SHA] [--claude-ref SHA] reviews/<file>.json ... (입력 파일 1개 이상 필요)'); return 2; }
  if (publish && !(refs.gpt && refs.claude)) { log('usage: --publish requires --gpt-ref SHA and --claude-ref SHA (또는 --ref SHA) — 발행 검사 안 함'); return 2; }
  try { normRefs(root, refs); } catch (e) { log('ref error: ' + e.message); return 2; }
  let bad = 0, checked = 0, solo = 0;
  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { log('FAIL ' + f + ' unreadable-json'); bad++; continue; }
    let res; try { res = verifyFile(j, root, refs); } catch (e) { log('lookup error: ' + e.message + ' — 판정 안 함'); return 2; }
    for (const r of res) {
      if (r.status === 'solo' && r.ok) { solo++; continue; }
      checked++; if (!r.ok) bad++;
      log((r.ok ? 'OK   ' : 'FAIL ') + f + ' ' + r.ticker + ' ' + r.market + ' ' + (r.status || '') + ' ' + r.reason);
    }
  }
  const src = 'gpt@' + (refs.gpt || 'working-tree') + ' claude@' + (refs.claude || 'working-tree') + (refs.gpt && refs.claude ? '' : ' (원문 고정 안 됨 — 발행용 아님)');
  if (bad) { log(bad + ' 건 실패 — 합의 발행 보류 · ' + src); return 1; }
  const msg = checked ? checked + ' consensus card(s) ok, solo ' + solo + ' · ' + src : '0 consensus cards — 합의 근거 검사 대상 없음(solo ' + solo + ') · ' + src;
  log(publish ? 'PUBLISH-CHECK OK ' + msg : msg + ' · 진단 모드 — 종료 0은 발행 허가 아님');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2), path.join(__dirname, '..'), (s) => console.log(s)));
module.exports = { extractRegion, plainLines, plainScan, readTeam, verifyCard, verifyFile, checkRef, main, VERDICTS };
