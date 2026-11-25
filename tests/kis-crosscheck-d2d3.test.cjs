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
  a.equal(ok.status, 'match'); a.equal(ok.stale, '');
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
  const row = (o) => Object.assign({ d: '2026-11-24', at: now, n: 2, matched: 2, bad: [], total: 2, fp: '0000abcd' }, o);
  a.equal(K.trustSummary(row(), now, false).sev, 'ok');
  const old = K.trustSummary(row({ d: '2026-11-10' }), now, false); a.equal(old.sev, 'warn'); a.match(old.text, /오래됨/); // 오늘 조회했어도 종가가 오래됨
  const part = K.trustSummary(row({ total: 20 }), now, false); a.equal(part.sev, 'warn'); a.match(part.text, /일부만: 보유 20종목 중 2종목/);
  const legacy = K.trustSummary({ d: '2026-11-24', at: now, n: 2, matched: 2, bad: [] }, now, false); a.equal(legacy.sev, 'info'); a.match(legacy.text, /대조 범위 미기록/);
  a.equal(K.trustSummary(row({ matched: 1, bad: ['000660'] }), now, false).sev, 'warn');
  a.match(K.trustSummary(row(), now, true).text, /미국 가격은 미검증/);
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
  a.equal(K.AUTO_MAX, 2); a.equal(K.STALE_DAYS, 6);
});
test('D3 화면: 자동 대조 실패는 하루 최대 2회까지만, 실패 횟수 표시(가짜 JSONP, 네트워크 없음)', async () => {
  const { JSDOM } = require('jsdom'), fs = require('node:fs'), path = require('node:path');
  const dom = new JSDOM('<!doctype html><head></head><body><div id="m"></div></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  w.gasUrl = 'https://script.google.com/macros/s/SYNTHETIC_ID/exec'; w.domStocks = [{ ticker: '005930', name: '합성', quantity: 1 }];
  const orig = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (el) => { if (el.tagName === 'SCRIPT') { const u = new URL(el.src); calls.push(u.searchParams.get('type')); const cb = u.searchParams.get('callback'); setTimeout(() => w[cb](u.searchParams.get('type') === 'kis' ? { error: 'kis-failed' } : {}), 0); return el; } return orig(el); };
  w.eval(fs.readFileSync(path.join(__dirname, '../has/kis-crosscheck.js'), 'utf8'));
  const K2 = w.HASKISCrossCheck, box = w.document.getElementById('m'); K2.mount(box);
  K2.run(true); await new Promise((r) => setTimeout(r, 30));
  a.equal(K2.autoState().n, 1); a.match(box.textContent, /오늘 자동 대조 실패\(1\/2회\)/);
  K2.run(true); await new Promise((r) => setTimeout(r, 30));
  a.equal(K2.autoState().n, 2); a.match(box.textContent, /오늘 자동 시도는 끝났습니다/);
  a.equal(w.localStorage.getItem(K.LOG_KEY), null); // 실패는 기록하지 않음
  a.ok(calls.filter((x) => x === 'kis').length <= 2);
});
