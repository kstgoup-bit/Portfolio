'use strict';
const test=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto');
require('./lib/no-network.cjs');
const P=require('../has/benchmark-history-policy.js');
const ISO='2026-11-10T22:00:00.000Z',NOW=Date.parse(ISO),NEXT='2026-11-11T22:00:00.000Z',NEXTMS=Date.parse(NEXT);
const clone=x=>JSON.parse(JSON.stringify(x));
function yahoo(dates=['2026-11-06','2026-11-09','2026-11-10'],prices=dates.map((_,i)=>100+i),id='QQQ'){
 const s=P.specs[id];return {chart:{error:null,result:[{meta:{symbol:s.symbol,currency:s.currency,exchangeTimezoneName:s.timezone,exchangeName:id==='KS200'?'KSC':'NMS',instrumentType:'ETF',dataGranularity:'1d'},timestamp:dates.map(d=>Date.parse(d+(id==='KS200'?'T00:00:00Z':'T14:30:00Z'))/1000),indicators:{quote:[{close:prices}]}}]}};
}
function av(dates=['2026-11-06','2026-11-09','2026-11-10'],prices=dates.map((_,i)=>100+i)){
 return {'Meta Data':{'1. Information':'Daily Prices (open, high, low, close) and Volumes','2. Symbol':'QQQ','3. Last Refreshed':dates.at(-1),'4. Output Size':'Compact','5. Time Zone':'US/Eastern'},'Time Series (Daily)':Object.fromEntries(dates.map((d,i)=>[d,{'1. open':String(prices[i]),'2. high':String(prices[i]+2),'3. low':String(prices[i]-2),'4. close':String(prices[i]),'5. volume':'1000'}]))};
}
const candidate=(d,p,iso=ISO)=>P.parseYahoo(yahoo(d,p),'QQQ',iso);
const legacy=()=>({QQQ:clone(candidate(['2026-11-05','2026-11-06'],[99,100]).points),KS200:[],SPY:[],fetchedAt:'preserve verbatim'});

