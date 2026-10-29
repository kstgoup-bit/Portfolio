#!/usr/bin/env node
/* KST (stage15): invest/*.js 순수 모듈 + backup/core.js(읽기 전용 파싱용)를 모바일 실험실용 한 파일로 묶는다.
   사용: node tools/build-invest-lab.cjs [--check]   (--check: 파일을 쓰지 않고 최신 여부만 검사) */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'mobile-lab', 'invest-bundle.js');
const FILES = ['invest/format.js', 'invest/ledger.js', 'invest/risk.js', 'invest/backtest.js', 'backup/core.js'];
function build() {
  const parts = ['/* 생성 파일 — 직접 고치지 말 것. node tools/build-invest-lab.cjs 로 재생성. 원본: ' + FILES.join(', ') + ' */'];
  for (const f of FILES) parts.push('/* ---- ' + f + ' ---- */', fs.readFileSync(path.join(ROOT, f), 'utf8').trimEnd());
  return parts.join('\n') + '\n';
}
if (require.main === module) {
  const text = build();
  if (process.argv.includes('--check')) { const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''; if (cur !== text) { console.error('mobile-lab/invest-bundle.js 가 최신이 아님'); process.exit(1); } console.log('invest bundle up to date'); }
  else { fs.writeFileSync(OUT, text); console.log('wrote', path.relative(ROOT, OUT), text.length, 'bytes'); }
}
module.exports = { build };
