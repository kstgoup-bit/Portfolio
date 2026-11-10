'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('./lib/no-network.cjs');
const P=require('../has/benchmark-history-policy.js');
const NOW='2026-11-10T22:00:00.000Z',MS=Date.parse(NOW),DAY=86400000;
const clone=x=>JSON.parse(JSON.stringify(x));
function yahoo(id='QQQ',dates=['2026-11-05','2026-11-06','2026-11-09']){
 const s=P.specs[id];return {chart:{result:[{meta:{symbol:s.symbol,currency:s.currency,exchangeTimezoneName:s.timezone,exchangeName:id==='KS200'?'KSC':'NMS',fullExchangeName:id==='KS200'?'KSE':'NasdaqGS',instrumentType:'ETF',dataGranularity:'1d',regularMarketTime:Date.parse('2026-11-10T21:00:00Z')/1000},timestamp:dates.map(d=>Date.parse(d+(id==='KS200'?'T00:00:00Z':'T14:30:00Z'))/1000),indicators:{quote:[{close:dates.map((_,i)=>100+i)}]}}],error:null}};
}
function parsed(id='QQQ',dates){return P.parseYahoo(yahoo(id,dates),id,NOW);}
function cache(){return {KS200:parsed('KS200').points,QQQ:parsed().points,SPY:parsed('SPY').points,fetchedAt:'old receipt',fetchedAtISO:'2026-11-09T22:00:00Z'};}
function gas(id='QQQ'){
 const s=P.specs[id];return {[s.ticker]:{source:'yahoo-chart-v8',symbol:s.symbol,currency:s.currency,timezone:s.timezone,exchange:id==='KS200'?'KSE':'NasdaqGS',instrumentType:'ETF',regularMarketTime:'2026-11-10T21:00:00Z',regularMarketPrice:103,fiftyTwoWeekHigh:110,adjustment:'unverified',barCount:2,bars:[{d:'2026-11-06',c:100},{d:'2026-11-09',c:101}]}};
}
test('Yahoo ETF identity and real bar timestamp survive without close/finality/latestness invention',()=>{
 for(const id of ['KS200','QQQ','SPY']){const r=parsed(id);a.equal(r.ok,true);a.equal(r.symbol,P.specs[id].symbol);a.equal(r.currency,P.specs[id].currency);a.equal(r.finality,'unverified');a.equal(r.latestness,'unconfirmed');a.equal(r.adjustment,'unverified');a.equal(r.barTimestampKind,'provider-bar-time-not-confirmed-close');a.equal(r.points[0].ts,yahoo(id).chart.result[0].timestamp[0]*1000);}
});
test('wrong source identity, currency, time zone, exchange or non-ETF is rejected',()=>{
 for(const [field,value] of [['symbol','SPY'],['currency','KRW'],['currency','USD '],['exchangeTimezoneName','UTC'],['exchangeName','KSC'],['fullExchangeName','KSE'],['instrumentType','INDEX'],['dataGranularity','1wk']]){const x=yahoo();x.chart.result[0].meta[field]=value;a.equal(P.parseYahoo(x,'QQQ',NOW).ok,false,field);}
 const x=yahoo('KS200');x.chart.result[0].meta.symbol='069500.KQ';a.equal(P.parseYahoo(x,'KS200',NOW).ok,false);
});
test('invalid, partial, null, duplicate, reversed, future, impossible price or weekend bars are rejected in full',()=>{
 const mutations=[r=>r.timestamp.pop(),r=>r.indicators.quote[0].close[1]=null,r=>r.indicators.quote[0].close[1]='100',r=>r.indicators.quote[0].close[1]=0,r=>r.indicators.quote[0].close[1]=1e20,r=>r.timestamp[1]=r.timestamp[0],r=>r.timestamp.reverse(),r=>r.timestamp[2]=MS/1000+1,r=>r.timestamp[1]=Date.parse('2026-11-07T14:30:00Z')/1000,r=>r.timestamp[1]=r.timestamp[0]+60];
 for(const mutate of mutations){const x=yahoo();mutate(x.chart.result[0]);a.equal(P.parseYahoo(x,'QQQ',NOW).ok,false);}
 a.equal(P.parseYahoo(yahoo('QQQ',['2026-11-09']),'QQQ',NOW).ok,false);
});
test('receipt is separate from regularMarketTime and cannot certify close',()=>{
 const x=yahoo();x.chart.result[0].meta.regularMarketTime=MS/1000+1;a.equal(P.parseYahoo(x,'QQQ',NOW).ok,false);
 x.chart.result[0].meta.regularMarketTime=MS/1000;a.equal(P.parseYahoo(x,'QQQ',NOW).receivedAt,NOW);
 a.equal(P.parseYahoo(x,'QQQ','2026-02-30T22:00:00Z').ok,false);
});
test('legacy cache is read-only, supports missing or explicitly empty groups, rejects broken groups',()=>{
 const old=cache(),bytes=JSON.stringify(old);a.equal(P.readCache(old,MS).ok,true);a.equal(JSON.stringify(old),bytes);a.equal(P.readCache({KS200:[]},MS).ok,true);
 for(const bad of [null,[],{QQQ:null},{QQQ:[{ts:MS,close:null}]},{QQQ:[{ts:MS+DAY,close:1}]},{QQQ:[...old.QQQ].reverse()},{QQQ:old.QQQ,unknown:true}])a.equal(P.readCache(bad,MS).ok,false);
});
test('append preserves every old object and price; latest-date repeats never count as new',()=>{
 const old=parsed().points,bytes=JSON.stringify(old),same=P.mergeSeries(old,parsed(),'QQQ',MS);a.equal(same.changed,false);a.equal(same.points,old);
 const next=parsed('QQQ',['2026-11-05','2026-11-06','2026-11-09','2026-11-10']);const r=P.mergeSeries(old,next,'QQQ',MS);a.equal(r.ok,true);a.equal(r.changed,true);a.equal(r.points.length,4);a.equal(r.points[0],old[0]);a.equal(JSON.stringify(old),bytes);
});
test('older, conflicted, malformed or incomplete history cannot erase or correct old observations',()=>{
 const old=parsed().points,bytes=JSON.stringify(old),older=parsed('QQQ',['2026-11-05','2026-11-06']);a.equal(P.mergeSeries(old,older,'QQQ',MS).reason,'older-response');
 const corrected=parsed('QQQ',['2026-11-05','2026-11-06','2026-11-09','2026-11-10']);corrected.bars[0].c=500;corrected.points[0].close=500;a.equal(P.mergeSeries(old,corrected,'QQQ',MS).reason,'historical-correction-needs-review');
 for(const value of [null,{},parsed('SPY'),{...parsed(),points:null}])a.equal(P.mergeSeries(old,value,'QQQ',MS).ok,false);
 a.equal(JSON.stringify(old),bytes);
});
test('compact newer series appends only newer dates and never backfills or truncates history',()=>{
 const old=parsed().points,x=yahoo('QQQ',['2026-11-09','2026-11-10']);x.chart.result[0].indicators.quote[0].close=[102,103];const r=P.mergeSeries(old,P.parseYahoo(x,'QQQ',NOW),'QQQ',MS);a.equal(r.ok,true);a.equal(r.points.length,4);a.deepEqual(r.points.slice(0,3),old);
});
test('GAS date-only path is synthetic-only with no live activation or invented timestamp',()=>{
 a.equal(P.liveGasEnabled,false);a.equal(P.parseGasHistory(gas(),'QQQ',NOW).reason,'live-gas-disabled');a.equal(P.parseGasHistory(gas(),'QQQ',NOW,{mode:'live'}).ok,false);
 for(const id of ['KS200','QQQ','SPY']){const r=P.parseGasHistory(gas(id),id,NOW,{mode:'synthetic'});a.equal(r.ok,true);a.equal(r.synthetic,true);a.equal(r.points,null);a.equal(r.barTimestampKind,'absent');a.equal(r.finality,'unverified');a.equal(P.mergeSeries([],r,id,MS).ok,false);a.equal(Object.keys(r.bars[0]).sort().join(','),'c,d');}
});
test('GAS rejects bad or impossible dates, partial/null bars and identity/metadata contradictions',()=>{
 for(const [k,v] of [['source','gas'],['symbol','SPY'],['currency','KRW'],['timezone','UTC'],['exchange','KSE'],['adjustment','adjusted'],['barCount',1],['regularMarketPrice',0],['regularMarketTime','2026-11-11T00:00:00Z']]){const x=gas();x.QQQ[k]=v;a.equal(P.parseGasHistory(x,'QQQ',NOW,{mode:'synthetic'}).ok,false,k);}
 for(const d of ['2026-02-30','2026-13-01','2026-11-11','2026-11-07','2026-11-06T00:00:00Z']){const x=gas();x.QQQ.bars[0].d=d;a.equal(P.parseGasHistory(x,'QQQ',NOW,{mode:'synthetic'}).ok,false,d);}
 for(const b of [null,{d:'2026-11-06',c:null},{d:'2026-11-06',c:1,currency:'KRW'}]){const x=gas();x.QQQ.bars[0]=b;a.equal(P.parseGasHistory(x,'QQQ',NOW,{mode:'synthetic'}).ok,false);}
});
test('holiday/weekend/date age never produces a latest-confirmed declaration or receipt from legacy fetchedAt',()=>{
 const old=cache();for(const now of [MS,MS+4*DAY,MS+12*DAY]){const r=P.describe(old,'gen',{},now);a.equal(r.rows.length,1);a.equal(r.rows[0].id,'KS200');a.equal(r.rows[0].receivedAt,null);a.equal(r.rows[0].source,'캐시 출처 미확인');a.equal(r.rows[0].latestDate,'2026-11-09');a.equal(r.latestness,'unconfirmed');}
});
test('UI removes age shortcuts and date-only timestamp fabrication, keeps known transport and readable touch controls',()=>{
 const html=fs.readFileSync(require.resolve('../portfolio_v5.html'),'utf8'),start=html.indexOf('function fetchBenchmarkHistory(force)'),end=html.indexOf('function findBenchAtOrBefore',start),block=html.slice(start,end);
 a.equal((html.match(/src="has\/benchmark-history-policy.js"/g)||[]).length,1);a.doesNotMatch(block,/ageDays\s*>|4\*86400000|TIME_SERIES_DAILY|type=history|Date.UTC/);a.match(block,/function activeBenchRun\(\)/);a.match(html,/최신성 미확인 · 거래일 달력·종가 확정 근거 없음/);a.doesNotMatch(html,/✓ 데이터 최신 확인됨/);a.match(html,/onclick="fetchBenchmarkHistory\(true\)" style="min-height:44px;min-width:44px;font-size:12px;/);
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
});
test('receipt attribution is tied to exact saved series and exposes mixed-source legacy prefix',()=>{
 const c=cache(),rows=c.QQQ,receipt={source:'yahoo-chart-v8 (새 관측; 이전 이력 출처 미확인)',receivedAt:NOW,latestDate:'2026-11-09',pointCount:rows.length,lastClose:rows[rows.length-1].close,pointsJSON:JSON.stringify(rows)};
 const view=P.describe(c,'pen',{QQQ:receipt},MS);a.equal(view.rows[0].receivedAt,NOW);a.match(view.rows[0].source,/이전 이력 출처 미확인/);
 c.QQQ[0].close=9;a.equal(P.describe(c,'pen',{QQQ:receipt},MS).rows[0].receivedAt,null);
});
