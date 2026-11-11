'use strict';
// Independent acceptance tests of repaired behavior, not assertions that the old
// regressions still exist. All data/storage/transports are synthetic and local.
const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const guard = require('./lib/no-network.cjs');
const P = require('../has/snapshot-policy.js');
const H = require('../has/benchmark-history-policy.js');
const B = require('../backup/core.js');
const NOW = Date.parse('2026-11-10T22:00:00Z');
const ISO = new Date(NOW).toISOString();
const DAY = 86400000;
const clone = x => JSON.parse(JSON.stringify(x));
const stock = (extra = {}) => ({id:1,name:'Independent synthetic holding',ticker:'SYNTH',quantity:1,avgPrice:80,currentPrice:100,...extra});
function evaluation({now = NOW, key = 'gen', stocks = [stock()], received = now - 1000, fx = 1400} = {}) {
  const freshPrice = {}, quoteMeta = {}, quoteValues = {};
  for (const s of stocks) { const k=(key==='ov'?'US:':'KR:')+s.ticker; freshPrice[k]=true; quoteMeta[k]=received; quoteValues[k]=s.currentPrice; }
  if (key==='ov') { quoteMeta.FX=received; quoteValues.FX=fx; }
  return P.evaluate({now,key,accounts:{gen:[],dom:[],ov:[],pen:[],[key]:stocks},freshPrice,quoteMeta,quoteValues,fx});
}
function memory(seed = {}) {
  const map = new Map(Object.entries(seed));
  const storage = {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,
    setItem(k,v){if(storage.reject===k)throw Error('Synthetic quota failure');map.set(k,String(v));},removeItem:k=>map.delete(k),all:()=>Object.fromEntries(map)};
  return storage;
}
const seed = () => Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]']));
function yahoo(id='QQQ', dates=['2026-11-05','2026-11-06','2026-11-09'], values=dates.map((_,i)=>100+i), receipt=ISO) {
  const s=H.specs[id];return {chart:{error:null,result:[{meta:{symbol:s.symbol,currency:s.currency,exchangeTimezoneName:s.timezone,exchangeName:id==='KS200'?'KSC':'NMS',fullExchangeName:id==='KS200'?'KSE':'NasdaqGS',instrumentType:'ETF',dataGranularity:'1d'},timestamp:dates.map(d=>Date.parse(d+(id==='KS200'?'T00:00:00Z':'T14:30:00Z'))/1000),indicators:{quote:[{close:values}]}}]}};
}
const parsed = (id, dates, values, receipt=ISO) => H.parseYahoo(yahoo(id,dates,values,receipt),id,receipt);
function appHarness() {
  const {JSDOM}=require('jsdom');
  const html=fs.readFileSync(path.join(ROOT,'portfolio_v5.html'),'utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://offline.invalid/'}),w=dom.window;
  const storage=memory(seed()),timers=[],network=[],messages=[];
  Object.defineProperty(w,'localStorage',{value:storage});Object.defineProperty(w,'sessionStorage',{value:memory()});
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
  w.Date=FixedDate;
  for(const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','open'])w[name]=(...args)=>{network.push(name);throw Error('Unexpected external action '+name);};
  w.setTimeout=(fn,delay)=>{timers.push({fn,delay,cancelled:false});return timers.length;};
  w.clearTimeout=id=>{if(timers[id-1])timers[id-1].cancelled=true;};
  w.setInterval=w.requestAnimationFrame=()=>1;w.clearInterval=()=>{};w.confirm=()=>true;w.alert=()=>{};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  const noop=()=>{},context=new Proxy({},{get:()=>noop,set:()=>true});w.HTMLCanvasElement.prototype.getContext=()=>context;w.HTMLElement.prototype.scrollIntoView=noop;
  w.addEventListener=noop;const listen=w.document.addEventListener.bind(w.document);w.document.addEventListener=(n,f,o)=>{if(n!=='DOMContentLoaded')listen(n,f,o);};
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(m[1])&&m[2].trim())w.eval(m[2]);
  const dependencies=new Set(['has/quote-model.js','has/benchmark-history-policy.js','has/snapshot-policy.js','has/return-assessment.js','has/daily-return-assessment.js','backup/core.js']);
  for(const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi))if(dependencies.has(m[1]))w.eval(fs.readFileSync(path.join(ROOT,m[1]),'utf8'));
  w.renderAll=w.updateHeaderH=w.loadRiskData=w.fetchMarketIndices=w.renderAllReturnsTables=w.refreshAllLineCharts=noop;
  w.showToast=m=>messages.push(m);w.domStocks=[];w.ovStocks=[];w.penStocks=[];w.genStocks=[];w.snapshots={all:[],dom:[],ov:[],pen:[],gen:[]};w.deposits={dom:[],ov:[],pen:[],gen:[]};w.divList=[];
  function quote(stocks=[stock()],key='gen') {w[{gen:'genStocks',dom:'domStocks',pen:'penStocks',ov:'ovStocks'}[key]]=clone(stocks);for(const s of stocks){const k=(key==='ov'?'US:':'KR:')+s.ticker;w.freshPrice[k]=true;w.quoteMeta[k]=NOW-1000;w.snapshotQuoteValues[k]=s.currentPrice;}}
  return {dom,w,storage,timers,messages,network,quote,close:()=>dom.window.close()};
}

test('repair independent: old v5 records and general-account input survive modern backup unchanged',()=>{
  const stocks=[stock({id:17})], rows=[{ts:NOW-20*DAY,val:111,customNote:'preserve exactly'}], deposits=[{ts:NOW-15*DAY,amount:50,note:'old ambiguous contribution'}];
  const input={version:'v5',genStocks:stocks,snapshots:{gen:rows},deposits:{gen:deposits}};
  const plan=B.parse(JSON.stringify(input)),s=memory(seed());B.apply(s,plan);
  a.deepEqual(JSON.parse(s.getItem('v5_gen')),stocks);a.deepEqual(JSON.parse(s.getItem('v5_snap')).gen,rows);a.deepEqual(JSON.parse(s.getItem('v5_deposits')).gen,deposits);
  const exported=B.create(s),p=B.parse(JSON.stringify(exported));
  a.equal(p.values.v5_gen,s.getItem('v5_gen'));a.equal(p.values.v5_deposits,s.getItem('v5_deposits'));a.equal(p.values.v5_snap,s.getItem('v5_snap'));
  a.equal(Object.hasOwn(JSON.parse(p.values.v5_snap).gen[0],'cost'),false);
});

