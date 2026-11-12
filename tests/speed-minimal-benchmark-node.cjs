'use strict';
// Synthetic, detached return-table fragment benchmark. Not app startup/network or phone timing.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),current=fs.readFileSync(path.join(root,'portfolio_v5.html'),'utf8');
const projection=require('../tests/lib/speed-minimal-projection.cjs'),baseline=projection.beforeSpeedBytes('portfolio_v5.html').toString();
const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const shared=slice(current,'function returnRowHtml(','function renderAllReturnsTables(');
const periods=slice(current,'var RETURN_PERIODS_LEFT =','// Classified activity entry');
const dispatch=s=>slice(s,'function renderAllReturnsTables()','function updateHeaderH()');
const policy=require('../has/snapshot-policy.js'),now=Date.parse('2026-11-11T03:00:00Z'),keys=['all','gen','dom','ov','pen'];
const accounts={};for(const[k,count]of [['gen',11],['dom',10],['ov',10],['pen',10]]) accounts[k]=Array.from({length:count},(_,i)=>({id:i,name:'합성 '+k+i,ticker:'SYN_'+k+i,quantity:10+i,avgPrice:80+i,currentPrice:100+i}));
function input(key,ts,day){const copy=JSON.parse(JSON.stringify(accounts)),freshPrice={},quoteMeta={FX:ts},quoteValues={FX:1370};for(const[k,rows]of Object.entries(copy))for(const row of rows){row.currentPrice+=day/100;const q=(k==='ov'?'US:':'KR:')+row.ticker;freshPrice[q]=true;quoteMeta[q]=ts;quoteValues[q]=row.currentPrice;}return {key,now:ts,accounts:copy,freshPrice,quoteMeta,quoteValues,fx:1370};}
const fixture={snapshots:{},inputs:{}};
for(const key of keys){fixture.snapshots[key]=Array.from({length:170},(_,d)=>{const r=policy.evaluate(input(key,now-(170-d)*86400000,d));assert.equal(r.ok,true);return r.snapshot;});fixture.inputs[key]=input(key,now,170);}
const map={all:'dashboard',gen:'general',dom:'domestic',ov:'overseas',pen:'pension'};
const median=a=>{const s=[...a].sort((a,b)=>a-b),n=s.length;return n%2?s[Math.floor(n/2)]:(s[n/2-1]+s[n/2])/2;};

const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><style>.panel{display:none}.panel.active{display:block}</style>'+keys.map(k=>'<section id="panel-'+map[k]+'" class="panel '+(k==='all'?'active':'')+'"><div id="'+k+'ReturnsTable"></div></section>').join(''),{url:'https://synthetic.invalid',runScripts:'outside-only'}),w=dom.window;
try {
 for(const p of ['has/snapshot-policy.js','has/return-assessment.js'])w.eval(fs.readFileSync(path.join(root,p),'utf8'));
 w.eval('window.fixture='+JSON.stringify(fixture)+';window.snapshots=fixture.snapshots;window.inputs=fixture.inputs;window.counts={eval:0,assess:0};window.snapshotEvaluation=function(k){counts.eval++;return HASSnapshotPolicy.evaluate(inputs[k]);};var realAssess=HASReturnAssessment.assess;window.HASReturnAssessment=Object.assign({},HASReturnAssessment,{assess:function(x){counts.assess++;return realAssess(x);}});');
 w.snapshotEscape=s=>String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
 w.getReturnActivity=()=>({flows:[],flowAccounts:[]});w.benchmarkAssessmentForInterval=(k,fromTs,toTs)=>({valuePct:3,fromTs,toTs,currency:'KRW',status:'unverified',detail:'SYNTHETIC'});w.getBenchDataLatestLabel=w.getBenchFetchTimeLabel=()=>({text:'SYNTHETIC',source:'SYNTHETIC'});w._benchStatusMsg='SYNTHETIC';
 w.eval(periods+shared);w.eval(dispatch(baseline)+'\nwindow.beforeDispatch=renderAllReturnsTables;');w.eval(dispatch(current)+'\nwindow.afterDispatch=renderAllReturnsTables;');
 const samples={before:[],after:[]},calls={};let expected;
 for(let i=0;i<25;i++)for(const mode of i%2?['after','before']:['before','after']){
  w.counts={eval:0,assess:0};w.document.querySelectorAll('[id$="ReturnsTable"]').forEach(e=>e.innerHTML='');const t=performance.now();w[mode+'Dispatch']();const ms=performance.now()-t;
  calls[mode]=JSON.parse(JSON.stringify(w.counts));if(i>=5)samples[mode].push(ms);const html=w.document.getElementById('allReturnsTable').innerHTML;if(mode==='before')expected=html;else if(expected)assert.equal(html,expected);
 }
 for(const key of keys){w.document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('active',e.querySelector('#'+key+'ReturnsTable')!==null));w.beforeDispatch();const before=w.document.getElementById(key+'ReturnsTable').innerHTML;w.afterDispatch();assert.equal(w.document.getElementById(key+'ReturnsTable').innerHTML,before);}
 assert.deepEqual(calls.before,{eval:5,assess:50});assert.deepEqual(calls.after,{eval:1,assess:10});
 const result={scope:'Node.js/JSDOM detached return-table fragment; NOT browser layout, whole-app startup, network, or phone timing',baseline:'127bca49456827a0b9cbd0fb3dc26b8787ef0d80',syntheticStocks:41,historyDaysPerAccount:170,warmupPerVariant:5,measuredPerVariant:20,calls,medianMs:{before:median(samples.before),after:median(samples.after)},samples,networkGuard:'External JSDOM resources disabled; strict test HTTP guard enabled',identicalVisibleHTML:true,nodeVersion:process.version};
 fs.writeFileSync(path.join(root,'evidence-speed/benchmark-node.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,samples:undefined},null,2));
} finally {dom.window.close();}
