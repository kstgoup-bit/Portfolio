'use strict';
// 지피 GPT-REVIEW-postmerge-queue-20261125-1130 CR-B1·B2·B3 (순태씨 D2·D3·D5 승인 범위의 표시·검증 오류 수정).
// 합성 자료만 사용: 실제 KIS/GAS 호출·네트워크·실제 기록 없음. 가짜 JSONP·가짜 fetch.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const K = require('../has/kis-crosscheck.js'), R = require('../has/review-cards.js');
const KIS_SRC = fs.readFileSync(path.join(__dirname, '../has/kis-crosscheck.js'), 'utf8');
const now = Date.parse('2026-11-25T10:00:00+09:00');
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 30));

// ---------- CR-B1: 가격 신뢰도 띠 — 현재 보유 집합·최신성 ----------
const AB = ['005930', '000660'], AC = ['005930', '035720'], ABC = ['005930', '000660', '035720'];
const set = (t) => ({ tickers: t, total: t.length, fp: K.fingerprint(t) });
const rowOf = (t, o) => Object.assign({ d: '2026-11-24', at: now, n: t.length, matched: t.length, bad: [], total: t.length, fp: K.fingerprint(t) }, o);
test('CR-B1: 같은 개수 다른 집합(A/B 기록 → 현재 A/C)은 일치로 보이지 않음', () => {
  const s = K.trustSummary(rowOf(AB), now, false, set(AC)); a.equal(s.sev, 'warn'); a.match(s.text, /보유 종목이 바뀌어/); a.doesNotMatch(s.text, /✅/);
});
test('CR-B1: 종목 추가·삭제·0종목·현재 집합 미확인(null)', () => {
  a.equal(K.trustSummary(rowOf(AB), now, false, set(ABC)).sev, 'warn'); // 추가
  a.equal(K.trustSummary(rowOf(ABC), now, false, set(AB)).sev, 'warn'); // 삭제
  const zero = K.trustSummary(rowOf(AB), now, false, set([])); a.equal(zero.sev, 'info'); a.match(zero.text, /현재 국내 보유 없음 · 지난 KIS 대조\(2026-11-24\)는 참고만/);
  const unk = K.trustSummary(rowOf(AB), now, false, null); a.equal(unk.sev, 'info'); a.match(unk.text, /현재 보유와 연결 확인 못 함/);
});
test('CR-B1: 집합이 같고 6일 이내 같은 종가여도 녹색(ok) 없음 — 공식 거래일·시세 종류 미확인 참고 대조', () => {
  for (const d of ['2026-11-24', '2026-11-19', '2026-11-21']) { // 최신 · 양쪽 함께 지연(6일 이내) · 주말(휴장 불명)
    const s = K.trustSummary(rowOf(AB, { d }), now, false, set(AB)); a.equal(s.sev, 'info', d); a.match(s.text, /참고 대조\(공식 거래일·시세 종류 미확인\)/); a.doesNotMatch(s.text, /✅/);
  }
});
test('CR-B1: 최신 조회 실패 후 과거 row는 현재 검증이 아님(warn)', () => {
  const s = K.trustSummary(rowOf(AB), now, false, set(AB), true); a.equal(s.sev, 'warn'); a.match(s.text, /최근 KIS 조회 실패 · 2026-11-24 대조 기록은 참고만/);
});
test('CR-B1 화면: KIS 참고 대조는 기존 가격 경고(warn)를 낮추지 못하고, 현재 집합(수량>0·중복 제거) 기준으로 비교', () => {
  const T = require('../has/price-trust.js');
  const dom = new JSDOM('<!doctype html><head></head><body><div id="hasPriceTrust"></div></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval('var domStocks=[{ticker:"005930",quantity:1},{ticker:"000660",quantity:2},{ticker:"000660",quantity:1},{ticker:"035720",quantity:0}], ovStocks=[], penStocks=[], genStocks=[], freshPrice={};');
  w.HASPriceTrust = T;
  w.localStorage.setItem(K.LOG_KEY, JSON.stringify({ v: 1, autoDay: '', rows: [rowOf(AB, { d: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() - 86400000)) })] }));
  w.eval(KIS_SRC); w.eval(fs.readFileSync(path.join(__dirname, '../has/price-trust-ui.js'), 'utf8'));
  const cs = w.HASKISCrossCheck.currentSet(); a.deepEqual([...cs.tickers], AB); a.equal(cs.fp, K.fingerprint(AB));
  w.HASPriceTrustUI.refresh();
  const box = w.document.getElementById('hasPriceTrust');
  a.equal(T.sourceNotice('gas-jsonp', null, new Date().toISOString()).severity, 'warn'); // 앱 가격 경로는 미검증 warn
  a.ok(box.classList.contains('hpt-warn')); a.ok(!box.classList.contains('hpt-ok')); a.ok(!box.classList.contains('hpt-info'));
  a.match(box.querySelector('.hpt-head').textContent, /미검증 가격/); // 기존 경고 문구 유지
  a.match(box.querySelector('[data-testid=hpt-kis]').textContent, /참고 대조/);
  // 보유를 A/C로 바꾸면 같은 기록은 '보유 종목이 바뀌어'
  w.eval('domStocks=[{ticker:"005930",quantity:1},{ticker:"035720",quantity:1}]'); w.HASPriceTrustUI.refresh();
  a.match(box.querySelector('[data-testid=hpt-kis]').textContent, /보유 종목이 바뀌어/);
  w.eval('domStocks=[]'); w.HASPriceTrustUI.refresh();
  a.match(box.querySelector('[data-testid=hpt-kis]').textContent, /현재 국내 보유 없음/);
});