test('legacy symbol isolation preserves invalid bytes and references, duplicate dates are read-only',()=>{
 const raw=legacy(),bad=[{ts:Date.parse('2026-11-06T14:30Z'),close:1},{ts:Date.parse('2026-11-06T15:30Z'),close:2}];raw.SPY=bad;
 const before=JSON.stringify(raw),r=P.readCache(raw,NOW);a.equal(r.ok,true);a.equal(r.allValid,false);a.equal(r.series.QQQ.ok,true);a.equal(r.series.SPY.ok,false);a.equal(r.series.SPY.points,bad);a.equal(r.series.SPY.compatible.readOnly,true);a.equal(JSON.stringify(raw),before);
 a.equal(P.validateSeries(bad,'SPY',NOW).ok,false);a.equal(P.validateSeries(bad,'SPY',NOW,{allowDuplicateDates:true}).readOnly,true);
 const merged=P.mergeHistoryStore(null,before,candidate(), 'QQQ',NOW);a.equal(merged.ok,true);a.equal(P.readStore(merged.store,before,NOW).series.SPY.ok,false);a.equal(merged.store.series.SPY,undefined);
});
test('zero tolerance conflict evidence does not stop unrelated append or mutate legacy',()=>{
 const old=legacy(),raw=JSON.stringify(old),c=candidate(['2026-11-05','2026-11-06','2026-11-09'],[99,100.0001,101]);
 const r=P.mergeHistoryStore(null,raw,c,'QQQ',NOW);a.equal(r.ok,true);a.deepEqual(r.acceptedDates,['2026-11-09']);a.equal(r.pendingConflicts.length,1);a.equal(r.pendingConflicts[0].alternative.close,100.0001);a.equal(JSON.stringify(old),raw);
 const view=P.readStore(r.store,raw,NOW);a.equal(view.series.QQQ.byDate['2026-11-06'].close,100);a.equal(view.series.QQQ.byDate['2026-11-09'].close,101);a.equal(view.series.QQQ.pendingConflicts.length,1);a.equal(P.validateStore(r.store).ok,true);a.equal(P.validateStore(r.store,raw,NOW).ok,true);
 const saved=JSON.stringify(r.store),again=P.mergeHistoryStore(r.store,raw,c,'QQQ',NOW);a.equal(again.changed,false);a.equal(again.store,r.store);a.equal(JSON.stringify(r.store),saved);
});
test('compatibility merge returns per-date conflicts and retains exact old object references',()=>{
 const old=legacy().QQQ,c=candidate(['2026-11-05','2026-11-06','2026-11-09'],[99,100.0001,101]),before=JSON.stringify(old),r=P.mergeSeries(old,c,'QQQ',NOW);
 a.equal(r.ok,true);a.equal(r.points[0],old[0]);a.equal(r.points[1],old[1]);a.equal(r.pendingConflicts[0].existing,old[1]);a.equal(r.points.length,3);a.equal(JSON.stringify(old),before);
});
test('AV retains source dates without manufacturing availability or provider timestamps',()=>{
 const c=P.parseAlphaVantage(av(),'QQQ',ISO);a.equal(c.ok,true);a.equal(c.points,null);a.equal(c.signalHold,true);a.equal(c.finality,'unverified');
 const r=P.mergeHistoryStore(null,null,c,'QQQ',NOW),v=P.readStore(r.store,null,NOW),p=v.series.QQQ.points.at(-1);
 a.equal(p.providerBarTs,null);a.equal(Object.hasOwn(p,'ts'),false);a.equal(p.finality,'provisional');a.equal(p.d,'2026-11-10');a.equal(P.observedDate(p,'QQQ'),p.d);
 const selected=P.selectPointAtOrBefore(v.series.QQQ.points,'QQQ',Date.parse('2026-11-10T12:00Z'),{now:NOW});a.equal(selected.ok,true);a.equal(selected.date,'2026-11-09');a.equal(selected.lagged,true);a.equal(selected.signalHold,true);
});
test('AV rejects rate limits, identity/timezone/OHLC errors, dates, extra fields and unsupported markets',()=>{
 for(const mutate of [x=>x.Note='limit',x=>x.Information='limit',x=>x['Error Message']='bad',x=>x['Meta Data']['2. Symbol']='SPY',x=>x['Meta Data']['5. Time Zone']='UTC',x=>x['Meta Data']['3. Last Refreshed']='2026-11-11',x=>x['Time Series (Daily)']['2026-11-10']['4. close']='NaN',x=>x['Time Series (Daily)']['2026-11-10']['2. high']='90',x=>x['Time Series (Daily)']['2026-11-10'].ts=123]){const x=av();mutate(x);a.equal(P.parseAlphaVantage(x,'QQQ',ISO).ok,false);}
 a.equal(P.parseAlphaVantage(av(['2026-11-06','2026-11-07']),'QQQ',ISO).ok,false);a.equal(P.parseAlphaVantage(av(),'KS200',ISO).ok,false);
});
test('provisional next-day successor preserves original and its bytes with no final-close claim',()=>{
 const first=P.mergeHistoryStore(null,null,candidate(),'QQQ',NOW),before=JSON.stringify(first.store),p=first.store.series.QQQ.observations.at(-1);
 const next=P.mergeHistoryStore(first.store,null,candidate(['2026-11-09','2026-11-10','2026-11-11'],[101,103,104],NEXT),'QQQ',NEXTMS);
 a.equal(next.ok,true);a.equal(JSON.stringify(first.store),before);a.equal(next.store.series.QQQ.observations[2],p);a.equal(next.store.series.QQQ.conflicts[0].existing,p);a.equal(next.store.series.QQQ.conflicts[0].status,'provisional-successor');a.equal(next.pendingConflicts.length,0);
 const v=P.readStore(next.store,null,NEXTMS);a.equal(v.ok,true);a.equal(v.series.QQQ.ok,true);a.equal(v.series.QQQ.byDate['2026-11-10'].close,103);a.equal(v.series.QQQ.byDate['2026-11-10'].finality,'unverified');a.equal(P.selectPointAtOrBefore(v.series.QQQ.points,'QQQ',NEXTMS,{now:NEXTMS,conflicts:v.series.QQQ.conflicts}).point.close,103);
});
test('unchanged next-day provisional receipt retains explicit successor evidence',()=>{
 const first=P.mergeHistoryStore(null,null,candidate(),'QQQ',NOW),next=P.mergeHistoryStore(first.store,null,candidate(['2026-11-09','2026-11-10'],[101,102],NEXT),'QQQ',NEXTMS);
 a.equal(next.changed,true);a.equal(next.store.series.QQQ.conflicts[0].status,'provisional-successor');a.equal(P.validateStore(next.store,null,NEXTMS).ok,true);
});
test('boundary conflict holds exactly affected benchmark boundary, never silently skips disputed date',()=>{
 const r=P.mergeHistoryStore(null,JSON.stringify(legacy()),candidate(['2026-11-06','2026-11-09'],[100.0001,101]),'QQQ',NOW),v=P.readStore(r.store,JSON.stringify(legacy()),NOW).series.QQQ;
 const bad=P.selectPointAtOrBefore(v.points,'QQQ',Date.parse('2026-11-09T12:00Z'),{now:NOW,conflicts:v.conflicts});a.equal(bad.reason,'benchmark-date-conflict');
 const good=P.selectPointAtOrBefore(v.points,'QQQ',NOW,{now:NOW,conflicts:v.conflicts});a.equal(good.ok,true);a.equal(good.date,'2026-11-09');
});
test('manufactured/cloned candidate flags and mutation cannot launder admission',()=>{
 const c=candidate(),raw=JSON.stringify(legacy());a.equal(Object.isFrozen(c),true);a.equal(Object.isFrozen(c.points[0]),true);a.throws(()=>c.bars[0].c=500,TypeError);
 for(const forged of [clone(c),{...c},Object.assign({},c,{synthetic:false,ok:true})]){a.equal(P.admitCandidate(forged,'QQQ',NOW).ok,false);a.equal(P.mergeHistoryStore(null,raw,forged,'QQQ',NOW).ok,false);}
 a.equal(P.admitCandidate(c,'SPY',NOW).ok,false);a.equal(P.liveGasEnabled,true);
});
test('no gap backfill or pruning; bound overflow leaves exact previous store',()=>{
 const raw=JSON.stringify(legacy()),r=P.mergeHistoryStore(null,raw,candidate(['2026-11-04','2026-11-09'],[1,101]),'QQQ',NOW);a.equal(r.failures[0].reason,'gap-backfill-disabled');a.deepEqual(r.acceptedDates,['2026-11-09']);
 const dates=[];for(let ms=Date.parse('2025-01-01T00:00Z');dates.length<P.limits.conflicts;ms+=86400000)if(![0,6].includes(new Date(ms).getUTCDay()))dates.push(new Date(ms).toISOString().slice(0,10));
 const boundedRaw=JSON.stringify({QQQ:clone(candidate(dates,dates.map(()=>100)).points)}),bounded=P.mergeHistoryStore(null,boundedRaw,candidate(dates,dates.map(()=>200)),'QQQ',NOW);a.equal(bounded.ok,true);const store=bounded.store;
 const before=JSON.stringify(store),overflow=P.mergeHistoryStore(store,boundedRaw,candidate([dates.at(-1),'2026-11-10'],[999,103]),'QQQ',NOW);a.equal(overflow.ok,false);a.equal(overflow.reason,'store-bound');a.equal(JSON.stringify(store),before);
});
test('SHA-256 fingerprint is exact raw identity, not a canonicalized object checksum',()=>{
 for(const raw of [null,'{}',' { } ','{"note":"한글😀"}']){const str=raw===null?'N':'S'+raw,bytes=Buffer.alloc(str.length*2);for(let i=0;i<str.length;i++)bytes.writeUInt16BE(str.charCodeAt(i),i*2);a.equal(P.fingerprint(raw),'sha256-utf16be-v1:'+crypto.createHash('sha256').update(bytes).digest('hex'));}
 const raw=JSON.stringify(legacy()),r=P.mergeHistoryStore(null,raw,candidate(),'QQQ',NOW),before=JSON.stringify(r.store);a.equal(P.readStore(r.store,raw+' ',NOW).ok,false);a.equal(P.mergeHistoryStore(r.store,raw+' ',candidate(),'QQQ',NOW).ok,false);a.equal(JSON.stringify(r.store),before);
});
test('duplicate raw keys, hostile accessors/prototypes/cycles, invalid offsets cannot become data',()=>{
 let calls=0;const x=Object.defineProperty({},'chart',{get(){calls++;throw Error('getter');},enumerable:true});a.equal(P.parseYahoo(x,'QQQ',ISO).ok,false);a.equal(calls,0);a.equal(P.readCache(Object.create({QQQ:[]} ),NOW).ok,false);
 const cyclic={};cyclic.QQQ=cyclic;a.equal(P.readCache(cyclic,NOW).ok,false);a.equal(P.readStore(null,'{"QQQ":[],"QQQ":[]}',NOW).ok,false);a.equal(P.readStore(null,'{"QQQ":[{"ts":1793975400000,"close":2,"close":3}]}',NOW).ok,false);
 for(const receipt of ['2026-11-10T22:00:00+15:00','2026-11-10T22:00:00+14:01','2026-11-10T22:00:00-14:99'])a.equal(P.parseYahoo(yahoo(),'QQQ',receipt).ok,false);
 a.equal(P.selectPointAtOrBefore(legacy().QQQ,'QQQ',NOW,{now:NOW,conflicts:[{d:'2026-11-06',status:'provisional-successor'}]}).ok,false);
 for(const number of ['1e999','9007199254740992'])a.equal(P.readStore(null,'{\"QQQ\":[{\"ts\":1793975400000,\"close\":100,\"note\":'+number+'}]}',NOW).ok,false);
 a.equal(P.readCache({},NaN).ok,false);a.equal(P.selectPointAtOrBefore([],'QQQ',NaN).ok,false);
});