test('repair independent: malformed current valuation never enters an unchanged legacy record',()=>{
  const rows=[{ts:NOW-10*DAY,val:100}],before=JSON.stringify(rows);
  for(const overrides of [{received:NOW-DAY-1},{received:NOW+1},{stocks:[stock({currentPrice:NaN})]},{stocks:[stock({currentPrice:0})]},{key:'ov',fx:NaN}]) {
    const result=evaluation(overrides);a.equal(result.ok,false);a.equal(result.snapshot,null);a.equal(JSON.stringify(rows),before);
  }
});

const returns = () => require('../has/return-assessment.js');
function assessment(extra = {}) {
  return returns().assess({key:'gen',records:[{ts:NOW-20*DAY,val:100}],targetTs:NOW-7*DAY,endTs:NOW,currentCandidate:evaluation({stocks:[stock({currentPrice:150})]}).snapshot,flows:[],evidence:[],...extra});
}
const typedFlow = (extra={}) => ({activityVersion:1,id:'independent-flow-1',account:'gen',kind:'external-in',ts:NOW-10*DAY,amount:50,currency:'KRW',recordedAt:ISO,timeCertainty:'instant',...extra});
const notHeld = metric => {a.equal(metric.computable,true);a.notEqual(metric.status,'hold');};

test('repair independent: actual saved start includes pre-request contribution and live second endpoint without writes',()=>{
  const records=[{ts:NOW-20*DAY,val:100,note:'old observation without cost'}],flows=[{ts:NOW-10*DAY,amount:50}],before=JSON.stringify({records,flows});
  const r=assessment({records,flows});
  notHeld(r.raw);notHeld(r.dietz);a.equal(r.raw.valuePct,50);a.equal(r.dietz.valuePct,0);a.equal(r.dietz.status,'unverified');
  a.equal(r.interval.fromTs,NOW-20*DAY);a.equal(r.interval.toTs,NOW);a.equal(JSON.stringify({records,flows}),before);
  a.match(JSON.stringify(r),/legacy|unverified|unknown/);a.equal(r.signalHold,true);
});

test('repair independent: benchmark failure and currency mismatch do not blank raw or Dietz',()=>{
  for(const benchmark of [null,{valuePct:3,fromTs:NOW-7*DAY,toTs:NOW,currency:'KRW',status:'unverified'},{valuePct:3,fromTs:NOW-20*DAY,toTs:NOW,currency:'USD',status:'available'},{valuePct:NaN,fromTs:NOW-20*DAY,toTs:NOW,currency:'KRW',status:'available'}]) {
    const r=assessment({benchmark});notHeld(r.raw);notHeld(r.dietz);a.equal(r.alpha.status,'hold');
  }
  const matching=assessment({benchmark:{valuePct:10,fromTs:NOW-20*DAY,toTs:NOW,currency:'KRW',status:'available'}});
  notHeld(matching.alpha);a.equal(matching.alpha.valuePct,40);a.notEqual(matching.alpha.status,'available');
});

test('repair independent: stale, malformed, partial and duplicate current endpoints cannot become current returns',()=>{
  const good=evaluation().snapshot,stale=evaluation({now:NOW-1}).snapshot,partial=clone(good);partial.val++;
  for(const currentCandidate of [null,stale,partial,{ts:NOW,val:150},{...good,quality:'verified'},{...good,signalHold:false}]) {
    const r=assessment({currentCandidate});a.equal(r.raw.status,'hold');a.equal(r.dietz.status,'hold');
  }
  const duplicate=assessment({records:[good],targetTs:NOW,currentCandidate:good});a.equal(duplicate.raw.status,'hold');
});

test('repair independent: same-day revisions before selected baseline remain visible and do not contaminate later interval',()=>{
  const first=evaluation({now:NOW-50000,stocks:[stock(),stock({id:2,ticker:'REMOVED',currentPrice:100})]}).snapshot;
  const post=evaluation({now:NOW-30000}).snapshot;
  const history=P.appendDaily([first],post);a.equal(history.ok,true);a.equal(history.records[0].comparisonHold,true);
  const original=JSON.stringify(history.records);
  const later=evaluation({now:NOW,stocks:[stock({currentPrice:110})]}).snapshot;
  const r=assessment({records:history.records,targetTs:post.ts,currentCandidate:later});
  notHeld(r.raw);notHeld(r.dietz);a.equal(r.dietz.valuePct,10);a.equal(JSON.stringify(history.records),original);
});

test('repair independent: basis-only correction does not become scope loss or blank value returns',()=>{
  const first=evaluation({now:NOW-20*DAY}).snapshot;
  const next=evaluation({stocks:[stock({avgPrice:90,currentPrice:110})]}).snapshot;
  const r=assessment({records:[first],currentCandidate:next});notHeld(r.raw);notHeld(r.dietz);a.equal(r.dietz.valuePct,10);
});

test('repair independent: unexplained disappearance cannot be waived by a nearby unrelated deposit',()=>{
  const first=evaluation({now:NOW-20*DAY,stocks:[stock(),stock({id:2,ticker:'REMOVED',currentPrice:50})]}).snapshot;
  const next=evaluation({stocks:[stock({currentPrice:150})]}).snapshot;
  const r=assessment({records:[first],currentCandidate:next,flows:[typedFlow()]});notHeld(r.raw);a.equal(r.dietz.status,'unverified');a.equal(r.scope.transitions[0].explained,false);a.ok(r.dietz.warnings.includes('unexplained-holdings-change'));a.equal(r.alpha.status,'hold');
});

