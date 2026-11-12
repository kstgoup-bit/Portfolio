'use strict';
/* 2026-11-12 순태씨 요청: 수익률 화면 하단의 긴 "충돌 격리 날짜" 목록·관측일/출처 줄을 줄임. 계산·판정 불변. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
test('충돌 격리는 날짜 나열 대신 개수만 표시', () => {
  a.doesNotMatch(html, /충돌 격리 "\+r\.conflictDates\.join/);
  a.match(html, /충돌 격리 "\+r\.conflictDates\.length\+"일\(기준 확인 전 제외\)"/);
});
test('관측일·수신·출처 줄은 접힌 "수익률 계산 안내·지수 출처" 안에 있고, 새로고침 버튼은 그대로', () => {
  const i = html.indexOf('ⓘ 수익률 계산 안내·지수 출처'), j = html.indexOf('</details>', i), k = html.indexOf('관측일: ', i);
  a.ok(i > 0 && k > i && k < j, '관측일 줄이 안내 details 안');
  a.match(html, /fetchBenchmarkHistory\(true\)" style="min-height:44px/);
});
test('그래프 갱신: 보이는 그래프만 바로, 가려진 것은 나눠서(최신 호출만 유효)', () => {
  a.match(html, /var epoch=\(refreshAllLineCharts\.epoch=/);
  a.match(html, /rest\.forEach\(function\(m,i\)\{setTimeout\(function\(\)\{if\(epoch===refreshAllLineCharts\.epoch\)draw\(m\);\},60\*\(i\+1\)\);\}\);/);
});
