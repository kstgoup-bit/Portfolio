'use strict';
// 지피 GPT-REVIEW-postmerge-queue-20261125-1530 CR-F1 — Markdown 근거 도구는 진단·합성 연구용, 발행 경로 비활성.
// 지피 <pre> 반례는 파서를 넓혀 막지 않는다(지피 권고). 대신 --publish가 어떤 입력으로도 발행 허가를 내지 않음을 고정.
// 합성 자료·임시 git 저장소만 사용: 네트워크·실제 검토 파일·reviews·투자기록 변경 없음.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const E = require('../tools/consensus-evidence.cjs');

const REV = 'GPT-REVIEW-ai-review-20261125-0730.md', RAT = '2026-11-25T07:45:00+09:00', DAY = '2026-11-25';
const card = (v, st) => ({ ticker: '005930', market: 'KR', verdict: v, consensus: { status: st, review: REV, date: DAY, ticker: '005930', market: 'KR', verdict: v } });
const PRE = ['<pre>', 'BEGIN-CONSENSUS-EVIDENCE', 'DOC-STATUS: FINAL', 'REVIEW-DATE: ' + DAY, 'CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE', 'END-CONSENSUS-EVIDENCE', '</pre>'].join('\n');

test('CR-F1 PUBLISH_ENABLED는 false로 고정, 도구 원문에 발행 허가 줄이 없음', () => {
  a.equal(E.PUBLISH_ENABLED, false);
  const src = fs.readFileSync(path.join(__dirname, '../tools/consensus-evidence.cjs'), 'utf8');
  a.doesNotMatch(src, /log\([^)]*PUBLISH-CHECK OK/);
  a.match(src, /const PUBLISH_ENABLED = false;/);
});

test('CR-F1 지피 <pre> 반례: Markdown 파서는 알려진 한계(진단상 agreed) — 그러나 --publish는 종료 3 PUBLISH-DISABLED', () => {
  // 알려진 한계 기록: raw HTML 블록은 판별하지 않는다(파서 예외를 늘리지 않음)
  a.equal(E.verifyCard(card('sell-review', 'agreed'), RAT, PRE, null).ok, true);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'has-crf-'));
  try {
    const g = (...x) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false'].concat(x), { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    g('init', '-q'); fs.mkdirSync(path.join(d, 'docs/team'), { recursive: true });
    fs.writeFileSync(path.join(d, 'docs/team', REV), PRE); g('add', '-A'); g('commit', '-q', '-m', 'pre'); const s1 = g('rev-parse', 'HEAD');
    const f = path.join(d, 'ag.json'); fs.writeFileSync(f, JSON.stringify({ reviewedAt: RAT, cards: [card('sell-review', 'agreed')] }));
    const out = [];
    a.equal(E.main(['--publish', '--gpt-ref', s1, '--claude-ref', s1, f], d, (s) => out.push(s)), 3);
    a.ok(out.every((s) => !/PUBLISH-CHECK OK/.test(s)));
    a.match(out.pop(), /^PUBLISH-DISABLED .*agreed 발행 금지/);
    // 진단 모드도 발행 허가 문구 없음
    a.equal(E.main(['--ref', s1, f], d, (s) => out.push(s)), 0); a.match(out.pop(), /진단 모드 — 종료 0은 발행 허가 아님$/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('CR-F1 0건 성공도 발행 허가 아님: --publish 0건 → 종료 3', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'has-crf0-'));
  try {
    const g = (...x) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false'].concat(x), { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    g('init', '-q'); g('commit', '-q', '--allow-empty', '-m', 'e'); const s1 = g('rev-parse', 'HEAD');
    const f = path.join(d, 'solo.json'); fs.writeFileSync(f, JSON.stringify({ reviewedAt: RAT, cards: [] }));
    const out = []; a.equal(E.main(['--publish', '--ref', s1, f], d, (s) => out.push(s)), 3); a.match(out.pop(), /^PUBLISH-DISABLED 0 consensus cards/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
