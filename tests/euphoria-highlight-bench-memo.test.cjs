'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','portfolio_v5.html'),'utf8');
test('환호성 화면이면 강조는 환호성 바로가기에, 곡소리 탭에서는 해제',()=>{
  const fn=/function hasSyncRiskTabHighlight\(\)\{[\s\S]*?\n\}\n/.exec(html)[0];
  assert.match(fn,/euphoria/);assert.match(fn,/link\.classList\.toggle\("active",euph\)/);
  assert.match(fn,/btn\.classList\.remove\("active"\)/);
  assert.match(html,/if\(typeof hasSyncRiskTabHighlight==="function"\) hasSyncRiskTabHighlight\(\);/);
  assert.match(html,/addEventListener\(ev,function\(\)\{setTimeout\(hasSyncRiskTabHighlight,0\)/);
});
test('기준지수 조회 캐시: 같은 거래소 날짜는 한 번만, 입력 상태가 바뀌면 초기화, 저장 형식 무변경',()=>{
  const fn=/function findBenchAtOrBefore\(hist,targetTs,id\) \{[\s\S]*?\n\}\nvar _benchSelCache[^\n]*\n/.exec(html);
  assert.ok(fn);
  const s=fn[0];
  assert.match(s,/c\.hist!==hist\|\|c\.len!==hist\.length\|\|c\.state!==_benchState\|\|nowMs-c\.at>30000/);
  assert.match(s,/ck=id\+"@"\+dk/);assert.match(s,/selectPointAtOrBefore\(hist,id,targetTs/);
  assert.doesNotMatch(s,/localStorage/);
});