function tradeEvidence(first,next,extra={}) {
  const mini=c=>({ticker:c.ticker,quantity:c.quantity,currency:c.currency,unit:c.unit});
  return {version:1,id:'independent-event-1',account:'gen',kind:'internal-trade',fromTs:first.ts,toTs:next.ts,effectiveTs:NOW-DAY,recordedAt:ISO,timeCertainty:'instant',source:'user-entered',changes:[{componentId:'gen:id:1',before:mini(first.components[0]),after:null},{componentId:'gen:id:2',before:null,after:mini(next.components[0])}],flowIds:[],externalAmount:0,cashIncluded:true,...extra};
}
test('repair independent: exact user-declared trade evidence permits unverified math, not unrelated or duplicated evidence',()=>{
  const first=evaluation({now:NOW-20*DAY}).snapshot,next=evaluation({stocks:[stock({id:2,ticker:'REBALANCED',currentPrice:100})]}).snapshot;
  const good=tradeEvidence(first,next),r=assessment({records:[first],currentCandidate:next,evidence:[good]});
  notHeld(r.raw);notHeld(r.dietz);a.equal(r.dietz.valuePct,0);a.equal(r.dietz.status,'unverified');
  for(const evidence of [[{...good,account:'dom'}],[{...good,cashIncluded:false}],[{...good,changes:good.changes.slice(1)}],[good,clone(good)],[{...good,source:'independently-verified'}]]) {
    const held=assessment({records:[first],currentCandidate:next,evidence});notHeld(held.raw);a.equal(held.dietz.status,'hold');
  }
});

test('repair independent: signed external flows and typed internal trades have distinct Dietz effects',()=>{
  const initial={ts:NOW-20*DAY,val:100};
  const withdrawal=assessment({records:[initial],currentCandidate:evaluation({stocks:[stock({currentPrice:50})]}).snapshot,flows:[typedFlow({kind:'external-out'})]});
  notHeld(withdrawal.dietz);a.equal(withdrawal.dietz.valuePct,0);
  for(const kind of ['internal-buy','internal-sell']) {
    const r=assessment({records:[initial],currentCandidate:evaluation().snapshot,flows:[typedFlow({kind})]});notHeld(r.dietz);a.equal(r.dietz.valuePct,0);
  }
  const duplicate=assessment({flows:[typedFlow(),typedFlow()]});notHeld(duplicate.raw);a.equal(duplicate.dietz.status,'hold');
});

test('repair independent: invalid flow/current/history/accessor inputs fail closed without evaluating getter code',()=>{
  let calls=0;const hostile={};Object.defineProperty(hostile,'ts',{enumerable:true,get(){calls++;throw Error('must not execute');}});
  const r=assessment({records:[hostile]});a.equal(r.raw.status,'hold');a.equal(calls,0);
  for(const flows of [[{ts:NOW-DAY,amount:NaN}],[typedFlow({amount:Infinity})],[typedFlow({currency:'USD'})],[typedFlow({ts:NOW-DAY,kind:'invented'})]]) {
    const result=assessment({flows});notHeld(result.raw);a.equal(result.dietz.status,'hold');
  }
  const cyclic=[];cyclic.push(cyclic);a.equal(assessment({evidence:cyclic}).dietz.status,'hold');
  const inherited=Object.create({ts:NOW-20*DAY,val:100});a.equal(assessment({records:[inherited]}).raw.status,'hold');
});

function av(dates=['2026-11-06','2026-11-09'],prices=[100,102]) {
  return {'Meta Data':{'1. Information':'Daily Prices (open, high, low, close) and Volumes','2. Symbol':'QQQ','3. Last Refreshed':dates.at(-1),'4. Output Size':'Compact','5. Time Zone':'US/Eastern'},'Time Series (Daily)':Object.fromEntries(dates.map((d,i)=>[d,{'1. open':String(prices[i]),'2. high':String(prices[i]+1),'3. low':String(prices[i]-1),'4. close':String(prices[i]),'5. volume':'1000'}]))};
}

test('repair independent benchmark: tiny and material conflicts retain originals while unrelated dates append',()=>{
  for(const change of [0.0001,50]) {
    const old=parsed('QQQ',['2026-11-05','2026-11-06'],[100,101]).points,legacy=JSON.stringify({QQQ:old});
    const incoming=parsed('QQQ',['2026-11-05','2026-11-06','2026-11-09','2026-11-10'],[100+change,101,102,103]);
    const r=H.mergeHistoryStore(null,legacy,incoming,'QQQ',NOW);a.equal(r.ok,true);a.equal(r.changed,true);
    a.deepEqual(r.acceptedDates,['2026-11-09','2026-11-10']);a.equal(r.pendingConflicts.length,1);a.equal(r.pendingConflicts[0].d,'2026-11-05');
    a.equal(r.pendingConflicts[0].existing.close,100);a.equal(r.pendingConflicts[0].alternative.close,100+change);
    const view=H.readStore(r.store,legacy,NOW);a.equal(view.series.QQQ.ok,true);a.deepEqual(view.series.QQQ.points.slice(0,2),old);
    a.equal(r.store.series.QQQ.observations.at(-1).finality,'provisional');
    const dispute=H.selectPointAtOrBefore(view.series.QQQ.points,'QQQ',Date.parse('2026-11-06T19:00Z'),{now:NOW,conflicts:view.series.QQQ.conflicts});a.equal(dispute.ok,false);
    const clean=H.selectPointAtOrBefore(view.series.QQQ.points,'QQQ',NOW,{now:NOW,conflicts:view.series.QQQ.conflicts});a.equal(clean.ok,true);a.equal(clean.date,'2026-11-09');
    a.equal(H.mergeHistoryStore(r.store,legacy,incoming,'QQQ',NOW).changed,false);
  }
});

