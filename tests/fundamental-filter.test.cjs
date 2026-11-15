'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const F=require('../has/fundamental-filter.js');
const NOW=Date.parse('2026-11-15T00:00:00Z');
// 합성 companyfacts(실제 기업 아님). years: 최근→과거, 연말 12-31 결산.
function facts(years,opt){opt=opt||{};const g={};
  function put(tag,end,val,flow,extra){if(val===null||val===undefined)return;g[tag]=g[tag]||{units:{USD:[]}};const y=+end.slice(0,4);const e=Object.assign({end,val,form:'10-K',fp:'FY',fy:y,filed:(y+1)+'-02-15',accn:'0000000000-'+y},extra||{});if(flow)e.start=(y)+'-01-01';g[tag].units.USD.push(e);}
  years.forEach((r,i)=>{const end=(2025-i)+'-12-31';
    put(opt.revTag||'Revenues',end,r.rev,true);put('OperatingIncomeLoss',end,r.op,true);put('NetIncomeLoss',end,r.ni,true);
    put('NetCashProvidedByUsedInOperatingActivities',end,r.ocf,true);put('PaymentsToAcquirePropertyPlantAndEquipment',end,r.capex,true);
    put('InterestExpense',end,r.int,true);put('StockholdersEquity',end,r.eq,false);put('CashAndCashEquivalentsAtCarryingValue',end,r.cash,false);put('LongTermDebt',end,r.debt,false);});
  return {cik:123,entityName:'Synthetic Co',facts:{'us-gaap':g}};}
