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
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});let network=0;await context.route('**/*',route=>{network++;return route.abort();});const page=await context.newPage();
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.setContent('<!doctype html><style>.panel{display:none}.panel.active{display:block}</style>'+keys.map(k=>'<section id="panel-'+map[k]+'" class="panel '+(k==='all'?'active':'')+'"><div id="'+k+'ReturnsTable"></div></section>').join(''));
 for(const p of ['has/snapshot-policy.js','has/return-assessment.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,p),'utf8')});
 await page.evaluate(f=>{window.snapshots=f.snapshots;window.inputs=f.inputs;window.counts={eval:0,assess:0};window.snapshotEvaluation=k=>{counts.eval++;return HASSnapshotPolicy.evaluate(inputs[k]);};const real=HASReturnAssessment.assess;HASReturnAssessment.assess=x=>{counts.assess++;return real(x);};window.snapshotEscape=s=>String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));window.getReturnActivity=()=>({flows:[],flowAccounts:[]});window.benchmarkAssessmentForInterval=(k,fromTs,toTs)=>({valuePct:3,fromTs,toTs,currency:'KRW',status:'unverified',detail:'SYNTHETIC'});window.getBenchDataLatestLabel=window.getBenchFetchTimeLabel=()=>({text:'SYNTHETIC',source:'SYNTHETIC'});window._benchStatusMsg='SYNTHETIC';},fixture);
 await page.addScriptTag({content:periods+shared});await page.addScriptTag({content:dispatch(baseline)+'\nwindow.beforeDispatch=renderAllReturnsTables;'});await page.addScriptTag({content:dispatch(current)+'\nwindow.afterDispatch=renderAllReturnsTables;'});
 const samples={before:[],after:[]},calls={};
 for(let i=0;i<35;i++)for(const mode of i%2?['after','before']:['before','after']){const result=await page.evaluate(mode=>{counts={eval:0,assess:0};document.querySelectorAll('[id$="ReturnsTable"]').forEach(e=>e.innerHTML='');const t=performance.now();window[mode+'Dispatch']();return {ms:performance.now()-t,calls:counts,html:document.getElementById('allReturnsTable').innerHTML};},mode);calls[mode]=result.calls;if(i>=5)samples[mode].push(result.ms);if(mode==='before')fixture.html=result.html;else if(fixture.html)assert.equal(result.html,fixture.html);}
 for(const key of keys)await page.evaluate(key=>{document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('active',e.querySelector('#'+key+'ReturnsTable')!==null));beforeDispatch();const before=document.getElementById(key+'ReturnsTable').innerHTML;afterDispatch();if(before!==document.getElementById(key+'ReturnsTable').innerHTML)throw Error('Changed output '+key);},key);
 assert.equal(network,0);assert.deepEqual(calls.before,{eval:5,assess:50});assert.deepEqual(calls.after,{eval:1,assess:10});
 const result={scope:'Actual Chromium detached return-table fragment; not whole-app startup, network, or physical phone',baseline:'127bca49456827a0b9cbd0fb3dc26b8787ef0d80',syntheticStocks:41,historyDaysPerAccount:170,viewport:390,cpuThrottle:4,warmupPerVariant:5,measuredPerVariant:30,calls,medianMs:{before:median(samples.before),after:median(samples.after)},samples,networkRequests:network,identicalVisibleHTML:true,browserVersion:browser.version()};
 fs.writeFileSync(path.join(root,'evidence-speed/benchmark.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,samples:undefined},null,2));await context.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
