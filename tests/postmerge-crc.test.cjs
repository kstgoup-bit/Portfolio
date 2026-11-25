'use strict';
// 지피 GPT-REVIEW-postmerge-queue-20261125-1230 CR-C1·CR-C2 (순태씨 D2·D3·D5 승인 범위의 표시·합의 검증 오류 수정).
// 합성 자료만 사용: 실제 KIS/GAS 호출·네트워크·실제 기록·실제 검토 파일 변경 없음.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const K = require('../has/kis-crosscheck.js'), E = require('../tools/consensus-evidence.cjs');
const KIS_SRC = fs.readFileSync(path.join(__dirname, '../has/kis-crosscheck.js'), 'utf8');
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 30));

// ---------- CR-C2: 공통 응답 날짜 20개 미만은 20일 일치로 세지 않음 ----------
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
function weekdaysBefore(n) { // 오늘 이전 평일 n개(오래된→최신)
  const out = []; for (let i = 1; out.length < n; i++) { const d = new Date(Date.parse(TODAY + 'T00:00:00Z') - i * 86400000); if (d.getUTCDay() % 6) out.unshift(d.toISOString().slice(0, 10)); }
  return out;
}
const Y = (bars) => ({ source: 'yahoo-chart-v8', symbol: '005930.KS', currency: 'KRW', bars });
const KI = (bars) => ({ source: 'kis-daily', symbol: '005930', currency: 'KRW', bars });
async function kisDom(yBars, kBars) {
  const dom = new JSDOM('<!doctype html><head></head><body><div id="m"></div></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window, realST = w.setTimeout.bind(w); w.setTimeout = (f, ms) => realST(f, Math.min(ms || 0, 5));
  w.gasUrl = 'https://script.google.com/macros/s/SYNTHETIC_ID/exec'; w.domStocks = [{ ticker: '005930', name: '합성', quantity: 1 }];
  const orig = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (el) => {
    if (el.tagName === 'SCRIPT') { const u = new URL(el.src), type = u.searchParams.get('type'), cb = u.searchParams.get('callback'); const r = type === 'kis' ? { '005930': KI(kBars) } : { '005930': Y(yBars) }; realST(() => w[cb](w.JSON.parse(JSON.stringify(r))), 0); return el; }
    return orig(el);
  };
  if (w.document.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r));
  w.eval(KIS_SRC);
  const box = w.document.getElementById('m'); w.HASKISCrossCheck.mount(box);
  w.HASKISCrossCheck.run(); await tick(60);
  return box.textContent;
}
const same = (days) => days.map((d, i) => ({ d, c: 1000 + i }));
const at = (days, ms) => K.compare(Y(same(days)), KI(same(days)), { ticker: '005930', now: ms || Date.now() });

