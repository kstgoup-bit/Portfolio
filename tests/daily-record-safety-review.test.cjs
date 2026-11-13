'use strict';
// Independent, synthetic-only edge probes. No external transport or real records.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const R=require('../has/return-assessment.js'),B=require('../backup/core.js');
const html=fs.readFileSync(path.join(__dirname,'../portfolio_v5.html'),'utf8');
function activity(raw,fail=false){
 const code=html.slice(html.indexOf('function activityReadStored()'),html.indexOf('function activityWriteStored('))+html.slice(html.indexOf('function getReturnActivity('),html.indexOf('// Modified Dietz 방식:'));
 const w={KSTPortfolioBackup:B,localStorage:{getItem(){if(fail)throw Error('unreadable');return raw;}},activityAccountLabel:k=>['dom','ov','pen','gen'].includes(k)?k:null};w.window=w;vm.runInNewContext(code,w);return w.getReturnActivity('gen');
}
const base={key:'gen',startTs:Date.parse('2026-11-09T03:00:00Z'),endTs:Date.parse('2026-11-10T03:00:00Z'),startVal:1000,endVal:1100};
test('validated storage path distinguishes absence from corruption and unreadability',()=>{
 for(const raw of [null,'{}','{"gen":[]}']){const f=activity(raw),r=R.modifiedDietz({...base,...f});a.equal(r.status,'unverified');a.equal(r.valuePct,10);a.ok(r.warnings.includes('external-flow-completeness-unverified'));}
 for(const raw of ['', 'null','[]','{"gen":null}','{"gen":[{"amount":12}]}'])a.equal(R.modifiedDietz({...base,...activity(raw)}).status,'hold');
 a.equal(R.modifiedDietz({...base,...activity('{}',true)}).status,'hold');
});
test('missing explicit flows never silently becomes zero capital, including undefined',()=>{
 for(const extra of [{},{flows:undefined},{flows:null},{flows:{}}])a.equal(R.modifiedDietz({...base,...extra}).status,'hold');
});
function loadHelpers(file,segments,expression){const source=fs.readFileSync(path.join(__dirname,file),'utf8'),w={require,__dirname,URL,TextDecoder,Date,console};vm.runInNewContext(segments(source)+'\n;globalThis.helpers='+expression,w);return w.helpers;}
const h=loadHelpers('daily-return-assessment.test.cjs',s=>s.slice(0,s.indexOf("test('actual saved")),'({snap,input,flow,START,NOW})');
test('large delayed DEP cash corrections are never inferred as external flows or suppress holdings warnings',()=>{
 const first=h.snap({ts:h.START,quantity:10,extra:[{id:2,ticker:'DEP_TEST',quantity:1,avgPrice:100,currentPrice:100}]}),last=h.snap({quantity:20,extra:[{id:2,ticker:'DEP_TEST',quantity:1,avgPrice:100,currentPrice:900}]});
 const r=R.assess(h.input({records:[first],currentCandidate:last,flows:[]}));a.equal(r.dietz.status,'unverified');a.equal(r.dietz.netFlow,0);a.ok(r.dietz.warnings.includes('cash-balance-timing-unverified'));a.equal(r.scope.transitions[0].explained,false);
});
test('explicit mismatched transition evidence still holds instead of being upgraded to mere warning',()=>{
 const first=h.snap({ts:h.START}),last=h.snap({quantity:20});
 const e={version:1,id:'synthetic-event',account:'gen',kind:'internal-trade',fromTs:first.ts,toTs:last.ts,effectiveTs:last.ts,recordedAt:last.recordedAt,timeCertainty:'instant',source:'user-entered',changes:[],flowIds:[],externalAmount:0,cashIncluded:true};
 const r=R.assess(h.input({records:[first],currentCandidate:last,evidence:[e]}));a.equal(r.dietz.status,'hold');a.ok(r.dietz.reasons.includes('transition-evidence-mismatch'));
});
const g=loadHelpers('benchmark-gas-link.test.cjs',s=>s.slice(0,s.indexOf("test('configured Korean"))+s.slice(s.indexOf('function harness('),s.indexOf("test('configured GAS is first")),'({harness,fixture,drain,settleUS})');
test('synchronous JSONP append callback plus onerror and duplicate invocation settle exactly once',async()=>{
 const x=g.harness(),original=x.w.document.head.appendChild;let callback;
 x.w.document.head.appendChild=function(s){original(s);callback=x.w[new URL(s.src).searchParams.get('callback')];callback(g.fixture());callback(g.fixture());};
 x.w.fetchBenchmarkHistory(true);await g.drain();a.equal(x.writes.length,1);a.equal(x.scripts[0].parentNode,null);a.equal(x.w._benchGasCleanup,null);a.equal(x.w._benchFetchInFlight,false);
});
test('retained error handler after successful callback cannot trigger Korean fallback or double-save',async()=>{
 const x=g.harness();x.w.fetchBenchmarkHistory(true);const err=x.scripts[0].onerror,late=x.w[x.callback()];late(g.fixture());err();late(g.fixture());await g.settleUS(x);a.equal(x.writes.length,1);a.equal(x.fetches.some(u=>u.includes('069500')),false);
});
