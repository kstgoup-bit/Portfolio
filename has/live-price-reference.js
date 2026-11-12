/* GAS price observations, never verified closes or trading permission.
 * Cache is memory-only: one successful fetch per UTC day per endpoint/market/ticker.
 * Reloading the app clears it. No investment record or backup format is modified. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HASLivePriceReference=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 var DAY=86400000,MAX=1e12;
 function plain(o){if(!o||typeof o!=='object'||Array.isArray(o))return false;var p=Object.getPrototypeOf(o);return (p===Object.prototype||p===null)&&Object.keys(o).every(function(k){var d=Object.getOwnPropertyDescriptor(o,k);return d&&'value' in d;});}
 function price(x){return typeof x==='number'&&Number.isFinite(x)&&x>=1e-8&&x<=MAX;}
 function date(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
 function identity(t,m){return typeof t==='string'&&t.length<=15&&(m==='KR'?/^[0-9][0-9A-Z]{5}$/.test(t):m==='US'&&/^[A-Z][A-Z0-9]*(?:[.\-][A-Z0-9]+)*$/.test(t)&&! /\.(KS|KQ)$/.test(t));}
 function endpoint(value){var u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||u.port||u.username||u.password||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname))throw Error('invalid-gas-endpoint');u.search='';u.hash='';return u.href;}
 function marketDate(now,market){return new Intl.DateTimeFormat('en-CA',{timeZone:market==='KR'?'Asia/Seoul':'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
 function fail(reason){return {ok:false,reason:reason,signalHold:true,adjustment:'unverified'};}
 function normalize(raw,options){
  var o=options||{},t=o.ticker,m=o.market,now=o.now==null?Date.now():+new Date(o.now);
  if(!identity(t,m)||!Number.isFinite(now)||!plain(raw))return fail('invalid-input');
  var isKR=m==='KR',currency=isKR?'KRW':'USD',zone=isKR?'Asia/Seoul':'America/New_York';
  var exchanges=isKR?['KSE','KSC','KOSDAQ','KOE']:['NasdaqGS','NasdaqGM','NasdaqCM','Nasdaq','NMS','NGM','NCM','NYSE','NYQ','NYSE American','AMEX','ASE','NYSEArca','NYSE Arca','PCX','BATS','Cboe US'];
  if(raw.source!=='yahoo-chart-v8'||raw.currency!==currency||raw.timezone!==zone||exchanges.indexOf(raw.exchange)<0||!['ETF','EQUITY'].includes(raw.instrumentType)||raw.adjustment!=='unverified'||(isKR?![t+'.KS',t+'.KQ'].includes(raw.symbol):raw.symbol!==t))return fail('identity-or-basis-mismatch');
  if(isKR&&((raw.symbol.endsWith('.KS')&&!['KSE','KSC'].includes(raw.exchange))||(raw.symbol.endsWith('.KQ')&&!['KOSDAQ','KOE'].includes(raw.exchange))))return fail('exchange-mismatch');
  if(!Array.isArray(raw.bars)||raw.bars.length<2||raw.bars.length>400||raw.barCount!==raw.bars.length)return fail('invalid-bars');
  var today=marketDate(now,m),bars=[],prev='',excluded=0;
  for(var i=0;i<raw.bars.length;i++){
   var b=raw.bars[i];if(!plain(b)||!date(b.d)||!price(b.c)||b.d<=prev||b.d>today||Date.parse(b.d+'T00:00:00Z')<now-380*DAY)return fail('invalid-observation');prev=b.d;
   if(b.d===today||b.finality==='provisional'||b.confirmed===false){excluded++;continue;}
   bars.push({d:b.d,c:b.c});
  }
  if(bars.length<2)return fail('insufficient-prior-observations');
  if(raw.regularMarketTime!=null&&(!Number.isFinite(Date.parse(raw.regularMarketTime))||Date.parse(raw.regularMarketTime)>now))return fail('invalid-price-time');
  if(raw.regularMarketPrice!=null&&!price(raw.regularMarketPrice)||raw.fiftyTwoWeekHigh!=null&&!price(raw.fiftyTwoWeekHigh))return fail('invalid-metadata-price');
  return {ok:true,ticker:t,market:m,currency:currency,exchange:raw.exchange,instrumentType:raw.instrumentType,source:'yahoo-chart-v8-via-gas',asOf:bars[bars.length-1].d,bars:bars,high52:raw.fiftyTwoWeekHigh||null,high52AsOf:null,high52MetadataAsOf:raw.regularMarketTime||null,high52Basis:'provider-range-high-time-unconfirmed',excludedBars:excluded,adjustment:'unverified',latestness:'unconfirmed',observationAgeDays:Math.floor((Date.parse(today)-Date.parse(bars[bars.length-1].d))/DAY),signalHold:true};
 }
 function monthBefore(s,n){var d=new Date(s+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-n);var end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString().slice(0,10);}
 function analyze(raw,options){
  var o=options||{},r=normalize(raw,o);if(!r.ok)return r;
  var last=r.bars[r.bars.length-1],benchmark=o.benchmark?normalize(o.benchmark.record,{ticker:o.benchmark.ticker,market:o.benchmark.market,now:o.now}):null;
  var returns={};[1,3,6].forEach(function(n){var target=monthBefore(last.d,n),p=null;for(var i=0;i<r.bars.length;i++){if(r.bars[i].d<=target)p=r.bars[i];else break;}
   var v={value:null,startDate:null,endDate:last.d,benchmarkReturn:null,excessPct:null,reason:'insufficient-history'};
   if(p&&Date.parse(target)-Date.parse(p.d)<=7*DAY){v.value=(last.c/p.c-1)*100;v.startDate=p.d;v.reason='unverified-price-return';
    if(benchmark&&benchmark.ok&&benchmark.currency===r.currency){var a=benchmark.bars.find(function(x){return x.d===p.d;}),b=benchmark.bars.find(function(x){return x.d===last.d;});if(a&&b){v.benchmarkReturn=(b.c/a.c-1)*100;v.excessPct=v.value-v.benchmarkReturn;}}
   }returns[n]=v;
  });
  return Object.assign({},r,{price:last.c,priceKind:'prior-dated-observation-not-confirmed-close',drawdownPct:r.high52&&r.high52>=last.c?(last.c/r.high52-1)*100:null,returns:returns,notice:'미검증 가격 참고값 · 기업가치·매매 판단 보류'});
 }
 function createService(options){
  var o=options||{},cache=new Map(),pending=new Map(),generation=0,activeEndpoint=null,now=o.now||Date.now;
  function key(m,t){return m+':'+t;}
  function snapshot(item){var c=cache.get(key(item.market,item.ticker));return c?JSON.parse(JSON.stringify(c)):{ticker:item.ticker,market:item.market,status:'missing',record:null,signalHold:true};}
  async function load(items,settings){
   if(!Array.isArray(items)||items.length>500||items.some(function(x){return !plain(x)||!identity(x.ticker,x.market);}))return {ok:false,error:'invalid-symbols',items:[]};
   var base;try{base=endpoint(typeof o.endpoint==='function'?o.endpoint():o.endpoint);}catch(e){return {ok:false,error:'invalid-gas-endpoint',items:items.map(snapshot)};}
   if(activeEndpoint!==base){generation++;cache.clear();pending.clear();activeEndpoint=base;}
   var seen=new Set(),unique=items.filter(function(x){var k=key(x.market,x.ticker);if(seen.has(k))return false;seen.add(k);return true;}),day=new Date(now()).toISOString().slice(0,10),jobs=[],g=generation;
   for(var market of ['US','KR']){
    var needed=unique.filter(function(x){var k=key(x.market,x.ticker),c=cache.get(k);return x.market===market&&!pending.has(k)&&(!(c&&c.endpoint===base&&c.receiptDay===day&&c.record&&!c.error)||(settings&&settings.force));});
    for(var i=0;i<needed.length;i+=12){var chunk=needed.slice(i,i+12);start(chunk,market,base,day,g);}
   }
   unique.forEach(function(x){var p=pending.get(key(x.market,x.ticker));if(p)jobs.push(p);});await Promise.all(jobs);
   var result=unique.map(snapshot);return {ok:result.every(function(x){return x.status==='ready';}),items:result};
  }
  function start(chunk,market,base,day,g){
   var url=new URL(base);url.searchParams.set('type','history');url.searchParams.set('tickers',chunk.map(function(x){return x.ticker;}).join(','));url.searchParams.set('market',market);
   var task=Promise.resolve().then(function(){if(typeof o.transport!=='function')throw Error('transport-missing');return o.transport(url.href);}).then(function(data){if(!plain(data))throw Error('invalid-response');return data;},function(){return null;}).then(function(data){
    if(g!==generation)return;
    chunk.forEach(function(x){var k=key(market,x.ticker),raw=data&&data[x.ticker],n=normalize(raw,{ticker:x.ticker,market:market,now:now()}),old=cache.get(k);
     if(n.ok&&(!old||old.endpoint!==base||n.asOf>=old.asOf)){cache.set(k,{ticker:x.ticker,market:market,endpoint:base,status:n.observationAgeDays>7?'stale':'ready',record:JSON.parse(JSON.stringify(raw)),asOf:n.asOf,observationAgeDays:n.observationAgeDays,receivedAt:new Date(now()).toISOString(),receiptDay:day,signalHold:true});}
     else if(old&&old.endpoint===base){cache.set(k,Object.assign({},old,{status:'stale',error:n.ok?'older-response':'request-or-data-failed'}));}
     else cache.set(k,{ticker:x.ticker,market:market,endpoint:base,status:'missing',record:null,error:'request-or-data-failed',signalHold:true});
    });
   }).catch(function(){if(g===generation)chunk.forEach(function(x){var k=key(market,x.ticker),old=cache.get(k);cache.set(k,Object.assign({},old||{ticker:x.ticker,market:market,record:null},{status:old&&old.record?'stale':'missing',error:'request-or-data-failed',signalHold:true}));});}).finally(function(){chunk.forEach(function(x){var k=key(market,x.ticker);if(pending.get(k)===task)pending.delete(k);});});
   chunk.forEach(function(x){pending.set(key(market,x.ticker),task);});
  }
  return {load:load,peek:function(items){return items.map(snapshot);},clear:function(){generation++;cache.clear();pending.clear();}};
 }
 return {normalize:normalize,analyze:analyze,createService:createService,validateEndpoint:endpoint};
});
