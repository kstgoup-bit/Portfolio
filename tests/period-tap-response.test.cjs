'use strict';
/* 2026-11-13 기간 버튼(1주·3달·6달…) 반응: 버튼 색은 바로 바뀌고 그래프는 다음 화면 그리기 뒤에, 연속으로 누르면 마지막 기간만 그린다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
const src = html.match(/function selectPeriod\(btnId, chartId, period, snapKey, color\) \{[\s\S]*?\n\}\n/)[0];

function setup() {
  const svg = { style: { opacity: '' } }, frames = [], timers = [], log = [];
  const ctx = {
    currentPeriods: {}, document: { getElementById: id => (id === 'allLineChart' ? svg : null) },
    renderPeriodBtns: (b) => log.push(['btns', b, ctx.currentPeriods[b], svg.style.opacity]),
    renderLineChart: (p, b) => log.push(['chart', p, b, svg.style.opacity]),
    requestAnimationFrame: f => frames.push(f), setTimeout: f => timers.push(f)
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const flush = () => { while (frames.length || timers.length) { frames.splice(0).forEach(f => f()); timers.splice(0).forEach(f => f()); } };
  return { ctx, svg, log, flush };
}

test('누르는 즉시 버튼만 바뀌고 그래프는 흐리게 → 다음 프레임 뒤에 그린 뒤 원래 밝기', () => {
  const { ctx, svg, log, flush } = setup();
  ctx.selectPeriod('allPeriodBtns', 'allLineChart', '3M', 'all', '#1565c0');
  a.deepEqual(log, [['btns', 'allPeriodBtns', '3M', '']]);
  a.equal(svg.style.opacity, '0.45');
  flush();
  a.deepEqual(log[1], ['chart', '3M', 'allPeriodBtns', '0.45']);
  a.equal(svg.style.opacity, '');
});

test('연속으로 누르면 마지막 기간 한 번만 그림, 다른 그래프 버튼은 서로 취소하지 않음', () => {
  const { ctx, log, flush } = setup();
  ['1W', '3M', '6M'].forEach(p => ctx.selectPeriod('allPeriodBtns', 'allLineChart', p, 'all', '#1565c0'));
  ctx.selectPeriod('domPeriodBtns', 'domLineChart', '1M', 'dom', '#f57f17');
  flush();
  a.deepEqual(log.filter(x => x[0] === 'chart').map(x => x[1] + ':' + x[2]), ['6M:allPeriodBtns', '1M:domPeriodBtns']);
});

test('그리기 중 오류가 나도 그래프 밝기는 원래대로', () => {
  const { ctx, svg, flush } = setup();
  ctx.renderLineChart = () => { throw Error('draw'); };
  ctx.selectPeriod('allPeriodBtns', 'allLineChart', '1Y', 'all', '#1565c0');
  a.throws(flush, /draw/);
  a.equal(svg.style.opacity, '');
});

test('ETF 이력 새로고침: 누르는 즉시 버튼이 확인 중으로 바뀌고, 끝나면 원래 글자(모든 종료 경로에서 버튼 동기화)', () => {
  const pick = re => { const m = html.match(re); a.ok(m, String(re)); return m[0]; };
  const src2 = 'var _benchFetchInFlight=false,_benchStatusMsg="";\n' + pick(/function setBenchStatus\(msg\)\{[\s\S]*?\n\}\n/) + pick(/function benchBtnLabel\(\)[^\n]*\n/) + pick(/function benchBtnSync\(\)[^\n]*\n/);
  const btn = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }, msg = { textContent: '' };
  const ctx = { document: { querySelectorAll: s => (s === 'button[onclick="fetchBenchmarkHistory(true)"]' ? [btn] : s === '.benchStatusMsg' ? [msg] : []) } };
  vm.createContext(ctx); vm.runInContext(src2, ctx);
  vm.runInContext('_benchFetchInFlight=true;setBenchStatus("ETF 이력 확인 중…")', ctx);
  a.match(btn.textContent, /확인 중/); a.equal(btn.attrs['aria-busy'], 'true'); a.match(msg.textContent, /^ETF 이력 확인 중…/);
  vm.runInContext('_benchFetchInFlight=false;benchBtnSync()', ctx);
  a.equal(btn.textContent, '↻ ETF 이력 새로고침'); a.equal(btn.attrs['aria-busy'], 'false');
  // 앱 연결: 시작 시 상태 표시, finally·취소·잠금 보류에서 버튼 동기화, 버튼은 상태에 맞는 글자로 그려짐
  a.match(html, /_benchFetchInFlight=true;\n  if\(force\)setBenchStatus\("ETF 이력 확인 중…"\);else benchBtnSync\(\);/);
  a.match(html, /finally\{clearTimeout\(timeout\);if\(_benchRunId===myRun\)_benchFetchInFlight=false;benchBtnSync\(\);\}/);
  a.match(html, /_benchFetchInFlight=false; cancelBenchmarkGas\(\); benchBtnSync\(\);/);
  a.match(html, /if\(snapshotWriteBlocked\(\)\)\{if\(force\)setBenchStatus\("백업 복원·저장 잠금 중이라 조회 보류"\);return;\}/);
  a.match(html, /onclick="fetchBenchmarkHistory\(true\)"[^>]*>'\+\(typeof benchBtnLabel==="function"\?benchBtnLabel\(\):"↻ ETF 이력 새로고침"\)\+'<\/button>/);
});
