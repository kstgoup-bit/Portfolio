'use strict';
/* 2026-11-27 지수 비교선이 빠질 때 이유를 접힌 '그래프 안내' 밖(그래프 바로 아래)에 한 줄로 표시. 표시 전용 — 계산·저장값 불변. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
const m = html.match(/  \/\/ 접힌 안내를 열지 않아도[^\n]*\n  try\{\n[\s\S]*?\n  \}catch\(e\)\{\}\n/);

function fakeDom(withNote) {
  const nodes = {}, parent = { children: [], insertBefore(el, ref) { el.parentNode = parent; parent.children.push(el); }, removeChild(el) { parent.children = parent.children.filter(x => x !== el); delete nodes[el.id]; el.parentNode = null; } };
  const note = withNote ? { id: 'allLineChartAssessment', parentNode: parent, nextSibling: null } : null;
  if (note) nodes[note.id] = note;
  return {
    parent, nodes,
    document: {
      getElementById: id => nodes[id] || null,
      createElement: () => { const el = { style: {}, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } }; return el; }
    },
    insertHook: parent
  };
}
function run(benchWhy, withNote, dom) {
  dom = dom || fakeDom(withNote);
  const origInsert = dom.parent.insertBefore;
  dom.parent.insertBefore = function (el) { dom.nodes[el.id] = el; return origInsert.call(dom.parent, el); };
  const ctx = { document: dom.document, chartId: 'allLineChart', benchWhy };
  vm.createContext(ctx); vm.runInContext(m[0], ctx);
  return dom;
}

test('표시 코드가 앱에 있고, 계산 경로(benchSeries 계산)는 바뀌지 않음', () => {
  a.ok(m, '표시 블록 있음');
  a.match(html, /var benchSeries=chartComparison\.hold\?null:getBenchmarkSeriesForChart\(snapKey, pts\);/);
  a.match(html, /benchWhy="지수 비교선 없음 — "\+bWhy;/);
  a.match(html, /benchWhy="지수 비교선 보류 — 수익률 계산이 보류 상태예요/);
  // 표시 블록은 저장소·계산 함수를 호출하지 않는다
  a.doesNotMatch(m[0], /localStorage|setItem|priceAtTs|computeCashFlowSeries|snapshots\[/);
});

test('이유가 있으면 12px·#333 한 줄이 그래프 안내 바로 뒤에 생기고, 같은 줄을 재사용', () => {
  const dom = run('지수 비교선 없음 — 그래프 시작일 이전 기준지수 기록이 없어 비교선을 만들 수 없음', true);
  const el = dom.nodes.allLineChartBenchWhy;
  a.ok(el);
  a.equal(el.textContent, '⚠ 지수 비교선 없음 — 그래프 시작일 이전 기준지수 기록이 없어 비교선을 만들 수 없음');
  a.match(el.style.cssText, /font-size:12px/); a.match(el.style.cssText, /color:#333/);
  a.equal(el.attrs.role, 'status');
  run('지수 비교선 보류 — 수익률 계산이 보류 상태예요(ⓘ 그래프 안내 참고)', true, dom);
  a.equal(dom.parent.children.filter(x => x.id === 'allLineChartBenchWhy').length, 1);
  a.match(dom.nodes.allLineChartBenchWhy.textContent, /^⚠ 지수 비교선 보류/);
});

test('이유가 없어지면(선이 생기면) 한 줄이 사라지고, 안내 요소가 없어도 오류 없음', () => {
  const dom = run('지수 비교선 없음 — x', true);
  a.ok(dom.nodes.allLineChartBenchWhy);
  run('', true, dom);
  a.equal(dom.nodes.allLineChartBenchWhy, undefined);
  a.equal(dom.parent.children.length, 0);
  a.doesNotThrow(() => run('지수 비교선 없음 — x', false));
});