// ---------- CR-B2: 연속 집계·자동 재시도 ----------
test('CR-B2: 응답 날짜 사이 평일이 비면 끊음(11/20·11/24만 응답 → 11/23 누락), 날짜 중복 제거', () => {
  const FP = K.fingerprint(AB), r = (d) => ({ d, at: 1, n: 2, matched: 2, bad: [], total: 2, fp: FP });
  const log = { v: 1, autoDay: '', rows: [r('2026-11-20'), r('2026-11-24')] };
  a.equal(K.streak(log, ['2026-11-20', '2026-11-24']), 1);
  a.equal(K.streak(log, ['2026-11-24', '2026-11-24', '2026-11-20', '2026-11-20']), 1);
  const full = { v: 1, autoDay: '', rows: [r('2026-11-20'), r('2026-11-23'), r('2026-11-24')] };
  a.equal(K.streak(full, ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-24']), 3); // 주말만 건너뜀
});
async function kisDom(storage, opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><head></head><body><div id="m"></div></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  if (o.now) w.Date.now = () => o.now;
  const realST = w.setTimeout.bind(w); w.setTimeout = (f, ms) => realST(f, Math.min(ms || 0, 5)); // 스케줄러 지연만 줄임(5초·3초·20초 → 5ms)
  w.gasUrl = 'https://script.google.com/macros/s/SYNTHETIC_ID/exec'; w.domStocks = [{ ticker: '005930', name: '합성', quantity: 1 }];
  for (const [k, v] of Object.entries(storage || {})) w.localStorage.setItem(k, v);
  const orig = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (el) => {
    if (el.tagName === 'SCRIPT') { const u = new URL(el.src), type = u.searchParams.get('type'), cb = u.searchParams.get('callback'); calls.push(type); realST(() => w[cb](w.JSON.parse(JSON.stringify(o.reply ? o.reply(type) : (type === 'kis' ? { error: 'kis-failed' } : {})))), 0); return el; }
    return orig(el);
  };
  if (w.document.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r)); // 자연 DOMContentLoaded가 지난 뒤 싣는다(스케줄러는 시험이 직접 발생)
  w.eval(KIS_SRC);
  const box = w.document.getElementById('m'); w.HASKISCrossCheck.mount(box);
  return { w, calls, box, dump: () => ({ [K.LOG_KEY]: w.localStorage.getItem(K.LOG_KEY) }) };
}
const kisCalls = (c) => c.filter((x) => x === 'kis').length;
test('CR-B2: 실제 스케줄러 경로 — 첫 자동 1회, 실패 후 다시 보이기(visibility)·10분 뒤·새 인스턴스에서도 같은 날 재시도 없음', async () => {
  const t0 = Date.now();
  const A = await kisDom({}, { now: t0 });
  A.w.document.dispatchEvent(new A.w.Event('DOMContentLoaded')); await tick(80);
  a.equal(kisCalls(A.calls), 1); a.match(A.box.textContent, /오늘 자동 대조 실패 — 자동 대조는 하루 1회/);
  A.w.document.dispatchEvent(new A.w.Event('visibilitychange')); await tick(80);
  a.equal(kisCalls(A.calls), 1); // 3번째·2번째 시도 실제 차단
  A.w.Date.now = () => t0 + 11 * 60000; A.w.HASKISCrossCheck.run(true); await tick(40);
  a.equal(kisCalls(A.calls), 1); // 10분 지나도 같은 날 자동 없음
  const B = await kisDom(A.dump(), { now: t0 + 12 * 60000 }); // 앱을 다시 열거나 새 탭
  B.w.document.dispatchEvent(new B.w.Event('DOMContentLoaded')); await tick(80);
  a.equal(kisCalls(B.calls), 0);
  // 날짜가 바뀌면 그날 1회
  const C = await kisDom(A.dump(), { now: t0 + 86400000 });
  C.w.document.dispatchEvent(new C.w.Event('DOMContentLoaded')); await tick(80);
  a.equal(kisCalls(C.calls), 1);
});
test('CR-B2: 기록을 남길 수 없으면(저장 실패) 자동 대조 안 함, 버튼(수동)은 그대로', async () => {
  const A = await kisDom({});
  A.w.Storage.prototype.setItem = () => { throw Error('quota'); }; // 실제 Storage 쓰기 실패 흉내
  A.w.HASKISCrossCheck.run(true); await tick(40);
  a.equal(kisCalls(A.calls), 0); a.match(A.box.textContent, /자동 대조를 하지 않습니다/);
  A.w.HASKISCrossCheck.run(); await tick(40); a.equal(kisCalls(A.calls), 1);
});
test('CR-B2: 부분 성공(KIS 응답, Yahoo 없음)·실패 뒤에는 이전 성공 기록을 현재 연속 집계로 보이지 않음', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const FP = K.fingerprint(['005930']), prev = { v: 1, autoDay: '', rows: [{ d: '2026-11-23', at: 1, n: 1, matched: 1, bad: [], total: 1, fp: FP }, { d: '2026-11-24', at: 1, n: 1, matched: 1, bad: [], total: 1, fp: FP }] };
  const bars = [{ d: '2026-11-23', c: 100 }, { d: '2026-11-24', c: 101 }].filter((b) => b.d < today);
  const A = await kisDom({ [K.LOG_KEY]: JSON.stringify(prev) }, { reply: (t) => t === 'kis' ? { '005930': { source: 'kis-daily', symbol: '005930', currency: 'KRW', bars } } : {} });
  A.w.HASKISCrossCheck.run(); await tick(60);
  a.equal(A.w.HASKISCrossCheck.lastFail(), true);
  a.match(A.box.textContent, /연속 집계: 현재 보유와 맞는 최신 성공 기록이 없어 표시하지 않음/);
  a.doesNotMatch(A.box.textContent, /연속 일치 \d+일/);
});
test('CR-B2: 최신일 일치와 20일 비교창 전체 일치를 화면에서 분리, 연속 집계는 참고·G0 근거 아님', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const days = []; for (let i = 1; days.length < 3; i++) { const d = new Date(Date.parse(today + 'T00:00:00Z') - i * 86400000); if (d.getUTCDay() % 6) days.unshift(d.toISOString().slice(0, 10)); }
  const y = days.map((d, i) => ({ d, c: i === 0 ? 90 : 100 + i })), k = days.map((d, i) => ({ d, c: 100 + i })); // 가장 옛날 하루만 차이(과거 partial)
  const A = await kisDom({}, { reply: (t) => t === 'kis' ? { '005930': { source: 'kis-daily', symbol: '005930', currency: 'KRW', bars: k } } : { '005930': { source: 'yahoo-chart-v8', symbol: '005930.KS', currency: 'KRW', bars: y } } });
  A.w.HASKISCrossCheck.run(); await tick(60);
  const t = A.box.textContent;
  a.match(t, /최신 종가 일치 1 · 20일 비교창 전체 일치 0/);
  a.match(t, /최신 종가 일치 1\/1\(20일 비교창 전체 일치와는 별개\)/);
  a.match(t, /확인된 응답 날짜 기준 연속 일치 1일 \(참고 집계 · 공식 거래일 연속·G0 근거 아님/);
  a.doesNotMatch(t, /보류 해제를 검토합니다/);
});

