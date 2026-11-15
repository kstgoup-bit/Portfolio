'use strict';
// 위대한 기업 2단계 — 합성 시험(실제 기업·실제 공시 아님). ORDER GPT-20261115-1326 5절 필수 시나리오 ①~⑩.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');
const F=require('../has/fundamental-filter.js');const G=require('../has/great-companies.js');
const NOW=Date.parse('2026-11-15T00:00:00Z');
function facts(years){const g={};
  function put(tag,end,val,flow){if(val===null||val===undefined)return;g[tag]=g[tag]||{units:{USD:[]}};const y=+end.slice(0,4);const e={end,val,form:'10-K',fp:'FY',fy:y,filed:(y+1)+'-02-15',accn:'0000000000-'+y};if(flow)e.start=y+'-01-01';g[tag].units.USD.push(e);}
  years.forEach((r,i)=>{const end=(2025-i)+'-12-31';
    put('Revenues',end,r.rev,true);put('OperatingIncomeLoss',end,r.op,true);put('NetIncomeLoss',end,r.ni,true);
    put('NetCashProvidedByUsedInOperatingActivities',end,r.ocf,true);put('PaymentsToAcquirePropertyPlantAndEquipment',end,r.capex,true);
    put('InterestExpense',end,r.int,true);put('StockholdersEquity',end,r.eq,false);put('CashAndCashEquivalentsAtCarryingValue',end,r.cash,false);put('LongTermDebt',end,r.debt,false);});
  return {cik:123,entityName:'Synthetic Co',facts:{'us-gaap':g}};}
// 성장하는 우량 합성 기업: 매출 연 8% 성장, 영업이익률 25%, 순현금에 가까움
const greatYears=[0,1,2,3,4].map(i=>{const rev=Math.round(1000/Math.pow(1.08,i));return {rev,op:Math.round(rev*0.25),ni:Math.round(rev*0.2),ocf:Math.round(rev*0.26),capex:Math.round(rev*0.06),int:10,eq:1000,cash:300,debt:400};});
// 장기 훼손: 매출 감소, 이익률 3년 연속 하락, 부채 증가
const erodingYears=[{rev:800,op:40,ni:20,ocf:30,capex:60,int:30,eq:500,cash:50,debt:900},{rev:900,op:90,ni:60,ocf:80,capex:60,int:28,eq:550,cash:60,debt:850},{rev:1000,op:150,ni:100,ocf:140,capex:60,int:25,eq:600,cash:60,debt:800},{rev:1050,op:210,ni:150,ocf:190,capex:60,int:20,eq:650,cash:80,debt:700},{rev:1100,op:250,ni:180,ocf:220,capex:60,int:20,eq:700,cash:90,debt:650}];
function norm(y){return F.normalize(facts(y),{ticker:'SYN'});}
const moat={text:'합성: 전환비용 높은 업무 소프트웨어(가상 자료)',confirmedAt:'2026-10-01',sourceRefs:['가상 10-K Item 1']};
const capital={text:'합성: 희석 억제·FCF 내 환원(가상 자료)',confirmedAt:'2026-10-01',sourceRefs:['가상 주주서한']};
const capAlloc=[0,1,2,3,4].map(i=>({end:(2025-i)+'-12-31',buybacks:60,dividends:40,acquisitions:0,dilutedShares:100+i*0.5}));
function input(over){return Object.assign({schema:'hasGreatCompanyInput.v1',generatedAt:'2026-11-15T00:00:00Z',synthetic:true,
  company:{ticker:'SYN',market:'US',name:'가상 기업',listType:'holding',kind:'company'},
  fundamental:norm(greatYears),capitalAllocation:capAlloc,
  thesis:{text:'가상 논리',logic:'가상',logicBreak:'점유율 2년 연속 하락',logicState:'maintained',checkpoints:['점유율','이익률'],nextCheckDate:'2027-03-01',moat,capital},
  price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-12,weightPct:6,conviction:false},
  valuation:{ticker:'SYN',metric:'P/FCF',current:20,history:[14,18,22,26,30],asOf:'2026-11-14',source:'가상 밸류에이션 입력(합성)'},previous:null},over||{});}
function A(x){return G.assess(x,{now:NOW});}
function allText(a){return JSON.stringify(a);}

