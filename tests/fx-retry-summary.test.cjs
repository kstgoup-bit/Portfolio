'use strict';
/* 2026-11-13 순태씨: 해외 탭 "기록 대기" 설명이 종목마다 반복되고 수익률이 전부 '-'.
   원인 = 환율(USD/KRW)을 한 번만 요청하고 재시도가 없어, 한 번 실패하면 해외 평가·수익률이 전부 보류됨.
   + 그릴 때마다 보이지 않는 지수 칸을 위해 외부 요청 4건씩 나가던 것 제거. 계산·판정 정책은 불변. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
function grab(startMarker, endMarker) { const i = html.indexOf(startMarker), j = html.indexOf(endMarker, i); a.ok(i > 0 && j > i, startMarker); return html.slice(i, j); }

function fxHarness() {
  const timers = [], scripts = [], inputs = { usdKrw: { value: '' }, fxTime: { textContent: '' } };
  const body = { appended: [], appendChild(s) { this.appended.push(s); scripts.push(s); }, removeChild(s) { this.appended = this.appended.filter(x => x !== s); }, contains(s) { return this.appended.includes(s); } };
  const ctx = {
    window: {}, quoteMeta: {}, snapshotQuoteValues: {}, snapshotInputEpoch: 0, gasUrl: 'https://script.google.com/macros/s/X/exec', renders: 0,
    snapshotWriteBlocked: () => false, autoSnapshot() {}, renderAll() { ctx.renders++; },
    document: { body, createElement: () => ({}), getElementById: id => inputs[id] },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, Date, Number, Math, Date: Date
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(grab('function retryFetch(', 'function fetchUS(') + grab('function fetchFX(', '// =============================================\n// 설정'), ctx);
  return { ctx, timers, scripts, inputs, body };
}
const cbOf = s => /callback=(gas_fx_\d+)/.exec(s.src)[1];

test('환율 응답이 정상이면 값·수신시각 기록, 재시도 없음', () => {
  const h = fxHarness(); h.ctx.fetchFX();
  const cb = cbOf(h.scripts[0]); h.ctx[cb]({ usdKrw: 1344 });
  a.equal(h.inputs.usdKrw.value, 1344); a.equal(h.ctx.snapshotQuoteValues.FX, 1344); a.ok(h.ctx.quoteMeta.FX > 0); a.equal(h.ctx.renders, 1);
  a.equal(h.scripts.length, 1); a.equal(h.body.appended.length, 0, '스크립트 태그 정리');
});
test('환율 응답이 null·비정상이면 3초→10초→30초 재시도(최대 3회) 후 중단', () => {
  const h = fxHarness(); h.ctx.fetchFX();
  const expected = [3000, 10000, 30000];
  for (let n = 0; n < 3; n++) {
    h.ctx[cbOf(h.scripts[n])]({ usdKrw: null });
    const t = h.timers.filter(x => x.ms !== 15000).pop(); a.equal(t.ms, expected[n]); t.fn();
    a.equal(h.scripts.length, n + 2, '재요청 발생');
  }
  h.ctx[cbOf(h.scripts[3])]({ usdKrw: 'x' });
  a.equal(h.timers.filter(x => x.ms !== 15000).length, 3, '4번째 실패 후에는 더 이상 재시도 안 함');
  a.equal(h.inputs.usdKrw.value, ''); a.equal(h.ctx.snapshotQuoteValues.FX, undefined, '실패 값으로 채우지 않음');
});
test('스크립트 오류·15초 무응답도 재시도, 늦게 온 중복 처리 없음', () => {
  const h = fxHarness(); h.ctx.fetchFX();
  h.scripts[0].onerror(); a.equal(h.timers.filter(x => x.ms === 3000).length, 1);
  const h2 = fxHarness(); h2.ctx.fetchFX(); const to = h2.timers.find(x => x.ms === 15000); to.fn();
  a.equal(h2.timers.filter(x => x.ms === 3000).length, 1); to.fn(); a.equal(h2.timers.filter(x => x.ms === 3000).length, 1, '두 번 호출돼도 재시도 1번');
});
test('접속 중 기록 증거가 바뀌면(epoch) 늦은 환율 응답은 버림', () => {
  const h = fxHarness(); h.ctx.fetchFX(); const cb = cbOf(h.scripts[0]); h.ctx.snapshotInputEpoch++;
  h.ctx[cb]({ usdKrw: 1300 }); a.equal(h.inputs.usdKrw.value, ''); a.equal(h.ctx.snapshotQuoteValues.FX, undefined);
});

test('같은 사유는 한 줄로 묶어 요약(종목 7개 → 1줄)', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(grab('  function snapshotWaitSummary(', '  ["all","dom","ov","pen","gen"].forEach(function(key){\n    var el=document.getElementById("snapshotStatus-"'), ctx);
  const reason = '이번 접속에서 받은 유효한 USD/KRW 환율이 없습니다';
  const missing = ['QTOP', 'GOOGL', 'MSFT', 'NVDA', 'AVGO', 'IONQ', 'JOBY'].map(t => ({ account: 'ov', ticker: t, reason }));
  const text = ctx.snapshotWaitSummary({ ok: false, missing });
  a.equal(text, '⚠ 평가 기록 대기 — ' + reason + ' (7개 종목 공통)'); a.equal(text.split('\n').length, 1);
  a.equal(ctx.snapshotWaitSummary({ ok: false, missing: [{ account: 'gen', ticker: 'SYNTH', reason: '이번 접속에서 시세를 받지 못했습니다' }] }), '⚠ 평가 기록 대기 — 이번 접속에서 시세를 받지 못했습니다 (SYNTH)');
  a.match(ctx.snapshotWaitSummary({ ok: false, missing: [{ account: 'x', ticker: '', reason: '백업 복원 상태를 먼저 확인해주세요. 기록 변경을 보류합니다' }, { account: 'x', ticker: 'A', reason }] }), / \/ /);
});
test('긴 기록 상태 설명은 접힌 "ⓘ 기록 상태 자세히" 안에 있고, 전체 문구(시험·검사용 textContent)는 그대로', () => {
  for (const k of ['all', 'dom', 'gen', 'ov', 'pen']) {
    const i = html.indexOf('id="snapshotSummary-' + k + '"'), d = html.indexOf('<details', i), s = html.indexOf('id="snapshotStatus-' + k + '"', i), e = html.indexOf('</details>', i);
    a.ok(i > 0 && d > i && s > d && s < e, k + ' 상태 줄이 details 안');
    a.ok(d - i < 400, k + ' 요약은 details 바로 앞');
  }
  a.match(html, /font-size:13px;line-height:1\.6;margin-top:8px;color:#333;overflow-wrap:anywhere/);
  a.match(html, /el\.textContent=lines\.join\("\\n"\);\n    var summaryEl=/);
});
test('보이는 칸이 없으면 지수 외부 요청을 보내지 않음(그릴 때마다 4건 → 0건)', () => {
  a.doesNotMatch(html, /id="mkt-(KS11|KQ11|IXIC|GSPC)"/, '지수 칸이 화면에 없음(이 전제가 바뀌면 이 시험을 다시 봐야 함)');
  const ctx = { snapshotWriteBlocked: () => false, fetches: 0, fetch() { ctx.fetches++; return { then() { return { then() { return { catch() {} }; } }; } }; }, document: { getElementById: () => null } };
  vm.createContext(ctx); vm.runInContext(grab('function fetchMarketIndices(', 'function renderAll('), ctx); ctx.fetchMarketIndices(); a.equal(ctx.fetches, 0);
  const shown = { fetches: 0, fetch() { shown.fetches++; return Promise.resolve({ json: () => new Promise(() => {}) }); }, snapshotWriteBlocked: () => false, document: { getElementById: id => id === 'mkt-KS11' ? {} : null } };
  vm.createContext(shown); vm.runInContext(grab('function fetchMarketIndices(', 'function renderAll('), shown); shown.fetchMarketIndices(); a.equal(shown.fetches, 4, '칸이 생기면 기존처럼 요청');
});
