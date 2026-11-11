'use strict';
// Synthetic valuations and DOM only. No actual records, live API, storage or keys.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../has/snapshot-policy.js'),R=require('../has/return-assessment.js');
const NOW=Date.parse('2026-11-11T03:00:00Z'),DAY=86400000,START=NOW-7*DAY;
const html=fs.readFileSync(path.join(__dirname,'../portfolio_v5.html'),'utf8');
function snap(ts,quantity=10,cash=500){
 const stocks=[{id:1,ticker:'SYNTH',quantity,currentPrice:100,avgPrice:80},{id:2,ticker:'DEP_TEST',quantity:1,currentPrice:cash,avgPrice:cash}];
 const r=P.evaluate({key:'gen',now:ts,accounts:{gen:stocks},freshPrice:{'KR:SYNTH':true},quoteMeta:{'KR:SYNTH':ts-1},quoteValues:{'KR:SYNTH':100},fx:1400});a.equal(r.ok,true);return r.snapshot;
}
function input(extra={}){return {key:'gen',records:[snap(START)],targetTs:START,endTs:NOW,currentCandidate:snap(NOW,15),flows:[],benchmark:{valuePct:3,fromTs:START,toTs:NOW,currency:'KRW',status:'unverified'},...extra};}
function external(extra={}){return {activityVersion:1,id:'synthetic-flow',account:'gen',kind:'external-in',ts:NOW-DAY,amount:500,currency:'KRW',recordedAt:new Date(NOW).toISOString(),timeCertainty:'instant',...extra};}
for(const [label,q] of [['buy',15],['sell',5]])test('share '+label+' with delayed cash has explicit unverified Dietz and alpha without invented flows',()=>{
 const args=input({currentCandidate:snap(NOW,q)}),before=JSON.stringify(args),r=R.assess(args);
 for(const metric of [r.dietz,r.alpha]){a.equal(metric.status,'unverified');a.ok(metric.warnings.includes('unexplained-holdings-change'));a.ok(metric.warnings.includes('cash-balance-timing-unverified'));a.ok(metric.warnings.includes('external-flow-completeness-unverified'));}
 a.equal(r.dietz.netFlow,0);a.equal(r.scope.transitions[0].explained,false);a.equal(r.signalHold,true);a.equal(r.quality,'unconfirmed');a.equal(JSON.stringify(args),before);
});
test('delayed cash correction changes the estimate, never reclassifies a trade or fabricates a deposit',()=>{
 const before=snap(START),buy=snap(NOW-2*DAY,15,500),settled=snap(NOW,15,0.01);
 const first=R.assess(input({records:[before],currentCandidate:buy,endTs:buy.ts}));
 const final=R.assess(input({records:[before,buy],currentCandidate:settled}));
 a.ok(first.dietz.valuePct>30);a.ok(Math.abs(final.dietz.valuePct)<0.001);a.equal(final.dietz.netFlow,0);a.equal(final.dietz.status,'unverified');a.ok(final.scope.transitions.every(x=>!x.explained));
});
test('a recorded external deposit is applied while an omitted one stays explicitly unknown',()=>{
 const unknown=R.assess(input()),recorded=R.assess(input({flows:[external()]}));
 a.ok(unknown.dietz.valuePct>30);a.equal(recorded.dietz.valuePct,0);a.equal(recorded.dietz.netFlow,500);
 for(const r of [unknown,recorded]){a.equal(r.dietz.status,'unverified');a.ok(r.dietz.warnings.includes('external-flow-completeness-unverified'));a.equal(r.scope.transitions[0].explained,false);}
});
test('absent, null and malformed flow lists are not zero-flow assumptions',()=>{
 for(const value of [undefined,null,{},[null]]){const args=input();if(value===undefined)delete args.flows;else args.flows=value;const r=R.assess(args);a.equal(r.dietz.status,'hold');a.equal(r.dietz.valuePct,null);a.equal(r.alpha.status,'hold');a.equal(r.raw.computable,true);}
 const args={key:'gen',startTs:START,endTs:NOW,startVal:100,endVal:110};a.deepEqual(R.modifiedDietz(args).reasons,['missing-flow-history']);
});
test('date-only external cash still holds despite share-change warning',()=>{
 const r=R.assess(input({flows:[external({ts:Date.parse('2026-11-10T00:00:00Z'),timeCertainty:'date-only',effectiveDate:'2026-11-10',utcOffsetMinutes:0})]}));
 a.equal(r.dietz.status,'hold');a.equal(r.dietz.valuePct,null);a.ok(r.dietz.reasons.includes('flow-time-uncertain'));a.equal(r.alpha.status,'hold');
});
test('same account cash offset is not treated as proof of an internal trade',()=>{
 const r=R.assess(input({currentCandidate:snap(NOW,12,300)}));a.equal(r.dietz.valuePct,0);a.equal(r.dietz.status,'unverified');a.equal(r.scope.transitions[0].explained,false);a.ok(r.dietz.warnings.includes('unexplained-holdings-change'));
});
test('foreign currency alpha and corrupt current prices retain their holds',()=>{
 const r=R.assess(input({benchmark:{...input().benchmark,currency:'USD'}}));a.equal(r.dietz.status,'unverified');a.equal(r.alpha.status,'hold');
 const current=snap(NOW);current.components[0].price=0;a.equal(R.assess(input({currentCandidate:current})).dietz.status,'hold');
});
test('rendered number carries unverified label, quantity/cash/omission warnings and readable date text',()=>{
 const {JSDOM}=require('jsdom'),d=new JSDOM('<!doctype html><main></main>');try{
  const context={Date,Number,String,window:{HASReturnAssessment:R},snapshotEscape:s=>String(s).replace(/[<>&]/g,''),getReturnActivity:()=>({flows:[],flowAccounts:[]})};vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function returnRowHtml('),html.indexOf('function returnsSectionHtml(')),context);
  const report=R.assess(input());const view={cache:{'7일':report}};const out=context.returnRowHtml({label:'7일',days:7},'gen',2000,NOW,'dietz',view);d.window.document.querySelector('main').innerHTML=out;
  // 2026-11-12 declutter: row shows value + '*'; reasons live in the section's collapsible details (view.details)
  const text=d.window.document.body.textContent+' '+view.details.dietz.join(' ');a.match(text,/미검증 참고값/);a.match(text,/보유 변화 미검증/);a.match(text,/예수금 지연/);a.match(text,/누락 여부 미검증/);a.doesNotMatch(out,/#546e7a/);a.match(d.window.document.querySelector('strong').textContent,/% \*$/);
 }finally{d.window.close();}
});
test('return activity reader uses validated stored source once and never stale memory or writes',()=>{
 const rows=[external()],context={activityReadStored:()=>({groups:{gen:rows}}),activityAccountLabel:k=>['dom','ov','pen','gen'].includes(k),deposits:{gen:[]}};vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function getReturnActivity('),html.indexOf('// Modified Dietz 방식:')),context);
 let r=context.getReturnActivity('gen');a.equal(r.flows[0],rows[0]);a.deepEqual(Array.from(r.flowAccounts),['gen']);
 context.activityReadStored=()=>{throw Error('corrupt JSON or denied storage read');};r=context.getReturnActivity('gen');a.equal(r.flows,null);
 context.activityReadStored=()=>({groups:{}});a.equal(context.getReturnActivity('gen').flows.length,0);a.equal(context.getReturnActivity('constructor').flows,null);
});
test('table, chart and compatibility calculator all use guarded activity reader',()=>{
 const section=html.slice(html.indexOf('function calcModifiedDietz('),html.indexOf('function renderAllReturnsTables('));a.equal((section.match(/getReturnActivity\(key\)/g)||[]).length,2);
 const chart=html.slice(html.indexOf('function renderLineChart('),html.indexOf('function renderLineChart(')+20000);a.match(chart,/getReturnActivity\(snapKey\)/);a.match(chart,/chartAssessment\.dietz\.warnings\.map\(returnReasonText\)/);
});
test('followup reversible source proof pins exact reviewed remote baseline and only three runtime files',()=>{
 const crypto=require('node:crypto'),pins=require('./lib/daily-followup-pins.json'),F=require('./lib/daily-followup-projection.cjs');
 a.equal(pins.remoteBaseline,'e738952130116cc943134872f3260c5b0099af89');a.equal(pins.baselineTree,'ac855b6e41a88a24e1bda33e40f20d42cb2cb591');
 a.deepEqual(Object.keys(pins.currentSha256).sort(),['has/benchmark-history-policy.js','has/return-assessment.js','portfolio_v5.html']);
 for(const file of Object.keys(pins.currentSha256)){a.equal(crypto.createHash('sha256').update(require('./lib/risk-menu-projection.cjs').beforeRiskMenuBytes(file)).digest('hex'),pins.currentSha256[file]);a.equal(crypto.createHash('sha256').update(F.beforeFollowupBytes(file)).digest('hex'),pins.baselineSha256[file]);}
});
