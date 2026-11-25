'use strict';
// 지피 GPT-REVIEW-postmerge-queue-20261125-1430 CR-E1·CR-E2 — 펜스 종류·길이 엄격 추적(애매하면 실패 폐쇄),
// 진단 모드/발행 검사 모드 구분, ref는 정확히 commit 객체, 원문 조회 장애 ≠ 부재.
// 합성 자료·임시 git 저장소만 사용: 네트워크·실제 검토 파일·reviews·투자기록 변경 없음.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const E = require('../tools/consensus-evidence.cjs');

const REV = 'GPT-REVIEW-ai-review-20261125-0730.md', RAT = '2026-11-25T07:45:00+09:00', DAY = '2026-11-25';
const card = (v, st) => ({ ticker: '005930', market: 'KR', verdict: v, consensus: { status: st, review: REV, date: DAY, ticker: '005930', market: 'KR', verdict: v } });
const AG = 'CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE';
const REG = ['BEGIN-CONSENSUS-EVIDENCE', 'DOC-STATUS: FINAL', 'REVIEW-DATE: ' + DAY, AG, 'END-CONSENSUS-EVIDENCE'];
const ACC = 'CLAUDE-ACCEPT: 005930 KR trim-review 2026-11-25 ' + REV;
const AREG = ['BEGIN-CLAUDE-ACCEPT', 'DOC-STATUS: FINAL', 'REVIEW-DATE: ' + DAY, ACC, 'END-CLAUDE-ACCEPT'];
const PROP = ['BEGIN-CONSENSUS-EVIDENCE', 'DOC-STATUS: FINAL', 'REVIEW-DATE: ' + DAY, 'CONSENSUS-EVIDENCE: 005930 KR hold-long 2026-11-25 DISAGREE PROPOSE=trim-review', 'END-CONSENSUS-EVIDENCE'].join('\n');
const v = (body, c, cl) => E.verifyCard(c || card('sell-review', 'agreed'), RAT, body, cl === undefined ? null : cl);
const J = (c) => ({ reviewedAt: RAT, cards: [c] });

