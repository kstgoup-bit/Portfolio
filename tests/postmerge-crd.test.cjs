'use strict';
// 지피 GPT-REVIEW-postmerge-queue-20261125-1330 CR-D1·CR-D2 — 합의 근거는 단일 기계 판독 영역만, 원문 고정·CLI 실패 폐쇄.
// 합성 자료·임시 git 저장소만 사용: 네트워크·실제 검토 파일·reviews·투자기록 변경 없음.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const E = require('../tools/consensus-evidence.cjs');

const REV = 'GPT-REVIEW-ai-review-20261125-0730.md', RAT = '2026-11-25T07:45:00+09:00', DAY = '2026-11-25';
const card = (v, st) => ({ ticker: '005930', market: 'KR', verdict: v, consensus: { status: st, review: REV, date: DAY, ticker: '005930', market: 'KR', verdict: v } });
const AG = 'CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE';
const region = (rows, o) => { o = o || {}; return ['BEGIN-CONSENSUS-EVIDENCE', 'DOC-STATUS: ' + (o.status || 'FINAL'), 'REVIEW-DATE: ' + (o.date || DAY)].concat(rows, ['END-CONSENSUS-EVIDENCE']).join('\n'); };
const acceptRegion = (rows, o) => { o = o || {}; return ['BEGIN-CLAUDE-ACCEPT', 'DOC-STATUS: ' + (o.status || 'FINAL'), 'REVIEW-DATE: ' + (o.date || DAY)].concat(rows, ['END-CLAUDE-ACCEPT']).join('\n'); };
const v = (body, c, cl) => E.verifyCard(c || card('sell-review', 'agreed'), RAT, body, cl === undefined ? null : cl);

// ---------- CR-D1: 예시·코드펜스·주석·초안은 근거 아님 ----------
test('CR-D1 지피 반례: 코드펜스 안 합성 예시 한 줄로는 agreed 불가(영역 없음)', () => {
  const body = 'VERDICT: APPROVE\n\n아래는 발행하지 않는 합성 예시:\n\n```\n' + AG + '\n```\n';
  const r = v(body); a.equal(r.ok, false); a.equal(r.reason, 'gpt-no-region');
});
test('CR-D1 코드펜스·~~~·HTML 주석(한 줄·여러 줄) 안의 영역 전체도 근거 아님', () => {
  for (const wrap of [(s) => '```text\n' + s + '\n```', (s) => '~~~\n' + s + '\n~~~', (s) => '<!--\n' + s + '\n-->', (s) => '<!-- ' + s.split('\n').join(' ') + ' -->'])
    a.equal(v('설명\n' + wrap(region([AG])) + '\n').reason, 'gpt-no-region');
});
test('CR-D1 들여쓰기·인용(>)·영역 밖 근거 줄은 무시', () => {
  a.equal(v('설명\n    ' + region([AG]).split('\n').join('\n    ')).reason, 'gpt-no-region');
  a.equal(v('> ' + region([AG]).split('\n').join('\n> ')).reason, 'gpt-no-region');
  // 영역 밖 예시 줄 + 빈 영역 → 근거 없음(evidence-missing), 영역 밖 줄로 합의 안 됨
  a.equal(v('예시: ' + AG + '\n' + AG + '\n' + region([])).reason, 'evidence-missing');
});
test('CR-D1 양성: 사람용 설명·예시 코드펜스와 함께 올바른 단일 영역 1개면 agreed', () => {
  const body = '# 지피 검토\n\n설명과 원문은 보존한다.\n\n```\n예시: ' + AG.replace('AGREE', 'DISAGREE') + '\n```\n\n' + region([AG]) + '\n\n추가 설명\n';
  const r = v(body); a.equal(r.ok, true); a.equal(r.status, 'agreed'); a.equal(r.reason, 'gpt-agree');
});
test('CR-D1 영역 구조 오류: 2개·중첩·닫히지 않음·END만·영역 안 다른 줄·영역 안 펜스/주석', () => {
  a.equal(v(region([AG]) + '\n' + region([])).reason, 'gpt-duplicate-region');
  a.equal(v('BEGIN-CONSENSUS-EVIDENCE\n' + region([AG])).reason, 'gpt-nested-region');
  a.equal(v(region([AG]).replace('END-CONSENSUS-EVIDENCE', '')).reason, 'gpt-unterminated-region');
  a.equal(v('END-CONSENSUS-EVIDENCE\n' + region([AG])).reason, 'gpt-end-without-begin');
  a.equal(v(region([AG, '설명 한 줄'])).reason, 'gpt-malformed-row');
  a.equal(v(region([AG, '<!-- 메모 -->'])).reason, 'gpt-markup-in-region');
  a.equal(v(region(['<!--', 'x', '-->', AG])).reason, 'gpt-markup-in-region');
  a.equal(v(region(['```', AG, '```'])).ok, false); // 펜스가 END까지 숨김 → 닫히지 않음
  a.equal(v(region(['  ' + AG])).reason, 'gpt-malformed-row'); // 영역 안 들여쓰기 줄도 허용 안 함
});
test('CR-D1 발행 문맥: 초안·상태 없음·중복 머리줄·검토일 불일치는 실패', () => {
  for (const st of ['DRAFT', 'final', 'FINAL (초안)', 'READY']) a.equal(v(region([AG], { status: st })).reason, 'gpt-not-final', st);
  a.equal(v(region([AG]).replace('DOC-STATUS: FINAL\n', '')).reason, 'gpt-header-missing-or-duplicate');
  a.equal(v(region([AG, 'DOC-STATUS: FINAL'])).reason, 'gpt-header-missing-or-duplicate');
  a.equal(v(region([AG], { date: '2026-11-24' })).reason, 'gpt-review-date-mismatch');
});
test('CR-D1 클로 수락도 단일 영역만: 펜스 예시·초안·영역 밖 줄은 수락 아님', () => {
  const g = region(['CONSENSUS-EVIDENCE: 005930 KR hold-long 2026-11-25 DISAGREE PROPOSE=trim-review']), c = card('trim-review', 'agreed');
  const ACC = 'CLAUDE-ACCEPT: 005930 KR trim-review 2026-11-25 ' + REV;
  a.equal(v(g, c, '예시\n```\n' + acceptRegion([ACC]) + '\n```').reason, 'claude-no-region');
  a.equal(v(g, c, acceptRegion([ACC], { status: 'DRAFT' })).reason, 'claude-not-final');
  a.equal(v(g, c, ACC + '\n' + acceptRegion([])).reason, 'claude-accept-missing');
  a.equal(v(g, c, acceptRegion([ACC]) + '\n' + acceptRegion([ACC])).reason, 'claude-duplicate-region');
  const r = v(g, c, '# 재검토\n\n동의 이유 설명\n\n' + acceptRegion([ACC])); a.equal(r.ok, true); a.equal(r.reason, 'gpt-propose-claude-accept');
});