test('repair independent benchmark: no gap backfill, altered legacy fingerprint or malformed clock can commit',()=>{
  const old=parsed('QQQ',['2026-11-05','2026-11-09'],[100,102]).points,legacy=JSON.stringify({QQQ:old});
  const r=H.mergeHistoryStore(null,legacy,parsed('QQQ',['2026-11-05','2026-11-06','2026-11-09','2026-11-10'],[100,101,102,103]),'QQQ',NOW);
  a.equal(r.ok,true);a.deepEqual(r.acceptedDates,['2026-11-10']);a.ok(r.failures.some(x=>x.d==='2026-11-06'));
  const before=JSON.stringify(r.store),changedRaw=legacy+' ';
  a.equal(H.readStore(r.store,changedRaw,NOW).ok,false);a.equal(H.mergeHistoryStore(r.store,changedRaw,parsed('QQQ'),'QQQ',NOW).ok,false);a.equal(JSON.stringify(r.store),before);
  for(const now of [NaN,Infinity,undefined,'2026-11-10'])a.equal(H.mergeHistoryStore(r.store,legacy,parsed('QQQ'),'QQQ',now).ok,false);
});

test('repair independent benchmark: date-only AV has no invented timestamp and intraday selection uses prior exchange date',()=>{
  const input=av(),p=H.parseAlphaVantage(input,'QQQ',ISO);a.equal(p.ok,true);a.equal(p.points,null);a.equal(p.barTimestampKind,'absent');
  const r=H.mergeHistoryStore(null,null,p,'QQQ',NOW);a.equal(r.ok,true);
  const rows=r.store.series.QQQ.observations;a.ok(rows.every(x=>x.providerBarTs===null&&!Object.hasOwn(x,'ts')));
  const same=H.selectPointAtOrBefore(rows,'QQQ',Date.parse('2026-11-09T20:00Z'),{now:NOW});a.equal(same.ok,true);a.equal(same.date,'2026-11-06');a.equal(same.lagged,true);
  const next=H.selectPointAtOrBefore(rows,'QQQ',Date.parse('2026-11-10T01:00Z'),{now:NOW});a.equal(next.date,'2026-11-06','01:00Z is still Nov 9 in New York');
  const later=H.selectPointAtOrBefore(rows,'QQQ',NOW,{now:NOW});a.equal(later.date,'2026-11-09');a.equal(later.signalHold,true);
});

test('repair independent benchmark: parser identity cannot be copied and input mutation cannot change admitted prices',()=>{
  const input=yahoo('QQQ'),p=H.parseYahoo(input,'QQQ',ISO);a.equal(p.ok,true);a.equal(Object.isFrozen(p),true);a.equal(Object.isFrozen(p.bars[0]),true);
  input.chart.result[0].indicators.quote[0].close[0]=999;
  a.equal(p.bars[0].c,100);a.equal(H.mergeHistoryStore(null,null,p,'QQQ',NOW).ok,true);
  for(const forged of [clone(p),{...p},Object.assign(Object.create(p),{}),{...p,source:'independently-verified',finality:'confirmed'}])a.equal(H.mergeHistoryStore(null,null,forged,'QQQ',NOW).ok,false);
  const wrong=av();wrong['Meta Data']['2. Symbol']='SPY';a.equal(H.parseAlphaVantage(wrong,'QQQ',ISO).ok,false);
  for(const field of ['Note','Information','Error Message'])a.equal(H.parseAlphaVantage({...av(),[field]:'Synthetic provider failure'},'QQQ',ISO).ok,false);
});

test('repair independent benchmark: broken symbol is quarantined without hiding an unrelated valid symbol',()=>{
  const good=parsed('KS200').points,bad=[{ts:Date.parse('2026-11-06T14:30Z'),close:100},{ts:Date.parse('2026-11-06T15:00Z'),close:101}],raw={QQQ:bad,KS200:good};
  const before=JSON.stringify(raw),r=H.readCache(raw,NOW);a.equal(r.ok,true);a.equal(r.series.QQQ.ok,false);a.equal(r.series.QQQ.readOnly,true);a.equal(r.series.KS200.ok,true);a.equal(r.series.QQQ.points,bad);a.equal(JSON.stringify(raw),before);
  const legacy=JSON.stringify(raw),merged=H.mergeHistoryStore(null,legacy,parsed('KS200',['2026-11-05','2026-11-06','2026-11-09','2026-11-10'],[100,101,102,103]),'KS200',NOW);
  a.equal(merged.ok,true);a.equal(H.mergeHistoryStore(merged.store,legacy,parsed('QQQ'),'QQQ',NOW).ok,false);
});

test('repair independent benchmark: hostile metadata, prototype and getter inputs reject without execution',()=>{
  let invoked=0;const hostile={};Object.defineProperty(hostile,'chart',{enumerable:true,get(){invoked++;throw Error('must not execute');}});
  a.equal(H.parseYahoo(hostile,'QQQ',ISO).ok,false);a.equal(invoked,0);
  a.equal(H.readCache(Object.create({QQQ:[]}),NOW).ok,false);
  const cycle={};cycle.chart=cycle;a.equal(H.parseYahoo(cycle,'QQQ',ISO).ok,false);
  for(const receipt of ['2026-02-30T22:00:00Z','2026-11-10T25:00:00Z','2026-11-10T22:00:00+15:00'])a.equal(H.parseYahoo(yahoo('QQQ'),'QQQ',receipt).ok,false);
  const bad=yahoo('QQQ');bad.chart.result[0].timestamp[0]=NaN;a.equal(H.parseYahoo(bad,'QQQ',ISO).ok,false);
});

