#!/usr/bin/env node
/* KST (stage15): 투자기록 계산 검증표(합성 사례별 손계산 기대값 vs 실제 계산값)를 마크다운으로 출력한다.
   사용: node tools/ledger-verification-table.cjs [--out docs/KST-stage15-ledger-verification.md]   (모두 합성 자료, 실제 거래 아님) */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const L = require('../invest/ledger.js'), CASES = require('../tests/fixtures/ledger-cases.cjs');
const LABEL = { qty: '보유 수량', avgKRW: '평균단가(원)', costKRW: '취득원가(원)', realizedKRW: '실현손익(원)', realizedLocal: '실현손익(현지통화)', dividendsKRW: '배당 세후(원)', withholdingKRW: '원천징수(원)', feesKRW: '수수료 누계(원)', unrealizedKRW: '평가손익(원)', valueKRW: '평가금액(원)', totalPnLKRW: '총손익(원)', simpleReturnPct: '단순수익률(%)' };
const fmt = x => (typeof x === 'number' ? (Math.abs(x) >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Math.round(x * 1e6) / 1e6)) : String(x));
function table() {
  const lines = ['# 투자기록 계산 검증표 (15단계 A)', '', '모든 사례는 **합성 자료**이며 기대값은 손으로 계산했습니다. 실제 거래기록·실제 시세는 사용하지 않았습니다. 재현: `node tools/ledger-verification-table.cjs`', '', '| # | 사례 | 항목 | 기대값(손계산) | 실제값(코드) | 결과 |', '|---|------|------|---------------:|-------------:|:----:|'];
  let n = 0, pass = 0, fail = 0;
  CASES.forEach((c, i) => {
    const r = L.compute(c.trades, c.options || {}), v = L.valuate(r, { prices: c.prices || {}, fxUsd: c.fxNow ?? null }), k = c.key || 'dom|AAA';
    const p = r.positions.find(x => x.account + '|' + x.ticker === k), row = v.rows.find(x => x.account + '|' + x.ticker === k);
    const map = { qty: p.qty, avgKRW: p.avgKRW, costKRW: p.costKRW, realizedKRW: p.realizedKRW, realizedLocal: p.realizedLocal, dividendsKRW: p.dividendsKRW, withholdingKRW: p.withholdingKRW, feesKRW: p.feesKRW, unrealizedKRW: row.unrealizedKRW, valueKRW: row.valueKRW, totalPnLKRW: v.totals.totalPnLKRW, simpleReturnPct: v.totals.simpleReturnPct };
    Object.entries(c.expected).forEach(([name, exp], j) => { const act = map[name], good = typeof act === 'number' && Math.abs(act - exp) <= 1e-6 * Math.max(1, Math.abs(exp)); n++; good ? pass++ : fail++; lines.push(`| ${j ? '' : i + 1} | ${j ? '' : c.name} | ${LABEL[name] || name} | ${fmt(exp)} | ${fmt(act)} | ${good ? '일치' : '**불일치**'} |`); });
  });
  lines.push('', `합계: ${n}개 항목, 일치 ${pass}, 불일치 ${fail}.`, '', '※ 해외주식 세금은 추정치 계산기만 있으며 확정 세액이 아닙니다. 연금계좌 인출세, 국내 대주주 과세 등은 계산하지 않고 "미확인"으로 표시합니다.');
  return { text: lines.join('\n') + '\n', n, pass, fail };
}
if (require.main === module) {
  const t = table(), i = process.argv.indexOf('--out');
  if (i > 0) fs.writeFileSync(path.resolve(process.argv[i + 1]), t.text); else process.stdout.write(t.text);
  console.error(`checked ${t.n}, pass ${t.pass}, fail ${t.fail}`); process.exit(t.fail ? 1 : 0);
}
module.exports = { table };
