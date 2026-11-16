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
test('그래프 전용 충돌 필터: 반올림 수준만 제외, 실제 차이·다른 상태는 유지, 저장 규칙 무변경',()=>{
  const src=/function benchChartConflicts\(g\)\{[\s\S]*?\n\}\n/.exec(html)[0];
  const f=new Function(src+';return benchChartConflicts;')();
  const mk=(a,b,st='pending-review')=>({d:'2026-11-12',status:st,existing:{close:a},alternative:{close:b}});
  const g={pendingConflicts:[mk(456.7799987792969,456.78),mk(457.1,470.5),mk(100,100.4),mk(5,5.004,'provisional-successor')]};
  const out=f(g);assert.equal(out.length,3);assert.ok(!out.includes(g.pendingConflicts[0]));assert.deepEqual(f(null),[]);
  assert.match(html,/dis=benchChartConflicts\(g\)/);
});
test('당일 종가가 보류 충돌이면 이전 거래일로 되돌아간다(기준지수선 끊김 방지)',()=>{
  assert.match(html,/r\.reason==="benchmark-date-conflict"\)r=HASBenchmarkHistory\.selectPointAtOrBefore\(hist,id,targetTs,\{now:nowMs,conflicts:dis\}\)/);
});
test('진단 문구에 충돌 날짜와 현재 선택 결과(당일허용/전날)가 포함된다',()=>{
  assert.match(html,/지금 선택: 당일허용 /);assert.match(html,/충돌날짜 /);
  const fn=/function benchDiagText\(\)\{[\s\S]*?\n\}\n/.exec(html)[0];assert.doesNotMatch(fn,/localStorage|setItem/);
});
test('직전 거래일도 충돌이면 충돌 날짜를 건너뛰어 충돌 없는 마지막 종가로 잇는다(그래프 전용, 입력 불변)',()=>{
  const src=/function findBenchAtOrBefore\(hist,targetTs,id\) \{[\s\S]*?\n\}\nvar _benchSelCache[^\n]*\n/.exec(html)[0];
  const day=s=>Date.parse(s+'T14:30:00Z');
  const rows=['2026-11-10','2026-11-11','2026-11-12','2026-11-13'].map((d,i)=>({ts:day(d),close:100+i}));
  const dateOf=p=>new Date(p.ts).toISOString().slice(0,10);
  const calls=[];
  const H={specs:{QQQ:{market:'US'}},closeTimeMs:()=>0,selectPointAtOrBefore(rs,id,t,o){calls.push(rs.length);
    const bad=(o.conflicts||[]).map(c=>c.d);const last=[...rs].filter(p=>p.ts<t&&!bad.includes(dateOf(p))&&dateOf(p)<new Date(t).toISOString().slice(0,10)).pop();
    if(!last&&(o.conflicts||[]).length)return {ok:false,reason:'benchmark-date-conflict'};
    const sel=[...rs].filter(p=>p.ts<t).pop();if(sel&&(o.conflicts||[]).some(c=>c.d===dateOf(sel)))return {ok:false,reason:'benchmark-date-conflict'};
    return sel?{ok:true,point:sel}:{ok:false,reason:'no-prior-observation'};}};
  const state={ok:true,series:{QQQ:{ok:true,pendingConflicts:[{d:'2026-11-12',status:'pending-review',existing:{close:102},alternative:{close:90}},{d:'2026-11-13',status:'pending-review',existing:{close:103},alternative:{close:90}}]}}};
  const f=new Function('window','HASBenchmarkHistory','benchmarkHistory','_benchState','_benchSelCache','benchChartConflicts','Date',src+';return findBenchAtOrBefore;');
  const hist=rows,bh={KS200:[],NDX:hist,SPY:[]};
  const fn=f({HASQuoteModel:{marketDate:(iso)=>iso.slice(0,10)},HASBenchmarkHistory:H},H,bh,state,{hist:null,len:-1,state:null,at:0,map:null},g=>g.pendingConflicts,Date);
  const r=fn(hist,Date.now(),'QQQ');
  assert.ok(r&&r.close===101,'11-12·11-13 충돌이면 11-11 종가(101)로 잇는다');
  assert.equal(hist.length,4,'입력 기록은 그대로');
  assert.match(html,/그래프 전용: 직전 거래일도 충돌이면/);
});
test('앱을 열거나 잠금을 풀면 맨 위로 스크롤해 가격 신뢰도 띠가 보이게 한다',()=>{
  const fn=/function hasScrollTop\(\)\{[^\n]*\n/.exec(html)[0];
  assert.match(fn,/scrollRestoration="manual"/);assert.match(fn,/window\.scrollTo\(0,0\)/);assert.doesNotMatch(fn,/localStorage|setItem/);
  assert.match(html,/sessionStorage\.setItem\("v5_auth","1"\);\n    renderAll\(\);\n    hasScrollTop\(\);/);
  assert.match(html,/loadBenchmarkCacheSync\(\);\n  renderAll\(\);\n  hasScrollTop\(\);/);
});