test('repair independent benchmark: later-day provisional successor preserves both receipts and is never called final',()=>{
  const early='2026-11-09T19:00:00.000Z',first=parsed('QQQ',['2026-11-06','2026-11-09'],[100,102],early);
  const initial=H.mergeHistoryStore(null,null,first,'QQQ',Date.parse(early));a.equal(initial.ok,true);
  const old=clone(initial.store),oldObservation=initial.store.series.QQQ.observations.at(-1);a.equal(oldObservation.finality,'provisional');
  const later=H.mergeHistoryStore(initial.store,null,parsed('QQQ',['2026-11-06','2026-11-09','2026-11-10'],[100,102.5,103]),'QQQ',NOW);a.equal(later.ok,true);
  a.deepEqual(initial.store,old);a.deepEqual(later.store.series.QQQ.observations[1],oldObservation);
  const view=H.readStore(later.store,null,NOW);a.equal(view.series.QQQ.ok,true);
  const active=H.selectPointAtOrBefore(view.series.QQQ.points,'QQQ',NOW,{now:NOW,conflicts:view.series.QQQ.conflicts});a.equal(active.ok,true);a.equal(active.point.close,102.5);a.equal(active.finality,'unverified');
  a.ok(later.store.series.QQQ.conflicts.some(c=>c.d==='2026-11-09'&&c.existing.close===102&&c.alternative.close===102.5&&c.status==='provisional-successor'));
});

test('repair independent benchmark: duplicate serialized legacy keys are not silently flattened',()=>{
  const input='{"QQQ":[],"QQQ":'+JSON.stringify(parsed('QQQ').points)+'}',before=input;
  a.equal(H.readStore(null,input,NOW).ok,false);a.equal(H.mergeHistoryStore(null,input,parsed('QQQ'),'QQQ',NOW).ok,false);a.equal(input,before);
});

test('repair independent benchmark: hostile persisted observation metadata cannot gain trust or survive validation',()=>{
  const r=H.mergeHistoryStore(null,null,parsed('QQQ'),'QQQ',NOW);a.equal(r.ok,true);
  for(const mutate of [p=>p.close=NaN,p=>p.finality='confirmed',p=>p.providerBarTs=null,p=>p.d='2026-02-30',p=>p.source='official',p=>p.receivedAt='2026-11-11T01:00:00Z',p=>p.id='forged',p=>p.extra='unknown']) {
    const s=clone(r.store);mutate(s.series.QQQ.observations[0]);const checked=H.readStore(s,null,NOW);a.equal(checked.ok&&checked.series.QQQ.ok,false);
  }
  const s=clone(r.store);s.series.QQQ.conflicts=Array(H.limits.conflicts+1).fill(null);const checked=H.readStore(s,null,NOW);a.equal(checked.ok&&checked.series.QQQ.ok,false);
});

test('repair independent benchmark: incomplete conflict metadata never grants provisional-successor selection',()=>{
  const rows=parsed('QQQ').points;
  for(const conflict of [{d:'2026-11-09',status:'provisional-successor'},{d:'2026-11-09',status:'pending-review'},null])a.equal(H.selectPointAtOrBefore(rows,'QQQ',NOW,{now:NOW,conflicts:[conflict]}).ok,false);
});

test('repair independent: bounded histories and date-only capital uncertainty cannot become precise returns',()=>{
  const oversized=Array(50001).fill({ts:NOW-20*DAY,val:100});a.equal(assessment({records:oversized}).raw.status,'hold');
  const r=assessment({flows:[typedFlow({ts:Date.parse('2026-11-06T12:00:00Z'),timeCertainty:'date-only',effectiveDate:'2026-11-06',utcOffsetMinutes:0})]});
  notHeld(r.raw);a.equal(r.dietz.status,'hold');a.equal(r.alpha.status,'hold');
});

test('repair independent: legacy inert id and kind metadata is preserved rather than reclassified as typed activity',()=>{
  const rows=[{ts:NOW-10*DAY,amount:50,id:'old-inert-id',kind:'internal-buy',version:1}],before=JSON.stringify(rows);
  const r=assessment({flows:rows});notHeld(r.dietz);a.equal(r.dietz.valuePct,0);a.equal(JSON.stringify(rows),before);a.match(JSON.stringify(r.dietz.warnings),/legacy/);
});

test('repair independent benchmark: raw legacy numeric overflow cannot bypass parsed-object validation',()=>{
  const raw='{"QQQ":[{"ts":1793975400000,"close":100,"note":1e999}]}';
  const r=H.readStore(null,raw,NOW);a.equal(r.ok&&r.series.QQQ.ok,false);
  a.throws(()=>B.parse(JSON.stringify({version:'v5',benchHist:{QQQ:[]}}).replace('"QQQ":[]','"QQQ":[{"ts":1793975400000,"close":100,"note":1e999}]')));
});

test.after(()=>a.equal(guard.attempts.length,0,'independent suite must make zero external network attempts'));