test('legacy inert source metadata never becomes provider proof or a date-native cache',()=>{
 const rows=legacy().QQQ;rows[0].source='yahoo-chart-v8';rows[0].receivedAt=ISO;
 const selected=P.selectPointAtOrBefore(rows,'QQQ',Date.parse('2026-11-06T12:00Z'),{now:NOW});a.equal(selected.ok,true);a.equal(selected.source,'legacy-unknown');a.equal(selected.receivedAt,null);
 const r=P.mergeHistoryStore(null,null,candidate(),'QQQ',NOW),p=r.store.series.QQQ.observations;
 a.equal(P.readCache({QQQ:p},NOW).series.QQQ.ok,false);a.equal(P.validateSeries(p,'QQQ',NOW,{legacyOnly:true}).ok,false);
});

test('transport raw JSON rejects duplicate identities before either proxy parsing layer',()=>{
 const text=JSON.stringify(yahoo()),outer=JSON.stringify({contents:text}),envelope=P.parseTransportJSON(outer);a.equal(envelope.ok,true);
 const inner=P.parseTransportJSON(envelope.data.contents);a.equal(inner.ok,true);a.equal(P.parseYahoo(inner.data,'QQQ',ISO).ok,true);
 const duplicate=text.replace('"symbol":"QQQ"','"symbol":"SPY","symbol":"QQQ"');a.equal(P.parseTransportJSON(duplicate).ok,false);
 const escaped=text.replace('"symbol":"QQQ"','"symbol":"SPY","sym\\u0062ol":"QQQ"');a.equal(P.parseTransportJSON(escaped).ok,false);
 const badProxy=P.parseTransportJSON(JSON.stringify({contents:duplicate}));a.equal(badProxy.ok,true);a.equal(P.parseTransportJSON(badProxy.data.contents).ok,false);
 for(const raw of ['{"contents":"x","contents":"y"}','{"x":1e999}','{"x":9007199254740992}','{"__proto__":{}}','{"x":{"constructor":1}}','{"x":1} trailing', '[1,]', '\u0000', ' '.repeat(P.limits.bytes+1)])a.equal(P.parseTransportJSON(raw).ok,false);
 for(const raw of [null,undefined,123,{},[]])a.equal(P.parseTransportJSON(raw).ok,false);
 a.equal(P.parseTransportJSON(JSON.stringify({safe:'한글',value:1.5})).data.safe,'한글');
});

