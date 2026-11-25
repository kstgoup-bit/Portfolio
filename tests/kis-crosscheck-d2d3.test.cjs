'use strict';
// 지피 사후 검토 CR-2·CR-3, 순태씨 D2·D3 승인(2026-11-25). 합성 자료만, 네트워크·저장소 없음.
const test = require('node:test'), a = require('node:assert/strict'), K = require('../has/kis-crosscheck.js');
const now = Date.parse('2026-11-25T10:00:00+09:00');
const Y = (bars) => ({ source: 'yahoo-chart-v8', symbol: '005930.KS', currency: 'KRW', bars });
const KI = (bars) => ({ source: 'kis-daily', symbol: '005930', currency: 'KRW', bars });
const b = (d, c) => ({ d, c });
test('D2: 두 출처 최신 확정일이 다르면(한쪽 지연) match가 아니라 stale', () => {
  const r = K.compare(Y([b('2026-11-20', 100), b('2026-11-23', 101)]), KI([b('2026-11-20', 100), b('2026-11-23', 101), b('2026-11-24', 102)]), { ticker: '005930', now });
  a.equal(r.status, 'stale'); a.equal(r.stale, 'source-lag'); a.equal(r.latest.match, true);
});
test('D2: 양쪽이 같은 오래된 날짜만 주면 stale(old)', () => {
  const r = K.compare(Y([b('2026-11-10', 100), b('2026-11-11', 101)]), KI([b('2026-11-10', 100), b('2026-11-11', 101)]), { ticker: '005930', now });
  a.equal(r.status, 'stale'); a.equal(r.stale, 'old');
  const ok = K.compare(Y([b('2026-11-23', 100), b('2026-11-24', 101)]), KI([b('2026-11-23', 100), b('2026-11-24', 101)]), { ticker: '005930', now });
  a.equal(ok.status, 'short'); a.equal(ok.stale, ''); // 지피 1230 CR-C2: 공통 2일뿐이라 20일 일치 아님
});
test('D2: recordFrom은 stale을 일치로 세지 않고 total·지문을 남긴다(15개 제한 범위)', () => {
  const m = (t, st) => ({ ticker: t, r: { ok: true, status: st, latest: { d: '2026-11-24', match: true } } });
  const rec = K.recordFrom([m('005930', 'match'), m('000660', 'stale')], 1, 20);
  a.equal(rec.matched, 1); a.deepEqual(rec.bad, ['000660']); a.equal(rec.total, 20); a.equal(rec.n, 2); a.match(rec.fp, /^[0-9a-f]{8}$/);
  a.equal(K.recordFrom([m('005930', 'match')], 1).total, 1);
  a.ok(K.parseLog(JSON.stringify({ v: 1, autoDay: '', rows: [rec] })));
  a.equal(K.parseLog(JSON.stringify({ v: 1, autoDay: '', rows: [Object.assign({}, rec, { total: 1 })] })), null); // total < n 거부
  a.equal(K.parseLog(JSON.stringify({ v: 1, autoDay: '', rows: [Object.assign({}, rec, { fp: 'XYZ' })] })), null);
  a.ok(K.parseLog(JSON.stringify({ v: 1, autoDay: '', rows: [{ d: '2026-11-20', at: 1, n: 1, matched: 1, bad: [] }] }))); // 옛 기록 읽기 호환
});
test('D2: 신뢰도 띠는 조회 시각이 아니라 종가 날짜로 신선도 판정, 일부만 대조·범위 미기록 구분', () => {
  // 지피 1130 CR-B1: 현재 보유 집합(cur)과 같아야 하고, 같아도 공식 거래일·시세 종류 미입증이라 녹색(ok) 없음.
  const T2 = ['005930', '000660'], FP = K.fingerprint(T2), cur = { tickers: T2, total: 2, fp: FP };
  const row = (o) => Object.assign({ d: '2026-11-24', at: now, n: 2, matched: 2, bad: [], total: 2, fp: FP }, o);
  const same = K.trustSummary(row(), now, false, cur); a.equal(same.sev, 'info'); a.match(same.text, /참고 대조\(공식 거래일·시세 종류 미확인\)/);
  const old = K.trustSummary(row({ d: '2026-11-10' }), now, false, cur); a.equal(old.sev, 'warn'); a.match(old.text, /오래됨/); // 오늘 조회했어도 종가가 오래됨
  const part = K.trustSummary(row({ total: 20 }), now, false, { tickers: T2, total: 20, fp: FP }); a.equal(part.sev, 'warn'); a.match(part.text, /일부만: 보유 20종목 중 2종목/);
  const legacy = K.trustSummary({ d: '2026-11-24', at: now, n: 2, matched: 2, bad: [] }, now, false, cur); a.equal(legacy.sev, 'info'); a.match(legacy.text, /대조 범위 미기록/);
  a.equal(K.trustSummary(row({ matched: 1, bad: ['000660'] }), now, false, cur).sev, 'warn');
  a.match(K.trustSummary(row(), now, true, cur).text, /미국 가격은 미검증/);
});
test('D3: 연속 일치 — 지문 없는 옛 기록 소급 안 함, 집합 변경·일부 대조에서 끊김', () => {
  const FP = K.fingerprint(['005930', '000660']), FP2 = K.fingerprint(['005930']);
  const r = (d, o) => Object.assign({ d, at: 1, n: 2, matched: 2, bad: [], total: 2, fp: FP }, o);
  const days = ['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'];
  const mk = (rows) => ({ v: 1, autoDay: '', rows });
  a.equal(K.streak(mk(days.map((d) => r(d))), days), 4);
  a.equal(K.streak(mk(days.map((d) => ({ d, at: 1, n: 2, matched: 2, bad: [] }))), days), 0); // 옛 기록 0
  a.equal(K.streak(mk([r('2026-11-19'), r('2026-11-20'), r('2026-11-23', { fp: FP2, n: 1, matched: 1, total: 1 }), r('2026-11-24', { fp: FP2, n: 1, matched: 1, total: 1 })]), days), 2); // 집합 변경
  a.equal(K.streak(mk([r('2026-11-23'), r('2026-11-24', { total: 20 })]), days), 0); // 일부만 대조한 최신일
  a.equal(K.fingerprint(['000660', '005930']), FP); // 순서 무관
  a.equal(K.STALE_DAYS, 6);
});
test('D3·CR-B2 화면: 자동 대조는 하루 1회(시작 전 autoDay 기록), 실패해도 같은 날 자동 재시도 없음(가짜 JSONP, 네트워크 없음)', async () => {
  const { JSDOM } = require('jsdom'), fs = require('node:fs'), path = require('node:path');
  const dom = new JSDOM('<!doctype html><head></head><body><div id="m"></div></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  w.gasUrl = 'https://script.google.com/macros/s/SYNTHETIC_ID/exec'; w.domStocks = [{ ticker: '005930', name: '합성', quantity: 1 }];
  const orig = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (el) => { if (el.tagName === 'SCRIPT') { const u = new URL(el.src); calls.push(u.searchParams.get('type')); const cb = u.searchParams.get('callback'); setTimeout(() => w[cb](u.searchParams.get('type') === 'kis' ? { error: 'kis-failed' } : {}), 0); return el; } return orig(el); };
  w.eval(fs.readFileSync(path.join(__dirname, '../has/kis-crosscheck.js'), 'utf8'));
  const K2 = w.HASKISCrossCheck, box = w.document.getElementById('m'); K2.mount(box);
  K2.run(true); await new Promise((r) => setTimeout(r, 30));
  a.equal(K2.autoState().n, 1); a.match(box.textContent, /오늘 자동 대조 실패 — 자동 대조는 하루 1회/);
  const k1 = calls.filter((x) => x === 'kis').length; a.equal(k1, 1);
  K2.run(true); await new Promise((r) => setTimeout(r, 30));
  a.equal(calls.filter((x) => x === 'kis').length, 1); // 2번째 자동 호출은 실제로 막힘
  const saved = JSON.parse(w.localStorage.getItem(K.LOG_KEY)); a.equal(saved.rows.length, 0); a.equal(saved.autoDay, '2026-11-25'.slice(0, 0) + new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())); // 실패 결과 행은 없고 시도일만
  a.equal(K.AUTO_MAX, 1);
});
