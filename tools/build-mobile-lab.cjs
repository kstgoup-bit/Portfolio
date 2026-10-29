#!/usr/bin/env node
/* KST (stage14): kr-radar 순수 모듈을 브라우저 한 파일로 묶는다(판정 규칙을 CLI와 100% 같은 코드로 공유).
   사용: node tools/build-mobile-lab.cjs [--check]   --check 는 파일을 쓰지 않고 최신 여부만 검사(시험에서 사용). */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'mobile-lab', 'bundle.js');
const ENTRY = ['mobile-flow.js', 'mobile-status.js', 'rehearsal.js'];
function build() {
  const mods = new Map();
  const visit = f => { if (mods.has(f)) return; const src = fs.readFileSync(path.join(ROOT, 'kr-radar', f), 'utf8'); mods.set(f, src); for (const m of src.matchAll(/require\('\.\/([\w.-]+)'\)/g)) { if (m[1].endsWith('.json')) continue; visit(m[1]); } };
  ENTRY.forEach(visit);
  const uni = fs.readFileSync(path.join(ROOT, 'kr-radar', 'data', 'universe.json'), 'utf8');
  const parts = ['/* 생성 파일 — 직접 고치지 말 것. node tools/build-mobile-lab.cjs 로 재생성. 원본: kr-radar/*.js */', '(function(){', '"use strict";', 'var __defs={},__cache={};'];
  for (const [f, src] of [...mods].sort((a, b) => a[0] < b[0] ? -1 : 1)) parts.push('__defs[' + JSON.stringify('./' + f) + ']=function(module,exports,require){\n' + src + '\n};');
  parts.push('__defs["./data/universe.json"]=function(module){module.exports=' + uni.trim() + ';};');
  parts.push('function req(n){if(!__defs[n])throw new Error("module missing: "+n);if(__cache[n])return __cache[n].exports;var m={exports:{}};__cache[n]=m;__defs[n](m,m.exports,req);return m.exports;}');
  parts.push('window.KSTMobileLab={flow:req("./mobile-flow.js"),status:req("./mobile-status.js"),rehearsal:req("./rehearsal.js"),universe:req("./data/universe.json")};', '})();');
  return parts.join('\n') + '\n';
}
if (require.main === module) {
  const text = build();
  if (process.argv.includes('--check')) { const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''; if (cur !== text) { console.error('mobile-lab/bundle.js 가 최신이 아님'); process.exit(1); } console.log('bundle up to date'); }
  else { fs.writeFileSync(OUT, text); console.log('wrote', path.relative(ROOT, OUT), text.length, 'bytes'); }
}
module.exports = { build };
