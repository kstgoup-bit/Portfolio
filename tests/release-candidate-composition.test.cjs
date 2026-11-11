'use strict';
// Composition only: invented records, in-memory storage, and no live transports.
const test=require('node:test'),a=require('node:assert/strict');
const B=require('../backup/core.js'),H=require('../has/benchmark-history-policy.js');
const P=require('../has/snapshot-policy.js'),R=require('../has/return-assessment.js');
const NOW=Date.parse('2026-11-11T03:00:00Z'),START=NOW-7*86400000;
function memory(extra={}){
 const m=new Map(Object.entries({...Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]'])),...extra})),writes=[];
 return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,
  setItem(k,v){writes.push(k);m.set(k,String(v));},removeItem(k){writes.push(k);m.delete(k);},writes};
}
function sidecar(){
 const dates=['2026-11-09','2026-11-10','2026-11-11'];
 const payload={'069500':{source:'yahoo-chart-v8',symbol:'069500.KS',currency:'KRW',exchange:'KSE',timezone:'Asia/Seoul',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:new Date(NOW).toISOString(),regularMarketPrice:103,fiftyTwoWeekHigh:150,barCount:3,bars:dates.map((d,i)=>({d,c:101+i}))}};
 const candidate=H.parseGasHistory(payload,'KS200',new Date(NOW).toISOString(),{mode:'configured-gas'});a.equal(candidate.ok,true);
 const merged=H.mergeHistoryStore(null,null,candidate,'KS200',NOW);a.equal(merged.ok,true);return JSON.stringify(merged.store);
}
function snap(ts,quantity){
 const result=P.evaluate({key:'gen',now:ts,accounts:{gen:[{id:1,ticker:'SYNTH',quantity,currentPrice:100,avgPrice:80}]},freshPrice:{'KR:SYNTH':true},quoteMeta:{'KR:SYNTH':ts-1},quoteValues:{'KR:SYNTH':100}});
 a.equal(result.ok,true);return result.snapshot;
}
for(const fg of ['50',null])test('combined GAS sidecar + legacy FG '+fg+' + four accounts survive v7 synthetic roundtrip',()=>{
 const general=JSON.stringify([{id:4,name:'Synthetic stock',ticker:'SYNTH',quantity:2,currentPrice:100,avgPrice:80}]);
 const observed=sidecar(),src=memory({v5_gen:general,v5_fg:'25',v5_benchHistV2:observed});
 const plan=B.parse(JSON.stringify({version:'v5',domStocks:[],ovStocks:[],penStocks:[],fg}));
 B.preview(src,plan);a.equal(src.writes.length,0);B.apply(src,plan);
 a.equal(src.getItem('v5_fg'),fg??'25');a.equal(src.getItem('v5_gen'),general);a.equal(src.getItem('v5_benchHistV2'),observed);
 const exported=B.create(src);a.equal(exported.schemaVersion,7);const dst=memory();B.apply(dst,B.parse(JSON.stringify(exported)));
 for(const [k,v]of Object.entries(exported.storage))a.equal(dst.getItem(k),v,k);
 const restored=JSON.parse(dst.getItem('v5_benchHistV2'));a.equal(H.validateStore(restored,null,NOW).ok,true);
 for(const p of restored.series.KS200.observations){a.equal(p.providerBarTs,null);a.equal(p.adjustment,'unverified');}
 a.equal(restored.series.KS200.observations.at(-1).finality,'provisional');
 B.undo(src);a.equal(src.getItem('v5_fg'),'25');a.equal(src.getItem('v5_gen'),general);a.equal(src.getItem('v5_benchHistV2'),observed);
});
test('share-change reference return and alpha keep their uncertainty through v7 backup',()=>{
 const records=[snap(START,10)],candidate=snap(NOW,15);
 const flows=[{activityVersion:1,id:'synthetic-only-flow',account:'gen',kind:'external-in',ts:NOW-86400000,amount:100,currency:'KRW',recordedAt:new Date(NOW).toISOString(),timeCertainty:'instant'}];
 const src=memory({v5_snap:JSON.stringify({gen:records}),v5_deposits:JSON.stringify({gen:flows}),v5_benchHistV2:sidecar(),v5_fg:'50'}),dst=memory();
 const input={key:'gen',records,targetTs:START,endTs:NOW,currentCandidate:candidate,flows,benchmark:{valuePct:3,fromTs:START,toTs:NOW,currency:'KRW',status:'unverified'}};
 const before=R.assess(input);B.apply(dst,B.parse(JSON.stringify(B.create(src))));
 const after=R.assess({...input,records:JSON.parse(dst.getItem('v5_snap')).gen,flows:JSON.parse(dst.getItem('v5_deposits')).gen});
 a.deepEqual(after,before);a.equal(after.dietz.netFlow,100);
 for(const metric of [after.dietz,after.alpha]){a.equal(metric.status,'unverified');a.ok(metric.warnings.includes('unexplained-holdings-change'));a.ok(metric.warnings.includes('external-flow-completeness-unverified'));}
 a.equal(after.signalHold,true);a.equal(after.quality,'unconfirmed');
});
test('corrupt FG cannot write or displace valid GAS evidence and general-account values',()=>{
 const observed=sidecar(),src=memory({v5_fg:'25',v5_benchHistV2:observed,v5_gen:'[]'});
 a.throws(()=>B.parse(JSON.stringify({version:'v5',domStocks:[],fg:'50x'})));
 a.equal(src.writes.length,0);a.equal(src.getItem('v5_fg'),'25');a.equal(src.getItem('v5_benchHistV2'),observed);a.equal(src.getItem('v5_gen'),'[]');
});