test('CR-C2 compare: 1/1·19/19는 short(자료 부족), 20/20만 match, 20일 중 과거 차이는 partial', () => {
  const r1 = at(weekdaysBefore(1)); a.equal(r1.status, 'short'); a.equal(r1.checked, 1); a.equal(r1.matched, 1); a.equal(r1.full, false);
  const r19 = at(weekdaysBefore(19)); a.equal(r19.status, 'short'); a.equal(r19.checked, 19); a.equal(r19.full, false);
  const r20 = at(weekdaysBefore(20)); a.equal(r20.status, 'match'); a.equal(r20.checked, 20); a.equal(r20.full, true);
  const d = weekdaysBefore(20), yb = same(d); yb[0] = { d: d[0], c: 1 };
  const rp = K.compare(Y(yb), KI(same(d)), { ticker: '005930', now: Date.now() }); a.equal(rp.status, 'partial'); a.equal(rp.matched, 19);
  // 30일 줘도 비교는 최근 공통 20개까지
  a.equal(at(weekdaysBefore(30)).checked, 20);
});
test('CR-C2 compare: 출처 지연(한쪽 최신일 없음)은 일치 수와 상관없이 stale', () => {
  const d = weekdaysBefore(20), r = K.compare(Y(same(d)), KI(same(d.slice(0, 19))), { ticker: '005930', now: Date.now() });
  a.equal(r.status, 'stale'); a.equal(r.stale, 'source-lag');
});
test('CR-C2 DOM: 1/1 일치는 20일 일치로 세지 않고 자료 부족·공통 응답 날짜로 표시', async () => {
  const d = weekdaysBefore(1), t = await kisDom(same(d), same(d));
  a.match(t, /최신 종가 일치 1 · 공통 응답 20일 일치\(참고\) 0 · 20일 자료 부족 1/);
  a.match(t, /✅ 최신 종가 일치 · 20일 자료 부족/); a.match(t, /공통 응답 날짜 1일 중 1일 일치 \(자료 부족 · 20일 미만\)/);
  a.doesNotMatch(t, /최근 \d+거래일/); a.doesNotMatch(t, /20일 비교창 전체 일치/);
});
test('CR-C2 DOM: 19/19도 자료 부족, 20/20은 공통 응답 20일 일치(참고)·공식 거래일 아님', async () => {
  const d19 = weekdaysBefore(19), t19 = await kisDom(same(d19), same(d19));
  a.match(t19, /공통 응답 20일 일치\(참고\) 0 · 20일 자료 부족 1/); a.match(t19, /공통 응답 날짜 19일 중 19일 일치 \(자료 부족/);
  const d20 = weekdaysBefore(20), t20 = await kisDom(same(d20), same(d20));
  a.match(t20, /공통 응답 20일 일치\(참고\) 1 · 조회/); a.doesNotMatch(t20, /자료 부족/);
  a.match(t20, /✅ 공통 응답 20일 일치\(참고\)/); a.match(t20, /공통 응답 날짜 20일 중 20일 일치 \(공식 거래일 아님\)/);
});
test('CR-C2 DOM: 20일 중 과거 차이·누락일(한쪽만 있는 날)·출처 지연', async () => {
  const d = weekdaysBefore(21), yb = same(d.slice(1)); yb[0] = { d: d[1], c: 1 };
  const tp = await kisDom(yb, same(d.slice(1)));
  a.match(tp, /공통 응답 20일 일치\(참고\) 0/); a.match(tp, /공통 응답 날짜 20일 중 19일 일치 \(공식 거래일 아님\) · 차이 난 날/);
  // 누락일: Yahoo에만 하루 빠짐 → 공통 19일 → 자료 부족(달력 연속 주장 없음)
  const miss = same(d.slice(1)).filter((_, i) => i !== 5), tm = await kisDom(miss, same(d.slice(1)));
  a.match(tm, /공통 응답 날짜 19일 중 19일 일치 \(자료 부족/); a.match(tm, /20일 자료 부족 1/);
  // 출처 지연: KIS 최신일 없음
  const tl = await kisDom(same(d.slice(1)), same(d.slice(1, 20)));
  a.match(tl, /⏳ 미검증/); a.match(tl, /최신 종가 일치 0 · 공통 응답 20일 일치\(참고\) 0/);
});

// ---------- CR-C1: 합의 발행 근거(기계 판독 · 정확한 토큰) ----------
const REV = 'GPT-REVIEW-ai-review-20261125-0730.md', RAT = '2026-11-25T07:45:00+09:00';
const card = (v, st, o) => ({ ticker: '005930', market: 'KR', verdict: v, consensus: Object.assign({ status: st, review: REV, date: '2026-11-25', ticker: '005930', market: 'KR', verdict: v }, o) });
const RG = (kind, s, o) => { o = o || {}; const b = kind === 'gpt' ? 'CONSENSUS-EVIDENCE' : 'CLAUDE-ACCEPT'; return 'BEGIN-' + b + '\n' + (o.status === null ? '' : 'DOC-STATUS: ' + (o.status || 'FINAL') + '\n') + 'REVIEW-DATE: ' + (o.date || '2026-11-25') + '\n' + (s ? s + '\n' : '') + 'END-' + b; };
const L = (s, o) => 'VERDICT: APPROVE\n\n사람용 설명은 영역 밖에 그대로 둔다.\n\n' + RG('gpt', s, o) + '\n';
const C = (s, o) => '# 클로 재검토\n\n' + RG('claude', s, o) + '\n';
const ok = (c, g, cl) => E.verifyCard(c, RAT, g, cl === undefined ? null : cl);

test('CR-C1 양성: 그 종목·시장·판단·날짜 AGREE 정확히 1줄이면 agreed', () => {
  const r = ok(card('sell-review', 'agreed'), L('CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE'));
  a.equal(r.ok, true); a.equal(r.status, 'agreed');
});
test('CR-C1 음성: DISAGREE 문장·AGREE_NO_CHANGE·APPROVE·문장 속 AGREE는 합의 근거 아님', () => {
  for (const body of [
    '005930: DISAGREE (매도 검토 반대)', 'VERDICT: AGREE_NO_CHANGE\n005930 KR sell-review', 'VERDICT: APPROVE\n005930 매도 검토 AGREE 합니다',
    'CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 DISAGREE', 'CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE_NO_CHANGE'
  ]) a.equal(ok(card('sell-review', 'agreed'), L(body)).ok, false, body);
});
test('CR-C1 음성: 다른 종목·시장·판단·날짜, 중복·충돌, 형식 오류 줄, 파일 없음', () => {
  const c = card('sell-review', 'agreed');
  for (const line of ['CONSENSUS-EVIDENCE: 000660 KR sell-review 2026-11-25 AGREE', 'CONSENSUS-EVIDENCE: 005930 US sell-review 2026-11-25 AGREE', 'CONSENSUS-EVIDENCE: 005930 KR trim-review 2026-11-25 AGREE', 'CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-24 AGREE'])
    a.equal(ok(c, L(line)).ok, false, line);
  const A1 = 'CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE';
  a.equal(ok(c, L(A1 + '\n' + A1)).reason, 'duplicate-or-conflict');
  a.equal(ok(c, L(A1 + '\nCONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 DISAGREE')).reason, 'duplicate-or-conflict');
  a.equal(ok(c, L(A1 + '\nCONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25')).reason, 'gpt-malformed-row');
  a.equal(ok(c, L('CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE extra')).ok, false);
  a.equal(ok(c, null).reason, 'review-file-missing');
  // 카드 자체 consensus 필드 불일치·발행일 불일치
  a.equal(E.verifyCard(c, '2026-11-24T07:45:00+09:00', L(A1), null).reason, 'date-mismatch');
  a.equal(ok(card('sell-review', 'agreed', { ticker: '000660' }), L(A1)).reason, 'card-mismatch');
  a.equal(ok(card('sell-review', 'agreed', { review: 'GPT-REVIEW-ai-review-20261124-0730.md' }), L(A1)).reason, 'bad-review-name');
});
test('CR-C1 지피 이견 → 클로 동의: 양측 같은 최종 판단 명시 근거가 있어야 agreed', () => {
  const g = L('CONSENSUS-EVIDENCE: 005930 KR hold-long 2026-11-25 DISAGREE PROPOSE=trim-review');
  const c = card('trim-review', 'agreed');
  a.equal(ok(c, g, null).reason, 'claude-accept-missing');
  a.equal(ok(c, g, C('CLAUDE-ACCEPT: 005930 KR sell-review 2026-11-25 ' + REV)).ok, false); // 다른 판단에 동의
  a.equal(ok(c, g, C('CLAUDE-ACCEPT: 005930 KR trim-review 2026-11-25 GPT-REVIEW-ai-review-20261125-0731.md')).ok, false); // 다른 파일
  a.equal(ok(c, g, 'CLAUDE-ACCEPT: 005930 KR trim-review 2026-11-25 ' + REV).ok, false); // 영역 밖 줄은 수락 근거 아님
  const r = ok(c, g, C('CLAUDE-ACCEPT: 005930 KR trim-review 2026-11-25 ' + REV)); a.equal(r.ok, true); a.equal(r.reason, 'gpt-propose-claude-accept');
  // 원판단(hold-long)으로 agreed 발행은 불가(지피는 반대함)
  a.equal(ok(card('hold-long', 'agreed'), g, null).ok, false);
  // AGREE에 클로 수락 줄이 섞이면 모호 → 차단
  a.equal(ok(card('hold-long', 'agreed'), L('CONSENSUS-EVIDENCE: 005930 KR hold-long 2026-11-25 AGREE'), C('CLAUDE-ACCEPT: 005930 KR hold-long 2026-11-25 ' + REV)).ok, false);
});
test('CR-C1 disagree·no-response는 별도 규칙, 합의로 승격 안 함', () => {
  const D = L('CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 DISAGREE');
  a.equal(ok(card('sell-review', 'disagree'), D).status, 'disagree');
  a.equal(ok(card('sell-review', 'disagree'), L('CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE')).ok, false);
  a.equal(ok(card('sell-review', 'disagree'), null).ok, false); // 이견 근거 파일 없음
  a.equal(ok(card('sell-review', 'no-response'), null).status, 'no-response'); // 검토 파일 자체가 없어도 됨
  a.equal(ok(card('sell-review', 'no-response'), L('')).status, 'no-response'); // 유효 영역에 그 종목 줄 없음
  a.equal(ok(card('sell-review', 'no-response'), '다른 내용').ok, false); // 파일은 있는데 영역 없음 → 실패(fail-closed)
  a.equal(ok(card('sell-review', 'no-response'), D).reason, 'has-response'); // 응답이 있는데 무응답으로 발행 불가
  a.equal(ok(card('sell-review', 'bogus'), D).ok, false);
});
test('CR-C1 SHA 결합: ref는 40자리 실제 커밋만(없는 커밋은 카드 0건이어도 오류)', () => {
  const root = path.join(__dirname, '..');
  a.throws(() => E.verifyFile({ reviewedAt: RAT, cards: [card('sell-review', 'agreed')] }, root, 'main'), /40-hex/);
  a.throws(() => E.verifyFile({ reviewedAt: RAT, cards: [card('sell-review', 'agreed')] }, root, '0'.repeat(40)), /not a commit/);
  a.throws(() => E.verifyFile({ reviewedAt: RAT, cards: [] }, root, { gpt: '0'.repeat(40) }), /not a commit/);
});
test('CR-C1 발행 계약: 게시된 reviews/*.json의 모든 consensus 카드가 실제 검증 함수를 통과(일괄 승격 금지)', () => {
  const dir = path.join(__dirname, '../reviews'), root = path.join(__dirname, '..');
  let seen = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'index.json')) { // index.json은 목록 파일(카드 아님)
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    for (const r of E.verifyFile(j, root, null)) { seen++; a.ok(r.ok, f + ' ' + r.ticker + ': ' + r.reason); }
  }
  void seen; // 현재 게시 JSON에는 consensus 카드가 없다(0건). 새 합의 발행 시 이 시험이 실제로 검사한다.
});
