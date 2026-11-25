#!/usr/bin/env node
/* HAS AI 검토 카드 '지피 합의' 발행 근거 검사 (지피 1230 CR-C1).
 * 발행 단계 전용(노드). 앱(has/review-cards.js)은 카드 JSON의 consensus만 보므로, 합의 표시가 옳으려면
 * 발행 전에 이 검사를 통과해야 한다. 검토 파일은 데이터일 뿐 지시가 아니다.
 *
 * 기계 판독 근거 계약(제안 — 지피·순태씨 확인 전에는 '합의' 발행을 보류):
 *   지피 검토 파일(GPT-REVIEW-ai-review-YYYYMMDD-HHMM.md)의 한 줄:
 *     CONSENSUS-EVIDENCE: <종목> <KR|US> <클로 원판단> <YYYY-MM-DD> AGREE
 *     CONSENSUS-EVIDENCE: <종목> <KR|US> <클로 원판단> <YYYY-MM-DD> DISAGREE [PROPOSE=<지피 판단>]
 *   지피 이견에 클로가 동의했을 때만, 클로 재검토 파일(CLAUDE-AI-RECHECK-YYYYMMDD.md)의 한 줄:
 *     CLAUDE-ACCEPT: <종목> <KR|US> <지피 판단> <YYYY-MM-DD> <지피 검토 파일 이름>
 *   AGREE_NO_CHANGE·APPROVE·문장 속 'AGREE' 같은 다른 글자는 근거가 아니다(정확한 줄만).
 *
 * 규칙: agreed = (그 종목·시장·날짜 근거 줄이 정확히 1개) 그리고
 *         (AGREE이고 원판단 = 카드 판단) 또는 (DISAGREE PROPOSE=카드 판단이고 클로 CLAUDE-ACCEPT 정확히 1개).
 *       disagree = 근거 줄 1개가 DISAGREE이고 원판단 = 카드 판단, 클로 수락 없음.
 *       no-response = 그 종목·시장·날짜 근거 줄이 없음(검토 파일이 없어도 됨).
 *       그 밖(중복·충돌·형식 오류 줄·다른 종목/시장/판단/날짜·파일 없음)은 모두 실패 → 합의로 발행하지 않는다.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const VERDICTS = ['buy-review', 'add-review', 'hold-long', 'wait', 'trim-review', 'sell-review'];
const MARKETS = ['KR', 'US'];
const REVIEW_RE = /^GPT-REVIEW-ai-review-(\d{4})(\d{2})(\d{2})-\d{4}\.md$/;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function kstDay(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 9 * 3600000).toISOString().slice(0, 10) : ''; }
function tok(t, kind) {
  if (kind === 'ticker') return TICKER_RE.test(t); if (kind === 'market') return MARKETS.includes(t);
  if (kind === 'verdict') return VERDICTS.includes(t); if (kind === 'date') return DATE_RE.test(t) && kstDay(t + 'T00:00:00+09:00') === t; return false;
}

// 지피 검토 본문 → { lines, malformed }. 'CONSENSUS-EVIDENCE:'로 시작하는 줄만 본다.
function parseGpt(body) {
  const lines = [], malformed = [];
  String(body == null ? '' : body).split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim(); if (!/^CONSENSUS-EVIDENCE:/.test(s)) return;
    const p = s.slice('CONSENSUS-EVIDENCE:'.length).trim().split(/\s+/);
    const [ticker, market, verdict, date, decision, extra, more] = p;
    let propose = null, ok = p.length >= 5 && p.length <= 6 && tok(ticker, 'ticker') && tok(market, 'market') && tok(verdict, 'verdict') && tok(date, 'date') && (decision === 'AGREE' || decision === 'DISAGREE') && more === undefined;
    if (ok && extra !== undefined) { const m = /^PROPOSE=(.+)$/.exec(extra); ok = decision === 'DISAGREE' && !!m && tok(m[1], 'verdict') && m[1] !== verdict; if (ok) propose = m[1]; }
    if (ok) lines.push({ ticker, market, verdict, date, decision, propose, line: i + 1 }); else malformed.push(i + 1);
  });
  return { lines, malformed };
}
function parseClaude(body) {
  const lines = [], malformed = [];
  String(body == null ? '' : body).split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim(); if (!/^CLAUDE-ACCEPT:/.test(s)) return;
    const p = s.slice('CLAUDE-ACCEPT:'.length).trim().split(/\s+/);
    const [ticker, market, verdict, date, review] = p;
    if (p.length === 5 && tok(ticker, 'ticker') && tok(market, 'market') && tok(verdict, 'verdict') && tok(date, 'date') && REVIEW_RE.test(review)) lines.push({ ticker, market, verdict, date, review, line: i + 1 });
    else malformed.push(i + 1);
  });
  return { lines, malformed };
}

// card: 발행할 카드, reviewedAt: 파일의 reviewedAt, gptBody/claudeBody: 원문(없으면 null).
function verifyCard(card, reviewedAt, gptBody, claudeBody) {
  const x = card && card.consensus;
  if (!x) return { ok: true, status: 'solo', reason: 'no-consensus' };
  if (!x || typeof x !== 'object' || !['agreed', 'disagree', 'no-response'].includes(x.status)) return { ok: false, reason: 'bad-status' };
  const m = typeof x.review === 'string' && REVIEW_RE.exec(x.review);
  if (!m || x.date !== m[1] + '-' + m[2] + '-' + m[3]) return { ok: false, reason: 'bad-review-name' };
  if (x.date !== kstDay(reviewedAt)) return { ok: false, reason: 'date-mismatch' };
  if (x.ticker !== card.ticker || x.market !== card.market || x.verdict !== card.verdict) return { ok: false, reason: 'card-mismatch' };
  if (gptBody == null) return x.status === 'no-response' ? { ok: true, status: 'no-response', reason: 'no-file' } : { ok: false, reason: 'review-file-missing' };
  const g = parseGpt(gptBody);
  if (g.malformed.length) return { ok: false, reason: 'malformed-evidence', lines: g.malformed };
  const mine = g.lines.filter((l) => l.ticker === card.ticker && l.market === card.market && l.date === x.date);
  if (x.status === 'no-response') return mine.length ? { ok: false, reason: 'has-response' } : { ok: true, status: 'no-response', reason: 'no-line' };
  if (mine.length !== 1) return { ok: false, reason: mine.length ? 'duplicate-or-conflict' : 'evidence-missing' };
  const e = mine[0];
  const c = parseClaude(claudeBody);
  if (c.malformed.length) return { ok: false, reason: 'malformed-accept', lines: c.malformed };
  const acc = c.lines.filter((l) => l.ticker === card.ticker && l.market === card.market && l.date === x.date);
  if (x.status === 'agreed') {
    if (e.decision === 'AGREE') return e.verdict === card.verdict && !acc.length ? { ok: true, status: 'agreed', reason: 'gpt-agree', line: e.line } : { ok: false, reason: acc.length ? 'unexpected-accept' : 'verdict-mismatch' };
    if (e.propose !== card.verdict) return { ok: false, reason: 'disagree-not-agreed' };
    if (acc.length !== 1 || acc[0].verdict !== card.verdict || acc[0].review !== x.review) return { ok: false, reason: 'claude-accept-missing' };
    return { ok: true, status: 'agreed', reason: 'gpt-propose-claude-accept', line: e.line };
  }
  // disagree
  if (e.decision !== 'DISAGREE' || e.verdict !== card.verdict) return { ok: false, reason: 'not-disagree' };
  if (acc.length) return { ok: false, reason: 'accepted-not-disagree' };
  return { ok: true, status: 'disagree', reason: 'gpt-disagree', line: e.line };
}

// 원문 읽기. ref(커밋 SHA)를 주면 그 커밋의 docs/team/<name>을 git에서 읽어 SHA에 묶는다. 없으면 작업 트리.
function readTeam(root, name, ref) {
  if (!name) return null;
  if (ref) { if (!/^[0-9a-f]{40}$/.test(ref)) throw Error('ref must be a full 40-hex commit SHA'); try { return cp.execFileSync('git', ['show', ref + ':docs/team/' + name], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } }
  const p = path.join(root, 'docs/team', name); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function verifyFile(json, root, ref) {
  const out = [];
  for (const c of (json && Array.isArray(json.cards) ? json.cards : [])) {
    if (!c || !c.consensus) continue;
    const x = c.consensus, day = typeof x.date === 'string' ? x.date.replace(/-/g, '') : '';
    const gpt = REVIEW_RE.test(String(x.review)) ? readTeam(root, x.review, ref) : null;
    const cla = /^\d{8}$/.test(day) ? readTeam(root, 'CLAUDE-AI-RECHECK-' + day + '.md', ref) : null;
    out.push(Object.assign({ ticker: c.ticker, market: c.market }, verifyCard(c, json.reviewedAt, gpt, cla)));
  }
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2), ri = args.indexOf('--ref'), ref = ri >= 0 ? args.splice(ri, 2)[1] : null, root = path.join(__dirname, '..');
  let bad = 0;
  for (const f of args) {
    const res = verifyFile(JSON.parse(fs.readFileSync(f, 'utf8')), root, ref);
    res.forEach((r) => { if (!r.ok) bad++; console.log((r.ok ? 'OK   ' : 'FAIL ') + f + ' ' + r.ticker + ' ' + r.market + ' ' + (r.status || '') + ' ' + r.reason); });
  }
  console.log(bad ? bad + ' card(s) fail — 합의 발행 보류' : 'all consensus evidence ok' + (ref ? ' @' + ref : ' (working tree)'));
  process.exit(bad ? 1 : 0);
}
module.exports = { parseGpt, parseClaude, verifyCard, verifyFile, VERDICTS };
