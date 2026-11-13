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
test('기준지수선이 없으면 이유를 그래프 안내에 적는다(저장 형식 무변경)',()=>{
  assert.match(html,/기준지수선 없음: "\+bWhy/);
  for(const t of ['기준지수 기록 없음(시세 조회 대기 또는 실패)','기준지수 기록 원본 확인 필요(읽기 전용)','입금·출금 기록 확인 필요','그래프 시작일 이전 기준지수 기록이 없어'])assert.ok(html.includes(t),t);
});
test('기준지수 자료 진단 문구는 상태 문구 끝에 붙고 저장값을 바꾸지 않는다',()=>{
  assert.match(html,/function benchDiagText\(\)/);assert.match(html,/" ▶ 자료 진단: "\+benchDiagText\(\)/);
  const fn=/function benchDiagText\(\)\{[\s\S]*?\n\}\n/.exec(html)[0];assert.doesNotMatch(fn,/localStorage|setItem/);
});