// ---------- CR-E1: 지피 반례와 혼합 펜스 ----------
test('CR-E1 지피 반례: ```` 펜스 안 ``` 줄로 영역 전체를 노출해도 agreed 불가', () => {
  const body = ['````markdown', '```'].concat(REG, ['```', '````']).join('\n');
  const r = v(body); a.equal(r.ok, false); a.equal(r.reason, 'gpt-ambiguous-fence'); a.equal(r.line, 2);
});
test('CR-E1 혼합·짧은·뒤 글자 펜스는 애매한 문맥 → 문서 전체 실패(지피)', () => {
  const cases = [
    ['~~~', '```'].concat(REG, ['```', '~~~']), // ~~~ 안 ```
    ['```', '~~~'].concat(REG, ['~~~', '```']), // ``` 안 ~~~
    ['````', '```'].concat(REG, ['````']), // 짧은 닫힘 후보
    ['```', '``` 닫힘 아님'].concat(REG, ['```']), // 뒤 글자 있는 닫힘 후보
    ['~~~~', '~~~ x'].concat(REG, ['~~~~']),
  ];
  for (const c of cases) { const r = v(c.join('\n')); a.equal(r.ok, false, c[0] + '/' + c[1]); a.equal(r.reason, 'gpt-ambiguous-fence', c[0] + '/' + c[1]); }
  // 정보 문자열에 `가 있는 여는 줄(인라인 코드와 혼동)
  a.equal(v('```a`b```\n' + REG.join('\n')).reason, 'gpt-ambiguous-fence');
});
test('CR-E1 닫히지 않은 펜스·주석, 주석 안 <!-- 는 실패 폐쇄', () => {
  a.equal(v(REG.join('\n') + '\n\n```\n예시').reason, 'gpt-unterminated-fence');
  a.equal(v('````\n' + REG.join('\n')).reason, 'gpt-unterminated-fence');
  a.equal(v(REG.join('\n') + '\n<!-- 메모').reason, 'gpt-unterminated-comment');
  a.equal(v('<!--\n<!--\n-->\n' + REG.join('\n')).reason, 'gpt-ambiguous-comment');
  a.equal(v('<!-- a --> 글 <!-- b\n' + REG.join('\n') + '\n-->').reason, 'gpt-no-region'); // 한 줄에서 다시 열린 주석은 계속 주석
});
test('CR-E1 양성: 같은 종류·같거나 긴 닫힘, 뒤 공백, 정보 문자열이 있는 정상 펜스 뒤의 영역은 agreed', () => {
  for (const pre of [['```js', 'x', '```'], ['````', 'x', '`````'], ['~~~ text', 'x', '~~~   '], ['   ```', 'x', '  ```'], ['<!-- 메모 -->'], ['<!--', '메모', '-->']]) {
    const r = v(['# 지피 검토', ''].concat(pre, [''], REG, ['', '끝']).join('\n'));
    a.equal(r.ok, true, pre.join('|')); a.equal(r.reason, 'gpt-agree');
  }
});
test('CR-E1 클로 수락 영역도 같은 엄격 규칙', () => {
  const c = card('trim-review', 'agreed');
  a.equal(v(PROP, c, ['````markdown', '```'].concat(AREG, ['```', '````']).join('\n')).reason, 'claude-ambiguous-fence');
  a.equal(v(PROP, c, ['~~~', '```'].concat(AREG, ['```', '~~~']).join('\n')).reason, 'claude-ambiguous-fence');
  a.equal(v(PROP, c, AREG.join('\n') + '\n```').reason, 'claude-unterminated-fence');
  const r = v(PROP, c, ['# 재검토', '```', '예시', '```', ''].concat(AREG).join('\n')); a.equal(r.ok, true); a.equal(r.reason, 'gpt-propose-claude-accept');
});
test('CR-E1 plainLines는 애매한 문맥에서 빈 결과 대신 예외', () => {
  a.throws(() => E.plainLines('````\n```\nx\n```\n````'), /ambiguous-fence/);
  a.deepEqual(E.plainLines('a\n```\nb\n```\nc').map((l) => l.s), ['a', 'c']);
});

// ---------- CR-E2: 발행 검사/진단 구분, commit 객체, 조회 장애 ----------
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'has-cre-'));
  const g = (...x) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'].concat(x), { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  g('init', '-q'); fs.mkdirSync(path.join(d, 'docs/team'), { recursive: true });
  const put = (n, s) => fs.writeFileSync(path.join(d, 'docs/team', n), s);
  const commit = (m) => { g('add', '-A'); g('commit', '-q', '--allow-empty', '-m', m); return g('rev-parse', 'HEAD'); };
  return { d, g, put, commit, rm: () => fs.rmSync(d, { recursive: true, force: true }) };
}

