'use strict';
// 지피 검토(GPT-REVIEW-fundamental-filter-20261115-0930) 1·2항 보완 시험. 합성 자료(실제 기업 아님).
const test=require('node:test');const assert=require('node:assert/strict');
const F=require('../has/fundamental-filter.js');
const DAY=86400000;
// 연말 결산 5년(2025→2021). drop: {year:[필드...]} 해당 연도에서 뺄 항목. extra: 추가 태그 항목.
function facts(drop,extra){const g={};drop=drop||{};
  function put(tag,y,val,flow,o){g[tag]=g[tag]||{units:{USD:[]}};const e=Object.assign({end:y+'-12-31',val,form:'10-K',fp:'FY',filed:(y+1)+'-02-15',accn:'0000000000-'+y},o||{});if(flow)e.start=y+'-01-01';g[tag].units.USD.push(e);}
  for(let y=2025;y>=2021;y--){const d=drop[y]||[];const r={Revenues:[1000,1],OperatingIncomeLoss:[250,1],NetIncomeLoss:[200,1],NetCashProvidedByUsedInOperatingActivities:[260,1],PaymentsToAcquirePropertyPlantAndEquipment:[60,1],InterestExpense:[10,1],StockholdersEquity:[1000,0],CashAndCashEquivalentsAtCarryingValue:[300,0],LongTermDebt:[400,0]};
    Object.keys(r).forEach(t=>{if(!d.includes(t))put(t,y,r[t][0],!!r[t][1]);});}
  (extra||[]).forEach(x=>put(x.tag,x.y,x.val,x.flow,x.o));
  return {cik:1,entityName:'Synthetic',facts:{'us-gaap':g}};}
const NOW=Date.parse('2026-11-15T00:00:00Z');
const run=(f,now)=>{const n=F.normalize(f);return {n,a:F.assess(n,{now:now||NOW})};};
const chk=(a,id)=>a.checks.find(c=>c.id===id);

test('1항: 같은 결산일·다른 공시일·다른 금액의 대체 태그 → 최신 공시로 고르지 않고 그 항목 보류(conflict), 후보 tag·filed·accn 기록, 우량 단정 안 함',()=>{
  const f=facts({},[{tag:'InterestExpenseNonoperating',y:2025,val:14,flow:true,o:{filed:'2026-08-01',accn:'0000000000-26X'}}]);
  const {n,a}=run(f);
  assert.equal(n.years[0].interest,null);
  assert.equal(n.years[0].conflicts.length,1);const c=n.years[0].conflicts[0];assert.equal(c.field,'interest');
  assert.deepEqual(c.candidates.map(x=>[x.tag,x.val,x.filed,x.accn]),[['InterestExpense',10,'2026-02-15','0000000000-2025'],['InterestExpenseNonoperating',14,'2026-08-01','0000000000-26X']]);
  assert.equal(a.conflicts.length,1);assert.equal(a.label,'mixed');assert.match(a.reason,/태그 간 값 불일치 1건/);assert.equal(a.reviewEligible,false);
  // 이자 항목은 직전 결산(2024)으로 넘어가지 않고 최신 연도 보류가 근거에 드러나야 함 → 2024 값을 쓰면 fallback 기록
  assert.ok(a.fallback.every(x=>x.id!=='interest')||/2024-12-31 결산 기준/.test(chk(a,'interest').evidence));
});
test('1항: 대체 태그 금액이 같으면 우선순위 첫 태그 사용, 같은 값을 낸 태그(agree)와 filed·accn 근거 기록',()=>{
  const f=facts({},[{tag:'InterestExpenseNonoperating',y:2025,val:10,flow:true,o:{filed:'2026-08-01',accn:'X'}}]);
  const {n,a}=run(f);assert.equal(n.years[0].interest,10);assert.deepEqual(n.years[0].conflicts,[]);
  assert.deepEqual(n.years[0].sources.interest,{tag:'InterestExpense',filed:'2026-02-15',accn:'0000000000-2025',agree:['InterestExpenseNonoperating']});
  assert.equal(a.label,'strong');
});
test('2항: 최신 연도 부채 누락 → 직전 결산 사용 시 기준일·최신 결산 표시, fallback 기록, 우량 사유에 직전 결산 명시',()=>{
  const {a}=run(facts({2025:['LongTermDebt']}),Date.parse('2026-03-15T00:00:00Z'));// 직전 결산 2024-12-31은 439일 전 → 허용
  assert.equal(chk(a,'leverage').status,'pass');assert.match(chk(a,'leverage').evidence,/2024-12-31 결산 기준 · 최신 2025-12-31 결산엔 값 없음/);
  assert.deepEqual(a.fallback,[{id:'leverage',end:'2024-12-31',latest:'2025-12-31'}]);assert.equal(a.label,'strong');assert.match(a.reason,/leverage\) 직전 결산 기준/);
});
test('2항 경계(지피 예시: 2026-11 시점 2024-12 항목은 684일 → na): 직전 결산 항목 자체가 기준시각에서 550일 이내면 허용, 551일이면 na(근거 부족)',()=>{
  const lim=Date.parse('2024-12-31T00:00:00Z')+F.STALE_DAYS*DAY;
  assert.equal(chk(run(facts({2025:['LongTermDebt']}),lim).a,'leverage').status,'pass');
  assert.equal(chk(run(facts({2025:['LongTermDebt']})).a,'leverage').status,'na');
  const r=run(facts({2025:['LongTermDebt']}),lim+DAY).a;const l=chk(r,'leverage');
  assert.equal(l.status,'na');assert.match(l.evidence,/직전 결산 허용 한도 초과: 2024-12-31/);assert.ok(r.fallback.every(x=>x.id!=='leverage'));
});
test('2항: 최신 연도와 직전 값 연도 간격이 400일 넘으면(중간 연도 결측) 직전 결산 대체 안 함 — 부채·이자·이익률 모두',()=>{
  // 2024 연도 전체 누락: y[0]=2025, y[1]=2023 (730일 간격)
  const all=['Revenues','OperatingIncomeLoss','NetIncomeLoss','NetCashProvidedByUsedInOperatingActivities','PaymentsToAcquirePropertyPlantAndEquipment','InterestExpense','StockholdersEquity','CashAndCashEquivalentsAtCarryingValue','LongTermDebt'];
  const {a}=run(facts({2025:['LongTermDebt','InterestExpense','OperatingIncomeLoss'],2024:all}));
  assert.equal(chk(a,'leverage').status,'na');assert.equal(chk(a,'interest').status,'na');assert.equal(chk(a,'margin').status,'na');
  assert.match(chk(a,'margin').evidence,/허용 한도 초과\(2023-12-31\)/);assert.deepEqual(a.fallback,[]);assert.notEqual(a.label,'strong');
});
test('2항: 영업이익률 최신 값이 3년 전에만 있으면 "최근" 값으로 쓰지 않음',()=>{
  const {a}=run(facts({2025:['OperatingIncomeLoss'],2024:['OperatingIncomeLoss']}));
  assert.equal(chk(a,'margin').status,'na');
});