test('repair independent UI: actual snapshot interval reaches the display and legacy source stays a warning',()=>{
  const h=appHarness();try {
    h.quote([stock({currentPrice:150})]);h.w.snapshots.gen=[{ts:NOW-20*DAY,val:100}];h.w.deposits.gen=[{ts:NOW-10*DAY,amount:50}];h.storage.setItem('v5_deposits',JSON.stringify(h.w.deposits));
    const before=JSON.stringify({snapshots:h.w.snapshots,deposits:h.w.deposits}),storage=h.storage.all();
    const dietz=h.w.returnRowHtml({label:'1주',days:7},'gen',150,NOW,'dietz'),d1=h.w.returnRowHtml.lastDetail,raw=h.w.returnRowHtml({label:'1주',days:7},'gen',150,NOW,'raw'),d2=h.w.returnRowHtml.lastDetail;
    a.match(dietz,/0\.00%/);a.match(raw,/50\.00%/);a.doesNotMatch(dietz,/비교 보류/);a.match(d1+' '+d2,/실제|계산 기간|적용 기간/);
    a.equal(JSON.stringify({snapshots:h.w.snapshots,deposits:h.w.deposits}),before);a.deepEqual(h.storage.all(),storage);a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent UI: all-account projection keeps legacy account identity and chart external-flow signs',()=>{
  const h=appHarness();try {
    const pts=[{ts:NOW-20*DAY,val:100},{ts:NOW,val:240}];
    h.w.deposits={gen:[typedFlow(),typedFlow({id:'buy-1',kind:'internal-buy',ts:NOW-9*DAY,amount:100}),typedFlow({id:'out-1',kind:'external-out',ts:NOW-8*DAY,amount:10})],dom:[typedFlow({id:'dom-in',account:'dom',ts:NOW-7*DAY,amount:100})],ov:[],pen:[]};
    h.storage.setItem('v5_deposits',JSON.stringify(h.w.deposits));
    const before=JSON.stringify(h.w.deposits),gen=clone(h.w.buildCashFlows('gen',pts)),all=clone(h.w.buildCashFlows('all',pts));
    a.equal(gen.length,3);a.equal(gen.reduce((s,x)=>s+x.amount,0),140);a.equal(all.length,4);a.equal(all.reduce((s,x)=>s+x.amount,0),240);a.equal(JSON.stringify(h.w.deposits),before);
    h.w.deposits={gen:[{ts:NOW-10*DAY,amount:50}],dom:[{ts:NOW-10*DAY,amount:50}],ov:[],pen:[]};
    h.storage.setItem('v5_deposits',JSON.stringify(h.w.deposits));
    const original=JSON.stringify(h.w.deposits),projected=clone(h.w.getDepositsForKey('all'));
    a.deepEqual(projected.map(x=>x.account).sort(),['dom','gen']);a.equal(JSON.stringify(h.w.deposits),original);
    a.equal(h.w.calcModifiedDietz('all',NOW-20*DAY,NOW,100,200),0);
    a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent UI: one missing required cash-flow price prevents a partial benchmark sum',()=>{
  const h=appHarness();try {
    const pts=[{ts:NOW-20*DAY,val:100},{ts:NOW,val:150}],flows=[{ts:pts[0].ts,amount:100},{ts:NOW-10*DAY,amount:50}];
    h.w.priceAtTs=(_hist,ts)=>ts===NOW-10*DAY?null:100;
    const series=h.w.computeCashFlowSeries(pts,flows,[],'QQQ');a.ok(series===null||series[1]===null,'missing flow price must not leave a plausible 100 instead of 150');
    h.w.deposits={gen:[{ts:NOW-10*DAY,amount:50}],dom:[],ov:[],pen:[]};
    const all=h.w.getBenchmarkSeriesForChart('all',pts);a.ok(all===null||all[1]===null);a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent UI: date-only external activity cannot silently become an exact-time benchmark investment',()=>{
  const h=appHarness();try {
    const pts=[{ts:NOW-20*DAY,val:100},{ts:NOW,val:150}];
    h.w.deposits={gen:[typedFlow({ts:Date.parse('2026-11-06T12:00:00Z'),timeCertainty:'date-only',effectiveDate:'2026-11-06',utcOffsetMinutes:0})],dom:[],ov:[],pen:[]};
    h.storage.setItem('v5_deposits',JSON.stringify(h.w.deposits));
    h.w.priceAtTs=()=>100;
    a.equal(h.w.getBenchmarkSeriesForChart('gen',pts),null);a.equal(h.w.getBenchmarkSeriesForChart('all',pts),null);a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent backup: v7 date-native sidecar and typed activity round-trip with exact legacy bytes',()=>{
  const points=parsed('QQQ',['2026-11-05','2026-11-06'],[100,101]).points;
  const legacy=' {\n "QQQ" : '+JSON.stringify(points)+', "KS200": [], "SPY": []\n} ';
  const r=H.mergeHistoryStore(null,legacy,parsed('QQQ',['2026-11-05','2026-11-06','2026-11-09'],[100.0001,101,102]),'QQQ',NOW);a.equal(r.ok,true);
  const src=memory(seed());src.setItem('v5_benchHist',legacy);src.setItem('v5_benchHistV2',JSON.stringify(r.store));
  const activities={gen:[{ts:NOW-10*DAY,amount:1,note:'legacy untouched'},typedFlow({kind:'internal-buy'})],dom:[],ov:[],pen:[]};src.setItem('v5_deposits',JSON.stringify(activities));
  const doc=B.create(src);a.equal(doc.schemaVersion,7);a.equal(doc.storage.v5_benchHist,legacy);
  const dst=memory(seed());B.apply(dst,B.parse(JSON.stringify(doc)));
  a.equal(dst.getItem('v5_benchHist'),legacy);a.equal(dst.getItem('v5_benchHistV2'),src.getItem('v5_benchHistV2'));a.equal(dst.getItem('v5_deposits'),src.getItem('v5_deposits'));
  a.equal(H.readStore(JSON.parse(dst.getItem('v5_benchHistV2')),dst.getItem('v5_benchHist'),NOW).series.QQQ.ok,true);
  a.equal(B.create(dst).storage.v5_benchHist,legacy);
});

test('repair independent backup: v6 cannot smuggle new typed-flow or v2 semantics into an older application',()=>{
  const old={format:B.FORMAT,schemaVersion:6,exportedAt:ISO,scope:'portfolio-only-no-secrets-no-radar',storage:seed()};
  a.equal(B.parse(JSON.stringify(old)).sourceVersion,6);
  a.throws(()=>B.parse(JSON.stringify({...old,storage:{...old.storage,v5_deposits:JSON.stringify({gen:[typedFlow({kind:'internal-buy'})]})}})));
  const sidecar=H.mergeHistoryStore(null,null,parsed('QQQ'),'QQQ',NOW).store;
  a.throws(()=>B.parse(JSON.stringify({...old,storage:{...old.storage,v5_benchHistV2:JSON.stringify(sidecar)}})));
  a.throws(()=>B.parse(JSON.stringify({version:'v5',deposits:{gen:[typedFlow({kind:'internal-buy'})]}})));
});

test('repair independent UI: legacy fingerprint mismatch cannot hide a pending benchmark conflict',()=>{
  const h=appHarness();try {
    const old=parsed('KS200',['2026-11-05','2026-11-06','2026-11-09'],[100,101,102]).points,legacy=JSON.stringify({KS200:old});
    const merged=H.mergeHistoryStore(null,legacy,parsed('KS200',['2026-11-05','2026-11-06','2026-11-09','2026-11-10'],[100,101.1,102,103]),'KS200',NOW);a.equal(merged.ok,true);
    h.storage.setItem('v5_benchHist',legacy+' ');h.storage.setItem('v5_benchHistV2',JSON.stringify(merged.store));h.w.loadBenchmarkCacheSync();
    a.equal(h.w._benchState.ok,true);a.equal(h.w._benchState.readOnly,true);
    const result=h.w.benchmarkAssessmentForInterval('gen',Date.parse('2026-11-09T12:00:00Z'),NOW);
    a.equal(result.status,'hold');a.equal(result.valuePct,null);a.equal(h.network.length,0);
  }finally{h.close();}
});

const microtasks = async()=>{for(let i=0;i<160;i++)await Promise.resolve();};
function syntheticFetch(h,{duplicatePrimary=false,deferred=false}={}) {
  const calls=[],pending=[];
  h.w.getAlphaVantageKey=()=>'';
  h.w.fetch=(url)=>{
    const u=decodeURIComponent(String(url)),id=u.includes('069500')?'KS200':u.includes('/SPY')?'SPY':'QQQ';calls.push(u);
    let text=JSON.stringify(yahoo(id));if(duplicatePrimary&&id==='QQQ'&&u.startsWith('https://query1.'))text=text.replace('"symbol":"QQQ"','"symbol":"SPY","symbol":"QQQ"');
    let consumed=false;const reader={read:async()=>consumed?{done:true}:(consumed=true,{done:false,value:new TextEncoder().encode(text)}),cancel:async()=>{},releaseLock(){}};const response={ok:true,body:{getReader:()=>reader},text:async()=>text};return deferred?new Promise(resolve=>pending.push(()=>resolve(response))):Promise.resolve(response);
  };
  return {calls,pending};
}

test('repair independent transport: duplicate raw identity fails over to query2, repeats preserve legacy bytes',async()=>{
  const h=appHarness();try {
    const legacy=' {"KS200": [], "QQQ": [], "SPY": []} ';h.storage.setItem('v5_benchHist',legacy);
    const mock=syntheticFetch(h,{duplicatePrimary:true});h.w.fetchBenchmarkHistory(true);h.w.fetchBenchmarkHistory(true);await microtasks();
    a.ok(mock.calls.some(u=>u.startsWith('https://query2.finance.yahoo.com/v8/finance/chart/QQQ')),'ambiguous duplicate source identity must not be accepted by primary parser');
    a.equal(mock.calls.length,4,'an in-flight repeat must not start another provider chain');a.equal(h.storage.getItem('v5_benchHist'),legacy);
    const side=h.storage.getItem('v5_benchHistV2');a.ok(side);a.equal(H.readStore(JSON.parse(side),legacy,NOW).series.QQQ.ok,true);
    h.w.fetchBenchmarkHistory(true);await microtasks();a.equal(h.storage.getItem('v5_benchHistV2'),side);a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent transport: restore invalidation and quota failure preserve synthetic storage',async()=>{
  for(const mode of ['invalidate','quota']) {
    const h=appHarness();try {
      const legacy=JSON.stringify({KS200:[],QQQ:[],SPY:[]});h.storage.setItem('v5_benchHist',legacy);const before=h.storage.all();
      const mock=syntheticFetch(h,{deferred:mode==='invalidate'});if(mode==='quota')h.storage.reject='v5_benchHistV2';
      h.w.fetchBenchmarkHistory(true);
      if(mode==='invalidate'){a.equal(mock.pending.length,1);h.w.invalidateBackupRuntime();mock.pending[0]();}
      await microtasks();a.deepEqual(h.storage.all(),before);if(mode==='invalidate')a.equal(mock.calls.length,1);a.equal(h.network.length,0);
    }finally{h.close();}
  }
});

function fillActivity(h,{kind='external-in',mode='instant',amount='50',when='2026-11-06T12:00:00'}={}) {
  const d=h.w.document;d.getElementById('depositKindInput').value=kind;d.getElementById('depositTimeMode').value=mode;d.getElementById('depositTimeMode').dispatchEvent(new h.w.Event('change'));
  d.getElementById(mode==='instant'?'depositDateTimeInput':'depositDateInput').value=when;d.getElementById('depositAmtInput').value=amount;
  return d.getElementById('depositInputBox').querySelector('form');
}
const submitActivity = (h,form)=>form.dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));

test('repair independent activity: explicit classification preserves old rows and repeated submit writes once',()=>{
  const h=appHarness();try {
    const old={gen:[{ts:NOW-30*DAY,amount:7,note:'preserve original'}],dom:[],ov:[],pen:[]};h.storage.setItem('v5_deposits',JSON.stringify(old));h.w.deposits=clone(old);
    const before=h.storage.all();h.w.addDeposit('gen');const form=fillActivity(h,{kind:'internal-buy'});submitActivity(h,form);submitActivity(h,form);
    const saved=JSON.parse(h.storage.getItem('v5_deposits'));a.equal(saved.gen.length,2);a.deepEqual(saved.gen[0],old.gen[0]);a.equal(saved.gen[1].activityVersion,1);a.equal(saved.gen[1].kind,'internal-buy');a.equal(saved.gen[1].timeCertainty,'instant');
    for(const [key,value]of Object.entries(before))if(key!=='v5_deposits')a.equal(h.storage.getItem(key),value);a.equal(h.w.document.getElementById('depositInputBox'),null);a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent activity: cancel, replacement, quota and concurrent edits cannot submit stale dialogs',()=>{
  for(const mode of ['cancel','replace','quota','concurrent']) {
    const h=appHarness();try {
      h.storage.setItem('v5_deposits',JSON.stringify({gen:[]}));h.w.addDeposit('gen');const form=fillActivity(h),handler=form.onsubmit;
      if(mode==='cancel')h.w.document.getElementById('depositCancelBtn').click();
      if(mode==='replace')h.w.addDeposit('dom');
      if(mode==='quota')h.storage.reject='v5_deposits';
      if(mode==='concurrent')h.storage.setItem('v5_deposits',JSON.stringify({gen:[{ts:NOW-DAY,amount:1}]}));
      const before=h.storage.all();handler({preventDefault(){}});a.deepEqual(h.storage.all(),before);a.equal(h.network.length,0);
    }finally{h.close();}
  }
});

test('repair independent activity: same-timestamp delete removes one selected record only',()=>{
  const h=appHarness();try {
    const rows=[{ts:NOW-DAY,amount:1,note:'first'},{ts:NOW-DAY,amount:2,note:'second'}];h.storage.setItem('v5_deposits',JSON.stringify({gen:rows,dom:[]}));
    h.w.manageDeposits('gen');const button=h.w.document.getElementById('depositDeleteBtn-0'),handler=button.onclick;button.click();handler();
    a.deepEqual(JSON.parse(h.storage.getItem('v5_deposits')).gen,[rows[1]]);a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent activity: date-only uncertainty includes the last half-hour of the actual local calendar day',()=>{
  const h=appHarness();try {
    const when=h.w.activityParseTime('date-only','2026-11-01',NOW),midnight=new Date(2026,10,2,0,0,0).getTime();
    const flow=typedFlow({...clone(when),id:'calendar-day-flow'});
    const r=returns().modifiedDietz({key:'gen',startTs:midnight-30*60000,endTs:midnight+3600000,startVal:100,endVal:150,flows:[flow]});
    a.equal(r.status,'hold');a.ok(r.reasons.includes('flow-time-uncertain'));
    a.equal(h.network.length,0);
  }finally{h.close();}
});

test('repair independent backup: paired partial legacy restore refuses instead of erasing an omitted symbol or breaking binding',()=>{
  const legacy=JSON.stringify({QQQ:parsed('QQQ').points}),side=H.mergeHistoryStore(null,legacy,parsed('QQQ'),'QQQ',NOW).store;
  const source=memory(seed());source.setItem('v5_benchHist',legacy);source.setItem('v5_benchHistV2',JSON.stringify(side));
  const plan=B.parse(JSON.stringify(B.create(source))),target=memory(seed());target.setItem('v5_benchHist',JSON.stringify({QQQ:parsed('QQQ').points,KS200:parsed('KS200').points}));const before=target.all();
  a.throws(()=>B.apply(target,plan));a.deepEqual(target.all(),before);
});

test('repair independent backup: sidecar-only preview binds the unstated legacy dependency through apply',()=>{
  const legacy=JSON.stringify({QQQ:parsed('QQQ').points}),side=H.mergeHistoryStore(null,legacy,parsed('QQQ'),'QQQ',NOW).store;
  const source=memory(seed());source.setItem('v5_benchHist',legacy);source.setItem('v5_benchHistV2',JSON.stringify(side));
  const doc=B.create(source);delete doc.storage.v5_benchHist;const plan=B.parse(JSON.stringify(doc)),target=memory(seed());target.setItem('v5_benchHist',legacy);
  B.preview(target,plan);target.setItem('v5_benchHist',legacy+' ');const before=target.all();a.throws(()=>B.apply(target,plan));a.deepEqual(target.all(),before);
});

test('repair independent benchmark: inherited object names are not valid provider identities',()=>{
  const input={chart:{error:null,result:[{meta:{exchangeName:'NMS',instrumentType:'ETF',dataGranularity:'1d'},timestamp:[1793889000,1793975400],indicators:{quote:[{close:[100,101]}]}}]}};
  for(const id of ['constructor','__proto__','toString','NOT_SYMBOL'])a.equal(H.parseYahoo(input,id,ISO).ok,false,id);
});

test('repair independent activity: uncertain postwrite result never retries automatically in the same dialog',()=>{
  for(const mode of ['mismatch','read-error']) {
    const h=appHarness();try {
      h.storage.setItem('v5_deposits',JSON.stringify({gen:[]}));h.w.addDeposit('gen');const form=fillActivity(h),handler=form.onsubmit,set=h.storage.setItem,get=h.storage.getItem;let writes=0,throwRead=false;
      h.storage.setItem=(k,v)=>{set(k,v);if(k==='v5_deposits'){writes++;if(mode==='mismatch')set(k,JSON.stringify({gen:[{ts:NOW-DAY,amount:999}]}));else throwRead=true;}};
      h.storage.getItem=k=>{if(k==='v5_deposits'&&throwRead){throwRead=false;throw Error('Synthetic uncertain read');}return get(k);};
      handler({preventDefault(){}});const after=h.storage.all();handler({preventDefault(){}});a.equal(writes,1);a.deepEqual(h.storage.all(),after);a.equal(h.network.length,0);
    }finally{h.close();}
  }
});

test('repair independent: cloned or mutated assessment metadata cannot manufacture alpha',()=>{
  const R=returns(),base=assessment(),benchmark={valuePct:10,fromTs:NOW-20*DAY,toTs:NOW,currency:'KRW',status:'unverified'};
  a.equal(Object.isFrozen(base),true);a.equal(Object.isFrozen(base.dietz),true);
  const forged=clone(base);forged.dietz.status='available';forged.dietz.valuePct=900;
  a.equal(R.applyBenchmark(forged,benchmark).alpha.status,'hold');
  const honest=R.applyBenchmark(base,benchmark);notHeld(honest.alpha);a.equal(honest.alpha.valuePct,40);a.equal(honest.signalHold,true);
});
