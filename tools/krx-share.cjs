/* 네트워크·키 없음. 개인 PC 실행 결과를 값 없이 공유하기 위한 두 가지 변환.
   node tools/krx-share.cjs summary <verification-log.json>   → 상태 합계·출처·기준일·해시만(종목 식별정보 제외)
   node tools/krx-share.cjs shape <저장된-응답-파일>           → 응답 구조(경로·개수·값 종류)만, 값은 출력하지 않음 */
'use strict';
const fs = require('node:fs'), SH = require('../kr-radar/shape.js'), SU = require('../kr-radar/share.js');
const [cmd, file] = process.argv.slice(2);
try {
  if (cmd === 'summary' && file) console.log(JSON.stringify(SU.buildShareSummary(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2));
  else if (cmd === 'shape' && file) { const s = SH.describeShape(fs.readFileSync(file, 'utf8')); console.log(JSON.stringify({ shape: s, comparison: SH.compareToExpectation(s) }, null, 2)); }
  else { console.error('usage: summary <verification-log.json> | shape <response-file>'); process.exit(2); }
} catch (e) { console.error('실패: ' + e.message); process.exit(1); }