// ---------- CR-D2: 원문 고정(합성 저장소)·입력·CLI 실패 폐쇄 ----------
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'has-crd-'));
  const g = (...x) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false'].concat(x), { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  g('init', '-q'); fs.mkdirSync(path.join(d, 'docs/team'), { recursive: true });
  const put = (n, s) => fs.writeFileSync(path.join(d, 'docs/team', n), s);
  const commit = (m) => { g('add', '-A'); g('commit', '-q', '--allow-empty', '-m', m); return g('rev-parse', 'HEAD'); };
  return { d, put, commit, rm: () => fs.rmSync(d, { recursive: true, force: true }) };
}
const RECHECK = 'CLAUDE-AI-RECHECK-20261125.md';
const PROP = region(['CONSENSUS-EVIDENCE: 005930 KR hold-long 2026-11-25 DISAGREE PROPOSE=trim-review']);
const ACC = acceptRegion(['CLAUDE-ACCEPT: 005930 KR trim-review 2026-11-25 ' + REV]);
const J = (c) => ({ reviewedAt: RAT, cards: [c] });

test('CR-D2 원문 고정: ref 커밋 원문으로 검사, 작업 트리 수정과 무관', () => {
  const R = repo();
  try {
    R.put(REV, region([AG])); const s1 = R.commit('gpt');
    R.put(REV, region([AG.replace('AGREE', 'DISAGREE')])); // 커밋 안 한 작업 트리 변경
    a.equal(E.verifyFile(J(card('sell-review', 'agreed')), R.d, s1)[0].ok, true);
    a.equal(E.verifyFile(J(card('sell-review', 'agreed')), R.d, null)[0].reason, 'disagree-not-agreed'); // 작업 트리는 바뀐 원문(고정 안 됨)
    const s0 = R.commit('change'); // 다른 원문 커밋
    a.equal(E.verifyFile(J(card('sell-review', 'agreed')), R.d, s0)[0].ok, false);
  } finally { R.rm(); }
});
test('CR-D2 지피·클로 원문 SHA를 따로 고정: 이견→수락은 각 커밋에 근거가 있어야 함', () => {
  const R = repo();
  try {
    R.put(REV, PROP); const sg = R.commit('gpt review');
    R.put(RECHECK, ACC); const sc = R.commit('claude accept');
    const c = card('trim-review', 'agreed');
    a.equal(E.verifyFile(J(c), R.d, { gpt: sg, claude: sc })[0].reason, 'gpt-propose-claude-accept');
    a.equal(E.verifyFile(J(c), R.d, { gpt: sg, claude: sg })[0].reason, 'claude-accept-missing'); // 수락 커밋 이전 원문
    // 누락: 지피 파일이 없는 커밋
    const R2 = repo();
    try { R2.put('x.md', 'x'); const e = R2.commit('empty'); a.equal(E.verifyFile(J(c), R2.d, { gpt: e, claude: e })[0].reason, 'review-file-missing'); } finally { R2.rm(); }
  } finally { R.rm(); }
});
test('CR-D2 입력 구조: cards 배열 아님·객체 아님·잘못된 카드는 빈 성공이 아니라 실패', () => {
  const root = path.join(__dirname, '..');
  for (const j of [null, [], 'x', {}, { cards: {} }, { cards: 'a' }]) { const r = E.verifyFile(j, root, null); a.equal(r.length, 1); a.equal(r[0].ok, false); }
  a.equal(E.verifyFile({ reviewedAt: RAT, cards: [null] }, root, null)[0].reason, 'bad-card');
  const s = E.verifyFile({ reviewedAt: RAT, cards: [{ ticker: 'A', market: 'US', verdict: 'wait' }] }, root, null);
  a.equal(s[0].ok, true); a.equal(s[0].status, 'solo');
});
test('CR-D2 CLI: 인자 없음·알 수 없는 옵션·잘못된 ref·없는 커밋은 종료 2, 0건은 0건으로 표시', () => {
  const R = repo();
  try {
    R.put(REV, region([AG])); const s1 = R.commit('gpt');
    const out = []; const log = (s) => out.push(s);
    a.equal(E.main([], R.d, log), 2); a.match(out.pop(), /입력 파일 1개 이상/);
    a.equal(E.main(['--bogus', 'f.json'], R.d, log), 2);
    a.equal(E.main(['--ref'], R.d, log), 2);
    const f = path.join(R.d, 'solo.json'); fs.writeFileSync(f, JSON.stringify({ reviewedAt: RAT, cards: [{ ticker: 'A', market: 'US', verdict: 'wait' }] }));
    a.equal(E.main(['--ref', 'main', f], R.d, log), 2); a.match(out.pop(), /40-hex/);
    a.equal(E.main(['--ref', '0'.repeat(40), f], R.d, log), 2); a.match(out.pop(), /not a commit/); // 카드 0건이어도 ref 검사
    a.equal(E.main(['--ref', s1, f], R.d, log), 0); a.match(out.pop(), /^0 consensus cards — 합의 근거 검사 대상 없음\(solo 1\) · gpt@[0-9a-f]{40} claude@[0-9a-f]{40}$/);
    a.equal(E.main([f], R.d, log), 0); a.match(out.pop(), /원문 고정 안 됨 — 발행용 아님/);
    const bad = path.join(R.d, 'bad.json'); fs.writeFileSync(bad, '{"cards":{}}');
    a.equal(E.main(['--ref', s1, bad], R.d, log), 1);
    fs.writeFileSync(path.join(R.d, 'broken.json'), '{'); a.equal(E.main(['--ref', s1, path.join(R.d, 'broken.json')], R.d, log), 1);
    const ag = path.join(R.d, 'ag.json'); fs.writeFileSync(ag, JSON.stringify(J(card('sell-review', 'agreed'))));
    a.equal(E.main(['--gpt-ref', s1, '--claude-ref', s1, ag], R.d, log), 0); a.match(out.pop(), /^1 consensus card\(s\) ok, solo 0/);
  } finally { R.rm(); }
});