test('CR-E2 --publish: 두 ref 필수(없거나 하나면 종료 2), 성공 줄은 PUBLISH-CHECK OK', () => {
  const R = repo();
  try {
    R.put(REV, REG.join('\n')); const s1 = R.commit('gpt');
    const out = [], log = (s) => out.push(s);
    const f = path.join(R.d, 'ag.json'); fs.writeFileSync(f, JSON.stringify(J(card('sell-review', 'agreed'))));
    a.equal(E.main(['--publish', f], R.d, log), 2); a.match(out.pop(), /--publish requires/);
    a.equal(E.main(['--publish', '--gpt-ref', s1, f], R.d, log), 2);
    a.equal(E.main(['--publish', '--claude-ref', s1, f], R.d, log), 2);
    a.equal(E.main(['--publish', '--gpt-ref', s1, '--claude-ref', s1, f], R.d, log), 0); a.match(out.pop(), /^PUBLISH-CHECK OK 1 consensus card\(s\) ok/);
    a.equal(E.main(['--publish', '--ref', s1, f], R.d, log), 0); a.match(out.pop(), /^PUBLISH-CHECK OK /);
    // 진단 모드: 종료 0이어도 발행 허가 문구 없음, 명시적 경고
    a.equal(E.main([f], R.d, log), 0); const d = out.pop(); a.doesNotMatch(d, /PUBLISH-CHECK/); a.match(d, /진단 모드 — 종료 0은 발행 허가 아님/); a.match(d, /원문 고정 안 됨/);
    a.equal(E.main(['--ref', s1, f], R.d, log), 0); a.match(out.pop(), /진단 모드 — 종료 0은 발행 허가 아님$/);
    // 발행 검사에서 근거 실패는 1, PUBLISH-CHECK OK 없음
    const bad = path.join(R.d, 'bad.json'); fs.writeFileSync(bad, JSON.stringify(J(card('wait', 'agreed'))));
    a.equal(E.main(['--publish', '--ref', s1, bad], R.d, log), 1); a.ok(!out.some((s) => /^PUBLISH-CHECK OK/.test(s) && s.includes('bad')));
  } finally { R.rm(); }
});
test('CR-E2 ref는 정확히 commit 객체: 주석 태그·트리·blob SHA 거부', () => {
  const R = repo();
  try {
    R.put(REV, REG.join('\n')); const s1 = R.commit('gpt');
    R.g('tag', '-a', 'v1', '-m', 'tag', s1); const tagSha = R.g('rev-parse', 'v1'); a.notEqual(tagSha, s1);
    const tree = R.g('rev-parse', s1 + '^{tree}'), blob = R.g('rev-parse', s1 + ':docs/team/' + REV);
    for (const x of [tagSha, tree, blob]) a.throws(() => E.checkRef(R.d, x), /not a commit/);
    a.equal(E.checkRef(R.d, s1), s1);
    const f = path.join(R.d, 'ag.json'); fs.writeFileSync(f, JSON.stringify(J(card('sell-review', 'agreed'))));
    const out = []; a.equal(E.main(['--publish', '--ref', tagSha, f], R.d, (s) => out.push(s)), 2); a.match(out.pop(), /type tag/);
  } finally { R.rm(); }
});
test('CR-E2 원문 조회: 확인된 부재(null)와 조회 장애(예외·종료 2) 구분', () => {
  const R = repo();
  try {
    R.put(REV, REG.join('\n')); const s1 = R.commit('gpt');
    a.equal(E.readTeam(R.d, 'CLAUDE-AI-RECHECK-20261125.md', s1), null); // 커밋 트리에 없음 = 확인된 부재
    a.equal(E.readTeam(R.d, REV, s1), REG.join('\n'));
    // 경로가 디렉터리(blob 아님) → 장애
    fs.mkdirSync(path.join(R.d, 'docs/team', 'CLAUDE-AI-RECHECK-20261125.md')); fs.writeFileSync(path.join(R.d, 'docs/team', 'CLAUDE-AI-RECHECK-20261125.md', 'x'), 'x');
    const s2 = R.commit('dir');
    a.throws(() => E.readTeam(R.d, 'CLAUDE-AI-RECHECK-20261125.md', s2), /lookup-error/);
    a.throws(() => E.readTeam(R.d, 'CLAUDE-AI-RECHECK-20261125.md', null), /lookup-error/); // 작업 트리도 파일 아님 = 장애
    // blob 객체 손상(읽기 실패) → 장애, 부재로 보지 않음
    const blob = R.g('rev-parse', s1 + ':docs/team/' + REV);
    fs.rmSync(path.join(R.d, '.git/objects', blob.slice(0, 2), blob.slice(2)));
    a.throws(() => E.readTeam(R.d, REV, s1), /lookup-error/);
    const f = path.join(R.d, 'ag.json'); fs.writeFileSync(f, JSON.stringify(J(card('sell-review', 'agreed'))));
    const out = []; a.equal(E.main(['--publish', '--gpt-ref', s1, '--claude-ref', s1, f], R.d, (s) => out.push(s)), 2);
    a.match(out.pop(), /lookup error: .* — 판정 안 함/);
    // no-response 카드도 장애를 '파일 없음'으로 통과시키지 않음
    fs.writeFileSync(f, JSON.stringify(J(card('sell-review', 'no-response'))));
    a.equal(E.main(['--ref', s1, f], R.d, (s) => out.push(s)), 2);
  } finally { R.rm(); }
});
