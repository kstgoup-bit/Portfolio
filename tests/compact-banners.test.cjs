'use strict';
/* 2026-11-13 순태씨 요청("줄이고"): 상단 가격 신뢰도·오늘의 투자 브리핑 띠를 한 줄 높이로. CSS만 변경 — 문구·자세히 기능·계산 불변.
   (has/ledger-demo.css·advisor-panel.css는 KIS 보호 원본이라 건드리지 않고 portfolio_v5.html 안 규칙으로 덮어씀) */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
test('띠 두 개를 한 줄 높이로 줄이는 규칙이 있고 글자는 13px(12px 이상)·기능 요소는 그대로', () => {
  a.match(html, /body #hasPriceTrust\.hpt\{display:flex;flex-wrap:wrap;align-items:center;gap:0 8px;margin:4px 10px;padding:0 10px;border-width:1px;line-height:1\.4\}/);
  a.match(html, /body #hasBriefStrip\{flex-wrap:nowrap;margin:4px 10px;padding:2px 10px;border-width:1px;font-size:13px;line-height:1\.4\}/);
  a.match(html, /body #hasBriefStrip button\{flex:0 0 auto;padding:4px 12px;border-width:1px;font-size:13px\}/);
  a.doesNotMatch(html, /body #has(PriceTrust|BriefStrip)[^}]*font-size:(?:[0-9]|1[01])px/);
});
test('보호 원본 CSS는 바뀌지 않음', () => {
  const kis = require('./lib/kis-protected-source.json'), crypto = require('node:crypto');
  const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', f))).digest('hex');
  for (const f of ['has/advisor-panel.css', 'has/ledger-demo.css']) { const want = JSON.stringify(kis).includes(hash(f)); a.ok(want, f + ' 해시가 보호 목록과 일치'); }
});
