'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const S=require('../has/signal-scorecard.js');
const NOW=Date.parse('2026-11-20T01:00:00Z');
function row(t,o){return Object.assign({market:'US',ticker:t,status:'reference',drawdownBasis:'bar-close-high-365d',price:100,drawdownPct:-30,asOf:'2026-11-19'},o||{});}
function summ(o){return Object.assign({generatedAt:'2026-11-20T00:00:00Z',items:new Array(100).fill(0),missingCount:2},o||{});}
const BENCH={US:{ticker:'SPY',asOf:'2026-11-19',close:500},KR:{ticker:'069500',asOf:'2026-11-19',close:40000}};
test('gate: old, future, many-missing summaries are refused',()=>{
  assert.equal(S.gate(summ(),NOW).ok,true);
  assert.deepEqual(S.gate(summ({generatedAt:'2026-11-18T00:00:00Z'}),NOW).reasons,['summary-too-old']);
  assert.deepEqual(S.gate(summ({generatedAt:'2026-11-21T00:00:00Z'}),NOW).reasons,['future-generatedAt']);
  assert.deepEqual(S.gate(summ({missingCount:6}),NOW).reasons,['too-many-missing']);
  assert.equal(S.gate(summ({missingCount:5}),NOW).ok,true);
  assert.equal(S.gate(null,NOW).ok,false);
});
test('buildSnapshots: any bad row (old basis, stale, no price, future asOf) refuses the whole day',()=>{
  for(const bad of [{drawdownBasis:'provider-high'},{drawdownBasis:undefined},{status:'stale'},{price:null},{asOf:'2026-11-22'},{drawdownPct:5}]){
    const r=S.buildSnapshots(summ(),[row('A'),row('B',bad)],BENCH,NOW);
    assert.equal(r.snapshots.length,0);assert.equal(r.rejected.length,1);
  }
});
test('buildSnapshots: per-market snapshot, bench must match market and date',()=>{
  const rows=[row('A'),row('K1',{market:'KR',ticker:'005930'}),row('B')];
  const r=S.buildSnapshots(summ(),rows,BENCH,NOW);
  assert.equal(r.snapshots.length,2);const us=r.snapshots.find(s=>s.market==='US');
  assert.equal(us.key,'US|2026-11-19');assert.equal(us.benchTicker,'SPY');assert.deepEqual(us.rows.map(x=>x.rank),[1,3]);
  const b2=Object.assign({},BENCH,{KR:{ticker:'069500',asOf:'2026-11-18',close:40000}});
  const r2=S.buildSnapshots(summ(),rows,b2,NOW);assert.equal(r2.snapshots.length,1);assert.equal(r2.rejected[0].market,'KR');
  const r3=S.buildSnapshots(summ(),[row('A'),row('B',{asOf:'2026-11-18'})],BENCH,NOW);assert.equal(r3.snapshots.length,0);assert.equal(r3.rejected[0].reason,'mixed-asOf');
});
test('buildSnapshots: only top 10 are used, names are not stored',()=>{
  const rows=[];for(let i=0;i<14;i++)rows.push(row('T'+i,{name:'x'}));
  const s=S.buildSnapshots(summ(),rows,BENCH,NOW).snapshots[0];
  assert.equal(s.rows.length,10);assert.ok(!JSON.stringify(s).includes('"name"'));
});
test('addSnapshot: duplicate asOf refused, original kept; full store refuses new only',()=>{
  const snap=S.buildSnapshots(summ(),[row('A')],BENCH,NOW).snapshots[0];
  let r=S.addSnapshot(S.emptyStore(),snap,NOW);assert.equal(r.ok,true);
  const r2=S.addSnapshot(r.store,snap,NOW);assert.equal(r2.ok,false);assert.equal(r2.reason,'duplicate-asOf');
  assert.equal(r2.store.snapshots.length,1);assert.equal(r2.store.refused.length,1);
  let st=r.store;let i=0;
  while(true){const s2=Object.assign({},snap,{key:'US|k'+(i++),asOf:'2000-01-01'});const x=S.addSnapshot(st,s2,NOW);if(!x.ok){assert.equal(x.reason,'store-full');assert.equal(x.store.snapshots.length,st.snapshots.length);break;}st=x.store;if(i>5000)assert.fail('no cap');}
  assert.ok(JSON.stringify(st).length<=S.CFG.maxChars);
});
function storeWith(days){ // days: [[asOf,[tickers]]]
  let st=S.emptyStore();
  for(const [d,ts] of days){st=S.addSnapshot(st,{key:'US|'+d,market:'US',asOf:d,recordedAt:d+'T00:00:00Z',benchTicker:'SPY',benchClose:500,rows:ts.map((t,i)=>({ticker:t,rank:i+1,price:100,drawdownPct:-30}))},NOW).store;}
  return st;
}
function dates(n,start){const o=[];for(let i=0;i<n;i++){o.push(new Date(Date.parse((start||'2026-01-01')+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));}return o;}
test('entryEvents: first recording day excluded; consecutive days count once; re-entry needs 5 absent snapshots',()=>{
  const d=dates(14);
  // A present d0..d2 (not an event: d0 is first day; d1,d2 continuous). B enters d3 (only 3 snapshots before → not enough). C present d0 then absent d1..d5, back d6 → event.
  const days=d.map((x,i)=>[x,[...(i<=2?['A']:[]),...(i===0||i===6?['C']:[]),...(i===9?['B']:[])]]);
  days[0][1]=['A','C'];
  const ev=S.entryEvents(storeWith(days));
  assert.deepEqual(ev.map(e=>e.ticker+'@'+e.asOf),['C@'+d[6],'B@'+d[9]]);
  // B at d9: absent d0..d8 = 9 snapshots ≥5 → event; C d6 absent d1..d5 = 5 → event
});
test('entryEvents: re-entry after only 4 absent snapshots is not new',()=>{
  const d=dates(8);const days=d.map((x,i)=>[x,i===0||i===5?['C']:['Z']]);
  const ev=S.entryEvents(storeWith(days)).filter(e=>e.ticker==='C');assert.equal(ev.length,0);
});
const bars=(start,n,f)=>dates(n,start).map((d,i)=>({d,c:f(i)}));
test('scoreEvent: excess return, drawdown, tolerance window, pending, no-data',()=>{
  const ev={market:'US',ticker:'A',asOf:'2026-01-01',price:100,benchTicker:'SPY',benchClose:500};
  const a=bars('2026-01-01',60,i=>i===10?80:100+i),b=bars('2026-01-01',60,i=>500+i);
  const prices={'US:A':a,'US:SPY':b};
  const r=S.scoreEvent(ev,prices,Date.parse('2026-03-20T00:00:00Z'),30);
  assert.equal(r.status,'scored');assert.equal(r.endDate,'2026-01-31');
  assert.ok(Math.abs(r.stockPct-30)<1e-9);assert.ok(Math.abs(r.benchPct-6)<1e-9);assert.ok(Math.abs(r.excessPct-24)<1e-9);
  assert.equal(r.success,true);assert.ok(Math.abs(r.maxDrawdownPct+20)<1e-9);
  assert.equal(S.scoreEvent(ev,prices,Date.parse('2026-02-03T00:00:00Z'),30).status,'pending');
  assert.equal(S.scoreEvent(ev,{'US:A':a,'US:SPY':[]},Date.parse('2026-03-20T00:00:00Z'),30).status,'no-data');
  assert.equal(S.scoreEvent(ev,{'US:A':a.filter(x=>x.d<'2026-01-20'),'US:SPY':b},Date.parse('2026-03-20T00:00:00Z'),30).status,'no-data');
});
test('scoreEvent: bars dated after now are never used (no future leakage)',()=>{
  const ev={market:'US',ticker:'A',asOf:'2026-01-01',price:100,benchTicker:'SPY',benchClose:500};
  const a=bars('2026-01-01',60,i=>100+i),b=bars('2026-01-01',60,i=>500+i);
  const now=Date.parse('2026-02-06T12:00:00Z'); // target 01-31, window ends 02-05 → matured; later bars ignored
  const r=S.scoreEvent(ev,{'US:A':a,'US:SPY':b},now,30);assert.equal(r.status,'scored');assert.ok(r.endDate<='2026-02-06');
  const only=S.scoreEvent(ev,{'US:A':a.filter(x=>x.d>'2026-02-06'),'US:SPY':b.filter(x=>x.d>'2026-02-06')},now,30);
  assert.equal(only.status,'no-data');
});
test('scoreEvent: worse than benchmark is a failure even if stock rose',()=>{
  const ev={market:'US',ticker:'A',asOf:'2026-01-01',price:100,benchTicker:'SPY',benchClose:500};
  const r=S.scoreEvent(ev,{'US:A':bars('2026-01-01',60,i=>100+i*0.1),'US:SPY':bars('2026-01-01',60,i=>500+i*3)},Date.parse('2026-03-20T00:00:00Z'),30);
  assert.equal(r.success,false);assert.ok(r.stockPct>0&&r.excessPct<0);
});
test('summarize: N<30 says 표본 부족 and no verdict words; N>=30 keeps caveat; pending/no-data counted',()=>{
  const mk=(n)=>{const evs=[];const prices={'US:SPY':bars('2026-01-01',60,i=>500)};for(let i=0;i<n;i++){const t='T'+i;evs.push({market:'US',ticker:t,asOf:'2026-01-01',price:100,benchTicker:'SPY',benchClose:500});prices['US:'+t]=bars('2026-01-01',60,j=>i%2?110:90);}return {evs,prices};};
  const now=Date.parse('2026-03-20T00:00:00Z');
  let {evs,prices}=mk(10);let s=S.summarize(evs,prices,now).find(x=>x.market==='US'&&x.horizon===30);
  assert.equal(s.scored,10);assert.equal(s.wins,5);assert.equal(s.enough,false);assert.match(s.label,/표본 부족/);assert.ok(!/좋|나쁘|유효|검증/.test(s.label));
  ({evs,prices}=mk(30));s=S.summarize(evs,prices,now).find(x=>x.market==='US'&&x.horizon===30);
  assert.equal(s.enough,true);assert.match(s.label,/보장은 없음/);assert.equal(s.winRatePct,50);
  const s180=S.summarize(evs,prices,now).find(x=>x.market==='US'&&x.horizon===180);assert.equal(s180.pending,30);assert.equal(s180.scored,0);
  const nd=S.summarize(evs,{},now).find(x=>x.market==='US'&&x.horizon===30);assert.equal(nd.noData,30);assert.equal(nd.entries,30);
});
test('module is a lab-only pure module: no storage/network references',()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'../has/signal-scorecard.js'),'utf8');
  assert.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|document\.|v5_/.test(src));
});
