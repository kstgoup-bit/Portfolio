'use strict';
// Independent synthetic-only review: no auto-run scripts, resources, real storage or network.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),P=require('../has/snapshot-policy.js'),R=require('../has/return-assessment.js');
const html=fs.readFileSync(path.join(__dirname,'../portfolio_v5.html'),'utf8');
const baseline=require('./lib/speed-minimal-projection.cjs').beforeSpeedBytes('portfolio_v5.html').toString();
const pairs=[['dashboard','all'],['general','gen'],['domestic','dom'],['overseas','ov'],['pension','pen']];
const section=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
function setup(t,source=html,actual=false){
 const dom=new JSDOM(source,{url:'https://synthetic.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 let version=0;const calls=[];w.scrollTo=()=>{};
 for(const n of ['renderMemo','renderRetirement','renderNotouch','renderDebt','renderNetWorth','renderPrincipleDash'])w[n]=()=>{};
 w.eval(section(source,'function renderAllReturnsTables()','function updateHeaderH()'));
 w.eval(section(source,'var TAB_GROUPS=','// =============================================\n// 노터치 자산'));
 w.renderReturnsTable=(key,id)=>{calls.push({key,id,version,active:w.document.querySelector('.panel.active').id});w.document.getElementById(id).textContent=String(version);};
 if(actual){
  const NOW=Date.parse('2026-11-10T03:00:00Z'),NativeDate=w.Date;
  w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}};
  w.HASSnapshotPolicy=P;w.HASReturnAssessment=R;w.HASBackupUI={isWriteBlocked:()=>w.blocked};
  w.domStocks=[];w.ovStocks=[];w.penStocks=[];w.genStocks=[{id:1,ticker:'SYNTH',quantity:10,avgPrice:80,currentPrice:110}];
  w.freshPrice={'KR:SYNTH':true};w.quoteMeta={'KR:SYNTH':NOW-1};w.snapshotQuoteValues={'KR:SYNTH':110};
  const old=P.evaluate({key:'gen',now:NOW-7*86400000,accounts:{gen:[{...w.genStocks[0],currentPrice:100}]},freshPrice:{'KR:SYNTH':true},quoteMeta:{'KR:SYNTH':NOW-7*86400000-1},quoteValues:{'KR:SYNTH':100}});
  a.equal(old.ok,true);w.snapshots={gen:[old.snapshot]};w.getReturnActivity=()=>({flows:[]});w.snapshotEscape=s=>String(s).replaceAll('<','&lt;');
  w.benchmarkAssessmentForInterval=()=>({});w.getBenchDataLatestLabel=()=>({text:'synthetic',source:'offline'});w.getBenchFetchTimeLabel=()=>({text:'synthetic'});w._benchStatusMsg='offline';
  w.eval(section(source,'var RETURN_PERIODS_LEFT =','// Classified activity entry'));
  w.eval(section(source,'function returnRowHtml(','function renderAllReturnsTables()'));
  w.eval(section(source,'function snapshotWriteBlocked()','function snapshotMissingText('));
  Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem:()=>{throw Error('unexpected write');},removeItem:()=>{throw Error('unexpected removal');}}});
 }
 return {w,calls,advance(){version++;},table:key=>w.document.getElementById(key+'ReturnsTable').innerHTML};
}
test('independent speed: default dashboard, every tab mapping, same-tab refresh and inactive skipping',t=>{
 const f=setup(t);f.w.renderAllReturnsTables();a.deepEqual(f.calls.map(c=>c.key),['all']);
 for(const [tab,key]of pairs){f.calls.length=0;f.w.switchTab(tab);a.deepEqual(f.calls.map(c=>[c.key,c.id,c.active]),[[key,key+'ReturnsTable','panel-'+tab]]);f.advance();f.w.switchTab(tab);a.equal(f.calls.length,2);a.equal(f.calls[1].version,f.calls[0].version+1);}
 f.calls.length=0;f.w.switchTab('settings');f.w.renderAllReturnsTables();f.w.switchTab('invalid');a.equal(f.calls.length,0);a.equal(f.w.document.querySelector('.panel.active').id,'panel-settings');
});
test('independent speed: hidden tables defer work but next entry and each visible refresh read latest state',t=>{
 const f=setup(t);f.w.switchTab('general');const old=f.table('gen');f.w.switchTab('settings');f.advance();f.w.renderAllReturnsTables();a.equal(f.table('gen'),old);f.w.switchTab('general');a.notEqual(f.table('gen'),old);f.advance();f.w.renderAllReturnsTables();a.equal(f.table('gen'),'2');
});
test('independent speed: actual calculations and generated table UI equal historical renderer',t=>{
 const f=setup(t,html,true),b=setup(t,baseline,true);
 for(const [tab,key]of pairs){f.w.switchTab(tab);b.w.renderReturnsTable(key,key+'ReturnsTable');a.equal(f.table(key),b.table(key),key);}
 a.match(f.table('gen'),/\+10\.00/);
});
test('independent speed: restore hold replaces prior result and unblock/mutations recompute without writes',t=>{
 const f=setup(t,html,true);f.w.switchTab('general');a.match(f.table('gen'),/\+10\.00/);const before=JSON.stringify(f.w.snapshots);
 f.w.blocked=true;f.w.switchTab('general');a.doesNotMatch(f.table('gen'),/\+10\.00/);a.match(f.table('gen'),/현재 평가 자료 부족/);
 f.w.blocked=false;f.w.genStocks[0].currentPrice=120;f.w.snapshotQuoteValues['KR:SYNTH']=120;f.w.renderAllReturnsTables();a.match(f.table('gen'),/\+20\.00/);a.equal(JSON.stringify(f.w.snapshots),before);
 f.w.switchTab('settings');f.w.genStocks[0].currentPrice=130;f.w.snapshotQuoteValues['KR:SYNTH']=130;f.w.switchTab('general');a.match(f.table('gen'),/\+30\.00/);
});
test('independent speed: projection restores full baseline and only two scheduling sites differ',()=>{
 const start='function renderAllReturnsTables()',end='function updateHeaderH()';
 const preData=require('./lib/live-data-projection.cjs').beforeLiveDataBytes('portfolio_v5.html').toString();
 let s=preData.replace(section(preData,start,end),section(baseline,start,end));
 const added='  if(typeof renderAllReturnsTables==="function") renderAllReturnsTables();\n';
 a.equal(s.split(added).length,2);s=s.replace(added,'');a.equal(s,baseline);
});