const good=Array.from({length:5},()=>({rev:1000,op:250,ni:200,ocf:260,capex:60,int:10,eq:1000,cash:300,debt:400}));
const bad=[{rev:1000,op:20,ni:-50,ocf:-10,capex:80,int:30,eq:500,cash:50,debt:900},{rev:1100,op:150,ni:60,ocf:40,capex:90,int:28,eq:550,cash:60,debt:850},{rev:1150,op:200,ni:-5,ocf:30,capex:90,int:25,eq:560,cash:60,debt:800},{rev:1200,op:220,ni:100,ocf:120,capex:80,int:20,eq:600,cash:80,debt:700},{rev:1200,op:220,ni:110,ocf:130,capex:70,int:20,eq:620,cash:90,debt:650}];
function run(yrs,opt,now){return F.assess(F.normalize(facts(yrs,opt),{ticker:'SYN'}),{now:now||NOW});}
test('strong: steady profitable, net cash-ish, high coverage → 우량 근거 충분, reviewEligible only flag, opinion held',()=>{
  const r=run(good);assert.equal(r.label,'strong');assert.equal(r.labelKo,'우량 근거 충분');assert.equal(r.reviewEligible,true);assert.equal(r.signalHold,true);assert.equal(r.opinion,'판단 보류');
  assert.equal(r.asOf,'2025-12-31');assert.equal(r.filed,'2026-02-15');assert.equal(r.years,5);
  const roe=r.checks.find(c=>c.id==='roe');assert.equal(roe.status,'pass');assert.equal(roe.value,20);
  assert.ok(r.checks.every(c=>typeof c.evidence==='string'&&typeof c.counter==='string'&&c.counter.length>0),'every check has evidence and counter-argument');
  assert.equal(r.checks.find(c=>c.id==='valuation').status,'na');
});
test('weak: losses, falling margin, heavy debt → 취약 + 탈출 신호 가능 wording, not eligible',()=>{
  const r=run(bad);assert.equal(r.label,'weak');assert.equal(r.reviewEligible,false);assert.match(r.reason,/탈출 신호 가능/);
  assert.equal(r.checks.find(c=>c.id==='margin').status,'fail');assert.equal(r.checks.find(c=>c.id==='leverage').status,'fail');assert.equal(r.checks.find(c=>c.id==='stability').status,'fail');
});
test('mixed: one fail only → 혼재',()=>{
  const y=good.map(x=>Object.assign({},x));y[0].op=120;// 최근 영업이익률 12% vs 이전 25% → fail
  const r=run(y);assert.equal(r.label,'mixed');assert.equal(r.checks.filter(c=>c.status==='fail').length,1);
});
test('insufficient: <3 years, stale filing, IFRS filer, malformed input — never throws',()=>{
  assert.equal(run(good.slice(0,2)).label,'insufficient');
  const st=run(good,{},Date.parse('2027-12-01T00:00:00Z'));assert.equal(st.label,'insufficient');assert.match(st.reason,/18개월/);
  const ifrs=F.assess(F.normalize({cik:1,entityName:'ADR',facts:{'ifrs-full':{}}}),{now:NOW});assert.equal(ifrs.label,'insufficient');assert.match(ifrs.reason,/IFRS/);
  for(const bad of [null,1,'x',[],{facts:null},{facts:[]}])assert.equal(F.assess(F.normalize(bad),{now:NOW}).label,'insufficient');
  assert.equal(F.assess(null,{now:NOW}).label,'insufficient');
});
test('normalize ignores quarterly/non-annual durations and 10-Q, keeps latest filed (amendment), tag fallback',()=>{
  const raw=facts(good,{revTag:'RevenueFromContractWithCustomerExcludingAssessedTax'});const ni=raw.facts['us-gaap'].NetIncomeLoss.units.USD;
  ni.push({start:'2025-10-01',end:'2025-12-31',val:999999,form:'10-K',fp:'FY',filed:'2026-02-15'});// 분기 기간(10-K 안 분기 표) 무시
  ni.push({start:'2025-01-01',end:'2025-12-31',val:777,form:'10-Q',fp:'Q3',filed:'2026-03-01'});// 10-Q 무시
  ni.push({start:'2025-01-01',end:'2025-12-31',val:210,form:'10-K/A',fp:'FY',filed:'2026-04-01'});// 정정 공시 우선
  ni.push({start:'2025-01-01',end:'2025-12-31',val:NaN,form:'10-K',fp:'FY',filed:'2026-05-01'});// 숫자 아님 무시
  const n=F.normalize(raw,{ticker:'SYN'});assert.equal(n.ok,true);assert.equal(n.years.length,5);assert.equal(n.years[0].netIncome,210);assert.equal(n.years[0].revenue,1000);assert.equal(n.years[0].filed,'2026-04-01');
  assert.ok(n.years.every((y,i)=>i===0||y.end<n.years[i-1].end),'newest first');
});
test('debt fallback = noncurrent + current; missing debt → leverage n/a, not zero',()=>{
  const raw=facts(good);const g=raw.facts['us-gaap'];delete g.LongTermDebt;assert.equal(F.assess(F.normalize(raw),{now:NOW}).checks.find(c=>c.id==='leverage').status,'na');
  g.LongTermDebtNoncurrent={units:{USD:[{end:'2025-12-31',val:3000,form:'10-K',fp:'FY',filed:'2026-02-15'}]}};g.LongTermDebtCurrent={units:{USD:[{end:'2025-12-31',val:500,form:'10-K',fp:'FY',filed:'2026-02-15'}]}};
  const n=F.normalize(raw);assert.equal(n.years[0].debt,3500);const lv=F.assess(n,{now:NOW}).checks.find(c=>c.id==='leverage');assert.equal(lv.status,'fail');assert.equal(lv.value,12.3);// (3500-300)/260
});
test('negative equity → ROE warn with counter-argument (buybacks), not crash',()=>{
  const y=good.map(x=>Object.assign({},x,{eq:-100}));const r=run(y);const roe=r.checks.find(c=>c.id==='roe');assert.equal(roe.status,'warn');assert.match(roe.counter,/자사주/);
});
test('no buy/sell recommendation wording anywhere in output',()=>{
  for(const y of [good,bad]){const t=JSON.stringify(run(y));assert.ok(!/매수하세요|매도하세요|추천|사세요|파세요|매수 검토/.test(t));}
});
test('targets: -20% or deeper US reference rows ∪ US holdings, deduped, deep flag at -30%',()=>{
  const items=[{ticker:'AAA',market:'US',status:'reference',drawdownPct:-35},{ticker:'BBB',market:'US',status:'reference',drawdownPct:-20},{ticker:'CCC',market:'US',status:'reference',drawdownPct:-19.9},{ticker:'DDD',market:'US',status:'stale',drawdownPct:-50},{ticker:'005930',market:'KR',status:'reference',drawdownPct:-40},{ticker:'EEE',market:'US',status:'reference',drawdownPct:null}];
  const t=F.targets(items,[{ticker:'MSFT',market:'US'},{ticker:'AAA',market:'US'},{ticker:'069500',market:'KR'}]);
  assert.deepEqual(t.map(x=>x.ticker),['AAA','BBB','MSFT']);assert.equal(t[0].deep,true);assert.equal(t[0].holding,true);assert.equal(t[0].fear,true);assert.equal(t[1].deep,false);assert.equal(t[2].fear,false);
  assert.deepEqual(F.targets(items,[],{threshold:-30}).map(x=>x.ticker),['AAA']);
  assert.deepEqual(F.targets(null,null),[]);
});
test('needsRefresh: only when a newer filing than last checked exists',()=>{
  assert.equal(F.needsRefresh(null,'2026-05-01'),true);
  assert.equal(F.needsRefresh({filed:'2026-02-15'},'2026-02-15'),false);
  assert.equal(F.needsRefresh({filed:'2026-02-15'},'2026-05-01'),true);
  assert.equal(F.needsRefresh({filed:'2026-02-15',checkedFiled:'2026-05-01'},'2026-05-01'),false);
  assert.equal(F.needsRefresh({filed:'2026-02-15'},'bad'),false);
});
test('module is pure: no network, storage or DOM references; pinned',()=>{
  const f=path.join(__dirname,'../has/fundamental-filter.js');const src=fs.readFileSync(f,'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.|UrlFetchApp/.test(src));
  const pins=require('./lib/live-data-pins.json');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),pins.addedRuntimeFiles['has/fundamental-filter.js']);
});