test('unknown, prototype and non-string benchmark IDs cannot borrow missing identity',()=>{
 const payload=yahoo();delete payload.chart.result[0].meta.symbol;delete payload.chart.result[0].meta.currency;delete payload.chart.result[0].meta.exchangeTimezoneName;
 const c=candidate(),rows=clone(c.points),point=rows[0],v=P.mergeHistoryStore(null,null,c,'QQQ',NOW).store.series.QQQ.observations[0];
 for(const id of ['constructor','__proto__','toString','hasOwnProperty','valueOf','QQQ ',['QQQ'],{},null,undefined,42]){
  a.equal(P.parseYahoo(payload,id,ISO).ok,false);a.equal(P.parseYahoo(yahoo(),id,ISO).ok,false);a.equal(P.parseAlphaVantage(av(),id,ISO).ok,false);
  a.equal(P.parseGasHistory({},id,ISO,{mode:'synthetic'}).ok,false);a.equal(P.admitCandidate(c,id,NOW).ok,false);a.equal(P.validatePoint(point,id,NOW).ok,false);a.equal(P.validateObservation(v,id,NOW).ok,false);a.equal(P.validateSeries(rows,id,NOW).ok,false);
  a.equal(P.observedDate(point,id),null);a.equal(P.mergeSeries(rows,c,id,NOW).ok,false);a.equal(P.mergeHistoryStore(null,null,c,id,NOW).ok,false);a.equal(P.selectPointAtOrBefore(rows,id,NOW,{now:NOW}).ok,false);
 }
 let calls=0;const id=Object.defineProperty({},'toString',{enumerable:true,get(){calls++;throw Error('identity getter');}});a.equal(P.parseYahoo(payload,id,ISO).ok,false);a.equal(P.observedDate(point,id),null);a.equal(calls,0);
 const coercion={};Object.defineProperty(coercion,Symbol.toPrimitive,{value(){calls++;return 'QQQ';}});a.equal(P.parseYahoo(payload,coercion,ISO).ok,false);a.equal(P.observedDate(point,coercion),null);a.equal(calls,0);
});
