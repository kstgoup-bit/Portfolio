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