test('baseline: 6영역 모두 근거·반론·출처, 우량 → 장기보유 우선 검토, 확정 표현 없음, 참고 점수는 결정에 미사용 표시',()=>{
  const a=A(input());
  assert.equal(a.state,'priority');assert.equal(a.stateKo,'장기보유 우선 검토');assert.equal(a.domains.length,6);
  assert.ok(a.domains.every(d=>typeof d.evidence==='string'&&d.evidence&&typeof d.counter==='string'&&d.counter));
  assert.ok(a.sources.length>=3&&a.sources.every(s=>s.kind&&s.asOf));assert.equal(a.asOf,'2025-12-31');
  assert.ok(a.reasonsToHold.length>=1&&a.risks.length>=1);assert.equal(a.signalHold,true);
  assert.match(a.auxScore.note,/상태 결정에 쓰지 않음/);assert.equal(a.auxScore.coveredDomains,6);
  assert.doesNotMatch(allText(a),/확정|자동\s*매|주문/);assert.ok(Object.isFrozen(a));
});
test('① 경쟁력 유지·주가 급락 → 매수 검토 게이트 닫힘(실제 밸류에이션 검증·4단계 조사 전) = 판단 보류 + 가상 분석 설명만 / 밸류에이션 없으면 판단 보류',()=>{
  const a=A(input({price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-28,weightPct:6,conviction:false}}));
  assert.equal(a.state,'priority');assert.equal(a.priceRelation.signal,'fear');assert.equal(a.opinion,'판단 보류');assert.match(a.priceRelation.text,/4단계 사전 조사 연결 전이라 판단 보류\(매수 검토 아님\)/);
  assert.match(a.priceRelation.scenario,/^가상 분석\(설명용, 입력 미검증\)/);assert.equal(a.priceRelation.buyGate.open,false);assert.equal(a.priceRelation.buyGate.missing.length,2);
  const low=A(input({valuation:{ticker:'SYN',metric:'P/FCF',current:10,history:[14,18,22,26,30],asOf:'2026-11-14',source:'가상'},price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-40,weightPct:2}}));assert.equal(low.opinion,'판단 보류');
  assert.ok(!/분할매수 검토 대상/.test(JSON.stringify([a,low])));
  const b=A(input({price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-28,weightPct:6},valuation:null}));
  assert.equal(b.opinion,'판단 보류');assert.match(b.priceRelation.text,/밸류에이션 확인 전/);
});
test('② 경쟁력 훼손·주가 급락 → 보유 논리 훼손 우려, 곡소리 아님(매수 검토 아님)',()=>{
  const a=A(input({fundamental:norm(erodingYears),thesis:Object.assign({},input().thesis,{logicState:'broken'}),price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-35,weightPct:6}}));
  assert.equal(a.state,'erosion');assert.match(a.priceRelation.text,/곡소리 아님/);assert.notEqual(a.opinion,'분할매수 검토 대상');assert.equal(a.priceRelation.warning,true);
});
test('③ 기업가치 상승을 수반한 급등(고점권·한도 이내) → 보유 지속 검토, 일률 매도 아님',()=>{
  const a=A(input({price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-1,weightPct:8}}));
  assert.equal(a.state,'priority');assert.equal(a.priceRelation.signal,'euphoria');assert.equal(a.opinion,'보유 지속 검토');assert.match(a.priceRelation.text,/매도 근거 부족/);
  assert.equal(a.domains.find(d=>d.id==='growth').status,'pass');
});
test('④ 고평가·집중위험 동시 → 일부 축소 검토 가능(세금·비용·재진입 비교), 확신 종목은 25% 한도',()=>{
  const hi={ticker:'SYN',metric:'P/FCF',current:40,history:[14,18,22,26,30],asOf:'2026-11-14',source:'가상 밸류에이션 입력(합성)'};
  const a=A(input({valuation:hi,price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-2,weightPct:18,conviction:false}}));
  assert.equal(a.opinion,'일부 축소 검토 가능');assert.match(a.priceRelation.text,/집중위험·밸류에이션 높은 편/);assert.match(a.priceRelation.text,/세금·비용·재진입/);
  const b=A(input({valuation:hi,price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-2,weightPct:18,conviction:true}}));
  assert.equal(b.opinion,'보유 지속 검토');assert.match(b.priceRelation.text,/일률 매도 아님/);assert.match(b.priceRelation.text,/한도 25%/);
});
test('⑤ 일시 실적 악화(최근 1년 이익률 하락만) → 경쟁력 재점검, 훼손 단정 안 함',()=>{
  const y=greatYears.map(r=>Object.assign({},r));y[0].op=Math.round(y[0].rev*0.12);
  const a=A(input({fundamental:norm(y)}));
  assert.equal(a.state,'recheck');assert.match(a.reason,/훼손 단정하지 않음|미충족/);
});
test('⑥ 재무 공시 누락·기준일 경과·출처 충돌 → 모두 판단 보류(fail-closed)',()=>{
  assert.equal(A(input({fundamental:null})).state,'hold');
  assert.equal(A(input({fundamental:norm(greatYears.slice(0,2))})).state,'hold');
  const late=G.assess(input({price:null}),{now:Date.parse('2027-12-01T00:00:00Z')});assert.equal(late.state,'hold');assert.match(late.reason,/18개월/);
  const raw=facts(greatYears);raw.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax={units:{USD:[{end:'2025-12-31',start:'2025-01-01',val:999,form:'10-K',fp:'FY',fy:2025,filed:'2026-02-15'}]}};
  const c=A(input({fundamental:F.normalize(raw,{ticker:'SYN'})}));assert.equal(c.state,'hold');assert.match(c.reason,/충돌/);
  const gap=G.assess(input({price:{asOf:'2027-06-01T00:00:00Z',drawdownPct:-5}}),{now:Date.parse('2027-06-02T00:00:00Z')});assert.equal(gap.state,'hold');assert.match(gap.reason,/15개월/);
  const q=A(input({thesis:Object.assign({},input().thesis,{moat:Object.assign({},moat,{confirmedAt:'2025-06-01'})})}));assert.equal(q.state,'hold');assert.match(q.reason,/정성 영역\(1 경쟁우위\) 미확인/);
  const kr=A(input({company:{ticker:'005930',market:'KR',listType:'holding'}}));assert.equal(kr.state,'hold');assert.match(kr.reason,/DART/);
  const etf=A(input({company:{ticker:'QQQ',market:'US',listType:'holding',kind:'etf'}}));assert.equal(etf.state,'hold');assert.match(etf.reason,/ETF/);
  for(const h of [late,c,gap,q,kr,etf])assert.equal(h.opinion,'판단 보류');
});
test('⑦ 경쟁우위 장기 훼손(이익률 3년 연속 하락·ROIC 하락·성장 역전) → 훼손 우려, 정성 미확인이어도 경고는 숨기지 않음',()=>{
  const th=Object.assign({},input().thesis,{moat:null,capital:null});
  const a=A(input({fundamental:norm(erodingYears),thesis:th,price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-8,weightPct:6}}));
  assert.equal(a.state,'erosion');const moatD=a.domains.find(d=>d.id==='moat');assert.equal(moatD.status,'fail');assert.match(moatD.evidence,/3년 연속 하락/);
  assert.match(a.priceRelation.text,/훼손 우려/);
});
test('⑦-b 경쟁력 훼손인데 주가 상승 → 별도 경고',()=>{
  const a=A(input({fundamental:norm(erodingYears),thesis:Object.assign({},input().thesis,{logicState:'weakened'}),price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-1,weightPct:6}}));
  assert.equal(a.state,'erosion');assert.match(a.priceRelation.text,/상승 중이지만 경쟁력 훼손 신호/);assert.equal(a.priceRelation.warning,true);
});
test('⑧ 곡소리·환호성·보유 신호 상충(급락인데 밸류에이션 높음·비중 초과) → 판단 보류, 상충 근거 나열',()=>{
  const a=A(input({valuation:{ticker:'SYN',metric:'P/FCF',current:40,history:[14,18,22,26,30],asOf:'2026-11-14',source:'가상 밸류에이션 입력(합성)'},price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-25,weightPct:14}}));
  assert.equal(a.state,'priority');assert.equal(a.opinion,'판단 보류');assert.deepEqual(a.priceRelation.conflicts,['곡소리(가격 하락)','밸류에이션 높은 편','비중 한도 초과']);
});
test('⑨ 중복·형식 오류 → 판단 보류, 예외 없음, 중복은 첫 입력만 평가',()=>{
  for(const bad of [null,1,'x',[],{},{schema:'x'},input({company:{ticker:'bad ticker',market:'US',listType:'holding'}}),input({price:{asOf:'어제',drawdownPct:5}}),input({thesis:{logicState:'좋음'}}),input({capitalAllocation:[{end:'2024-12-31'},{end:'2025-12-31'}]}),input({fundamental:{ok:true,version:'x',years:[]}})]){
    const a=G.assess(bad,{now:NOW});assert.equal(a.state,'hold');assert.equal(a.opinion,'판단 보류');}
  const ev=G.createEvaluator();const r=ev.evaluate([input(),input({price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-30}})],{now:NOW});
  assert.equal(r.length,2);assert.equal(r[0].state,'priority');assert.equal(r[1].state,'hold');assert.equal(r[1].duplicate,true);
});
test('⑩ 같은 JS 인스턴스 안에서 같은 입력·같은 날짜 → 재계산 생략(새로고침은 새 인스턴스라 재계산), 입력·날짜 바뀌면 새로 계산',()=>{
  const ev=G.createEvaluator();const list=[input(),input({company:{ticker:'SYN2',market:'US',listType:'watch'}})];
  const a=ev.evaluate(list,{now:NOW});assert.deepEqual(ev.stats(),{computed:2,cacheHits:0,size:2});
  const b=ev.evaluate(list,{now:NOW+3600000});assert.deepEqual(ev.stats(),{computed:2,cacheHits:2,size:2});assert.equal(a[0],b[0]);
  ev.evaluate([input({price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-30,weightPct:6}})],{now:NOW});assert.equal(ev.stats().computed,3);
  ev.evaluate(list,{now:NOW+86400000});assert.equal(ev.stats().computed,5,'날짜가 바뀌면 점검일·신선도 재판정');
});
test('변경사항: 직전 평가 대비 영역 하락 → 재점검 + 변경 목록',()=>{
  const prevDom={moat:'pass',growth:'pass',returns:'pass',balance:'pass',capital:'pass',durability:'pass'};
  const a=A(input({thesis:Object.assign({},input().thesis,{checkpoints:[]}),previous:{state:'priority',domains:prevDom,evaluatedAt:'2026-10-15T00:00:00Z'}}));
  assert.equal(a.state,'recheck');assert.ok(a.changes.some(c=>/상태: 장기보유 우선 검토 → 경쟁력 재점검/.test(c)));assert.ok(a.changes.some(c=>/영역 6/.test(c)));
});
test('점검일 경과 → 재점검, 가격 기준일 오래됨 → 가격 신호 판단 보류',()=>{
  const a=A(input({thesis:Object.assign({},input().thesis,{nextCheckDate:'2026-09-01'})}));assert.equal(a.state,'recheck');assert.match(a.reason,/점검일 경과/);
  const b=A(input({price:{asOf:'2026-10-01T00:00:00Z',drawdownPct:-30}}));assert.equal(b.priceRelation.signal,'stale');assert.notEqual(b.opinion,'분할매수 검토 대상');
});
test('금지어 검사: 출력에 확정·주문 표현이 섞이면 표시 차단(판단 보류)',()=>{
  const a=A(input({company:{ticker:'SYN',market:'US',listType:'holding',name:'위대한 기업 확정'}}));
  assert.equal(a.state,'hold');assert.match(a.reason,/출력 문구 검사 실패/);
});
test('순수 모듈: 네트워크·저장소·DOM·운영 앱 참조 없음, 운영 portfolio_v5.html 미연결',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../has/great-companies.js'),'utf8');
  assert.doesNotMatch(src,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.|navigator\.|setTimeout|script\.google/);
  const app=fs.readFileSync(path.join(__dirname,'../portfolio_v5.html'),'utf8');assert.doesNotMatch(app,/great-companies/);
});
// GPT-REVIEW-great-companies-20261115-1431 반영 시험
test('1431-② 종목 정합성: 재무·밸류에이션 티커 불일치 → 판단 보류',()=>{
  const a=A(input({fundamental:F.normalize(facts(greatYears),{ticker:'OTHER'})}));assert.equal(a.state,'hold');assert.match(a.reason,/재무 자료 종목 불일치\(OTHER ≠ SYN\)/);
  const b=A(input({fundamental:F.normalize(facts(greatYears))}));assert.equal(b.state,'hold');assert.match(b.reason,/식별자 없음/);
  const c=A(input({valuation:Object.assign({},input().valuation,{ticker:'OTHER'})}));assert.equal(c.state,'hold');assert.match(c.reason,/밸류에이션 자료 종목 불일치/);
  for(const bad of [{metric:'임의지표'},{source:undefined},{ticker:undefined}]){const d=A(input({valuation:Object.assign({},input().valuation,bad)}));assert.equal(d.state,'hold');assert.match(d.reason,/valuation 형식/);}
});
test('1431-② 기준시각: 미래 가격·미래 밸류에이션·미래/결산 전 공시·미래 자본배분 → 판단 보류, 오래된 밸류에이션 → 밸류에이션 판단 보류',()=>{
  assert.match(A(input({price:{asOf:'2026-11-15T01:00:00Z',drawdownPct:-30,weightPct:6}})).reason,/가격 기준시각이 평가 시각보다 미래/);
  assert.equal(A(input({price:{asOf:'2026-11-15T00:05:00Z',drawdownPct:-12,weightPct:6}})).state,'priority','시계 차이 10분 이내 허용');
  assert.match(A(input({valuation:Object.assign({},input().valuation,{asOf:'2026-11-16'})})).reason,/밸류에이션 기준일이 평가일보다 미래/);
  const y0=norm(greatYears);const early=Object.assign({},y0,{years:[Object.assign({},y0.years[0],{filed:'2025-12-01'})].concat(y0.years.slice(1))});
  assert.match(A(input({fundamental:early})).reason,/결산 전 공시/);
  const fut=Object.assign({},y0,{years:[Object.assign({},y0.years[0],{filed:'2026-12-01'})].concat(y0.years.slice(1))});assert.equal(A(input({fundamental:fut})).state,'hold');
  assert.match(A(input({capitalAllocation:[{end:'2026-12-31',buybacks:1}].concat(capAlloc)})).reason,/자본배분 결산일이 평가일보다 미래/);
  const old=A(input({valuation:Object.assign({},input().valuation,{asOf:'2026-09-01'}),price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-28,weightPct:6}}));
  assert.equal(old.priceRelation.valuation.band,'unknown');assert.match(old.priceRelation.valuation.text,/31일 초과/);assert.equal(old.opinion,'판단 보류');assert.equal(old.priceRelation.scenario,null);
});
test('1431-③ 자본배분 비율은 같은 결산 연도 교집합만: 자본배분 3년/재무 5년, 누락·시차·순서',()=>{
  const cap3=capAlloc.slice(0,3).map(r=>Object.assign({},r,{buybacks:200,dividends:100}));
  const a=A(input({capitalAllocation:cap3}));const d=a.domains.find(x=>x.id==='capital');
  const fy=norm(greatYears).years.slice(0,3).reduce((s,r)=>s+r.ocf-r.capex,0);
  assert.match(d.evidence,new RegExp('FCF 합계의 '+(Math.round(900/fy*10)/10)+'배\\(같은 결산 3년 2023~2025\\)'));assert.equal(d.status,'warn','3년 기준 1.5배 초과 → 주의(5년 분모였다면 과소평가)');
  const shifted=capAlloc.map(r=>Object.assign({},r,{end:r.end.slice(0,4)+'-06-30'}));
  const b=A(input({capitalAllocation:shifted})).domains.find(x=>x.id==='capital');assert.doesNotMatch(b.evidence,/FCF 합계의/);assert.ok(b.unknowns.some(u=>/같은 결산 연도 3년 미만\(0년\)/.test(u)));
  const gaps=capAlloc.map((r,i)=>i%2?Object.assign({},r,{buybacks:null,dividends:null}):r);
  const c=A(input({capitalAllocation:gaps})).domains.find(x=>x.id==='capital');assert.match(c.evidence,/같은 결산 3년 2021~2025/);
  const rev=A(input({capitalAllocation:capAlloc.slice().reverse()}));assert.equal(rev.state,'hold');assert.match(rev.reason,/capitalAllocation 형식/);
});
test('1431-④ 출력 계약: 모든 출력에 buyGate 닫힘·분할매수 검토 대상 없음',()=>{
  const outs=[A(input()),A(input({price:{asOf:'2026-11-14T07:00:00Z',drawdownPct:-30,weightPct:6}})),A(input({fundamental:null})),G.assess(null,{now:NOW})];
  for(const o of outs){assert.equal(o.priceRelation.buyGate.open,false);assert.notEqual(o.opinion,'분할매수 검토 대상');}
});