// ---------- CR-B3: 합의 상태를 상세·요약·보유 띠에 같은 정책으로 ----------
const RD = '2026-11-25T07:45:00+09:00', REV = 'GPT-REVIEW-ai-review-20261125-0730.md';
const cons = (t, v, o) => Object.assign({ status: 'agreed', review: REV, date: '2026-11-25', ticker: t, market: 'KR', verdict: v }, o);
const hc = (t, v, c) => ({ ticker: t, market: 'KR', name: '합성' + t, verdict: v, headline: '원문 ' + t, reasons: ['r'], risks: ['k'], sources: [], consensus: c });
const MIX = [
  hc('S1', 'sell-review', cons('S1', 'sell-review')), // 합의
  hc('S2', 'sell-review', cons('S2', 'sell-review', { status: 'disagree' })),
  hc('S3', 'trim-review', cons('S3', 'trim-review', { status: 'no-response' })),
  hc('S4', 'trim-review', cons('S4', 'trim-review', { date: '2026-11-17', review: 'GPT-REVIEW-ai-review-20261117-0730.md' })), // 다른 날짜 → 기록 불일치
  hc('S5', 'hold-long', cons('S5', 'sell-review')), // 판단 불일치 → mismatch
  hc('S6', 'sell-review', undefined), // 단독
  hc('S7', 'hold-long', cons('S7', 'hold-long', { review: 'GPT-REVIEW-ai-review-2026112-0730.md' })), // 잘못된 파일명
  hc('S8', 'add-review', cons('S8', 'add-review')) // 매수 쪽: 합의여도 판단 보류
];
function revDom(cards, nowMs) {
  const dom = new JSDOM('<!doctype html><body><div id="hasBriefStrip"><div class="hdb-head">머리줄</div></div><section id="m"></section></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window; w.Date.now = () => nowMs;
  const D = { v: 1, reviewedAt: RD, reviewer: 'Claude', notice: '투자 자문이 아닙니다.', cards };
  w.fetch = (u) => Promise.resolve({ ok: /holdings|\/latest\.json$/.test(u), json: () => Promise.resolve(JSON.parse(JSON.stringify(D))) });
  w.eval(fs.readFileSync(path.join(__dirname, '../has/review-cards.js'), 'utf8'));
  return w;
}
test('CR-B3: 보유 띠는 합의된 비매수 판단만 판단 건수, 나머지는 합의 상태 건수(행동 집계 제외)', async () => {
  const w = revDom(MIX, Date.parse('2026-11-25T09:00:00+09:00'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick(); await tick();
  const b = w.document.querySelector('[data-testid=hdb-ai-hold]').textContent;
  a.match(b, /지피 합의 매도 검토 1/); a.doesNotMatch(b, /(^|· )매도 검토 [2-9]/); a.doesNotMatch(b, /비중 축소 검토|장기보유|추가 매수/);
  a.match(b, /클로 단독 의견 1/); a.match(b, /기록이 이 판단과 맞지 않음\) 3/); a.match(b, /지피 응답 없음 · 보류 1/); a.match(b, /의견 불일치로 보류 1/); a.match(b, /매수 쪽 판단 보류/);
  w.HASReviewCards.openHoldings();
  const pane = w.document.getElementById('hasHoldReview'), tally = pane.querySelector('[data-testid=review-tally]').textContent;
  a.equal(tally.replace(/[^\d]/g, '').split('').reduce((s, x) => s + +x, 0), 7); // 매수 쪽 1장은 건수 없음
  const arts = [...pane.querySelectorAll('article')].map((x) => x.textContent), art = (t) => arts.find((x) => x.includes('(' + t + ')'));
  a.match(art('S1'), /🔴 매도 검토/); a.doesNotMatch(art('S1'), /합의 전 참고/);
  a.doesNotMatch(art('S2'), /매도 검토/); a.doesNotMatch(art('S3'), /비중 축소 검토/);
  for (const t of ['S4', 'S5', 'S6', 'S7']) { a.doesNotMatch(art(t), /🔴|🟠|🔵/); a.match(art(t), /클로 조사 원문 판단: .+ \(합의 전 참고 · 현재 합의된 행동 아님\)/); a.match(art(t), /📝 클로 조사 의견\(원문 인용 · 합의 전 참고\): 원문/); }
  a.match(art('S8'), /판단 보류/); a.doesNotMatch(art('S8'), /🟢/);
});
test('CR-B3: 7일 경계 — 7일째까지 합의, 넘으면 만료(행동 집계 제외)', async () => {
  const at = (iso) => R.policyOf(MIX[0], { reviewedAt: RD }, Date.parse(iso));
  a.equal(at('2026-12-02T00:00:00+09:00').cs, 'agreed'); a.equal(at('2026-12-02T00:00:00+09:00').action, true);
  a.equal(at('2026-12-02T00:00:01+09:00').cs, 'expired'); a.equal(at('2026-12-02T00:00:01+09:00').action, false);
  const w = revDom([MIX[0]], Date.parse('2026-12-03T09:00:00+09:00'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick(); await tick();
  const b = w.document.querySelector('[data-testid=hdb-ai-hold]').textContent; a.doesNotMatch(b, /매도 검토/); a.match(b, /합의 기한\(7일\) 지남 · 다시 확인 필요 1/);
});
test('CR-B3: 같은 날짜 다른 근거(종목·판단 다름)·잘못된 시각은 합의로 올리지 않음', () => {
  const d = { reviewedAt: RD }, n = Date.parse('2026-11-25T09:00:00+09:00');
  a.equal(R.policyOf(hc('X', 'sell-review', cons('Y', 'sell-review')), d, n).cs, 'mismatch');
  a.equal(R.policyOf(hc('X', 'sell-review', cons('X', 'trim-review')), d, n).cs, 'mismatch');
  a.equal(R.policyOf(hc('X', 'sell-review', cons('X', 'sell-review')), { reviewedAt: 'not-a-date' }, n).cs, 'mismatch');
  a.equal(R.policyOf(hc('X', 'sell-review', cons('X', 'sell-review')), { reviewedAt: '2026-11-24T23:00:00+09:00' }, n).cs, 'mismatch');
});
test('CR-B3 발행 계약: 게시 JSON에 consensus가 있으면 docs/team의 그 검토 파일이 있고 종목·APPROVE/AGREE 근거가 있어야 함(일괄 승격 금지)', () => {
  const dir = path.join(__dirname, '../reviews'), team = path.join(__dirname, '../docs/team');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    for (const c of (j && Array.isArray(j.cards) ? j.cards : [])) {
      if (!c || !c.consensus) continue;
      const p = path.join(team, String(c.consensus.review || ''));
      a.ok(/^GPT-REVIEW-ai-review-\d{8}-\d{4}\.md$/.test(c.consensus.review) && fs.existsSync(p), f + ' ' + c.ticker + ': 검토 파일 없음');
      const body = fs.readFileSync(p, 'utf8'); a.ok(body.includes(c.ticker) && /APPROVE|AGREE/.test(body), f + ' ' + c.ticker + ': 종목별 합의 근거 없음');
    }
  }
});
